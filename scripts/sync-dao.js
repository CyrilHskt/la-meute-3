// Un seul scan des events du contrat par run, partagé par deux usages :
//  1. Poster sur Discord les nouvelles propositions ouvertes/clôturées.
//  2. Maintenir un instantané que le front télécharge au lieu de scanner
//     la chaîne lui-même.
//
// L'état ET l'instantané vivent dans Netlify Blobs (via la fonction
// netlify/functions/dao-sync.mts), pas dans le dépôt git — publier une
// donnée fraîche ne doit jamais déclencher un rebuild du site, ces deux
// choses n'ont aucun rapport. Avant : le job committait un fichier JSON
// dans front/public/, ce qui forçait Netlify à reconstruire tout le site
// à chaque rafraîchissement (et avait déjà causé un bug distinct via
// "[skip ci]", que Netlify interprète aussi comme "ne pas déployer").
//
// L'état est *cumulatif*, jamais recalculé depuis le déploiement : chaque
// run ne traite que les blocs nouveaux depuis le dernier passage, et met à
// jour la liste des membres / propositions / activité en conséquence.
// Sans ça, le job redeviendrait de plus en plus lent avec le temps — voir
// la discussion dans docs/local/soutenance-prep.md.
//
// Variables d'env requises :
//   RPC_URL              — endpoint Sepolia (Alchemy)
//   DISCORD_WEBHOOK_URL   — URL du webhook Discord à poster
//   SYNC_ENDPOINT         — URL de la fonction Netlify (ex:
//                           https://la-meute-3.netlify.app/.netlify/functions/dao-sync)
//   SYNC_SECRET           — secret partagé avec cette fonction
// Optionnelle :
//   CONTRACT_ADDRESS      — écrase l'adresse lue dans front/src/contract.ts
//                           (source unique par défaut, pour ne jamais
//                           désynchroniser ce script d'un redéploiement)

import { ethers } from "ethers";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTRACT_TS_PATH = join(__dirname, "..", "front", "src", "contract.ts");
// Le plan gratuit Alchemy limite eth_getLogs à 10 blocs par requête (vécu
// en prod : erreur -32600 dès qu'on dépasse), et à un débit de compute
// units/seconde assez bas (erreur 429 même en séquentiel sans délai).
const BLOCK_RANGE = 9n; // fromBlock..fromBlock+9 = 10 blocs inclus
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DELAI_DORMANCE = 365 * 24 * 60 * 60;

function readContractConstant(name) {
  const source = readFileSync(CONTRACT_TS_PATH, "utf8");
  const match = source.match(new RegExp(`export const ${name} = "?(\\w+)"?`));
  if (!match) throw new Error(`Constante ${name} introuvable dans ${CONTRACT_TS_PATH}`);
  return match[1];
}

const RPC_URL = process.env.RPC_URL;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS ?? readContractConstant("CONTRACT_ADDRESS");
const DEPLOY_BLOCK = BigInt(readContractConstant("CONTRACT_DEPLOY_BLOCK").replace(/n$/, ""));
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const SYNC_ENDPOINT = process.env.SYNC_ENDPOINT;
const SYNC_SECRET = process.env.SYNC_SECRET;

if (!RPC_URL || !DISCORD_WEBHOOK_URL || !SYNC_ENDPOINT || !SYNC_SECRET) {
  throw new Error("RPC_URL, DISCORD_WEBHOOK_URL, SYNC_ENDPOINT et SYNC_SECRET sont requis.");
}

const TYPE_LABELS = ["Admission", "Titularisation", "Exclusion", "Dépense"];
const Rang = { Louveteau: 0, Loup: 1 };

function loadAbi() {
  const artifactPath = join(__dirname, "..", "artifacts", "contracts", "Meute.sol", "Meute.json");
  try {
    return JSON.parse(readFileSync(artifactPath, "utf8")).abi;
  } catch {
    throw new Error(`ABI introuvable (${artifactPath}) — lance \`npx hardhat compile\` d'abord.`);
  }
}

async function loadState() {
  const res = await fetch(`${SYNC_ENDPOINT}?key=state`, {
    headers: { "x-sync-secret": SYNC_SECRET },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Lecture de l'état échouée (HTTP ${res.status})`);
  const state = await res.json();
  // `lastBlock: null` = jamais lancé (valeur par défaut de la fonction) —
  // on démarre alors du bloc de déploiement, pas de tenter `BigInt(null)`.
  return state.lastBlock == null ? { ...state, lastBlock: DEPLOY_BLOCK.toString() } : state;
}

async function saveJson(key, value) {
  const res = await fetch(`${SYNC_ENDPOINT}?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-sync-secret": SYNC_SECRET },
    body: JSON.stringify(value),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Écriture de "${key}" échouée (HTTP ${res.status})`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getLogsWithRetry(provider, params, attempt = 1) {
  try {
    return await provider.getLogs(params);
  } catch (err) {
    const is429 = err?.error?.code === 429 || err?.info?.error?.code === 429;
    if (!is429 || attempt >= 5) throw err;
    const delay = 1000 * 2 ** (attempt - 1);
    console.log(`Rate-limit (429), nouvelle tentative dans ${delay}ms (essai ${attempt}/5)...`);
    await sleep(delay);
    return getLogsWithRetry(provider, params, attempt + 1);
  }
}

// Aucun filtre de topic : une seule requête par fenêtre récupère tous les
// events du contrat (candidatures, votes, exécutions, mints/burns de
// carte), décodés ensuite côté script — pas de requête dupliquée par type
// d'event.
async function getAllLogsChunked(provider, address, fromBlock, toBlock) {
  const results = [];
  for (let from = fromBlock; from <= toBlock; from += BLOCK_RANGE + 1n) {
    const to = from + BLOCK_RANGE > toBlock ? toBlock : from + BLOCK_RANGE;
    const logs = await getLogsWithRetry(provider, { address, fromBlock: from, toBlock: to });
    results.push(...logs);
    await sleep(250);
  }
  return results;
}

function seuil(snapshotActifs) {
  return Math.floor(Number(snapshotActifs) / 2) + 1;
}

function propositionLabel(typeProp, cible, montant, motif) {
  const short = `${cible.slice(0, 6)}…${cible.slice(-4)}`;
  switch (Number(typeProp)) {
    case 0:
      return `Candidature de \`${short}\``;
    case 1:
      return `Titularisation de \`${short}\``;
    case 2:
      return `Exclusion de \`${short}\``;
    default:
      return `Dépense pour \`${short}\` — ${ethers.formatEther(montant)} ETH (${motif})`;
  }
}

// N'échoue jamais bruyamment : rater une notification Discord (webhook
// supprimé, Discord en carafe...) ne doit pas empêcher l'instantané JSON
// d'être mis à jour pour le front — ce sont deux usages indépendants d'un
// même scan, l'un ne doit pas bloquer l'autre.
async function postToDiscord(content) {
  try {
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error(`Discord a répondu ${res.status} : ${await res.text()}`);
    }
  } catch (err) {
    console.error("Échec de l'envoi vers Discord :", err);
  }
}

async function main() {
  const fetchRequest = new ethers.FetchRequest(RPC_URL);
  fetchRequest.timeout = 15_000;
  const provider = new ethers.JsonRpcProvider(fetchRequest);
  const abi = loadAbi();
  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

  const state = await loadState();
  const minted = new Set(state.minted);
  const burned = new Set(state.burned);
  const proposalIds = new Set(state.proposalIds);
  // `auteur` n'est pas stocké dans la struct Proposition on-chain (seulement
  // émis dans l'event PropositionOuverte) — il faut le garder à part pour
  // pouvoir le remettre dans l'instantané à chaque rafraîchissement.
  const proposalAuthors = state.proposalAuthors ?? {};
  const memberActivity = state.memberActivity ?? {};
  const bump = (addr, key) => {
    const k = addr.toLowerCase();
    memberActivity[k] ??= { votesSoumis: 0, propositionsOuvertes: 0 };
    memberActivity[k][key]++;
  };

  console.log("Récupération du dernier bloc...");
  const fromBlock = BigInt(state.lastBlock) + 1n;
  const toBlock = BigInt(await provider.getBlockNumber());
  console.log(`Plage à traiter : blocs ${fromBlock} → ${toBlock} (${toBlock - fromBlock + 1n} blocs).`);

  if (fromBlock <= toBlock) {
    console.log(`Récupération des events (par lots de ${BLOCK_RANGE + 1n} blocs)...`);
    const rawLogs = await getAllLogsChunked(provider, CONTRACT_ADDRESS, fromBlock, toBlock);
    const decoded = rawLogs.flatMap((log) => {
      try {
        return [contract.interface.parseLog(log)];
      } catch {
        return [];
      }
    });
    console.log(`${decoded.length} event(s) décodé(s).`);

    for (const log of decoded) {
      if (log.name === "Transfer") {
        const { from, to } = log.args;
        if (from === ZERO_ADDRESS) minted.add(to.toLowerCase());
        if (to === ZERO_ADDRESS) burned.add(from.toLowerCase());
      } else if (log.name === "VoteExprime") {
        bump(log.args.votant, "votesSoumis");
      } else if (log.name === "PropositionOuverte") {
        const { proposalId, cible, auteur, typeProp } = log.args;
        proposalIds.add(proposalId.toString());
        proposalAuthors[proposalId.toString()] = auteur;
        bump(auteur, "propositionsOuvertes");
        const prop = await contract.proposition(proposalId);
        console.log(`Ouverture #${proposalId} — ${TYPE_LABELS[Number(typeProp)]}`);
        await postToDiscord(
          `🗳️ **Nouvelle proposition ouverte** — ${propositionLabel(typeProp, cible, prop.montant, prop.motif)}\n` +
            `Vote ouvert 7 jours, ${seuil(prop.snapshotActifs)} voix « pour » requises (sur ${prop.snapshotActifs} Loups actifs).`,
        );
      } else if (log.name === "PropositionExecutee") {
        const { proposalId } = log.args;
        const prop = await contract.proposition(proposalId);
        const approuvee = Number(prop.votesApprouver) >= seuil(prop.snapshotActifs);
        console.log(`Exécution #${proposalId} — ${approuvee ? "approuvée" : "refusée"}`);
        await postToDiscord(
          `${approuvee ? "✅" : "❌"} **Vote clos** — ${propositionLabel(prop.typeProp, prop.cible, prop.montant, prop.motif)}\n` +
            `${approuvee ? "Approuvée" : "Refusée"} (${prop.votesApprouver} pour / ${prop.votesRejeter} contre).`,
        );
      }
    }
  } else {
    console.log("Aucun nouveau bloc — on rafraîchit quand même l'instantané (dormance, trésor).");
  }

  // Toujours recalculées, même sans nouveau bloc : la dormance dépend de
  // l'heure actuelle, pas seulement des events passés, et le trésor peut
  // changer sans event associé (aucun dans ce contrat, mais par prudence).
  const currentMembers = [...minted].filter((a) => !burned.has(a));
  console.log(`Rafraîchissement de ${currentMembers.length} carte(s) membre...`);
  const cartes = await Promise.all(currentMembers.map((addr) => contract.carte(addr)));
  const now = Number((await provider.getBlock(Number(toBlock))).timestamp);

  let louveteaux = 0;
  let loupsDormants = 0;
  cartes.forEach((c) => {
    if (Number(c.rang) === Rang.Louveteau) louveteaux++;
    else if (now - Number(c.derniereActivite) > DELAI_DORMANCE) loupsDormants++;
  });

  const [treasuryWei, loupsActifsCount] = await Promise.all([
    provider.getBalance(CONTRACT_ADDRESS),
    contract.loupsActifs(),
  ]);

  console.log(`Rafraîchissement de ${proposalIds.size} proposition(s)...`);
  const proposals = await Promise.all(
    [...proposalIds].map(async (id) => {
      const p = await contract.proposition(id);
      return {
        id,
        typeProp: Number(p.typeProp),
        cible: p.cible,
        auteur: proposalAuthors[id],
        echeance: p.echeance.toString(),
        snapshotActifs: Number(p.snapshotActifs),
        snapshotFige: p.snapshotFige,
        executee: p.executee,
        votesApprouver: Number(p.votesApprouver),
        votesRejeter: Number(p.votesRejeter),
        votesAjourner: Number(p.votesAjourner),
        montant: p.montant.toString(),
        motif: p.motif,
      };
    }),
  );
  const votesExprimes = Object.values(memberActivity).reduce((sum, a) => sum + a.votesSoumis, 0);
  const propositionsOuvertes = proposals.filter((p) => !p.executee).length;

  await saveJson("index", {
    updatedAt: new Date().toISOString(),
    lastBlock: toBlock.toString(),
    stats: {
      treasuryWei: treasuryWei.toString(),
      loupsActifs: Number(loupsActifsCount),
      loupsDormants,
      louveteaux,
      votesExprimes,
      propositionsOuvertes,
    },
    proposals,
    memberActivity,
  });

  await saveJson("state", {
    lastBlock: toBlock.toString(),
    minted: [...minted],
    burned: [...burned],
    proposalIds: [...proposalIds],
    proposalAuthors,
    memberActivity,
  });
  console.log(`État et instantané à jour (Netlify Blobs) : dernier bloc traité ${toBlock}.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
