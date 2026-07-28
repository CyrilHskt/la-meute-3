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
  // 5 : le plus haut index de rôle utilisé (loup4 = nodeAccounts[4]) —
  // filet de sécurité générique, tôt, avant même de choisir un scénario.
  if (nodeAccounts.length < 5) throw new Error("Pas assez de comptes de test sur le nœud (besoin d'au moins 5).");

  // Rôles fixes parmi les comptes du nœud, distincts du fondateur — utilisés
  // par les scénarios de test isolés (exclusion, ajournement, dormance).
  const roleAddrs = {
    loup2: nodeAccounts[0],
    candidat: nodeAccounts[1],
    loup3: nodeAccounts[3],
    loup4: nodeAccounts[4],
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

/** Mise en place légère (remplace l'ancienne mise en place à 14 Loups,
 *  devenue inutile une fois les scénarios A/B/C dédiés à la soutenance
 *  créés — voir docs/local/soutenance-prep.md) : 5 comptes réutilisés au
 *  fil des étapes, un maximum de statuts visibles différents pour un
 *  minimum de transactions, plutôt qu'un volume réaliste (ça, c'est le
 *  travail de scripts/seed-local.js). Conçue avec un agent "scénariste"
 *  (variété visible au moindre coût) et un agent "expert code" (formule de
 *  quorum exacte côté Meute.sol : exprimes*4 > actifs*3 — voir
 *  _approuvee) pour rester correcte sur les cas limites (ex: avec 3 Loups
 *  actifs, RIEN n'atteint le quorum sans que TOUS votent).
 *
 *  Rôles réutilisés (mêmes noms que les scénarios de test isolés — sans
 *  risque, un seul scénario tourne à la fois sur un contrat tout neuf) :
 *  loup2 → 1er Loup titularisé, loup3 → 2e Loup titularisé puis laissé
 *  dormant, loup4 → reste Louveteau (jamais titularisé), candidat → refusé
 *  une fois puis libre de redonner (aucun état on-chain ne l'en empêche,
 *  voir _executerAdmission qui rembourse et referme la candidature). */
export async function miseEnPlace(ctx) {
  const { loup2: l1, loup3: l2, loup4: l3, candidat: d } = ctx.roles;
  ctx.knownAddresses.push(l1, l2, l3, d);
  ctx.progress?.setTotal(7);

  // 1. L1 candidate et est titularisé — seul le fondateur vote (1 actif) :
  //    quorum le plus trivial possible, juste pour amorcer la meute.
  await faireRejoindre(ctx, l1, { titulariser: true });
  ctx.progress?.tick();

  // 2. L2 candidate et est titularisé — F+L1 votent (2 actifs).
  await faireRejoindre(ctx, l2, { titulariser: true });
  ctx.progress?.tick();

  // 3. L3 candidate mais reste Louveteau (jamais titularisé) — F+L1+L2
  //    votent (3 actifs) : premier quorum non trivial (100% de participation
  //    exigée avec seulement 3 actifs, cf. _approuvee).
  await faireRejoindre(ctx, l3, { titulariser: false });
  ctx.progress?.tick();

  // 4. Dormance : on avance 181 jours (personne n'agit depuis un moment),
  //    puis seuls F et L1 confirment leur présence — L2 reste dormant sans
  //    aucune transaction dédiée (juste l'absence d'action).
  await avancerTemps(ctx, 181 * JOUR);
  await (await ctx.contracts.get(ctx.founder).jeSuisLa()).wait();
  await (await ctx.contracts.get(l1).jeSuisLa()).wait();
  ctx.progress?.tick();

  // 5. D candidate et est nettement refusé — F+L1 votent Rejeter (L2
  //    dormant, exclu du calcul ; 2 actifs, quorum atteint car les deux
  //    votent). Cotisation remboursée automatiquement par le contrat, D
  //    reste donc libre de redonner plus loin (dons, étape 7).
  {
    const c = ctx.contracts.get(d);
    const id = await ouvrirEtRecupererId(ctx, c, c.candidater({ value: await ctx.contracts.get(ctx.founder).cotisation() }));
    await (await ctx.contracts.get(ctx.founder).voter(id, ChoixVote.Rejeter)).wait();
    await (await ctx.contracts.get(l1).voter(id, ChoixVote.Rejeter)).wait();
    await avancerTemps(ctx, 7 * JOUR + 1);
    await (await c.executer(id)).wait();
    ctx.ids.admissionRefusee = id;
    ctx.progress?.tick();
  }

  // 6. Dépense qui n'atteint jamais le quorum — seul F vote (L1 s'abstient,
  //    L2 dormant) : 1 votant sur 2 actifs, sous les 75% requis.
  {
    const founder = ctx.contracts.get(ctx.founder);
    const id = await ouvrirEtRecupererId(ctx, founder, founder.proposerDepense(l3, ethers.parseEther("0.001"), "Rachat de goodies (jamais assez voté)"));
    await (await founder.voter(id, ChoixVote.Approuver)).wait();
    await avancerTemps(ctx, 7 * JOUR + 1);
    await (await founder.executer(id)).wait();
    ctx.ids.depenseQuorumRate = id;
    ctx.progress?.tick();
  }

  // 7. Une dépense laissée ouverte, jamais votée (une proposition "en
  //    cours" visible dès l'arrivée) + quelques dons pour un petit
  //    classement (3 entrées) sur la page Dons.
  const founder = ctx.contracts.get(ctx.founder);
  ctx.ids.depenseOuverte = await ouvrirEtRecupererId(ctx, founder, founder.proposerDepense(d, ethers.parseEther("0.002"), "Achat d'un nom de domaine"));
  await (await founder.donner({ value: ethers.parseEther("0.5") })).wait();
  await (await ctx.contracts.get(d).donner({ value: ethers.parseEther("0.3") })).wait();
  await (await ctx.contracts.get(l3).donner({ value: ethers.parseEther("0.1") })).wait();
  ctx.progress?.tick();

  return (
    `Meute mise en place : ${ctx.loups.length} Loups actifs (dont 1 dormant), 1 Louveteau, ` +
    "1 candidature refusée et 1 dépense sans quorum dans l'historique, 0.9 ETH reçus en dons, " +
    "une dépense encore en cours."
  );
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
  // Le bénéficiaire (ctx.candidat, tout juste titularisé) ne peut pas voter
  // sur sa propre dépense (ConflitInteret) — même filtre que
  // voteDepenseTest/voteDepenseDormance plus haut dans ce fichier.
  const votants = ctx.loups.filter((a) => a !== ctx.candidat);
  for (const v of votants) {
    await (await ctx.contracts.get(v).voter(ctx.ids.depense, ChoixVote.Approuver)).wait();
  }
  return `Les ${votants.length} autres Loups actifs votent Approuver (le bénéficiaire ne peut pas voter sur son propre cas).`;
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
  await avancerTemps(ctx, 181 * JOUR);
  return "181 jours plus tard, sans aucune activité de personne.";
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
  // loup2 est le bénéficiaire de cette dépense (voir ouvrirDepenseDormance)
  // — conflit d'intérêt (§7.4) : il ne peut pas voter sur son propre cas et
  // est retiré du dénominateur du quorum pour ce vote-là. Seul le fondateur
  // vote donc ici (constaté : un `founder + loup2` votait par erreur,
  // provoquant un revert ConflitInteret sur le vote de loup2).
  await (await ctx.contracts.get(ctx.founder).voter(ctx.ids.depenseDormance, ChoixVote.Approuver)).wait();
  return "Le fondateur vote Approuver — loup2 (bénéficiaire) ne peut pas voter sur son propre cas, retiré du dénominateur du quorum.";
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

  // Classement construit hors-chaîne à partir des vrais events DonRecu —
  // pas seulement des dons déclenchés par le panneau : un don fait
  // directement via MetaMask sur le vrai front (mode local) doit
  // apparaître aussi. Même principe que le vrai indexeur
  // (scripts/sync-dao.js) : donsCumules() reste une lecture O(1) par
  // adresse côté contrat, jamais une boucle non bornée — seule la
  // recherche de "qui a déjà donné" scanne les events, bornée par la durée
  // de vie (courte) d'un contrat local.
  const donLogs = await founder.queryFilter(founder.filters.DonRecu());
  const donateurs = [...new Set(donLogs.map((log) => log.args.donateur))];
  const topDonateurs = (
    await Promise.all(donateurs.map(async (adresse) => ({ adresse, total: (await founder.donsCumules(adresse)).toString() })))
  )
    .sort((a, b) => (BigInt(a.total) < BigInt(b.total) ? 1 : -1))
    .slice(0, 20);

  let loupsDormants = 0;
  let louveteaux = 0;
  const members = [];
  for (const addr of ctx.knownAddresses) {
    // carte() renvoie une struct à zéro (donc rang Louveteau) pour une
    // adresse qui n'a jamais eu de carte du tout — il faut d'abord vérifier
    // que la carte existe vraiment (le contrat est un ERC721).
    if ((await founder.balanceOf(addr)) === 0n) continue;
    const c = await founder.carte(addr);
    const rang = Number(c.rang);
    if (rang === 0) {
      louveteaux += 1;
      members.push({ address: addr, rang, dormant: false });
      continue;
    }
    const dormant = await founder.estDormant(addr);
    if (dormant) loupsDormants += 1;
    members.push({ address: addr, rang, dormant });
  }

  // Même principe que le classement des dons juste au-dessus : la struct
  // Proposition ne stocke pas qui a voté ou proposé quoi (seulement des
  // compteurs), donc l'activité par membre se reconstruit à partir des
  // events — comme le fait le vrai indexeur (scripts/sync-dao.js). Avant
  // ce correctif, cette table restait vide en démo locale, affichant
  // toujours 0 pour "Votes soumis"/"Propositions ouvertes" sur la carte de
  // membre, contrairement à la prod.
  const memberActivity = {};
  const bump = (addr, key) => {
    const k = addr.toLowerCase();
    memberActivity[k] ??= { votesSoumis: 0, propositionsOuvertes: 0 };
    memberActivity[k][key]++;
  };
  for (const log of await founder.queryFilter(founder.filters.VoteExprime())) bump(log.args.votant, "votesSoumis");
  for (const log of await founder.queryFilter(founder.filters.PropositionOuverte())) bump(log.args.auteur, "propositionsOuvertes");

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
    memberActivity,
    topDonateurs,
    members,
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

// ---------------------------------------------------------------------
// Scénario de test : Dons
// ---------------------------------------------------------------------

/** Un don, ouvert à n'importe qui — même une adresse qui n'a jamais
 *  candidaté ni voté. buildIndex retrouve les donateurs via les events
 *  DonRecu, pas besoin de les suivre ici. */
async function faireDon(ctx, addr, montantEth) {
  await (await ctx.contracts.get(addr).donner({ value: ethers.parseEther(montantEth) })).wait();
}

export async function premierDon(ctx) {
  await faireDon(ctx, ctx.candidat, "0.01");
  return `${ctx.candidat.slice(0, 8)}… (jamais candidaté ni voté) fait un don de 0.01 ETH.`;
}

export async function deuxiemeDon(ctx) {
  await faireDon(ctx, ctx.roles.loup2, "0.05");
  return `${ctx.roles.loup2.slice(0, 8)}… fait un don plus généreux de 0.05 ETH.`;
}

export async function redonDuPremier(ctx) {
  await faireDon(ctx, ctx.candidat, "0.02");
  const total = await ctx.contracts.get(ctx.founder).donsCumules(ctx.candidat);
  return `${ctx.candidat.slice(0, 8)}… redonne 0.02 ETH — total cumulé : ${ethers.formatEther(total)} ETH.`;
}
