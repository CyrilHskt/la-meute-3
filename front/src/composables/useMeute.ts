import { ref, readonly, watch } from "vue";
import type { Address } from "viem";
import { useWallet } from "./useWallet";
import { useDiscordLink, type DiscordLink } from "./useDiscordLink";
import { isLocal } from "./chainMode";
// Direct `i18n.global.t` rather than `useI18n()`: this composable is also
// invoked from useWallet.ts's connect()/accountsChanged handlers, outside
// any component's setup() — `useI18n()` requires an active component
// instance and would throw there.
import { i18n } from "../i18n";

// Stats/proposals come from a snapshot maintained by a GitHub Actions job
// (scripts/sync-dao.js), read via a Netlify function
// (netlify/functions/dao-sync.mts) — never scanned live by the browser,
// neither locally nor in prod. Scanning the entire contract history
// ourselves on every page load ran into the limits of a free RPC (block
// range, throughput) and would only have gotten worse over time — see the
// discussion in docs/local/soutenance-prep.md. The data itself lives in
// Netlify Blobs, not committed to the repo: publishing a refresh must
// never trigger a site rebuild, the two are unrelated.
//
// Locally: run `npm run dev:netlify` (not just `npm run dev`) to serve the
// function alongside the front, and run `scripts/sync-dao.js` pointed at
// the local Hardhat node (RPC_URL=http://127.0.0.1:8545,
// SYNC_ENDPOINT=http://localhost:8888/.netlify/functions/dao-sync) after
// each test action (seed-local.js, vote...) to refresh the snapshot before
// reloading the page.

export const ProposalType = { Admission: 0, Confirmation: 1, Exclusion: 2, Expense: 3 } as const;
export const VoteChoice = { Approve: 0, Reject: 1, Postpone: 2 } as const;

export interface Proposal {
  id: bigint;
  proposalType: number;
  target: Address;
  author: Address;
  deadline: bigint;
  activeSnapshot: number;
  snapshotFrozen: boolean;
  executed: boolean;
  approveVotes: number;
  rejectVotes: number;
  postponeVotes: number;
  amount: bigint;
  reason: string;
}

export interface Stats {
  treasuryWei: bigint;
  activeWolves: number;
  dormantWolves: number;
  cubs: number;
  votesCast: number;
  openProposals: number;
}

export interface Donor {
  address: Address;
  total: bigint;
}

export interface DaoConfig {
  fee: bigint;
  dormancyDelay: number;
  maxPostponements: number;
  voteDuration: number;
  now: number;
}

interface DaoIndex {
  stats: {
    treasuryWei: string;
    activeWolves: number;
    dormantWolves: number;
    cubs: number;
    votesCast: number;
    openProposals: number;
  };
  // Read live rather than hardcoded (see sync-dao.js's DORMANCY_DELAY
  // comment) — GovernanceDao.vue reads these from here instead of
  // live-calling the chain on every page mount, for every visitor.
  config: {
    feeWei: string;
    dormancyDelaySeconds: number;
    maxPostponements: number;
    voteDurationSeconds: number;
    now: number;
  };
  proposals: {
    id: string;
    proposalType: number;
    target: Address;
    author: Address;
    deadline: string;
    activeSnapshot: number;
    snapshotFrozen: boolean;
    executed: boolean;
    approveVotes: number;
    rejectVotes: number;
    postponeVotes: number;
    amount: string;
    reason: string;
  }[];
  memberActivity: Record<string, { votesSubmitted: number; openProposals: number }>;
  // _hasVoted is private on the contract (no getter) — rebuilt off-chain
  // from VoteCast events by the indexer (scripts/sync-dao.js /
  // demo/actions.js's buildIndex), same principle as memberActivity just
  // above. Keyed by lowercased voter address, values are proposal ids.
  votedProposalsByVoter: Record<string, string[]>;
  topDonors: { address: Address; total: string }[];
  members: { address: Address; rank: number; dormant: boolean }[];
  // Only present on the ?key=index reread path (the ?key=governance
  // response carries it as a sibling of `index`, not inside it).
  discordLinks?: Record<string, DiscordLink>;
}

export interface Member {
  address: Address;
  rank: number;
  dormant: boolean;
}

const stats = ref<Stats | null>(null);
const config = ref<DaoConfig | null>(null);
const proposals = ref<Proposal[]>([]);
const memberActivity = ref<Map<string, { votesSubmitted: number; openProposals: number }>>(new Map());
const votedProposalsByVoter = ref<Map<string, Set<string>>>(new Map());
// Votes just cast by the connected wallet, not yet confirmed by the next
// indexer pass (up to 30 min away) — merged with votedProposalsByVoter so
// the vote button greys out immediately instead of waiting on the cron.
// See recordLocalVote()/hasVotedOn() below.
const locallyVotedProposalIds = ref<Set<string>>(new Set());
const topDonors = ref<Donor[]>([]);
const members = ref<Member[]>([]);
// Individual donation: "about me" data, read live (not via the shared
// snapshot, same principle as the balance). Displayed only on the
// membership card (GovernanceDao.vue) — the Donations tab also calls
// loadMyDonations() to keep this shared value up to date after a
// donation, but doesn't display it itself ("you've already donated"
// removed at the user's request: not useful once you're already on the
// donation form).
const myDonations = ref<bigint>(0n);
const loading = ref(false);
const error = ref<string | null>(null);

// Locally (VITE_CHAIN=local), the overview comes from the demo panel
// (demo/server.mjs) rather than dao-sync/Sepolia — same JSON format on
// both sides, so only one line changes, not a second implementation.
const NONCE_URL = isLocal ? "http://127.0.0.1:4100/discord/nonce" : "/.netlify/functions/dao-sync?key=discord-nonce";
const GOVERNANCE_URL = isLocal
  ? "http://127.0.0.1:4100/governance/verify"
  : "/.netlify/functions/dao-sync?key=governance";
const INDEX_URL = isLocal ? "http://127.0.0.1:4100/api/index" : "/.netlify/functions/dao-sync?key=index";

// The governance page (proposals, members, activity, donations) is
// reserved to current Meute members — see the de-anonymization discussion
// in docs/local/: rather than a masked-pseudonym system for visitors
// (convoluted, abandoned), we hide the data itself directly from anyone
// who isn't a member. A single proof of membership (signature + live
// on-chain verification of the card balance) issues a server-signed
// session token, valid for 30 min, kept in memory only (never persisted):
// a page reload asks for a new signature again, per the "once per
// session" choice.
const session = ref<string | null>(null);
const isAuthorized = ref(false);
const membershipError = ref<"network" | null>(null);

// Persisted across reloads (sessionStorage, not localStorage: cleared when
// the tab closes, consistent with the ~30 min server-side session rather
// than a "remember me forever" pattern) — without this, every reload asked
// for a new signature even though the server-side session was still valid.
// The stored value is never trusted blindly: it's only reused if its
// address matches the wallet currently connected, otherwise switching
// accounts (or a stale/corrupted entry from a previous visit) could apply
// someone else's session. No client-side TTL check here — the server
// already re-validates expiry on every request (loadAll()'s 401 handling
// below), a client-side decode would just duplicate that.
const SESSION_STORAGE_KEY = "meute-session";

function readStoredSession(): { address: string; token: string } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { address?: unknown; token?: unknown };
    if (typeof parsed.address !== "string" || typeof parsed.token !== "string") return null;
    return { address: parsed.address, token: parsed.token };
  } catch {
    return null;
  }
}

function clearStoredSession() {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Storage unavailable (e.g. private browsing) — nothing to clear.
  }
}

const { address: walletAddress, readOnlyContract, signMessage, syncLocalContractAddress } = useWallet();
const { setLinks } = useDiscordLink();

// One-shot restore per address change: fires once the wallet address is
// known (either right away if a session had been kept in memory, or once
// tryRestoreConnection() resolves on page load) and reapplies a
// still-matching stored session so loadAll() can reuse it without asking
// for a new signature. A mismatched or corrupted entry simply falls
// through — the page stays in its "members-only" state pending a fresh
// signature, same as if nothing had been stored.
watch(
  walletAddress,
  (addr) => {
    if (!addr) return;
    const stored = readStoredSession();
    if (stored && stored.address.toLowerCase() === addr.toLowerCase()) {
      session.value = stored.token;
      isAuthorized.value = true;
    }
  },
  { immediate: true },
);

watch(session, (token) => {
  if (token && walletAddress.value) {
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ address: walletAddress.value, token }));
    } catch {
      // Storage unavailable (e.g. private browsing) — the session still
      // works for the current tab, just won't survive a reload.
    }
  } else {
    clearStoredSession();
  }
});

// connect() (explicit click) AND MetaMask's `accountsChanged` event
// (triggered by that same click, right on the very first authorization)
// can both call verifyMembershipAndLoad() for the same address in near
// simultaneity — without deduplication, this triggered two signature
// requests back to back (observed). Only one verification in flight per
// wallet; a second call for the same wallet reuses the promise already in
// progress rather than starting over.
let verificationPromise: Promise<void> | null = null;
let walletBeingVerified: string | null = null;
// The generation `verificationPromise` was started under. Wallet identity
// alone isn't enough to decide whether it's safe to reuse: if a reset
// (disconnect/account change) bumped `verificationGeneration` after this
// promise started, it's already guaranteed to bail out without ever
// setting session/isAuthorized (see `isStale()` below) — reusing it would
// silently discard a legitimate, still-current verification for the same
// wallet racing in right behind it (issue: explicit connect() and
// MetaMask's own `accountsChanged` firing for the same authorization).
let verificationPromiseGeneration = 0;

// Generation counter: incremented on every new verification started AND
// on every reset (disconnect/account change). A verification in flight
// that finishes after being superseded (e.g. the user switches MetaMask
// accounts while the previous account's signature is still pending) must
// NEVER apply its result — without this guard, a late result for the old
// wallet could overwrite session/isAuthorized/the index with data for
// THAT wallet while the UI already shows the new one (observed in code
// review, not just theoretical).
let verificationGeneration = 0;

// Dashboard.vue mounts GovernanceDao/Members/Donations simultaneously (all
// `v-show`, never `v-if`), and each fires its own onMounted `loadAll()` —
// so opening the dashboard triggers 3 concurrent, redundant refreshes. A
// naive "return the in-flight promise to every caller" dedup was tried and
// reverted: a caller right after a just-mined transaction must never
// receive a snapshot older than that transaction, and reusing the promise
// already in flight can resolve with data fetched before that transaction
// was even sent. `loadAllRun` tracks the current in-flight
// `performLoadAll()`; `loadAllRerun` is a single trailing rerun shared by
// every caller that arrives while `loadAllRun` is in flight, guaranteed to
// start only once that run has fully settled (see `loadAll()` below).
let loadAllRun: Promise<void> | null = null;
let loadAllRerun: Promise<void> | null = null;

function applyIndex(index: DaoIndex) {
  stats.value = { ...index.stats, treasuryWei: BigInt(index.stats.treasuryWei) };
  config.value = {
    fee: BigInt(index.config.feeWei),
    dormancyDelay: index.config.dormancyDelaySeconds,
    maxPostponements: index.config.maxPostponements,
    voteDuration: index.config.voteDurationSeconds,
    now: index.config.now,
  };

  proposals.value = index.proposals
    .map((p) => ({
      ...p,
      id: BigInt(p.id),
      deadline: BigInt(p.deadline),
      amount: BigInt(p.amount),
    }))
    .sort((a, b) => (a.id > b.id ? -1 : 1));

  memberActivity.value = new Map(Object.entries(index.memberActivity));
  votedProposalsByVoter.value = new Map(
    Object.entries(index.votedProposalsByVoter ?? {}).map(([addr, ids]) => [addr, new Set(ids)]),
  );

  topDonors.value = (index.topDonors ?? []).map((d) => ({ address: d.address, total: BigInt(d.total) }));
  members.value = index.members ?? [];

  // Absent on the ?key=governance path (runVerification calls setLinks
  // itself with the sibling field) — never overwrite with {} there, that
  // would wipe links the caller is about to set.
  if (index.discordLinks) setLinks(index.discordLinks);
}

/** True once the indexer's snapshot confirms the vote, or immediately
 *  after a successful `vote()` tx via recordLocalVote() — see
 *  GovernanceDao.vue's hasVoted(). */
function hasVotedOn(address: Address | null, proposalId: bigint): boolean {
  if (!address) return false;
  const idStr = proposalId.toString();
  const voterKey = address.toLowerCase();
  return (votedProposalsByVoter.value.get(voterKey)?.has(idStr) ?? false) || locallyVotedProposalIds.value.has(idStr);
}

/** Grays out the vote button right after a successful tx, without waiting
 *  on the indexer's next pass (up to 30 min away) — see GovernanceDao.vue's
 *  vote(). Superseded (but never contradicted) by the snapshot once the
 *  indexer catches up. */
function recordLocalVote(proposalId: bigint) {
  locallyVotedProposalIds.value = new Set(locallyVotedProposalIds.value).add(proposalId.toString());
}

// Declared at module level, not inside useMeute(): they only ever touch
// module-level state, and the `watch(isAuthorized, ...)` edge below has to
// be registered exactly once for the whole app rather than once per
// component calling useMeute().
/** Clears every trace of the previous session — to call as soon as the
 *  wallet disconnects or changes account (see useWallet.ts,
 *  accountsChanged). Without this, the page stayed displayed as if the
 *  old account were still authenticated: the verified session/balance no
 *  longer relate to the currently selected account. */
function resetSession() {
  verificationGeneration++;
  isAuthorized.value = false;
  membershipError.value = null;
  session.value = null;
  stats.value = null;
  config.value = null;
  proposals.value = [];
  memberActivity.value = new Map();
  votedProposalsByVoter.value = new Map();
  locallyVotedProposalIds.value = new Set();
  topDonors.value = [];
  members.value = [];
  myDonations.value = 0n;
  setLinks({});
  clearStoredSession();
}

/** Proof of Meute membership: verifies the on-chain balance, signs a
 *  message containing a single-use nonce, then exchanges that proof for
 *  a session token and the full snapshot (proposals, members, donations,
 *  Discord identities). Does nothing noisy on failure (not a member,
 *  signature refused, network): the page simply stays in its
 *  "members-only" state. Called only from the explicit click on
 *  "Connect my wallet" (useWallet.ts, connect()) — never from the silent
 *  reconnection on load. */
async function verifyMembershipAndLoad(address: Address) {
  const wallet = address.toLowerCase();
  if (verificationPromise && walletBeingVerified === wallet && verificationPromiseGeneration === verificationGeneration) {
    return verificationPromise;
  }
  walletBeingVerified = wallet;
  verificationGeneration++;
  const generation = verificationGeneration;
  verificationPromiseGeneration = generation;
  verificationPromise = runVerification(address, generation).finally(() => {
    if (walletBeingVerified === wallet && verificationPromiseGeneration === generation) {
      verificationPromise = null;
      walletBeingVerified = null;
    }
  });
  return verificationPromise;
}

async function runVerification(address: Address, generation: number) {
  // At every async step, we check that no more recent verification
  // started in the meantime (new wallet, disconnect) — otherwise we bail
  // out without touching `isAuthorized`/`session`: applying them here
  // would overwrite the state already updated for the wallet currently
  // displayed with this old wallet's stale result.
  const isStale = () => generation !== verificationGeneration;
  membershipError.value = null;

  try {
    const balance = (await readOnlyContract().read.balanceOf([address])) as bigint;
    if (isStale()) return;
    if (balance === 0n) {
      isAuthorized.value = false;
      return;
    }
  } catch {
    if (!isStale()) {
      membershipError.value = "network";
      isAuthorized.value = false;
    }
    return;
  }

  let nonce: string;
  try {
    const nonceRes = await fetch(`${NONCE_URL}${isLocal ? "?" : "&"}wallet=${address}`);
    if (isStale()) return;
    if (!nonceRes.ok) {
      isAuthorized.value = false;
      return;
    }
    ({ nonce } = (await nonceRes.json()) as { nonce: string });
    if (isStale()) return;
  } catch {
    if (!isStale()) {
      membershipError.value = "network";
      isAuthorized.value = false;
    }
    return;
  }

  const message = `Je fais partie de La Meute (${address}) — ${nonce}`;
  let signature: `0x${string}`;
  try {
    signature = await signMessage(message);
    if (isStale()) return;
  } catch {
    // Signature refused/cancelled — not an error to display noisily, the
    // page stays members-only.
    return;
  }

  try {
    const res = await fetch(GOVERNANCE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet: address, signature, nonce }),
    });
    if (isStale()) return;
    if (!res.ok) {
      isAuthorized.value = false;
      return;
    }
    const body = (await res.json()) as { session: string; index: DaoIndex; discordLinks: Record<string, unknown> };
    if (isStale()) return;
    session.value = body.session;
    applyIndex(body.index);
    setLinks(body.discordLinks as Parameters<typeof setLinks>[0]);
    isAuthorized.value = true;
  } catch {
    if (!isStale()) {
      membershipError.value = "network";
      isAuthorized.value = false;
    }
  }
}

/** Refreshes the snapshot using the session already obtained — no new
 *  signature as long as it's valid (~30 min), so we don't ask for a
 *  signature again on every vote or tab change. Does nothing if the
 *  session isn't (yet) established. */
async function performLoadAll() {
  loading.value = true;
  error.value = null;
  try {
    if (isLocal) await syncLocalContractAddress();
    const url = `${INDEX_URL}${isLocal ? "?" : "&"}wallet=${walletAddress.value}&session=${session.value}`;
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 401) {
      // Session expired — purge everything (not just
      // isAuthorized/session): without this, already-loaded
      // proposals/members/donations stayed displayed everywhere else
      // (e.g. the beneficiary picker for a new proposal) while the page
      // is supposed to become "members-only" again pending a new proof
      // of membership.
      resetSession();
      return;
    }
    if (!res.ok) throw new Error(i18n.global.t('errors.daoSnapshotLoadFailed', { status: res.status }));
    applyIndex((await res.json()) as DaoIndex);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

/** Coalesces the 3 concurrent `loadAll()` calls fired when Dashboard.vue
 *  mounts its 3 governance sub-pages at once. Any caller B arriving while
 *  a run A is in flight gets `loadAllRerun`: a fresh `performLoadAll()`
 *  chained to only start once A has fully settled, i.e. strictly after B
 *  called `loadAll()` — so B's promise resolves with data reflecting at
 *  least everything committed before B's call. Multiple latecomers share
 *  the same `loadAllRerun`, so N concurrent calls collapse into at most 2
 *  real fetches instead of N. */
async function loadAll(): Promise<void> {
  if (!isAuthorized.value || !session.value || !walletAddress.value) return;

  if (!loadAllRun) {
    loadAllRun = performLoadAll().finally(() => {
      loadAllRun = null;
    });
    return loadAllRun;
  }

  if (!loadAllRerun) {
    loadAllRerun = loadAllRun.then(loadAll, loadAll).finally(() => {
      loadAllRerun = null;
    });
  }
  return loadAllRerun;
}

// Direct read of a single proposal, to call right after a transaction
// that modifies it (vote, execution) — the snapshot only refreshes every
// 15 min in prod (via the scheduled job), so voting then rereading via
// `loadAll()` wouldn't show the new vote yet. A targeted read is
// negligible (no history scan), so we can afford it on every
// transaction.
// `knownAuthor`: for a proposal just created, the caller already
// extracted it from the ProposalOpened event in the receipt (the
// on-chain struct reread below doesn't contain this field) — without
// this, a brand-new proposal would fall back to the zero address until
// the next indexer pass fixes it.
async function refreshProposal(id: bigint, knownAuthor?: Address) {
  const contract = readOnlyContract();
  const p = (await contract.read.proposal([id])) as Omit<Proposal, "id" | "author">;
  const index = proposals.value.findIndex((existing) => existing.id === id);
  const existingAuthor = knownAuthor ?? (index >= 0 ? proposals.value[index].author : ("0x0000000000000000000000000000000000000000" as Address));
  const updated: Proposal = { ...p, id, author: existingAuthor };
  if (index >= 0) {
    proposals.value = proposals.value.map((existing, i) => (i === index ? updated : existing));
  } else {
    proposals.value = [updated, ...proposals.value];
  }
}

async function loadMyDonations(address: Address | null) {
  if (!address) {
    myDonations.value = 0n;
    return;
  }
  myDonations.value = (await readOnlyContract().read.totalDonations([address])) as bigint;
}

// The missing reactive edge behind the "0 ongoing / 0 past" empty state: a
// component's onMounted `loadAll()` can run *before* the wallet address is
// restored (useWallet.ts, tryRestoreConnection) and the stored session
// reapplied, in which case `loadAll()`'s guard returns without fetching
// and nothing else ever retries — permanently empty on Sepolia, papered
// over locally by useLocalAutoRefresh's focus event. `stats === null`
// keeps the common case (onMounted already fetched, or the verification
// flow that populates the snapshot itself) from refetching.
watch(isAuthorized, (authorized) => {
  if (authorized && stats.value === null) void loadAll();
});

export function useMeute() {
  return {
    stats: readonly(stats),
    config: readonly(config),
    proposals: readonly(proposals),
    memberActivity: readonly(memberActivity),
    hasVotedOn,
    recordLocalVote,
    topDonors: readonly(topDonors),
    members: readonly(members),
    myDonations: readonly(myDonations),
    loading: readonly(loading),
    error: readonly(error),
    isAuthorized: readonly(isAuthorized),
    membershipError: readonly(membershipError),
    verifyMembershipAndLoad,
    resetSession,
    loadAll,
    refreshProposal,
    loadMyDonations,
  };
}
