// Peuple un contrat Meute fraîchement déployé sur un nœud Hardhat local
// (npx hardhat node) avec un état varié — pour avoir tout de suite un
// contrat avec des Louveteaux/Loups actifs et dormants/votes/historique/
// trésor à explorer dans le front, plutôt que de tout rejouer à la main
// via MetaMask. À relancer à chaque redémarrage du nœud (son état repart
// de zéro à chaque fois).
//
// Mapping des comptes `npx hardhat node` (toujours les mêmes adresses,
// mnémonique par défaut fixe) :
//   Account #0        -> Loup actif
//   Account #1        -> Louveteau (jamais titularisé)
//   Account #2        -> Candidat (candidature ouverte, non votée)
//   Account #3        -> Loup rendu dormant
//   Account #4        -> Visiteur (jamais touché, aucune carte)
//   Account #6        -> Louveteau (jamais titularisé)
//   Account #7        -> Loup rendu dormant
//   Account #8        -> Loup rendu dormant
//   Account #9        -> Loup actif
//   Account #10       -> Loup actif
//   Account #11       -> Banni (admis puis exclu par vote — carte brûlée,
//                        distinct d'une démission volontaire)
//   Account #12, #13, #14 -> admis puis démissionnaires, gonflent juste le trésor
//   (le fondateur du module Ignition, une adresse à part, reste Loup actif)
//
// État final : 4 Loups actifs (fondateur + #0, #9, #10), 3 Loups dormants
// (#3, #7, #8), 2 Louveteaux (#1, #6), 1 candidature en cours (#2), 1 banni
// (#11), trésor > 0, une dépense laissée ouverte.
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
//
// Pour avoir Account #0..#13 dans MetaMask sans importer chaque clé
// privée séparément à la main, deux options :
//   - le plus sûr : copier chaque clé privée affichée par `npx hardhat
//     node` et l'importer une par une (Importer un compte) — un peu plus
//     long, mais ne touche à rien d'autre dans MetaMask ;
//   - éviter d'importer la phrase secrète par défaut de Hardhat comme un
//     nouveau portefeuille : elle est publique et réutilisée par des
//     milliers de devs, MetaMask peut alors se mettre à scanner et
//     importer des centaines de comptes sans rapport.

import { ethers } from "ethers";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS ?? "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const FOUNDER = process.env.FOUNDER ?? "0x95B5d450178C9f13dc977655a9A70a17Aac6c8d3";

const ChoixVote = { Approuver: 0, Rejeter: 1, Ajourner: 2 };
const JOUR = 24 * 60 * 60;

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

/** Envoie une tx qui ouvre une proposition et retourne son proposalId réel,
 *  lu depuis l'event émis — plus robuste qu'un compteur tenu à la main. */
async function ouvrirEtRecupererId(contract, txPromise) {
  const receipt = await (await txPromise).wait();
  for (const log of receipt.logs) {
    let parsed;
    try {
      parsed = contract.interface.parseLog(log);
    } catch {
      continue;
    }
    if (parsed?.name === "PropositionOuverte") return parsed.args.proposalId;
  }
  throw new Error("PropositionOuverte introuvable dans les logs de la transaction.");
}

/** Fait passer une adresse de rien à Loup : candidature -> admission -> probation -> titularisation. */
async function devenirLoup(contracts, candidatAddr, votants) {
  const candidatContract = contracts.get(candidatAddr);
  const candId = await ouvrirEtRecupererId(
    candidatContract,
    candidatContract.candidater({ value: contracts.cotisation }),
  );
  for (const v of votants) await (await contracts.get(v).voter(candId, ChoixVote.Approuver)).wait();
  await advanceTime(contracts.provider, 7 * JOUR + 1);
  await (await candidatContract.executer(candId)).wait();

  await advanceTime(contracts.provider, 90 * JOUR + 1);
  const titId = await ouvrirEtRecupererId(
    contracts.get(votants[0]),
    contracts.get(votants[0]).ouvrirTitularisation(candidatAddr),
  );
  for (const v of votants) await (await contracts.get(v).voter(titId, ChoixVote.Approuver)).wait();
  await advanceTime(contracts.provider, 7 * JOUR + 1);
  await (await candidatContract.executer(titId)).wait();
}

/** Fait candidater une adresse et laisse la carte au rang Louveteau, sans jamais titulariser. */
async function devenirLouveteau(contracts, candidatAddr, votants) {
  const c = contracts.get(candidatAddr);
  const id = await ouvrirEtRecupererId(c, c.candidater({ value: contracts.cotisation }));
  for (const v of votants) await (await contracts.get(v).voter(id, ChoixVote.Approuver)).wait();
  await advanceTime(contracts.provider, 7 * JOUR + 1);
  await (await c.executer(id)).wait();
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const abi = loadAbi();

  await provider.send("hardhat_impersonateAccount", [FOUNDER]);
  await provider.send("hardhat_setBalance", [FOUNDER, "0x56BC75E2D63100000"]); // 100 ETH
  // provider.getSigner() vérifie l'adresse contre eth_accounts, qui ne
  // liste jamais les comptes impersonated — il faut construire le signer
  // directement pour contourner cette vérification côté ethers (le nœud,
  // lui, accepte bien les transactions de cette adresse).
  const founderSigner = new ethers.JsonRpcSigner(provider, ethers.getAddress(FOUNDER));

  const nodeAccounts = await provider.send("eth_accounts", []);
  if (nodeAccounts.length < 15) throw new Error("Pas assez de comptes de test sur le nœud (besoin d'au moins 15).");

  const acc = (n) => nodeAccounts[n];
  const loup0 = acc(0);
  const louveteau1 = acc(1);
  const candidat2 = acc(2);
  const dormant3 = acc(3);
  const visiteur4 = acc(4);
  const louveteau6 = acc(6);
  const dormant7 = acc(7);
  const dormant8 = acc(8);
  const loup9 = acc(9);
  const loup10 = acc(10);
  const banni11 = acc(11);
  const boosters = [acc(12), acc(13), acc(14)];

  const usedAccounts = [
    loup0,
    louveteau1,
    candidat2,
    dormant3,
    louveteau6,
    dormant7,
    dormant8,
    loup9,
    loup10,
    banni11,
    ...boosters,
  ];
  const signers = new Map();
  signers.set(FOUNDER.toLowerCase(), founderSigner);
  for (const addr of usedAccounts) signers.set(addr.toLowerCase(), await provider.getSigner(addr));

  const contracts = {
    provider,
    get(addr) {
      return new ethers.Contract(CONTRACT_ADDRESS, abi, signers.get(addr.toLowerCase()));
    },
  };
  const asFounder = contracts.get(FOUNDER);
  contracts.cotisation = await asFounder.cotisation();

  console.log(`Fondateur   (Loup actif)  : ${FOUNDER}`);
  console.log(`Account #0  (Loup actif)  : ${loup0}`);
  console.log(`Account #1  (Louveteau)   : ${louveteau1}`);
  console.log(`Account #2  (Candidat)    : ${candidat2}`);
  console.log(`Account #3  (Loup dormant): ${dormant3}`);
  console.log(`Account #4  (Visiteur)    : ${visiteur4}`);
  console.log(`Account #6  (Louveteau)   : ${louveteau6}`);
  console.log(`Account #7  (Loup dormant): ${dormant7}`);
  console.log(`Account #8  (Loup dormant): ${dormant8}`);
  console.log(`Account #9  (Loup actif)  : ${loup9}`);
  console.log(`Account #10 (Loup actif)  : ${loup10}`);
  console.log(`Account #11 (Banni)       : ${banni11}`);
  console.log("");

  console.log("1/8 — Account #0 rejoint la meute...");
  await devenirLoup(contracts, loup0, [FOUNDER]);

  console.log("2/8 — Account #3 rejoint la meute (deviendra dormant)...");
  await devenirLoup(contracts, dormant3, [FOUNDER, loup0]);

  console.log("3/8 — Account #7 rejoint la meute (deviendra dormant)...");
  await devenirLoup(contracts, dormant7, [FOUNDER, loup0, dormant3]);

  console.log("4/8 — Account #8 rejoint la meute (deviendra dormant)...");
  await devenirLoup(contracts, dormant8, [FOUNDER, loup0, dormant3, dormant7]);

  console.log("5/8 — Account #9 et #10 rejoignent la meute...");
  await devenirLoup(contracts, loup9, [FOUNDER, loup0, dormant3, dormant7, dormant8]);
  await devenirLoup(contracts, loup10, [FOUNDER, loup0, dormant3, dormant7, dormant8, loup9]);

  // Le seuil de majorité grandit avec le nombre de Loups actifs (snapshot
  // figé à l'ouverture) : à partir d'ici on est tous les 7, donc il faut
  // les faire voter tous pour être sûr de dépasser la majorité à chaque
  // fois, plutôt qu'un sous-ensemble fixe qui suffisait au début.
  const tousLesLoups = [FOUNDER, loup0, dormant3, dormant7, dormant8, loup9, loup10];

  console.log("6/8 — Account #1 et #6 candidatent et restent en probation (jamais titularisés)...");
  await devenirLouveteau(contracts, louveteau1, tousLesLoups);
  await devenirLouveteau(contracts, louveteau6, tousLesLoups);

  console.log("7/8 — Account #11 rejoint la meute puis est exclu par vote (banni, pas démissionnaire)...");
  await devenirLouveteau(contracts, banni11, tousLesLoups);
  {
    const idExclusion = await ouvrirEtRecupererId(asFounder, asFounder.proposerExclusion(banni11));
    for (const v of tousLesLoups) await (await contracts.get(v).voter(idExclusion, ChoixVote.Approuver)).wait();
    await advanceTime(provider, 7 * JOUR + 1);
    await (await asFounder.executer(idExclusion)).wait();
  }

  console.log("8/8 — Trésor : 3 candidats admis puis démissionnaires (cotisation non remboursée)...");
  for (const boosterAddr of boosters) {
    const c = contracts.get(boosterAddr);
    const id = await ouvrirEtRecupererId(c, c.candidater({ value: contracts.cotisation }));
    for (const v of tousLesLoups) await (await contracts.get(v).voter(id, ChoixVote.Approuver)).wait();
    await advanceTime(provider, 7 * JOUR + 1);
    await (await c.executer(id)).wait();
    await (await c.demissionner()).wait();
  }
  const treasury = await provider.getBalance(CONTRACT_ADDRESS);
  console.log(`   -> trésor : ${ethers.formatEther(treasury)} ETH.`);

  console.log("Rendre #3, #7 et #8 dormants (365j+ sans agir), les autres restent actifs...");
  await advanceTime(provider, 366 * JOUR);
  for (const v of [FOUNDER, loup0, loup9, loup10]) await (await contracts.get(v).jeSuisLa()).wait();

  console.log("Ouverture d'une candidature (#2) et d'une dépense, laissées non votées...");
  await (await contracts.get(candidat2).candidater({ value: contracts.cotisation })).wait();
  await (
    await asFounder.proposerDepense(louveteau1, ethers.parseEther("0.01"), "Hébergement serveur de jeu")
  ).wait();

  console.log("");
  console.log("Terminé. Résumé (réseau Hardhat Local dans MetaMask) :");
  console.log(`  Fondateur   (Loup actif)  : ${FOUNDER} — ton compte habituel, déjà financé.`);
  console.log(`  Account #0  (Loup actif)  : ${loup0}`);
  console.log(`  Account #1  (Louveteau)   : ${louveteau1}`);
  console.log(`  Account #2  (Candidat)    : ${candidat2}`);
  console.log(`  Account #3  (Loup dormant): ${dormant3}`);
  console.log(`  Account #4  (Visiteur)    : ${visiteur4} — jamais touché, aucune carte.`);
  console.log(`  Account #6  (Louveteau)   : ${louveteau6}`);
  console.log(`  Account #7  (Loup dormant): ${dormant7}`);
  console.log(`  Account #8  (Loup dormant): ${dormant8}`);
  console.log(`  Account #9  (Loup actif)  : ${loup9}`);
  console.log(`  Account #10 (Loup actif)  : ${loup10}`);
  console.log(`  Account #11 (Banni)       : ${banni11}`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  console.error(`Le nœud local et le contrat déployé à ${CONTRACT_ADDRESS} sont-ils bien en place ?`);
  process.exitCode = 1;
});
