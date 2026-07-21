// Peuple un contrat Meute fraîchement déployé sur un nœud Hardhat local
// (npx hardhat node) : fait admettre un candidat, le titularise Loup, et
// laisse une proposition de dépense ouverte — pour avoir tout de suite un
// contrat avec des Louveteaux/Loups/votes/historique à explorer dans le
// front, plutôt que de tout rejouer à la main via MetaMask.
//
// Prérequis : `npx hardhat node` dans un terminal, puis
//   npx hardhat ignition deploy ignition/modules/Meute.ts --network localhost
// dans un autre, avant de lancer ce script.
//
// Usage : node scripts/seed-local.js
// Variables d'env optionnelles :
//   RPC_URL           (défaut http://127.0.0.1:8545)
//   CONTRACT_ADDRESS  (défaut : adresse du tout premier déploiement Ignition
//                      sur un nœud fraîchement démarré, toujours la même)
//   FOUNDER           (défaut : le fondateur unique du module Ignition —
//                      doit correspondre à ce qui a été réellement déployé)

import { ethers } from "ethers";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS ?? "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const FOUNDER = process.env.FOUNDER ?? "0x95B5d450178C9f13dc977655a9A70a17Aac6c8d3";

const ChoixVote = { Approuver: 0, Rejeter: 1, Ajourner: 2 };

function loadAbi() {
  const artifactPath = join(__dirname, "..", "artifacts", "contracts", "Meute.sol", "Meute.json");
  try {
    return JSON.parse(readFileSync(artifactPath, "utf8")).abi;
  } catch {
    throw new Error(`ABI introuvable (${artifactPath}) — lance \`npx hardhat compile\` d'abord.`);
  }
}

async function advanceTime(provider, seconds) {
  await provider.send("evm_increaseTime", [seconds]);
  await provider.send("evm_mine", []);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const abi = loadAbi();

  // Le fondateur par défaut du module Ignition est une adresse réelle
  // (celle utilisée aussi sur Sepolia), pas un des 20 comptes du nœud
  // local : on l'impersonate (le nœud simulé l'autorise pour n'importe
  // quelle adresse, sans en connaître la clé privée) et on la finance.
  await provider.send("hardhat_impersonateAccount", [FOUNDER]);
  await provider.send("hardhat_setBalance", [FOUNDER, "0x56BC75E2D63100000"]); // 100 ETH
  // provider.getSigner() vérifie l'adresse contre eth_accounts, qui ne
  // liste jamais les comptes impersonated — il faut construire le signer
  // directement pour contourner cette vérification côté ethers (le nœud,
  // lui, accepte bien les transactions de cette adresse).
  const founder = new ethers.JsonRpcSigner(provider, ethers.getAddress(FOUNDER));

  const accounts = await provider.send("eth_accounts", []);
  const candidatAddr = accounts.find((a) => a.toLowerCase() !== FOUNDER.toLowerCase());
  if (!candidatAddr) throw new Error("Aucun compte de test disponible sur le nœud (en plus du fondateur).");
  const candidat = await provider.getSigner(candidatAddr);

  const asFounder = new ethers.Contract(CONTRACT_ADDRESS, abi, founder);
  const asCandidat = new ethers.Contract(CONTRACT_ADDRESS, abi, candidat);

  console.log(`Fondateur (Loup) : ${FOUNDER}`);
  console.log(`Candidat          : ${candidatAddr}`);
  console.log("");

  const cotisation = await asFounder.cotisation();

  console.log("1/4 — Candidature...");
  await (await asCandidat.candidater({ value: cotisation })).wait();
  await (await asFounder.voter(0n, ChoixVote.Approuver)).wait();
  await advanceTime(provider, 7 * 24 * 60 * 60 + 1);
  await (await asCandidat.executer(0n)).wait();
  console.log(`   -> ${candidatAddr} est maintenant Louveteau.`);

  console.log("2/4 — Titularisation...");
  await advanceTime(provider, 90 * 24 * 60 * 60 + 1);
  await (await asFounder.ouvrirTitularisation(candidatAddr)).wait();
  await (await asFounder.voter(1n, ChoixVote.Approuver)).wait();
  await advanceTime(provider, 7 * 24 * 60 * 60 + 1);
  await (await asCandidat.executer(1n)).wait();
  console.log(`   -> ${candidatAddr} est maintenant Loup.`);

  console.log("3/4 — Dépense laissée ouverte (pour voir une proposition en cours)...");
  await (
    await asFounder.proposerDepense(candidatAddr, ethers.parseEther("0.001"), "Hébergement serveur de jeu")
  ).wait();
  console.log("   -> proposition de dépense ouverte, non votée.");

  console.log("4/4 — Terminé.");
  console.log("");
  console.log("Dans MetaMask (réseau Hardhat Local) :");
  console.log(`  - ${FOUNDER} : ton compte fondateur habituel, déjà financé sur ce nœud.`);
  console.log(`  - ${candidatAddr} : importe la clé privée affichée par \`npx hardhat node\` pour ce compte`);
  console.log("    pour voir le point de vue du nouveau Loup.");
}

main().catch((e) => {
  console.error(e.message ?? e);
  console.error(`Le nœud local et le contrat déployé à ${CONTRACT_ADDRESS} sont-ils bien en place ?`);
  process.exitCode = 1;
});
