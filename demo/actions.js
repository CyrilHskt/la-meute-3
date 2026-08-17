// Replayable demo scenario actions, one per demo/scenario.js step.
// Deliberately separate from scripts/seed-local.js: seed-local sets up a
// varied final state in one go (useful to explore the front), this module
// tells a step-by-step story (useful to drive live in front of a jury).
//
// Only makes sense on a local Hardhat node (uses hardhat_reset,
// evm_increaseTime — nonexistent on a real network).

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

const VoteChoice = { Approve: 0, Reject: 1, Postpone: 2 };
const DAY = 24 * 60 * 60;

function loadAbi() {
  const artifactPath = join(__dirname, "..", "artifacts", "contracts", "Meute.sol", "Meute.json");
  try {
    return JSON.parse(readFileSync(artifactPath, "utf8")).abi;
  } catch {
    throw new Error(`ABI introuvable (${artifactPath}) — lance \`npx hardhat compile\` d'abord.`);
  }
}

/** Gets the proposal's id from the ProposalOpened event, and takes the
 *  opportunity to record its author (also in the event, not in the
 *  on-chain struct) into ctx.authors — otherwise buildIndex has no way of
 *  knowing who opened what. */
async function openAndGetId(ctx, contract, txPromise) {
  const receipt = await (await txPromise).wait();
  for (const log of receipt.logs) {
    let parsed;
    try {
      parsed = contract.interface.parseLog(log);
    } catch {
      continue;
    }
    if (parsed?.name === "ProposalOpened") {
      ctx.authors[parsed.args.proposalId.toString()] = parsed.args.author;
      return parsed.args.proposalId;
    }
  }
  throw new Error("ProposalOpened introuvable dans les logs de la transaction.");
}

/** State shared between the steps of a single run (reset by reset()). */
export function createContext() {
  return { provider: null, contracts: null, founder: null, wolves: [], applicant: null, ids: {}, authors: {} };
}

async function connect(ctx, contractAddress) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const abi = loadAbi();

  await provider.send("hardhat_impersonateAccount", [FOUNDER]);
  await provider.send("hardhat_setBalance", [FOUNDER, "0x56BC75E2D63100000"]);
  const founderSigner = new ethers.JsonRpcSigner(provider, ethers.getAddress(FOUNDER));

  const nodeAccounts = await provider.send("eth_accounts", []);
  // 5: the highest role index used (wolf4 = nodeAccounts[4]) — a generic
  // safety net, early, before even picking a scenario.
  if (nodeAccounts.length < 5) throw new Error("Pas assez de comptes de test sur le nœud (besoin d'au moins 5).");

  // Fixed roles among the node's accounts, distinct from the founder —
  // used by the isolated test scenarios (exclusion, postponement,
  // dormancy). nodeAccounts[2] is only used by the certification
  // scenario (see setup()), for its dedicated "no Discord" applicant.
  const roleAddrs = {
    wolf2: nodeAccounts[0],
    applicant: nodeAccounts[1],
    noDiscordApplicant: nodeAccounts[2],
    wolf3: nodeAccounts[3],
    wolf4: nodeAccounts[4],
  };

  // Every account has a signer ready, not just the named roles — the
  // certification scenario (rich setup) needs far more addresses than
  // the isolated test scenarios.
  const signers = new Map([[FOUNDER.toLowerCase(), founderSigner]]);
  for (const addr of nodeAccounts) {
    signers.set(addr.toLowerCase(), await provider.getSigner(addr));
  }

  ctx.provider = provider;
  ctx.contractAddress = contractAddress;
  ctx.founder = FOUNDER;
  ctx.applicant = roleAddrs.applicant;
  ctx.roles = roleAddrs;
  ctx.nodeAccounts = nodeAccounts;
  ctx.wolves = [FOUNDER]; // grows as admissions/confirmations happen
  ctx.knownAddresses = [FOUNDER, roleAddrs.applicant];
  ctx.contracts = {
    get(addr) {
      return new ethers.Contract(contractAddress, abi, signers.get(addr.toLowerCase()));
    },
  };
  ctx.ids = {};
  ctx.authors = {};
}

async function advanceTime(ctx, seconds) {
  await ctx.provider.send("evm_increaseTime", [seconds]);
  await ctx.provider.send("evm_mine", []);
}

async function allVote(ctx, id, choice = VoteChoice.Approve) {
  for (const v of ctx.wolves) {
    await (await ctx.contracts.get(v).vote(id, choice)).wait();
  }
}

/** Application -> vote (all current Wolves) -> 7d -> execution. Adds the
 *  address to ctx.wolves if `confirm` (probation + 2nd vote), otherwise
 *  it stays a Cub. Records the ids in ctx.ids so they show up in the list
 *  of past proposals, not just in the aggregated counters. */
async function makeJoin(ctx, addr, { confirm }) {
  const founder = ctx.contracts.get(ctx.founder);
  const c = ctx.contracts.get(addr);
  const id = await openAndGetId(ctx, c, c.applyForMembership({ value: await founder.fee() }));
  await allVote(ctx, id);
  await advanceTime(ctx, 7 * DAY + 1);
  await (await c.execute(id)).wait();
  ctx.ids[`admission_${addr}`] = id;

  if (!confirm) return;

  await advanceTime(ctx, 90 * DAY + 1);
  const confirmId = await openAndGetId(ctx, founder, founder.openConfirmationVote(addr));
  await allVote(ctx, confirmId);
  await advanceTime(ctx, 7 * DAY + 1);
  await (await c.execute(confirmId)).wait();
  ctx.ids[`confirmation_${addr}`] = confirmId;
  ctx.wolves.push(addr);
}

/** Redeploys a brand-new Meute contract (`--reset` ignores Ignition's
 *  previous deployment) — no need to reset the chain, a fresh empty
 *  contract instance is enough to start over. */
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

/** Light setup (replaces the old 14-Wolf setup, made useless once the
 *  A/B/C scenarios dedicated to the defense were created — see
 *  docs/local/soutenance-prep.md): 5 accounts reused across the steps,
 *  maximum visible variety of statuses for a minimum of transactions,
 *  rather than a realistic volume (that's scripts/seed-local.js's job).
 *  Designed with a "scenario writer" agent (visible variety at the lowest
 *  cost) and a "code expert" agent (exact quorum formula on the Meute.sol
 *  side: cast*4 > active*3 — see _isPassed) to stay correct on edge cases
 *  (e.g. with 3 active Wolves, NOTHING reaches quorum unless ALL vote).
 *
 *  Reused roles (same names as the isolated test scenarios — no risk,
 *  only one scenario runs at a time on a brand-new contract): wolf2 →
 *  1st confirmed Wolf, wolf3 → 2nd confirmed Wolf then left dormant,
 *  wolf4 → stays a Cub (never confirmed), applicant → rejected once then
 *  free to donate again (no on-chain state prevents it, see
 *  _executeAdmission which refunds and recloses the application).
 *  noDiscordApplicant → never made a member, its sole purpose is to
 *  author the ongoing Admission proposal in step 8 with no Discord
 *  linked (see server.mjs's seedDemoDiscordLinks). */
export async function setup(ctx) {
  const { wolf2: l1, wolf3: l2, wolf4: l3, applicant: d, noDiscordApplicant: e } = ctx.roles;
  ctx.knownAddresses.push(l1, l2, l3, d, e);
  ctx.progress?.setTotal(8);

  // 1. L1 applies and is confirmed — only the founder votes (1 active):
  //    the most trivial quorum possible, just to kick off the pack.
  await makeJoin(ctx, l1, { confirm: true });
  ctx.progress?.tick();

  // 2. L2 applies and is confirmed — F+L1 vote (2 active).
  await makeJoin(ctx, l2, { confirm: true });
  ctx.progress?.tick();

  // 3. L3 applies but stays a Cub (never confirmed) — F+L1+L2 vote (3
  //    active): first non-trivial quorum (100% participation required
  //    with only 3 active, see _isPassed).
  await makeJoin(ctx, l3, { confirm: false });
  ctx.progress?.tick();

  // 4. Dormancy: we advance 181 days (no one has acted in a while), then
  //    only F and L1 confirm their presence — L2 stays dormant with no
  //    dedicated transaction (just the absence of action).
  await advanceTime(ctx, 181 * DAY);
  await (await ctx.contracts.get(ctx.founder).imHere()).wait();
  await (await ctx.contracts.get(l1).imHere()).wait();
  ctx.progress?.tick();

  // 5. D applies and is clearly rejected — F+L1 vote Reject (L2 dormant,
  //    excluded from the count; 2 active, quorum reached since both
  //    vote). Fee automatically refunded by the contract, so D stays
  //    free to donate again later (donations, step 7).
  {
    const c = ctx.contracts.get(d);
    const id = await openAndGetId(ctx, c, c.applyForMembership({ value: await ctx.contracts.get(ctx.founder).fee() }));
    await (await ctx.contracts.get(ctx.founder).vote(id, VoteChoice.Reject)).wait();
    await (await ctx.contracts.get(l1).vote(id, VoteChoice.Reject)).wait();
    await advanceTime(ctx, 7 * DAY + 1);
    await (await c.execute(id)).wait();
    ctx.ids.rejectedAdmission = id;
    ctx.progress?.tick();
  }

  // 6. An expense that never reaches quorum — only F votes (L1 abstains,
  //    L2 dormant): 1 voter out of 2 active, below the 75% required.
  {
    const founder = ctx.contracts.get(ctx.founder);
    const id = await openAndGetId(ctx, founder, founder.proposeExpense(l3, ethers.parseEther("0.001"), "Rachat de goodies (jamais assez voté)"));
    await (await founder.vote(id, VoteChoice.Approve)).wait();
    await advanceTime(ctx, 7 * DAY + 1);
    await (await founder.execute(id)).wait();
    ctx.ids.expenseQuorumMissed = id;
    ctx.progress?.tick();
  }

  // 7. An expense left open, never voted on (an "ongoing" proposal
  //    visible right away) + a few donations for a small leaderboard
  //    (3 entries) on the Donations page.
  const founder = ctx.contracts.get(ctx.founder);
  ctx.ids.openExpense = await openAndGetId(ctx, founder, founder.proposeExpense(d, ethers.parseEther("0.002"), "Achat d'un nom de domaine"));
  await (await founder.donate({ value: ethers.parseEther("0.5") })).wait();
  await (await ctx.contracts.get(d).donate({ value: ethers.parseEther("0.3") })).wait();
  await (await ctx.contracts.get(l3).donate({ value: ethers.parseEther("0.1") })).wait();
  ctx.progress?.tick();

  // 8. Three more proposals left open (never voted on), alongside the
  //    expense from step 7, so all four proposal types are visible at
  //    once in "En cours": an admission whose author is also its own
  //    target (self-application) — E never links its Discord, so this
  //    single proposal covers both "author without Discord" and "target
  //    without Discord" — a confirmation targeting L3 (still a Cub,
  //    probation long over since step 4) and an exclusion targeting L2
  //    (the dormant Wolf from step 4). None of the three get voted on:
  //    voting would wake L2 up, breaking the "1 dormant Wolf" invariant.
  {
    const applicantContract = ctx.contracts.get(e);
    ctx.ids.openAdmission = await openAndGetId(
      ctx,
      applicantContract,
      applicantContract.applyForMembership({ value: await founder.fee() }),
    );
    ctx.ids.openConfirmation = await openAndGetId(ctx, founder, founder.openConfirmationVote(l3));
    ctx.ids.openExclusion = await openAndGetId(ctx, founder, founder.proposeExclusion(l2));
  }
  ctx.progress?.tick();

  return (
    `Meute mise en place : ${ctx.wolves.length} Loups actifs (dont 1 dormant), 1 Louveteau, ` +
    "1 candidature refusée et 1 dépense sans quorum dans l'historique, 0.9 ETH reçus en dons, " +
    "et une proposition de chaque type (Admission, Confirmation, Exclusion, Dépense) encore en cours."
  );
}

export async function applicantApplies(ctx) {
  const fee = await ctx.contracts.get(ctx.founder).fee();
  const c = ctx.contracts.get(ctx.applicant);
  ctx.ids.admission = await openAndGetId(ctx, c, c.applyForMembership({ value: fee }));
  return `Candidature ouverte (id ${ctx.ids.admission}), cotisation versée à la trésorerie.`;
}

export async function voteOnAdmission(ctx) {
  await allVote(ctx, ctx.ids.admission);
  return `Les ${ctx.wolves.length} Loups actifs votent Approuver.`;
}

export async function admissionVoteTime(ctx) {
  await advanceTime(ctx, 7 * DAY + 1);
  return "7 jours plus tard : la fenêtre de vote est close.";
}

export async function executeAdmission(ctx) {
  await (await ctx.contracts.get(ctx.applicant).execute(ctx.ids.admission)).wait();
  return "Candidature exécutée : le candidat devient Louveteau.";
}

export async function probationTime(ctx) {
  await advanceTime(ctx, 90 * DAY + 1);
  return "90 jours plus tard : la probation est terminée.";
}

export async function openConfirmation(ctx) {
  const c = ctx.contracts.get(ctx.founder);
  ctx.ids.confirmation = await openAndGetId(ctx, c, c.openConfirmationVote(ctx.applicant));
  return `Proposition de titularisation ouverte (id ${ctx.ids.confirmation}).`;
}

export async function voteOnConfirmation(ctx) {
  await allVote(ctx, ctx.ids.confirmation);
  return `Les ${ctx.wolves.length} Loups actifs votent Approuver.`;
}

export async function confirmationVoteTime(ctx) {
  await advanceTime(ctx, 7 * DAY + 1);
  return "7 jours plus tard : la fenêtre de vote est close.";
}

export async function executeConfirmation(ctx) {
  await (await ctx.contracts.get(ctx.applicant).execute(ctx.ids.confirmation)).wait();
  ctx.wolves.push(ctx.applicant);
  return "Titularisation exécutée : le Louveteau devient Loup à part entière.";
}

export async function expenseProposal(ctx) {
  const c = ctx.contracts.get(ctx.founder);
  ctx.ids.expense = await openAndGetId(ctx,
    c,
    c.proposeExpense(ctx.applicant, ethers.parseEther("0.005"), "Hébergement serveur de jeu"),
  );
  return `Proposition de dépense ouverte (id ${ctx.ids.expense}), 0.005 ETH vers le nouveau Loup.`;
}

export async function voteOnExpense(ctx) {
  // The beneficiary (ctx.applicant, just confirmed) can't vote on their
  // own expense (ConflictOfInterest) — same filter as
  // voteOnTestExpense/voteOnDormancyExpense further in this file.
  const voters = ctx.wolves.filter((a) => a !== ctx.applicant);
  for (const v of voters) {
    await (await ctx.contracts.get(v).vote(ctx.ids.expense, VoteChoice.Approve)).wait();
  }
  return `Les ${voters.length} autres Loups actifs votent Approuver (le bénéficiaire ne peut pas voter sur son propre cas).`;
}

export async function expenseVoteTime(ctx) {
  await advanceTime(ctx, 7 * DAY + 1);
  return "7 jours plus tard : la fenêtre de vote est close.";
}

export async function executeExpense(ctx) {
  await (await ctx.contracts.get(ctx.founder).execute(ctx.ids.expense)).wait();
  const balance = await ctx.provider.getBalance(ctx.contractAddress);
  return `Dépense exécutée : les fonds partent de la trésorerie. Trésor restant : ${ethers.formatEther(balance)} ETH.`;
}

// ---------------------------------------------------------------------
// Test scenario: Exclusion
// ---------------------------------------------------------------------

/** 3 active Wolves (founder + 2), so excluding one of them is a real
 *  majority vote, not a solo decision. */
export async function setupExclusion(ctx) {
  const { wolf2, wolf3 } = ctx.roles;
  await makeJoin(ctx, wolf2, { confirm: true });
  await makeJoin(ctx, wolf3, { confirm: true });
  ctx.knownAddresses.push(wolf2, wolf3);
  return `3 Loups actifs en place (fondateur, ${wolf2.slice(0, 8)}…, ${wolf3.slice(0, 8)}… — ce dernier sera la cible).`;
}

export async function openExclusion(ctx) {
  const founder = ctx.contracts.get(ctx.founder);
  ctx.ids.exclusion = await openAndGetId(ctx, founder, founder.proposeExclusion(ctx.roles.wolf3));
  return `Proposition d'exclusion ouverte contre ${ctx.roles.wolf3} (id ${ctx.ids.exclusion}).`;
}

export async function voteExclusion(ctx) {
  // The target can't vote on their own exclusion (ConflictOfInterest) —
  // only the other active Wolves vote.
  const voters = ctx.wolves.filter((a) => a !== ctx.roles.wolf3);
  for (const v of voters) {
    await (await ctx.contracts.get(v).vote(ctx.ids.exclusion, VoteChoice.Approve)).wait();
  }
  return `Les ${voters.length} autres Loups actifs votent Approuver (la cible ne peut pas voter sur son propre cas).`;
}

export async function exclusionVoteTime(ctx) {
  await advanceTime(ctx, 7 * DAY + 1);
  return "7 jours plus tard : la fenêtre de vote est close.";
}

export async function executeExclusion(ctx) {
  await (await ctx.contracts.get(ctx.founder).execute(ctx.ids.exclusion)).wait();
  ctx.wolves = ctx.wolves.filter((a) => a !== ctx.roles.wolf3);
  return "Exclusion exécutée : la carte est brûlée, l'ancien Loup n'est plus membre du tout.";
}

// ---------------------------------------------------------------------
// Test scenario: Postponement (MAX_POSTPONEMENTS cap)
// ---------------------------------------------------------------------

/** A Cub already admitted, probation already elapsed once — ready for a
 *  first confirmation vote. 2 active Wolves to vote. */
export async function setupPostponement(ctx) {
  await makeJoin(ctx, ctx.roles.wolf2, { confirm: true });
  await makeJoin(ctx, ctx.roles.applicant, { confirm: false });
  ctx.knownAddresses.push(ctx.roles.wolf2);
  await advanceTime(ctx, 90 * DAY + 1);
  return "Louveteau admis, probation écoulée, 2 Loups actifs prêts à voter.";
}

export async function openConfirmation1(ctx) {
  const founder = ctx.contracts.get(ctx.founder);
  ctx.ids.confirmation1 = await openAndGetId(ctx, founder, founder.openConfirmationVote(ctx.applicant));
  return `Vote de titularisation ouvert (id ${ctx.ids.confirmation1}).`;
}

export async function votePostpone1(ctx) {
  await allVote(ctx, ctx.ids.confirmation1, VoteChoice.Postpone);
  return "Les Loups votent Ajourner (report).";
}

export async function confirmationVoteTime1(ctx) {
  await advanceTime(ctx, 7 * DAY + 1);
  return "7 jours plus tard : la fenêtre de vote est close.";
}

export async function executePostponement1(ctx) {
  await (await ctx.contracts.get(ctx.applicant).execute(ctx.ids.confirmation1)).wait();
  return "Exécuté : ajournement n°1 consommé, le Louveteau reste Louveteau, sa probation redémarre.";
}

export async function newProbationTime1(ctx) {
  await advanceTime(ctx, 90 * DAY + 1);
  return "90 jours plus tard : la nouvelle probation est terminée.";
}

export async function openConfirmation2(ctx) {
  const founder = ctx.contracts.get(ctx.founder);
  ctx.ids.confirmation2 = await openAndGetId(ctx, founder, founder.openConfirmationVote(ctx.applicant));
  return `Vote de titularisation ouvert (id ${ctx.ids.confirmation2}).`;
}

export async function votePostpone2(ctx) {
  await allVote(ctx, ctx.ids.confirmation2, VoteChoice.Postpone);
  return "Les Loups votent Ajourner (report) — 2e fois.";
}

export async function confirmationVoteTime2(ctx) {
  await advanceTime(ctx, 7 * DAY + 1);
  return "7 jours plus tard : la fenêtre de vote est close.";
}

export async function executePostponement2(ctx) {
  await (await ctx.contracts.get(ctx.applicant).execute(ctx.ids.confirmation2)).wait();
  return "Exécuté : ajournement n°2 consommé — AJOURNEMENTS_MAX (2) est désormais atteint.";
}

export async function newProbationTime2(ctx) {
  await advanceTime(ctx, 90 * DAY + 1);
  return "90 jours plus tard : la nouvelle probation est terminée.";
}

export async function openConfirmation3(ctx) {
  const founder = ctx.contracts.get(ctx.founder);
  ctx.ids.confirmation3 = await openAndGetId(ctx, founder, founder.openConfirmationVote(ctx.applicant));
  return `Vote de titularisation ouvert (id ${ctx.ids.confirmation3}).`;
}

/** This vote MUST fail — {vote} rejects Postpone once the cap is reached
 *  (InvalidChoice). That's the point of the test: a revert here is the
 *  expected success, not a panel error. */
export async function postponeAttemptRefused(ctx) {
  try {
    await (await ctx.contracts.get(ctx.founder).vote(ctx.ids.confirmation3, VoteChoice.Postpone)).wait();
    return "Inattendu : le vote Ajourner est passé — le plafond ne s'est pas appliqué (bug ?).";
  } catch {
    return "Comme prévu : le contrat refuse (InvalidChoice) — AJOURNEMENTS_MAX est déjà atteint, impossible d'ajourner une 3e fois.";
  }
}

// ---------------------------------------------------------------------
// Test scenario: Dormancy and wake-up (quorum)
// ---------------------------------------------------------------------

/** 3 active Wolves — one of them (wolf3) will never do anything
 *  afterwards, to become dormant while the other two stay active. */
export async function setupDormance(ctx) {
  await makeJoin(ctx, ctx.roles.wolf2, { confirm: true });
  await makeJoin(ctx, ctx.roles.wolf3, { confirm: true });
  ctx.knownAddresses.push(ctx.roles.wolf2, ctx.roles.wolf3);
  return "3 Loups actifs en place. loup3 ne fera plus rien à partir de maintenant.";
}

export async function advanceOneYear(ctx) {
  await advanceTime(ctx, 181 * DAY);
  return "181 jours plus tard, sans aucune activité de personne.";
}

export async function partialWakeUp(ctx) {
  await (await ctx.contracts.get(ctx.founder).imHere()).wait();
  await (await ctx.contracts.get(ctx.roles.wolf2).imHere()).wait();
  return "Le fondateur et loup2 confirment leur présence (imHere) — loup3 ne fait rien, reste dormant.";
}

export async function openDormancyExpense(ctx) {
  const founder = ctx.contracts.get(ctx.founder);
  ctx.ids.dormancyExpense = await openAndGetId(ctx,
    founder,
    founder.proposeExpense(ctx.roles.wolf2, ethers.parseEther("0.001"), "Test dormance"),
  );
  return `Proposition ouverte (id ${ctx.ids.dormancyExpense}) — le snapshot devrait figer 2 Loups actifs, pas 3 (loup3 est dormant).`;
}

export async function voteOnDormancyExpense(ctx) {
  // wolf2 is the beneficiary of this expense (see openDormancyExpense) —
  // conflict of interest (§7.4): they can't vote on their own case and
  // are removed from the quorum denominator for this vote. Only the
  // founder votes here then (observed: a `founder + wolf2` used to vote
  // by mistake, causing a ConflictOfInterest revert on wolf2's vote).
  await (await ctx.contracts.get(ctx.founder).vote(ctx.ids.dormancyExpense, VoteChoice.Approve)).wait();
  return "Le fondateur vote Approuver — loup2 (bénéficiaire) ne peut pas voter sur son propre cas, retiré du dénominateur du quorum.";
}

export async function dormancyExpenseVoteTime(ctx) {
  await advanceTime(ctx, 7 * DAY + 1);
  return "7 jours plus tard : la fenêtre de vote est close.";
}

export async function executeDormancyExpense(ctx) {
  await (await ctx.contracts.get(ctx.founder).execute(ctx.ids.dormancyExpense)).wait();
  return "Exécuté sans loup3 : la preuve que la dormance l'a bien exclu du quorum.";
}

export async function lateWakeUp(ctx) {
  await (await ctx.contracts.get(ctx.roles.wolf3).imHere()).wait();
  return "loup3 se réveille enfin — trop tard pour peser sur le vote déjà clos (le snapshot ne bouge plus rétroactivement).";
}

/** Overview (stats + proposals), same shape the real indexer publishes —
 *  so the front can display local mode with the same code as prod mode,
 *  just a different source. That shape is defined in
 *  front/src/daoSnapshot.ts (DaoSnapshot); this file is plain JS and can't
 *  import it, so any field added there has to be added here and in
 *  scripts/sync-dao.js. */
export async function buildIndex(ctx) {
  if (!ctx.provider) throw new Error("Pas encore connecté — clique sur Réinitialiser.");
  const founder = ctx.contracts.get(ctx.founder);
  const treasuryWei = await ctx.provider.getBalance(ctx.contractAddress);
  const activeWolves = Number(await founder.activeWolves());
  // Mirrors the real indexer's `config` (scripts/sync-dao.js) — the front
  // reads fee/dormancy/etc. from the snapshot rather than live RPC calls,
  // in local demo mode too.
  const [fee, dormancyDelay, maxPostponements, voteDuration, block] = await Promise.all([
    founder.fee(),
    founder.DORMANCY_DELAY(),
    founder.MAX_POSTPONEMENTS(),
    founder.VOTE_DURATION(),
    ctx.provider.getBlock("latest"),
  ]);

  // Leaderboard built off-chain from the real DonationReceived events —
  // not just donations triggered by the panel: a donation made directly
  // via MetaMask on the real front (local mode) must show up too. Same
  // principle as the real indexer (scripts/sync-dao.js): totalDonations()
  // stays an O(1) read per address on the contract side, never an
  // unbounded loop — only the search for "who has already donated" scans
  // events, bounded by a local contract's (short) lifetime.
  const donationLogs = await founder.queryFilter(founder.filters.DonationReceived());
  const donors = [...new Set(donationLogs.map((log) => log.args.donor))];
  const topDonors = (
    await Promise.all(donors.map(async (address) => ({ address, total: (await founder.totalDonations(address)).toString() })))
  )
    .sort((a, b) => (BigInt(a.total) < BigInt(b.total) ? 1 : -1))
    .slice(0, 20);

  // Same principle as the donations leaderboard above, and for the same
  // reason: ctx.knownAddresses only grows as scripted scenario steps run
  // (makeJoin, setup*), so a member who joined by calling
  // applyForMembership() directly through the live front (bypassing the
  // demo panel entirely) never made it into that list — the front showed
  // them a working card (direct contract reads) but they were invisible
  // everywhere the index is the source (members list, dormancy/cub
  // counts). Mint/burn events give the exact current membership, exactly
  // like scripts/sync-dao.js does for the real indexer.
  const transferLogs = await founder.queryFilter(founder.filters.Transfer());
  const minted = new Set();
  const burned = new Set();
  for (const log of transferLogs) {
    if (log.args.from === ethers.ZeroAddress) minted.add(log.args.to.toLowerCase());
    if (log.args.to === ethers.ZeroAddress) burned.add(log.args.from.toLowerCase());
  }
  const knownAddresses = [...minted].filter((addr) => !burned.has(addr));

  let dormantWolves = 0;
  let cubs = 0;
  const members = [];
  for (const addr of knownAddresses) {
    const c = await founder.card(addr);
    const rank = Number(c.rank);
    if (rank === 0) {
      cubs += 1;
      members.push({ address: addr, rank, dormant: false });
      continue;
    }
    const dormant = await founder.isDormant(addr);
    if (dormant) dormantWolves += 1;
    members.push({ address: addr, rank, dormant });
  }

  // Same principle as the donations leaderboard just above: the Proposal
  // struct doesn't store who voted or proposed what (only counters), so
  // per-member activity is rebuilt from events — like the real indexer
  // does (scripts/sync-dao.js). Before this fix, this table stayed empty
  // in local demo mode, always showing 0 for "Votes soumis"/"Propositions
  // ouvertes" on the membership card, unlike prod.
  const memberActivity = {};
  const bump = (addr, key) => {
    const k = addr.toLowerCase();
    memberActivity[k] ??= { votesSubmitted: 0, openProposals: 0 };
    memberActivity[k][key]++;
  };
  // Same reasoning as the real indexer (scripts/sync-dao.js): _hasVoted is
  // private on the contract (no getter), so "did this member already vote
  // on this proposal" is rebuilt from VoteCast events, not a live RPC scan
  // from the front — see GovernanceDao.vue's loadMyVotedProposals.
  const votedProposalsByVoter = {};
  for (const log of await founder.queryFilter(founder.filters.VoteCast())) {
    bump(log.args.voter, "votesSubmitted");
    const voterKey = log.args.voter.toLowerCase();
    (votedProposalsByVoter[voterKey] ??= []).push(log.args.proposalId.toString());
  }
  for (const log of await founder.queryFilter(founder.filters.ProposalOpened())) bump(log.args.author, "openProposals");

  // Same reasoning as above: ctx.ids only records proposals opened through
  // a scripted scenario step (openAndGetId) — a proposal opened directly
  // through the live front never lands there, so it appeared once (via
  // the front's own direct post-transaction read) then vanished on the
  // next index-based refresh, forever. ProposalOpened events give every
  // proposal that actually exists, exactly like scripts/sync-dao.js.
  const proposalLogs = await founder.queryFilter(founder.filters.ProposalOpened());
  const proposalIds = [...new Set(proposalLogs.map((log) => log.args.proposalId.toString()))];
  const proposalAuthors = Object.fromEntries(proposalLogs.map((log) => [log.args.proposalId.toString(), log.args.author]));

  const proposals = [];
  let votesCast = 0;
  let openProposals = 0;
  for (const id of proposalIds) {
    const p = await founder.proposal(id);
    votesCast += Number(p.approveVotes) + Number(p.rejectVotes) + Number(p.postponeVotes);
    if (!p.executed) openProposals += 1;
    proposals.push({
      id: id.toString(),
      proposalType: Number(p.proposalType),
      target: p.target,
      author: proposalAuthors[id] ?? "0x0000000000000000000000000000000000000000",
      deadline: p.deadline.toString(),
      activeSnapshot: Number(p.activeSnapshot),
      snapshotFrozen: p.snapshotFrozen,
      executed: p.executed,
      approveVotes: Number(p.approveVotes),
      rejectVotes: Number(p.rejectVotes),
      postponeVotes: Number(p.postponeVotes),
      amount: p.amount.toString(),
      reason: p.reason,
    });
  }

  return {
    stats: { treasuryWei: treasuryWei.toString(), activeWolves, dormantWolves, cubs, votesCast, openProposals },
    config: {
      feeWei: fee.toString(),
      dormancyDelaySeconds: Number(dormancyDelay),
      maxPostponements: Number(maxPostponements),
      voteDurationSeconds: Number(voteDuration),
      now: Number(block.timestamp),
    },
    proposals,
    memberActivity,
    votedProposalsByVoter,
    topDonors,
    members,
  };
}

// ---------------------------------------------------------------------
// Test scenario: Expense
// ---------------------------------------------------------------------

/** 3 active Wolves (founder + 2) — their admission fees already feed the
 *  treasury, no need for a separate funding step. wolf2 will be the
 *  beneficiary: this shows the conflict of interest (they won't be able
 *  to vote on their own expense) on top of the expense mechanism itself. */
export async function setupExpense(ctx) {
  const { wolf2, wolf3 } = ctx.roles;
  await makeJoin(ctx, wolf2, { confirm: true });
  await makeJoin(ctx, wolf3, { confirm: true });
  ctx.knownAddresses.push(wolf2, wolf3);
  return `3 Loups actifs en place (trésorerie déjà alimentée par leurs cotisations) — ${wolf2.slice(0, 8)}… sera le bénéficiaire.`;
}

export async function openTestExpense(ctx) {
  const founder = ctx.contracts.get(ctx.founder);
  ctx.ids.testExpense = await openAndGetId(ctx,
    founder,
    founder.proposeExpense(ctx.roles.wolf2, ethers.parseEther("0.005"), "Test dépense"),
  );
  return `Proposition de dépense ouverte (id ${ctx.ids.testExpense}) vers ${ctx.roles.wolf2.slice(0, 8)}… (0.005 ETH).`;
}

export async function voteOnTestExpense(ctx) {
  // The beneficiary (wolf2) can't vote on their own expense
  // (ConflictOfInterest) — only the other active Wolves vote.
  const voters = ctx.wolves.filter((a) => a !== ctx.roles.wolf2);
  for (const v of voters) {
    await (await ctx.contracts.get(v).vote(ctx.ids.testExpense, VoteChoice.Approve)).wait();
  }
  return `Les ${voters.length} autres Loups actifs votent Approuver (le bénéficiaire ne peut pas voter sur son propre cas).`;
}

export async function testExpenseVoteTime(ctx) {
  await advanceTime(ctx, 7 * DAY + 1);
  return "7 jours plus tard : la fenêtre de vote est close.";
}

export async function executeTestExpense(ctx) {
  await (await ctx.contracts.get(ctx.founder).execute(ctx.ids.testExpense)).wait();
  const balance = await ctx.provider.getBalance(ctx.contractAddress);
  return `Dépense exécutée : les fonds partent de la trésorerie vers le bénéficiaire. Trésor restant : ${ethers.formatEther(balance)} ETH.`;
}

// ---------------------------------------------------------------------
// Test scenario: Donations
// ---------------------------------------------------------------------

/** A donation, open to anyone — even an address that never applied nor
 *  voted. buildIndex finds donors via the DonationReceived events, no
 *  need to track them here. */
async function makeDonation(ctx, addr, amountEth) {
  await (await ctx.contracts.get(addr).donate({ value: ethers.parseEther(amountEth) })).wait();
}

export async function firstDonation(ctx) {
  await makeDonation(ctx, ctx.applicant, "0.01");
  return `${ctx.applicant.slice(0, 8)}… (jamais candidaté ni voté) fait un don de 0.01 ETH.`;
}

export async function secondDonation(ctx) {
  await makeDonation(ctx, ctx.roles.wolf2, "0.05");
  return `${ctx.roles.wolf2.slice(0, 8)}… fait un don plus généreux de 0.05 ETH.`;
}

export async function firstDonorGivesAgain(ctx) {
  await makeDonation(ctx, ctx.applicant, "0.02");
  const total = await ctx.contracts.get(ctx.founder).totalDonations(ctx.applicant);
  return `${ctx.applicant.slice(0, 8)}… redonne 0.02 ETH — total cumulé : ${ethers.formatEther(total)} ETH.`;
}
