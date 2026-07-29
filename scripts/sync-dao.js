// A single scan of the contract's events per run, shared by two uses:
//  1. Posting newly opened/closed proposals to Discord.
//  2. Maintaining a snapshot that the front downloads instead of scanning
//     the chain itself.
//
// Both the state AND the snapshot live in Netlify Blobs (via the
// netlify/functions/dao-sync.mts function), not in the git repo —
// publishing fresh data must never trigger a site rebuild, the two are
// unrelated. Before: the job committed a JSON file into front/public/,
// which forced Netlify to rebuild the whole site on every refresh (and
// had already caused a separate bug via "[skip ci]", which Netlify also
// interprets as "don't deploy").
//
// The state is *cumulative*, never recomputed from deployment: each run
// only processes the blocks new since the last pass, and updates the list
// of members / proposals / activity accordingly. Without this, the job
// would get slower and slower over time — see the discussion in
// docs/local/soutenance-prep.md.
//
// Required env vars:
//   RPC_URL              — Sepolia endpoint (Alchemy)
//   DISCORD_WEBHOOK_URL   — URL of the Discord webhook to post to
//   SYNC_ENDPOINT         — URL of the Netlify function (e.g.
//                           https://la-meute-3.netlify.app/.netlify/functions/dao-sync)
//   SYNC_SECRET           — secret shared with that function
// Optional:
//   CONTRACT_ADDRESS      — overrides the address read from
//                           front/src/contract.ts (single source of truth
//                           by default, so this script never drifts out
//                           of sync with a redeployment)

import { ethers } from "ethers";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadAbi } from "./lib/abi.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTRACT_TS_PATH = join(__dirname, "..", "front", "src", "contract.ts");
// Alchemy's free plan caps eth_getLogs at 10 blocks per request (observed
// in prod: -32600 error as soon as you exceed it), and a fairly low
// compute-units/second throughput (429 error even sequentially with no
// delay).
const BLOCK_RANGE = 9n; // fromBlock..fromBlock+9 = 10 blocks inclusive
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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
const Rank = { Cub: 0, Wolf: 1 };
const VoteChoice = { Approve: 0, Reject: 1, Postpone: 2 };

async function loadState() {
  const res = await fetch(`${SYNC_ENDPOINT}?key=state`, {
    headers: { "x-sync-secret": SYNC_SECRET },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Lecture de l'état échouée (HTTP ${res.status})`);
  const state = await res.json();
  // `lastBlock: null` = never run yet (the function's default value) — we
  // then start from the deployment block, instead of trying `BigInt(null)`.
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

// No topic filter: a single request per window fetches every event of the
// contract (applications, votes, executions, card mints/burns), decoded
// afterward on the script side — no duplicated request per event type.
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

// 75% quorum + strict majority among votes cast — same rule as Meute.sol
// (_isPassed / _executeConfirmation), keep in sync if it changes again. A
// confirmation is a 3-outcome vote: `postponeVotes` counts toward quorum,
// and the "Approve" outcome must exceed both other outcomes, not just
// "Reject".
function requiredQuorum(activeSnapshot) {
  return Math.floor((Number(activeSnapshot) * 3) / 4) + 1;
}

function proposalLabel(proposalType, target, amount, reason) {
  const short = `${target.slice(0, 6)}…${target.slice(-4)}`;
  switch (Number(proposalType)) {
    case 0:
      return `Candidature de \`${short}\``;
    case 1:
      return `Titularisation de \`${short}\``;
    case 2:
      return `Exclusion de \`${short}\``;
    default:
      return `Dépense pour \`${short}\` — ${ethers.formatEther(amount)} ETH (${reason})`;
  }
}

// Never fails loudly: missing a Discord notification (webhook deleted,
// Discord down...) must not prevent the JSON snapshot from being updated
// for the front — these are two independent uses of the same scan, one
// must not block the other.
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
  const abi = loadAbi(import.meta.url);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

  const state = await loadState();
  const minted = new Set(state.minted);
  const burned = new Set(state.burned);
  const proposalIds = new Set(state.proposalIds);
  // `author` isn't stored in the on-chain Proposal struct (only emitted in
  // the ProposalOpened event) — it has to be kept separately to be able to
  // put it back into the snapshot on every refresh.
  const proposalAuthors = state.proposalAuthors ?? {};
  const memberActivity = state.memberActivity ?? {};
  // The contract only accumulates totalDonations[address] (O(1) read, see
  // Meute.sol) — the leaderboard is built here, off-chain, never through
  // an on-chain loop over an unbounded number of donors.
  const donations = state.donations ?? {};
  const bump = (addr, key) => {
    const k = addr.toLowerCase();
    memberActivity[k] ??= { votesSubmitted: 0, openProposals: 0 };
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
      } else if (log.name === "VoteCast") {
        bump(log.args.voter, "votesSubmitted");
      } else if (log.name === "DonationReceived") {
        const { donor, amount, totalDonated } = log.args;
        // totalDonated comes directly from the contract (totalDonations):
        // source of truth, no recomputation from amount, to avoid any
        // drift if a run were replayed or an event missed.
        donations[donor.toLowerCase()] = totalDonated.toString();
        console.log(`Don reçu de ${donor} : ${ethers.formatEther(amount)} ETH (total ${ethers.formatEther(totalDonated)} ETH).`);
        await postToDiscord(`💝 **Don reçu** — ${ethers.formatEther(amount)} ETH de \`${donor.slice(0, 6)}…${donor.slice(-4)}\`. Merci !`);
      } else if (log.name === "ProposalOpened") {
        const { proposalId, target, author, proposalType } = log.args;
        proposalIds.add(proposalId.toString());
        proposalAuthors[proposalId.toString()] = author;
        bump(author, "openProposals");
        const prop = await contract.proposal(proposalId);
        console.log(`Ouverture #${proposalId} — ${TYPE_LABELS[Number(proposalType)]}`);
        await postToDiscord(
          `🗳️ **Nouvelle proposition ouverte** — ${proposalLabel(proposalType, target, prop.amount, prop.reason)}\n` +
            `Vote ouvert 7 jours — quorum : ${requiredQuorum(prop.activeSnapshot)}/${prop.activeSnapshot} Loups actifs doivent voter, puis oui doit dépasser non.`,
        );
      } else if (log.name === "ProposalExecuted") {
        const { proposalId, outcome } = log.args;
        const prop = await contract.proposal(proposalId);
        const approved = Number(outcome) === VoteChoice.Approve;
        console.log(`Exécution #${proposalId} — ${approved ? "approuvée" : "refusée"}`);
        await postToDiscord(
          `${approved ? "✅" : "❌"} **Vote clos** — ${proposalLabel(prop.proposalType, prop.target, prop.amount, prop.reason)}\n` +
            `${approved ? "Approuvée" : "Refusée"} (${prop.approveVotes} pour / ${prop.rejectVotes} contre).`,
        );
      }
    }
  } else {
    console.log("Aucun nouveau bloc — on rafraîchit quand même l'instantané (dormance, trésor).");
  }

  // Always recomputed, even without a new block: dormancy depends on the
  // current time, not just past events, and the treasury can change with
  // no associated event (none in this contract, but as a precaution).
  const currentMembers = [...minted].filter((a) => !burned.has(a));
  console.log(`Rafraîchissement de ${currentMembers.length} carte(s) membre...`);
  const [cards, dormancyDelay] = await Promise.all([
    Promise.all(currentMembers.map((addr) => contract.card(addr))),
    contract.DORMANCY_DELAY(), // read from the chain — never hardcoded here
  ]);
  const now = Number((await provider.getBlock(Number(toBlock))).timestamp);

  let cubs = 0;
  let dormantWolves = 0;
  const members = [];
  cards.forEach((c, i) => {
    const rank = Number(c.rank);
    // Dormancy only concerns Wolves (see Meute.sol, NatSpec of
    // openConfirmationVote — a Cub has no way to reset their own clock,
    // unlike a Wolf via imHere()).
    const dormant = rank !== Rank.Cub && now - Number(c.lastActivity) > Number(dormancyDelay);
    if (rank === Rank.Cub) cubs++;
    else if (dormant) dormantWolves++;
    members.push({ address: currentMembers[i], rank, dormant });
  });

  const [treasuryWei, activeWolvesCount] = await Promise.all([
    provider.getBalance(CONTRACT_ADDRESS),
    contract.activeWolves(),
  ]);

  console.log(`Rafraîchissement de ${proposalIds.size} proposition(s)...`);
  const proposals = await Promise.all(
    [...proposalIds].map(async (id) => {
      const p = await contract.proposal(id);
      return {
        id,
        proposalType: Number(p.proposalType),
        target: p.target,
        author: proposalAuthors[id],
        deadline: p.deadline.toString(),
        activeSnapshot: Number(p.activeSnapshot),
        snapshotFrozen: p.snapshotFrozen,
        executed: p.executed,
        approveVotes: Number(p.approveVotes),
        rejectVotes: Number(p.rejectVotes),
        postponeVotes: Number(p.postponeVotes),
        amount: p.amount.toString(),
        reason: p.reason,
      };
    }),
  );
  const votesCast = Object.values(memberActivity).reduce((sum, a) => sum + a.votesSubmitted, 0);
  const openProposals = proposals.filter((p) => !p.executed).length;

  // Off-chain leaderboard (see Meute.sol, totalDonations) — sorted once
  // here, never recomputed on the front side. Limited to 20: a "top
  // contributors" list doesn't need to be unbounded.
  const topDonors = Object.entries(donations)
    .map(([address, total]) => ({ address, total }))
    .sort((a, b) => (BigInt(a.total) < BigInt(b.total) ? 1 : -1))
    .slice(0, 20);

  await saveJson("index", {
    updatedAt: new Date().toISOString(),
    lastBlock: toBlock.toString(),
    stats: {
      treasuryWei: treasuryWei.toString(),
      activeWolves: Number(activeWolvesCount),
      dormantWolves,
      cubs,
      votesCast,
      openProposals,
    },
    proposals,
    memberActivity,
    topDonors,
    members,
  });

  await saveJson("state", {
    lastBlock: toBlock.toString(),
    minted: [...minted],
    burned: [...burned],
    proposalIds: [...proposalIds],
    proposalAuthors,
    memberActivity,
    donations,
  });
  console.log(`État et instantané à jour (Netlify Blobs) : dernier bloc traité ${toBlock}.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
