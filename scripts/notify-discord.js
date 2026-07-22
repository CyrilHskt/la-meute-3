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
const BLOCK_RANGE = 900n; // même prudence que front/src/composables/useMeute.ts

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

async function getEventsChunked(contract, eventName, fromBlock, toBlock) {
  const windows = [];
  for (let from = fromBlock; from <= toBlock; from += BLOCK_RANGE + 1n) {
    const to = from + BLOCK_RANGE > toBlock ? toBlock : from + BLOCK_RANGE;
    windows.push(contract.queryFilter(contract.filters[eventName](), from, to));
  }
  return (await Promise.all(windows)).flat();
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
  });
  if (!res.ok) {
    throw new Error(`Discord a répondu ${res.status} : ${await res.text()}`);
  }
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const abi = loadAbi();
  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

  const state = loadState();
  const fromBlock = BigInt(state.lastBlock) + 1n;
  const toBlock = await provider.getBlockNumber();

  if (fromBlock > toBlock) {
    console.log("Rien de nouveau (aucun bloc à traiter).");
    return;
  }

  const [openedLogs, executedLogs] = await Promise.all([
    getEventsChunked(contract, "PropositionOuverte", fromBlock, toBlock),
    getEventsChunked(contract, "PropositionExecutee", fromBlock, toBlock),
  ]);

  for (const log of openedLogs) {
    const { proposalId, cible, typeProp } = log.args;
    const prop = await contract.proposition(proposalId);
    console.log(`Ouverture #${proposalId} — ${TYPE_LABELS[Number(typeProp)]}`);
    await postToDiscord(
      `🗳️ **Nouvelle proposition ouverte** — ${propositionLabel(typeProp, cible, prop.montant, prop.motif)}\n` +
        `Vote ouvert 7 jours, ${seuil(prop.snapshotActifs)} voix « pour » requises (sur ${prop.snapshotActifs} Loups actifs).`,
    );
  }

  for (const log of executedLogs) {
    const { proposalId } = log.args;
    const prop = await contract.proposition(proposalId);
    const approuvee = Number(prop.votesApprouver) >= seuil(prop.snapshotActifs);
    console.log(`Exécution #${proposalId} — ${approuvee ? "approuvée" : "refusée"}`);
    await postToDiscord(
      `${approuvee ? "✅" : "❌"} **Vote clos** — ${propositionLabel(prop.typeProp, prop.cible, prop.montant, prop.motif)}\n` +
        `${approuvee ? "Approuvée" : "Refusée"} (${prop.votesApprouver} pour / ${prop.votesRejeter} contre).`,
    );
  }

  saveState({ lastBlock: toBlock.toString() });
  console.log(`État à jour : dernier bloc traité ${toBlock}.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
