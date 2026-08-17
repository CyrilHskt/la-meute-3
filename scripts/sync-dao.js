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
//   RPC_URL              — endpoint (Alchemy) for the chain CHAIN_ID points to
//   DISCORD_WEBHOOK_URL   — URL of the Discord webhook to post to
//   SYNC_ENDPOINT         — URL of the Netlify function (e.g.
//                           https://la-meute-3.netlify.app/.netlify/functions/dao-sync)
//   SYNC_SECRET           — secret shared with that function
// Optional:
//   CHAIN_ID              — which entry of front/src/contract-meta.json's
//                           `deployments` map to use. The cron passes
//                           84532 (Base Sepolia), what production has run
//                           on since 2026-08-03; the 11155111 (Sepolia)
//                           default is the rollback path — see
//                           docs/local/l2-migration-reflection.md
//   CONTRACT_ADDRESS      — overrides the address read from
//                           front/src/contract-meta.json (generated from
//                           front/src/contract.ts via
//                           scripts/generate-contract-meta.js — single
//                           source of truth by default, so this script
//                           never drifts out of sync with a redeployment)

import { ethers } from "ethers";
import { loadAbi } from "./lib/abi.js";
import meta from "../front/src/contract-meta.json" with { type: "json" };

// Alchemy's free plan caps eth_getLogs at 10 blocks per request (observed
// in prod: -32600 error as soon as you exceed it), and a fairly low
// compute-units/second throughput (429 error even sequentially with no
// delay).
const BLOCK_RANGE = 9n; // fromBlock..fromBlock+9 = 10 blocks inclusive

// Deployed at this same address via a deterministic (Nick's method)
// deployer on virtually every EVM chain, including Base Sepolia — see
// https://www.multicall3.com/deployments. Used to batch every member-card
// read, every proposal read, and the handful of singleton reads
// (activeWolves, treasury balance, block timestamp) into a single
// eth_call per run instead of one eth_call per item — that per-item cost,
// repeated on every cron run, was the main driver of Alchemy free-tier
// compute-unit exhaustion (see .github/workflows/sync-dao.yml).
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
const MULTICALL3_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)",
  "function getEthBalance(address addr) view returns (uint256 balance)",
  "function getCurrentBlockTimestamp() view returns (uint256 timestamp)",
];

const CHAIN_ID = process.env.CHAIN_ID ?? "11155111";
const DEPLOYMENT = meta.deployments[CHAIN_ID] ?? meta.deployments["11155111"];

const RPC_URL = process.env.RPC_URL;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS ?? DEPLOYMENT.address;
const DEPLOY_BLOCK = BigInt(DEPLOYMENT.deployBlock);
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const SYNC_ENDPOINT = process.env.SYNC_ENDPOINT;
const SYNC_SECRET = process.env.SYNC_SECRET;

if (!RPC_URL || !DISCORD_WEBHOOK_URL || !SYNC_ENDPOINT || !SYNC_SECRET) {
  throw new Error("RPC_URL, DISCORD_WEBHOOK_URL, SYNC_ENDPOINT and SYNC_SECRET are required.");
}

const TYPE_LABELS = ["Admission", "Confirmation", "Exclusion", "Expense"];
const Rank = { Cub: 0, Wolf: 1 };
const VoteChoice = { Approve: 0, Reject: 1, Postpone: 2 };

// Everything in the state is chain-specific: block cursor, but also the
// members/proposals/donations accumulated on that chain. Reusing it across
// chains would be silently wrong, and a cursor left on the other chain's
// block height either rescans tens of millions of blocks (10 at a time —
// guaranteed CI timeout) or skips every past event. Only the migration
// itself hits this, but nothing in the code used to notice it: the L2
// switch was handled by manually clearing the blob.
//
// A state written before this field existed is adopted as-is rather than
// discarded: the only such blob in existence is the current chain's, and
// wiping it would trigger a pointless full rescan.
function stateForChain(state) {
  if (state.chainId == null || String(state.chainId) === CHAIN_ID) return { ...state, chainId: CHAIN_ID };
  console.log(`State belongs to chain ${state.chainId}, now running on ${CHAIN_ID} — starting over from the deployment block.`);
  return { chainId: CHAIN_ID, lastBlock: null };
}

async function loadState() {
  const res = await fetch(`${SYNC_ENDPOINT}?key=state`, {
    headers: { "x-sync-secret": SYNC_SECRET },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Failed to read state (HTTP ${res.status})`);
  const state = stateForChain(await res.json());
  // `lastBlock: null` = never run yet (the function's default value) — we
  // then start from one block before deployment, instead of trying
  // `BigInt(null)`. One before, not at, DEPLOY_BLOCK itself: `fromBlock`
  // below is always `lastBlock + 1`, and the constructor's founder
  // mint(s) — a Transfer event — happen in the same transaction as the
  // deployment, i.e. in DEPLOY_BLOCK itself. Starting at DEPLOY_BLOCK
  // would skip that block and silently lose the founder's own mint (only
  // visible once activeWolves() and the members list disagree).
  return state.lastBlock == null ? { ...state, lastBlock: (DEPLOY_BLOCK - 1n).toString() } : state;
}

async function saveJson(key, value) {
  const res = await fetch(`${SYNC_ENDPOINT}?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-sync-secret": SYNC_SECRET },
    body: JSON.stringify(value),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Failed to write "${key}" (HTTP ${res.status})`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getLogsWithRetry(provider, params, attempt = 1) {
  try {
    return await provider.getLogs(params);
  } catch (err) {
    const is429 = err?.error?.code === 429 || err?.info?.error?.code === 429;
    if (!is429 || attempt >= 5) throw err;
    const delay = 1000 * 2 ** (attempt - 1);
    console.log(`Rate-limited (429), retrying in ${delay}ms (attempt ${attempt}/5)...`);
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
// (_quorumReached, the authority) and as the front
// (useProposalFormatting.ts, sole TypeScript copy). Three copies across
// three languages, nothing can share them: they must move together. A
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
      console.error(`Discord responded ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.error("Failed to send to Discord:", err);
  }
}

async function main() {
  const fetchRequest = new ethers.FetchRequest(RPC_URL);
  fetchRequest.timeout = 15_000;
  // A plain `staticNetwork: true` still performs one real eth_chainId call
  // before locking in — insufficient on a dead/quota-exhausted RPC, which
  // is exactly what caused every run to retry eth_chainId once per second
  // for the full 25-minute CI timeout during the Alchemy free-tier
  // incident (see docs/local/soutenance-prep.md). Passing an actual
  // Network instance skips that detection call entirely.
  const network = ethers.Network.from(Number(CHAIN_ID));
  const provider = new ethers.JsonRpcProvider(fetchRequest, network, { staticNetwork: network });
  const abi = loadAbi(import.meta.url);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);
  const multicall = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, provider);

  const state = await loadState();
  const minted = new Set(state.minted);
  const burned = new Set(state.burned);
  const proposalIds = new Set(state.proposalIds);
  // `author` isn't stored in the on-chain Proposal struct (only emitted in
  // the ProposalOpened event) — it has to be kept separately to be able to
  // put it back into the snapshot on every refresh.
  const proposalAuthors = state.proposalAuthors ?? {};
  const memberActivity = state.memberActivity ?? {};
  // _hasVoted is private on the contract (no getter) — "did this member
  // already vote on this proposal" is rebuilt here from VoteCast events,
  // same principle as everything else in this function, so the front
  // never has to scan eth_getLogs itself (see GovernanceDao.vue's
  // loadMyVotedProposals). Kept as Set<string> per voter while scanning:
  // a Set makes replaying an already-processed block range (the known
  // index-before-state write-ordering issue below) naturally idempotent —
  // re-adding an already-known proposalId is a no-op, never a duplicate.
  const votedProposalsByVoter = new Map(
    Object.entries(state.votedProposalsByVoter ?? {}).map(([addr, ids]) => [addr, new Set(ids)]),
  );
  // The contract only accumulates totalDonations[address] (O(1) read, see
  // Meute.sol) — the leaderboard is built here, off-chain, never through
  // an on-chain loop over an unbounded number of donors.
  const donations = state.donations ?? {};
  const bump = (addr, key) => {
    const k = addr.toLowerCase();
    memberActivity[k] ??= { votesSubmitted: 0, openProposals: 0 };
    memberActivity[k][key]++;
  };

  console.log("Fetching the latest block...");
  const fromBlock = BigInt(state.lastBlock) + 1n;
  const toBlock = BigInt(await provider.getBlockNumber());
  console.log(`Range to process: blocks ${fromBlock} → ${toBlock} (${toBlock - fromBlock + 1n} blocks).`);

  if (fromBlock <= toBlock) {
    console.log(`Fetching events (in batches of ${BLOCK_RANGE + 1n} blocks)...`);
    const rawLogs = await getAllLogsChunked(provider, CONTRACT_ADDRESS, fromBlock, toBlock);
    const decoded = rawLogs.flatMap((log) => {
      try {
        return [contract.interface.parseLog(log)];
      } catch {
        return [];
      }
    });
    console.log(`${decoded.length} event(s) decoded.`);

    for (const log of decoded) {
      if (log.name === "Transfer") {
        const { from, to } = log.args;
        if (from === ethers.ZeroAddress) minted.add(to.toLowerCase());
        if (to === ethers.ZeroAddress) burned.add(from.toLowerCase());
      } else if (log.name === "VoteCast") {
        bump(log.args.voter, "votesSubmitted");
        const voterKey = log.args.voter.toLowerCase();
        if (!votedProposalsByVoter.has(voterKey)) votedProposalsByVoter.set(voterKey, new Set());
        votedProposalsByVoter.get(voterKey).add(log.args.proposalId.toString());
      } else if (log.name === "DonationReceived") {
        const { donor, amount, totalDonated } = log.args;
        // totalDonated comes directly from the contract (totalDonations):
        // source of truth, no recomputation from amount, to avoid any
        // drift if a run were replayed or an event missed.
        donations[donor.toLowerCase()] = totalDonated.toString();
        console.log(`Donation received from ${donor}: ${ethers.formatEther(amount)} ETH (total ${ethers.formatEther(totalDonated)} ETH).`);
        await postToDiscord(`💝 **Don reçu** — ${ethers.formatEther(amount)} ETH de \`${donor.slice(0, 6)}…${donor.slice(-4)}\`. Merci !`);
      } else if (log.name === "ProposalOpened") {
        const { proposalId, target, author, proposalType } = log.args;
        proposalIds.add(proposalId.toString());
        proposalAuthors[proposalId.toString()] = author;
        bump(author, "openProposals");
        const prop = await contract.proposal(proposalId);
        console.log(`Opening #${proposalId} — ${TYPE_LABELS[Number(proposalType)]}`);
        await postToDiscord(
          `🗳️ **Nouvelle proposition ouverte** — ${proposalLabel(proposalType, target, prop.amount, prop.reason)}\n` +
            `Vote ouvert 7 jours — quorum : ${requiredQuorum(prop.activeSnapshot)}/${prop.activeSnapshot} Loups actifs doivent voter, puis oui doit dépasser non.`,
        );
      } else if (log.name === "ProposalExecuted") {
        const { proposalId, outcome } = log.args;
        const prop = await contract.proposal(proposalId);
        const approved = Number(outcome) === VoteChoice.Approve;
        console.log(`Execution #${proposalId} — ${approved ? "approved" : "rejected"}`);
        await postToDiscord(
          `${approved ? "✅" : "❌"} **Vote clos** — ${proposalLabel(prop.proposalType, prop.target, prop.amount, prop.reason)}\n` +
            `${approved ? "Approuvée" : "Refusée"} (${prop.approveVotes} pour / ${prop.rejectVotes} contre).`,
        );
      }
    }
  } else {
    console.log("No new block — refreshing the snapshot anyway (dormancy, treasury).");
  }

  // Always recomputed, even without a new block: dormancy depends on the
  // current time, not just past events, and the treasury can change with
  // no associated event (none in this contract, but as a precaution).
  //
  // Every member card, every proposal, and the singleton reads
  // (activeWolves, treasury balance, current timestamp) are batched into
  // one aggregate3 multicall instead of one eth_call per item — this is
  // the part of the run whose cost used to scale with the pack's size on
  // every single invocation (see MULTICALL3_ADDRESS comment above).
  const currentMembers = [...minted].filter((a) => !burned.has(a));
  const proposalIdList = [...proposalIds];
  console.log(`Refreshing ${currentMembers.length} member card(s) and ${proposalIdList.length} proposal(s) via multicall...`);

  const calls = [
    ...currentMembers.map((addr) => ({
      target: CONTRACT_ADDRESS,
      allowFailure: false,
      callData: contract.interface.encodeFunctionData("card", [addr]),
    })),
    ...proposalIdList.map((id) => ({
      target: CONTRACT_ADDRESS,
      allowFailure: false,
      callData: contract.interface.encodeFunctionData("proposal", [id]),
    })),
    {
      target: CONTRACT_ADDRESS,
      allowFailure: false,
      callData: contract.interface.encodeFunctionData("activeWolves", []),
    },
    {
      // Read live rather than hardcoded: it's a `constant` today (Meute.sol
      // line 117) but nothing guarantees it stays 180 days across a future
      // redeploy, and batching it here costs zero extra RPC requests —
      // same pattern the front already follows (GovernanceDao.vue reads it
      // live too, never trusts a fixed value).
      target: CONTRACT_ADDRESS,
      allowFailure: false,
      callData: contract.interface.encodeFunctionData("DORMANCY_DELAY", []),
    },
    // Same reasoning as DORMANCY_DELAY just above — batched here at zero
    // extra RPC cost so the front (GovernanceDao.vue) can read all four
    // from the snapshot instead of live-calling the chain on every page
    // mount, for every visitor (traffic-driven, not activity-driven —
    // this is what actually burned through Alchemy's throughput, not the
    // cron itself).
    {
      target: CONTRACT_ADDRESS,
      allowFailure: false,
      callData: contract.interface.encodeFunctionData("fee", []),
    },
    {
      target: CONTRACT_ADDRESS,
      allowFailure: false,
      callData: contract.interface.encodeFunctionData("MAX_POSTPONEMENTS", []),
    },
    {
      target: CONTRACT_ADDRESS,
      allowFailure: false,
      callData: contract.interface.encodeFunctionData("VOTE_DURATION", []),
    },
    {
      target: MULTICALL3_ADDRESS,
      allowFailure: false,
      callData: multicall.interface.encodeFunctionData("getEthBalance", [CONTRACT_ADDRESS]),
    },
    {
      target: MULTICALL3_ADDRESS,
      allowFailure: false,
      callData: multicall.interface.encodeFunctionData("getCurrentBlockTimestamp", []),
    },
  ];
  const results = await multicall.aggregate3.staticCall(calls);

  let cursor = 0;
  const cards = currentMembers.map((_, i) => contract.interface.decodeFunctionResult("card", results[cursor + i].returnData)[0]);
  cursor += currentMembers.length;
  const rawProposals = proposalIdList.map((_, i) => contract.interface.decodeFunctionResult("proposal", results[cursor + i].returnData)[0]);
  cursor += proposalIdList.length;
  const activeWolvesCount = contract.interface.decodeFunctionResult("activeWolves", results[cursor++].returnData)[0];
  const dormancyDelay = contract.interface.decodeFunctionResult("DORMANCY_DELAY", results[cursor++].returnData)[0];
  const fee = contract.interface.decodeFunctionResult("fee", results[cursor++].returnData)[0];
  const maxPostponements = contract.interface.decodeFunctionResult("MAX_POSTPONEMENTS", results[cursor++].returnData)[0];
  const voteDuration = contract.interface.decodeFunctionResult("VOTE_DURATION", results[cursor++].returnData)[0];
  const treasuryWei = multicall.interface.decodeFunctionResult("getEthBalance", results[cursor++].returnData)[0];
  const now = Number(multicall.interface.decodeFunctionResult("getCurrentBlockTimestamp", results[cursor++].returnData)[0]);

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

  const proposals = proposalIdList.map((id, i) => {
    const p = rawProposals[i];
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
  });
  const votesCast = Object.values(memberActivity).reduce((sum, a) => sum + a.votesSubmitted, 0);
  const openProposals = proposals.filter((p) => !p.executed).length;

  // Off-chain leaderboard (see Meute.sol, totalDonations) — sorted once
  // here, never recomputed on the front side. Limited to 20: a "top
  // contributors" list doesn't need to be unbounded.
  const topDonors = Object.entries(donations)
    .map(([address, total]) => ({ address, total }))
    .sort((a, b) => (BigInt(a.total) < BigInt(b.total) ? 1 : -1))
    .slice(0, 20);

  const votedProposalsByVoterJson = Object.fromEntries([...votedProposalsByVoter].map(([addr, ids]) => [addr, [...ids]]));

  // Write ordering, and what a crash between these two writes actually
  // costs. `index` (what the front reads) goes out first, `state` (the
  // cursor) second, and they are two separate HTTP POSTs — so a run can
  // die in between. That is deliberate and safe, because each write is
  // itself atomic (one setJSON) and reprocessing a block range is a no-op:
  //   - `memberActivity` counters are rebuilt from the *persisted* state on
  //     every run, so replaying a range re-increments up to the same total,
  //     never past it;
  //   - minted/burned/proposalIds/votedProposalsByVoter are Sets, re-adding
  //     a known entry changes nothing.
  // A crash after `index` only leaves the snapshot briefly ahead of the
  // cursor; the next run rewrites both and the gap closes by itself.
  //
  // The one residue: Discord posts happen *during* the event loop above,
  // i.e. before either write. A crash after a post but before `state` is
  // saved means the next run reprocesses those events and posts them
  // again — duplicate notifications, never duplicate data. Accepted as-is:
  // the alternative (buffering messages until after `state` is written)
  // trades a visible duplicate for a silently lost announcement, which is
  // worse for a governance feed.
  //
  // Snapshot shape defined in front/src/daoSnapshot.ts (DaoSnapshot) — the
  // front and the Netlify function type themselves against it, this script
  // can't import it (plain JS), so any field added below has to be added
  // there too, and in demo/actions.js's buildIndex.
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
    // Read live rather than hardcoded (see DORMANCY_DELAY comment above) —
    // GovernanceDao.vue reads these from here instead of live-calling the
    // chain on every page mount.
    config: {
      feeWei: fee.toString(),
      dormancyDelaySeconds: Number(dormancyDelay),
      maxPostponements: Number(maxPostponements),
      voteDurationSeconds: Number(voteDuration),
      now,
    },
    proposals,
    memberActivity,
    votedProposalsByVoter: votedProposalsByVoterJson,
    topDonors,
    members,
  });

  await saveJson("state", {
    chainId: CHAIN_ID,
    lastBlock: toBlock.toString(),
    minted: [...minted],
    burned: [...burned],
    proposalIds: [...proposalIds],
    proposalAuthors,
    memberActivity,
    votedProposalsByVoter: votedProposalsByVoterJson,
    donations,
  });
  console.log(`State and snapshot up to date (Netlify Blobs): last block processed ${toBlock}.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
