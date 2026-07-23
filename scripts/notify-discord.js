// Poste sur Discord les nouveaux events de gouvernance depuis le dernier
// passage : ouverture de proposition (candidature, titularisation,
// exclusion, dépense) et clôture (résultat). Pensé pour tourner en cron via
// GitHub Actions plutôt qu'un serveur dédié — voir
// .github/workflows/discord-notify.yml.
//
// L'état (dernier bloc traité) est persisté dans un petit fichier JSON
// committé par le workflow après chaque exécution, pour ne jamais renvoyer
// deux fois le même message ni en rater un si le job saute une exécution.
//
// Variables d'env requises :
//   RPC_URL              — endpoint Sepolia (Alchemy)
//   DISCORD_WEBHOOK_URL   — URL du webhook Discord à poster
// Optionnelle :
//   CONTRACT_ADDRESS      — écrase l'adresse lue dans front/src/contract.ts
//                           (source unique par défaut, pour ne jamais
//                           désynchroniser ce script d'un redéploiement)

import { ethers } from "ethers";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(__dirname, ".discord-notify-state.json");
const CONTRACT_TS_PATH = join(__dirname, "..", "front", "src", "contract.ts");
// Le plan gratuit Alchemy limite eth_getLogs à 10 blocs par requête (vécu
// en prod : erreur -32600 dès qu'on dépasse), bien plus strict que les
// RPC publics utilisés côté front (voir useMeute.ts, 900 là-bas). D'où
// aussi le passage en séquentiel plus bas plutôt qu'en Promise.all : le
// backfill initial (depuis le bloc de déploiement) représente des
// centaines de requêtes, et les envoyer toutes en parallèle sur un compte
// gratuit prend le risque d'un rate-limit en plus de la limite de plage.
const BLOCK_RANGE = 9n; // fromBlock..fromBlock+9 = 10 blocs inclus

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

if (!RPC_URL || !DISCORD_WEBHOOK_URL) {
  throw new Error("RPC_URL et DISCORD_WEBHOOK_URL sont requis.");
}

const TYPE_LABELS = ["Admission", "Titularisation", "Exclusion", "Dépense"];

function loadAbi() {
  const artifactPath = join(__dirname, "..", "artifacts", "contracts", "Meute.sol", "Meute.json");
  try {
    return JSON.parse(readFileSync(artifactPath, "utf8")).abi;
  } catch {
    throw new Error(`ABI introuvable (${artifactPath}) — lance \`npx hardhat compile\` d'abord.`);
  }
}

function loadState() {
  if (!existsSync(STATE_PATH)) return { lastBlock: DEPLOY_BLOCK.toString() };
  return JSON.parse(readFileSync(STATE_PATH, "utf8"));
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Le plan gratuit Alchemy a aussi un plafond de débit (compute units par
// seconde), distinct de la limite de plage — vécu en prod : erreur 429
// même en séquentiel, sans délai entre les requêtes. Un backoff
// exponentiel sur les 429 spécifiquement (pas sur les autres erreurs, qui
// doivent remonter normalement) absorbe ces pics sans configuration fine
// du débit exact autorisé.
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

// Une seule requête getLogs par fenêtre pour les deux events (filtre OR sur
// les deux topic0), au lieu d'une requête par event — moitié moins d'appels
// sur un RPC déjà très contraint en plage de blocs. Un petit délai fixe
// entre chaque fenêtre lisse aussi le débit pour éviter de déclencher le
// 429 plutôt que de compter uniquement sur les tentatives de secours.
async function getEventsChunked(provider, contract, eventNames, fromBlock, toBlock) {
  const topic0s = eventNames.map((name) => contract.interface.getEvent(name).topicHash);
  const address = await contract.getAddress();
  const results = [];
  for (let from = fromBlock; from <= toBlock; from += BLOCK_RANGE + 1n) {
    const to = from + BLOCK_RANGE > toBlock ? toBlock : from + BLOCK_RANGE;
    const logs = await getLogsWithRetry(provider, { address, fromBlock: from, toBlock: to, topics: [topic0s] });
    results.push(...logs.map((log) => contract.interface.parseLog(log)));
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

async function postToDiscord(content) {
  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Discord a répondu ${res.status} : ${await res.text()}`);
  }
}

async function main() {
  // Un timeout explicite par requête RPC : sans lui, une clé invalide ou un
  // RPC qui ne répond jamais laisse le job tourner indéfiniment sans le
  // moindre message d'erreur (vécu au premier run réel).
  const fetchRequest = new ethers.FetchRequest(RPC_URL);
  fetchRequest.timeout = 15_000;
  const provider = new ethers.JsonRpcProvider(fetchRequest);
  const abi = loadAbi();
  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

  console.log(`RPC configuré : ${RPC_URL ? "oui" : "NON — variable vide"}`);
  console.log("Récupération du dernier bloc...");
  const state = loadState();
  const fromBlock = BigInt(state.lastBlock) + 1n;
  const toBlock = BigInt(await provider.getBlockNumber());
  console.log(`Plage à traiter : blocs ${fromBlock} → ${toBlock} (${toBlock - fromBlock + 1n} blocs).`);

  if (fromBlock > toBlock) {
    console.log("Rien de nouveau (aucun bloc à traiter).");
    return;
  }

  console.log(`Récupération des events (par lots de ${BLOCK_RANGE + 1n} blocs)...`);
  const logs = await getEventsChunked(
    provider,
    contract,
    ["PropositionOuverte", "PropositionExecutee"],
    fromBlock,
    toBlock,
  );
  console.log(`${logs.length} event(s) trouvé(s).`);

  for (const log of logs) {
    if (log.name === "PropositionOuverte") {
      const { proposalId, cible, typeProp } = log.args;
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

  saveState({ lastBlock: toBlock.toString() });
  console.log(`État à jour : dernier bloc traité ${toBlock}.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
