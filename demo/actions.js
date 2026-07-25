// Actions rejouables du scénario de démo, une par étape de demo/scenario.js.
// Séparé de scripts/seed-local.js volontairement : seed-local pose un état
// final varié en une fois (utile pour explorer le front), ce module raconte
// une histoire pas à pas (utile pour la piloter en direct devant un jury).
//
// N'a de sens que sur un nœud Hardhat local (utilise hardhat_reset,
// evm_increaseTime — inexistants sur un vrai réseau).

import { ethers } from "ethers";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const FOUNDER = process.env.FOUNDER ?? "0x95B5d450178C9f13dc977655a9A70a17Aac6c8d3";
const DEPLOYMENT_JOURNAL = join(__dirname, "..", "ignition", "deployments", "chain-31337", "deployed_addresses.json");

export const RESET_COMMAND = [
  { type: "code", text: "npx hardhat ignition deploy ignition/modules/Meute.ts --network localhost --reset" },
  { type: "comment", text: "lit l'adresse déployée dans ignition/deployments/chain-31337/deployed_addresses.json" },
];

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

/** Récupère l'id de la proposition depuis l'event PropositionOuverte, et en
 *  profite pour enregistrer son auteur (aussi dans l'event, pas dans la
 *  struct on-chain) dans ctx.auteurs — sinon buildIndex n'a aucun moyen de
 *  savoir qui a ouvert quoi. */
async function ouvrirEtRecupererId(ctx, contract, txPromise) {
  const receipt = await (await txPromise).wait();
  for (const log of receipt.logs) {
    let parsed;
    try {
      parsed = contract.interface.parseLog(log);
    } catch {
      continue;
    }
    if (parsed?.name === "PropositionOuverte") {
      ctx.auteurs[parsed.args.proposalId.toString()] = parsed.args.auteur;
      return parsed.args.proposalId;
    }
  }
  throw new Error("PropositionOuverte introuvable dans les logs de la transaction.");
}

/** État partagé entre les étapes d'une même partie (remis à zéro par reset()). */
export function createContext() {
  return { provider: null, contracts: null, founder: null, loups: [], candidat: null, ids: {}, auteurs: {} };
}

async function connect(ctx, contractAddress) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const abi = loadAbi();

  await provider.send("hardhat_impersonateAccount", [FOUNDER]);
  await provider.send("hardhat_setBalance", [FOUNDER, "0x56BC75E2D63100000"]);
  const founderSigner = new ethers.JsonRpcSigner(provider, ethers.getAddress(FOUNDER));

  const nodeAccounts = await provider.send("eth_accounts", []);
  if (nodeAccounts.length < 19) throw new Error("Pas assez de comptes de test sur le nœud (besoin d'au moins 19).");

  // Rôles fixes parmi les comptes du nœud, distincts du fondateur — utilisés
  // par les scénarios de test isolés (exclusion, ajournement, dormance).
  const roleAddrs = {
    loup2: nodeAccounts[0],
    candidat: nodeAccounts[1],
    loup3: nodeAccounts[3],
    loup4: nodeAccounts[4],
    louveteauA: nodeAccounts[5],
    louveteauB: nodeAccounts[6],
    boosterA: nodeAccounts[7],
    boosterB: nodeAccounts[8],
  };

  // Tous les comptes ont un signer prêt, pas seulement les rôles nommés —
  // le scénario de certification (mise en place riche) a besoin de bien
  // plus d'adresses que les scénarios de test isolés.
  const signers = new Map([[FOUNDER.toLowerCase(), founderSigner]]);
  for (const addr of nodeAccounts) {
    signers.set(addr.toLowerCase(), await provider.getSigner(addr));
  }

  ctx.provider = provider;
  ctx.contractAddress = contractAddress;
  ctx.founder = FOUNDER;
  ctx.candidat = roleAddrs.candidat;
  ctx.roles = roleAddrs;
  ctx.nodeAccounts = nodeAccounts;
  ctx.loups = [FOUNDER]; // grandit au fil des admissions/titularisations
  ctx.knownAddresses = [FOUNDER, roleAddrs.candidat];
  ctx.contracts = {
    get(addr) {
      return new ethers.Contract(contractAddress, abi, signers.get(addr.toLowerCase()));
    },
  };
  ctx.ids = {};
  ctx.auteurs = {};
}

async function avancerTemps(ctx, seconds) {
  await ctx.provider.send("evm_increaseTime", [seconds]);
  await ctx.provider.send("evm_mine", []);
}

async function tousVotent(ctx, id, choix = ChoixVote.Approuver) {
  for (const v of ctx.loups) {
    await (await ctx.contracts.get(v).voter(id, choix)).wait();
  }
}

/** Candidature -> vote (tous les Loups actuels) -> 7j -> exécution.
 *  Ajoute l'adresse à ctx.loups si `titulariser` (probation + 2e vote),
 *  sinon elle reste Louveteau. Enregistre les ids dans ctx.ids pour
 *  qu'elles apparaissent dans la liste des propositions passées, pas
 *  seulement dans les compteurs agrégés. */
async function faireRejoindre(ctx, addr, { titulariser }) {
  const founder = ctx.contracts.get(ctx.founder);
  const c = ctx.contracts.get(addr);
  const id = await ouvrirEtRecupererId(ctx, c, c.candidater({ value: await founder.cotisation() }));
  await tousVotent(ctx, id);
  await avancerTemps(ctx, 7 * JOUR + 1);
  await (await c.executer(id)).wait();
  ctx.ids[`admission_${addr}`] = id;

  if (!titulariser) return;

  await avancerTemps(ctx, 90 * JOUR + 1);
  const titId = await ouvrirEtRecupererId(ctx, founder, founder.ouvrirTitularisation(addr));
  await tousVotent(ctx, titId);
  await avancerTemps(ctx, 7 * JOUR + 1);
  await (await c.executer(titId)).wait();
  ctx.ids[`titularisation_${addr}`] = titId;
  ctx.loups.push(addr);
}

/** Redéploie un contrat Meute tout neuf (`--reset` ignore le déploiement
 *  précédent d'Ignition) — pas besoin de remettre la chaîne à zéro, une
 *  nouvelle instance vide du contrat suffit à repartir de rien. */
export async function reset(ctx) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["hardhat", "ignition", "deploy", "ignition/modules/Meute.ts", "--network", "localhost", "--reset"],
      { cwd: join(__dirname, ".."), stdio: "inherit" },
    );
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Déploiement échoué (code ${code})`))));
  });
  const addresses = JSON.parse(readFileSync(DEPLOYMENT_JOURNAL, "utf8"));
  const contractAddress = addresses["MeuteModule#Meute"];
  if (!contractAddress) throw new Error("Adresse du contrat introuvable après déploiement.");
  await connect(ctx, contractAddress);
  return `Contrat redéployé à ${contractAddress}.`;
}

/** Mise en place : la meute a déjà une vraie activité avant même que
 *  l'histoire commence — 3 Loups de plus, 2 Louveteaux, de la trésorerie,
 *  plusieurs propositions déjà passées, et une encore ouverte. */
// Nombre de Loups actifs / dormants visés dans l'état initial de la
// certification (2026-07-25, sur demande de Cyril) — au-delà de la
// trésorerie/propositions, ça donne un vrai volume à montrer côté front.
const LOUPS_ACTIFS_CIBLE = 10; // fondateur inclus
const LOUPS_DORMANTS_CIBLE = 5;

export async function miseEnPlace(ctx) {
  const { louveteauA, louveteauB, boosterA, boosterB } = ctx.roles;

  // Un pool d'adresses dédié à cette mise en place, distinct des rôles
  // utilisés plus loin dans cette même fonction (candidat, louveteauA/B,
  // boosterA/B) — sinon une même adresse se retrouverait candidater() deux
  // fois (DejaMembre). loup2/loup3/loup4 ne servent qu'aux scénarios de
  // test isolés (jamais dans la même session que la certification), donc
  // libres de réutilisation ici.
  const reserves = new Set([ctx.candidat, louveteauA, louveteauB, boosterA, boosterB].map((a) => a.toLowerCase()));
  const pool = ctx.nodeAccounts.filter((a) => !reserves.has(a.toLowerCase()));
  const nbLoupsATitulariser = LOUPS_ACTIFS_CIBLE - 1 + LOUPS_DORMANTS_CIBLE;
  const nouveauxLoups = pool.slice(0, nbLoupsATitulariser);

  // Une unité de progression par Loup admis + 1 pour le réveil partiel + 1
  // par Louveteau + 1 par booster + 1 pour la proposition finale.
  ctx.progress?.setTotal(nouveauxLoups.length + 1 + 2 + 2 + 1);

  // Chaque admission/titularisation fait voter tous les Loups déjà présents
  // (faireRejoindre → tousVotent) : leur activité est donc rafraîchie à
  // chaque tour, personne ne devient dormant pendant cette phase.
  for (const addr of nouveauxLoups) {
    await faireRejoindre(ctx, addr, { titulariser: true });
    ctx.progress?.tick();
  }
  ctx.knownAddresses.push(...nouveauxLoups);

  // On endort volontairement LOUPS_DORMANTS_CIBLE d'entre eux : on avance
  // le temps au-delà du délai de dormance, puis seuls les autres confirment
  // leur présence — les silencieux restent dormants pour de vrai.
  const loupsAReveiller = [ctx.founder, ...nouveauxLoups.slice(0, LOUPS_ACTIFS_CIBLE - 1)];
  const loupsLaissesDormants = nouveauxLoups.slice(LOUPS_ACTIFS_CIBLE - 1);
  await avancerTemps(ctx, 180 * JOUR + 1);
  for (const addr of loupsAReveiller) {
    await (await ctx.contracts.get(addr).jeSuisLa()).wait();
  }
  ctx.progress?.tick();
  // Seuls les réveillés continuent de voter à partir d'ici — voter avec un
  // dormant le réveillerait, ce qui ruinerait l'état qu'on vient de figer.
  ctx.loups = loupsAReveiller;

  await faireRejoindre(ctx, louveteauA, { titulariser: false });
  ctx.progress?.tick();
  await faireRejoindre(ctx, louveteauB, { titulariser: false });
  ctx.progress?.tick();
  ctx.knownAddresses.push(louveteauA, louveteauB);

  // Deux candidats admis puis démissionnaires : gonflent la trésorerie
  // (cotisation non remboursée) sans compter dans les effectifs actuels.
  for (const addr of [boosterA, boosterB]) {
    const c = ctx.contracts.get(addr);
    const founder = ctx.contracts.get(ctx.founder);
    const id = await ouvrirEtRecupererId(ctx, c, c.candidater({ value: await founder.cotisation() }));
    await tousVotent(ctx, id);
    await avancerTemps(ctx, 7 * JOUR + 1);
    await (await c.executer(id)).wait();
    ctx.ids[`admission_${addr}`] = id;
    await (await c.demissionner()).wait();
    ctx.progress?.tick();
  }

  // Une proposition de dépense laissée ouverte, jamais votée — pour
  // démarrer avec "1 proposition en cours" plutôt qu'un tableau vide.
  const founder = ctx.contracts.get(ctx.founder);
  ctx.ids.depenseInitiale = await ouvrirEtRecupererId(ctx, 
    founder,
    founder.proposerDepense(louveteauA, ethers.parseEther("0.002"), "Achat d'un nom de domaine"),
  );
  ctx.progress?.tick();

  return `Meute mise en place : ${ctx.loups.length} Loups actifs, ${loupsLaissesDormants.length} Loups dormants, 2 Louveteaux, trésorerie alimentée, plusieurs propositions passées et une en cours.`;
}

export async function candidatPostule(ctx) {
  const cotisation = await ctx.contracts.get(ctx.founder).cotisation();
  const c = ctx.contracts.get(ctx.candidat);
  ctx.ids.admission = await ouvrirEtRecupererId(ctx, c, c.candidater({ value: cotisation }));
  return `Candidature ouverte (id ${ctx.ids.admission}), cotisation versée à la trésorerie.`;
}

export async function voteAdmission(ctx) {
  await tousVotent(ctx, ctx.ids.admission);
  return `Les ${ctx.loups.length} Loups actifs votent Approuver.`;
}

export async function tempsVoteAdmission(ctx) {
  await avancerTemps(ctx, 7 * JOUR + 1);
  return "7 jours plus tard : la fenêtre de vote est close.";
}

export async function executionAdmission(ctx) {
  await (await ctx.contracts.get(ctx.candidat).executer(ctx.ids.admission)).wait();
  return "Candidature exécutée : le candidat devient Louveteau.";
}

export async function tempsProbation(ctx) {
  await avancerTemps(ctx, 90 * JOUR + 1);
  return "90 jours plus tard : la probation est terminée.";
}

export async function ouvertureTitularisation(ctx) {
  const c = ctx.contracts.get(ctx.founder);
  ctx.ids.titularisation = await ouvrirEtRecupererId(ctx, c, c.ouvrirTitularisation(ctx.candidat));
  return `Proposition de titularisation ouverte (id ${ctx.ids.titularisation}).`;
}

export async function voteTitularisation(ctx) {
  await tousVotent(ctx, ctx.ids.titularisation);
  return `Les ${ctx.loups.length} Loups actifs votent Approuver.`;
}

export async function tempsVoteTitularisation(ctx) {
  await avancerTemps(ctx, 7 * JOUR + 1);
  return "7 jours plus tard : la fenêtre de vote est close.";
}

export async function executionTitularisation(ctx) {
  await (await ctx.contracts.get(ctx.candidat).executer(ctx.ids.titularisation)).wait();
  ctx.loups.push(ctx.candidat);
  return "Titularisation exécutée : le Louveteau devient Loup à part entière.";
}

export async function propositionDepense(ctx) {
  const c = ctx.contracts.get(ctx.founder);
  ctx.ids.depense = await ouvrirEtRecupererId(ctx, 
    c,
    c.proposerDepense(ctx.candidat, ethers.parseEther("0.005"), "Hébergement serveur de jeu"),
  );
  return `Proposition de dépense ouverte (id ${ctx.ids.depense}), 0.005 ETH vers le nouveau Loup.`;
}

export async function voteDepense(ctx) {
  await tousVotent(ctx, ctx.ids.depense);
  return `Les ${ctx.loups.length} Loups actifs votent Approuver.`;
}

export async function tempsVoteDepense(ctx) {
  await avancerTemps(ctx, 7 * JOUR + 1);
  return "7 jours plus tard : la fenêtre de vote est close.";
}

export async function executionDepense(ctx) {
  await (await ctx.contracts.get(ctx.founder).executer(ctx.ids.depense)).wait();
  const solde = await ctx.provider.getBalance(ctx.contractAddress);
  return `Dépense exécutée : les fonds partent de la trésorerie. Trésor restant : ${ethers.formatEther(solde)} ETH.`;
}

// ---------------------------------------------------------------------
// Scénario de test : Exclusion
// ---------------------------------------------------------------------

/** 3 Loups actifs (fondateur + 2), pour qu'exclure l'un d'eux soit un vrai
 *  vote à majorité, pas une décision solitaire. */
export async function setupExclusion(ctx) {
  const { loup2, loup3 } = ctx.roles;
  await faireRejoindre(ctx, loup2, { titulariser: true });
  await faireRejoindre(ctx, loup3, { titulariser: true });
  ctx.knownAddresses.push(loup2, loup3);
  return `3 Loups actifs en place (fondateur, ${loup2.slice(0, 8)}…, ${loup3.slice(0, 8)}… — ce dernier sera la cible).`;
}

export async function ouvrirExclusion(ctx) {
  const founder = ctx.contracts.get(ctx.founder);
  ctx.ids.exclusion = await ouvrirEtRecupererId(ctx, founder, founder.proposerExclusion(ctx.roles.loup3));
  return `Proposition d'exclusion ouverte contre ${ctx.roles.loup3} (id ${ctx.ids.exclusion}).`;
}

export async function voteExclusion(ctx) {
  // La cible ne peut pas voter sur sa propre exclusion (ConflitInteret) —
  // seuls les autres Loups actifs votent.
  const votants = ctx.loups.filter((a) => a !== ctx.roles.loup3);
  for (const v of votants) {
    await (await ctx.contracts.get(v).voter(ctx.ids.exclusion, ChoixVote.Approuver)).wait();
  }
  return `Les ${votants.length} autres Loups actifs votent Approuver (la cible ne peut pas voter sur son propre cas).`;
}

export async function tempsVoteExclusion(ctx) {
  await avancerTemps(ctx, 7 * JOUR + 1);
  return "7 jours plus tard : la fenêtre de vote est close.";
}

export async function executionExclusion(ctx) {
  await (await ctx.contracts.get(ctx.founder).executer(ctx.ids.exclusion)).wait();
  ctx.loups = ctx.loups.filter((a) => a !== ctx.roles.loup3);
  return "Exclusion exécutée : la carte est brûlée, l'ancien Loup n'est plus membre du tout.";
}

// ---------------------------------------------------------------------
// Scénario de test : Ajournement (plafond AJOURNEMENTS_MAX)
// ---------------------------------------------------------------------

/** Un Louveteau déjà admis, probation déjà écoulée une première fois —
 *  prêt pour un premier vote de titularisation. 2 Loups actifs pour voter. */
export async function setupAjournement(ctx) {
  await faireRejoindre(ctx, ctx.roles.loup2, { titulariser: true });
  await faireRejoindre(ctx, ctx.roles.candidat, { titulariser: false });
  ctx.knownAddresses.push(ctx.roles.loup2);
  await avancerTemps(ctx, 90 * JOUR + 1);
  return "Louveteau admis, probation écoulée, 2 Loups actifs prêts à voter.";
}

export async function ouvrirTitularisation1(ctx) {
  const founder = ctx.contracts.get(ctx.founder);
  ctx.ids.titularisation1 = await ouvrirEtRecupererId(ctx, founder, founder.ouvrirTitularisation(ctx.candidat));
  return `Vote de titularisation ouvert (id ${ctx.ids.titularisation1}).`;
}

export async function voteAjourner1(ctx) {
  await tousVotent(ctx, ctx.ids.titularisation1, ChoixVote.Ajourner);
  return "Les Loups votent Ajourner (report).";
}

export async function tempsVoteTitularisation1(ctx) {
  await avancerTemps(ctx, 7 * JOUR + 1);
  return "7 jours plus tard : la fenêtre de vote est close.";
}

export async function executionAjournement1(ctx) {
  await (await ctx.contracts.get(ctx.candidat).executer(ctx.ids.titularisation1)).wait();
  return "Exécuté : ajournement n°1 consommé, le Louveteau reste Louveteau, sa probation redémarre.";
}

export async function tempsNouvelleProbation1(ctx) {
  await avancerTemps(ctx, 90 * JOUR + 1);
  return "90 jours plus tard : la nouvelle probation est terminée.";
}

export async function ouvrirTitularisation2(ctx) {
  const founder = ctx.contracts.get(ctx.founder);
  ctx.ids.titularisation2 = await ouvrirEtRecupererId(ctx, founder, founder.ouvrirTitularisation(ctx.candidat));
  return `Vote de titularisation ouvert (id ${ctx.ids.titularisation2}).`;
}

export async function voteAjourner2(ctx) {
  await tousVotent(ctx, ctx.ids.titularisation2, ChoixVote.Ajourner);
  return "Les Loups votent Ajourner (report) — 2e fois.";
}

export async function tempsVoteTitularisation2(ctx) {
  await avancerTemps(ctx, 7 * JOUR + 1);
  return "7 jours plus tard : la fenêtre de vote est close.";
}

export async function executionAjournement2(ctx) {
  await (await ctx.contracts.get(ctx.candidat).executer(ctx.ids.titularisation2)).wait();
  return "Exécuté : ajournement n°2 consommé — AJOURNEMENTS_MAX (2) est désormais atteint.";
}

export async function tempsNouvelleProbation2(ctx) {
  await avancerTemps(ctx, 90 * JOUR + 1);
  return "90 jours plus tard : la nouvelle probation est terminée.";
}

export async function ouvrirTitularisation3(ctx) {
  const founder = ctx.contracts.get(ctx.founder);
  ctx.ids.titularisation3 = await ouvrirEtRecupererId(ctx, founder, founder.ouvrirTitularisation(ctx.candidat));
  return `Vote de titularisation ouvert (id ${ctx.ids.titularisation3}).`;
}

/** Ce vote DOIT échouer — {voter} rejette Ajourner une fois le plafond
 *  atteint (ChoixInvalide). C'est le point du test : un revert ici est
 *  le succès attendu, pas une erreur du panneau. */
export async function tentativeAjournementRefuse(ctx) {
  try {
    await (await ctx.contracts.get(ctx.founder).voter(ctx.ids.titularisation3, ChoixVote.Ajourner)).wait();
    return "Inattendu : le vote Ajourner est passé — le plafond ne s'est pas appliqué (bug ?).";
  } catch {
    return "Comme prévu : le contrat refuse (ChoixInvalide) — AJOURNEMENTS_MAX est déjà atteint, impossible d'ajourner une 3e fois.";
  }
}

// ---------------------------------------------------------------------
// Scénario de test : Dormance et réveil (quorum)
// ---------------------------------------------------------------------

/** 3 Loups actifs — l'un d'eux (loup3) ne fera jamais rien ensuite, pour
 *  devenir dormant pendant que les deux autres restent actifs. */
export async function setupDormance(ctx) {
  await faireRejoindre(ctx, ctx.roles.loup2, { titulariser: true });
  await faireRejoindre(ctx, ctx.roles.loup3, { titulariser: true });
  ctx.knownAddresses.push(ctx.roles.loup2, ctx.roles.loup3);
  return "3 Loups actifs en place. loup3 ne fera plus rien à partir de maintenant.";
}

export async function avancerUnAn(ctx) {
  await avancerTemps(ctx, 366 * JOUR);
  return "366 jours plus tard, sans aucune activité de personne.";
}

export async function reveilPartiel(ctx) {
  await (await ctx.contracts.get(ctx.founder).jeSuisLa()).wait();
  await (await ctx.contracts.get(ctx.roles.loup2).jeSuisLa()).wait();
  return "Le fondateur et loup2 confirment leur présence (jeSuisLa) — loup3 ne fait rien, reste dormant.";
}

export async function ouvrirDepenseDormance(ctx) {
  const founder = ctx.contracts.get(ctx.founder);
  ctx.ids.depenseDormance = await ouvrirEtRecupererId(ctx, 
    founder,
    founder.proposerDepense(ctx.roles.loup2, ethers.parseEther("0.001"), "Test dormance"),
  );
  return `Proposition ouverte (id ${ctx.ids.depenseDormance}) — le snapshot devrait figer 2 Loups actifs, pas 3 (loup3 est dormant).`;
}

export async function voteDepenseDormance(ctx) {
  await (await ctx.contracts.get(ctx.founder).voter(ctx.ids.depenseDormance, ChoixVote.Approuver)).wait();
  await (await ctx.contracts.get(ctx.roles.loup2).voter(ctx.ids.depenseDormance, ChoixVote.Approuver)).wait();
  return "Le fondateur et loup2 votent Approuver — 2 votes sur un snapshot de 2 : ça doit suffire.";
}

export async function tempsVoteDepenseDormance(ctx) {
  await avancerTemps(ctx, 7 * JOUR + 1);
  return "7 jours plus tard : la fenêtre de vote est close.";
}

export async function executionDepenseDormance(ctx) {
  await (await ctx.contracts.get(ctx.founder).executer(ctx.ids.depenseDormance)).wait();
  return "Exécuté sans loup3 : la preuve que la dormance l'a bien exclu du quorum.";
}

export async function reveilTardif(ctx) {
  await (await ctx.contracts.get(ctx.roles.loup3).jeSuisLa()).wait();
  return "loup3 se réveille enfin — trop tard pour peser sur le vote déjà clos (le snapshot ne bouge plus rétroactivement).";
}

/** Vue d'ensemble (stats + propositions), même format que dao-sync côté
 *  Sepolia — pour que le front puisse afficher le mode local avec le même
 *  code que le mode prod, juste une source différente. */
export async function buildIndex(ctx) {
  if (!ctx.provider) throw new Error("Pas encore connecté — clique sur Réinitialiser.");
  const founder = ctx.contracts.get(ctx.founder);
  const treasuryWei = await ctx.provider.getBalance(ctx.contractAddress);
  const loupsActifs = Number(await founder.loupsActifs());

  let loupsDormants = 0;
  let louveteaux = 0;
  for (const addr of ctx.knownAddresses) {
    // carte() renvoie une struct à zéro (donc rang Louveteau) pour une
    // adresse qui n'a jamais eu de carte du tout — il faut d'abord vérifier
    // que la carte existe vraiment (le contrat est un ERC721).
    if ((await founder.balanceOf(addr)) === 0n) continue;
    const c = await founder.carte(addr);
    if (Number(c.rang) === 0) {
      louveteaux += 1;
      continue;
    }
    if (await founder.estDormant(addr)) loupsDormants += 1;
  }

  const proposals = [];
  let votesExprimes = 0;
  let propositionsOuvertes = 0;
  for (const id of Object.values(ctx.ids)) {
    const p = await founder.proposition(id);
    votesExprimes += Number(p.votesApprouver) + Number(p.votesRejeter) + Number(p.votesAjourner);
    if (!p.executee) propositionsOuvertes += 1;
    proposals.push({
      id: id.toString(),
      typeProp: Number(p.typeProp),
      cible: p.cible,
      auteur: ctx.auteurs[id.toString()] ?? "0x0000000000000000000000000000000000000000",
      echeance: p.echeance.toString(),
      snapshotActifs: Number(p.snapshotActifs),
      snapshotFige: p.snapshotFige,
      executee: p.executee,
      votesApprouver: Number(p.votesApprouver),
      votesRejeter: Number(p.votesRejeter),
      votesAjourner: Number(p.votesAjourner),
      montant: p.montant.toString(),
      motif: p.motif,
    });
  }

  return {
    stats: { treasuryWei: treasuryWei.toString(), loupsActifs, loupsDormants, louveteaux, votesExprimes, propositionsOuvertes },
    proposals,
    memberActivity: {},
  };
}

// ---------------------------------------------------------------------
// Scénario de test : Dépense
// ---------------------------------------------------------------------

/** 3 Loups actifs (fondateur + 2) — leurs cotisations d'admission
 *  alimentent déjà la trésorerie, pas besoin d'étape de financement à part.
 *  loup2 sera le bénéficiaire : ça permet de montrer le conflit d'intérêt
 *  (il ne pourra pas voter sur sa propre dépense) en plus du mécanisme de
 *  dépense lui-même. */
export async function setupDepense(ctx) {
  const { loup2, loup3 } = ctx.roles;
  await faireRejoindre(ctx, loup2, { titulariser: true });
  await faireRejoindre(ctx, loup3, { titulariser: true });
  ctx.knownAddresses.push(loup2, loup3);
  return `3 Loups actifs en place (trésorerie déjà alimentée par leurs cotisations) — ${loup2.slice(0, 8)}… sera le bénéficiaire.`;
}

export async function ouvrirDepenseTest(ctx) {
  const founder = ctx.contracts.get(ctx.founder);
  ctx.ids.depenseTest = await ouvrirEtRecupererId(ctx, 
    founder,
    founder.proposerDepense(ctx.roles.loup2, ethers.parseEther("0.005"), "Test dépense"),
  );
  return `Proposition de dépense ouverte (id ${ctx.ids.depenseTest}) vers ${ctx.roles.loup2.slice(0, 8)}… (0.005 ETH).`;
}

export async function voteDepenseTest(ctx) {
  // Le bénéficiaire (loup2) ne peut pas voter sur sa propre dépense
  // (ConflitInteret) — seuls les autres Loups actifs votent.
  const votants = ctx.loups.filter((a) => a !== ctx.roles.loup2);
  for (const v of votants) {
    await (await ctx.contracts.get(v).voter(ctx.ids.depenseTest, ChoixVote.Approuver)).wait();
  }
  return `Les ${votants.length} autres Loups actifs votent Approuver (le bénéficiaire ne peut pas voter sur son propre cas).`;
}

export async function tempsVoteDepenseTest(ctx) {
  await avancerTemps(ctx, 7 * JOUR + 1);
  return "7 jours plus tard : la fenêtre de vote est close.";
}

export async function executionDepenseTest(ctx) {
  await (await ctx.contracts.get(ctx.founder).executer(ctx.ids.depenseTest)).wait();
  const solde = await ctx.provider.getBalance(ctx.contractAddress);
  return `Dépense exécutée : les fonds partent de la trésorerie vers le bénéficiaire. Trésor restant : ${ethers.formatEther(solde)} ETH.`;
}
