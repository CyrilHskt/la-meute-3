// Single entry point between the indexing job (scripts/sync-dao.js), the
// front and a transaction that just happened, to decouple publishing the
// data from deploying the site. Before: the job committed the JSON to the
// repo, which forced Netlify to rebuild the whole site on every refresh
// (and had already caused a separate bug via "[skip ci]"). Now: everyone
// writes here via an HTTP request, stored in Netlify Blobs — no commit, no
// rebuild triggered by changing data.
//
// Three uses on the same store:
//   "index" — the governance snapshot (stats, proposals, members,
//             activity). Even though this is already on-chain data, we
//             reserve it to current members rather than making it public
//             on the site — see the de-anonymization discussion in
//             docs/local/. Read via ?key=governance (first time, with
//             signature) or ?key=index&wallet=&session= (rereads). Writing
//             always protected by x-sync-secret (indexing job).
//   "state" — the indexer's internal cursor (last processed block,
//             members/proposals already seen); read AND write protected
//             by a shared secret, only the job should touch it.
//   "patch-proposal" — called by the front right after a transaction that
//             affects a proposal (application, vote, execution...), so the
//             shared snapshot reflects that action for everyone
//             immediately, without waiting for the job's next pass (up to
//             5 min). No secret required: the client never says "here's
//             the value, write it", only "reread proposal #X" — the
//             function itself reads the on-chain truth before writing,
//             impossible to inject made-up data from the browser.
//
// GET  ?key=state                       → internal state (x-sync-secret header required)
// GET  ?key=discord-nonce&wallet=       → single-use token, prerequisite for ?key=governance (see below)
// POST ?key=governance                  → { wallet, signature, nonce } → { session, index, discordLinks },
//                                          reserved to current members (card verified live on-chain
//                                          on this call) — see the de-anonymization discussion in
//                                          docs/local/. The whole governance page (proposals, members,
//                                          donations, Discord identities) is members-only, not just the
//                                          Discord table.
// GET  ?key=index&wallet=&session=      → rereads the snapshot with the session obtained via ?key=governance
//                                          (no new signature as long as it's valid, ~30 min)
// POST ?key=index|state                 → writes the JSON body (x-sync-secret header required) — used by
//                                          the indexing job, never by the front
// POST ?key=patch-proposal              → { proposalId, author } (no auth, but rate-limited)

import { getStore } from "@netlify/blobs";
import { createPublicClient, http, isAddress, recoverMessageAddress, type Address } from "viem";
import { sepolia } from "viem/chains";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../../src/contract.js";
import { createNonce, verifyNonce, createSession, verifySession, type NoncePurpose } from "./lib/tokens.js";

const SYNC_SECRET = process.env.SYNC_SECRET;
const RPC_URL = process.env.RPC_URL;

// A single real transaction never triggers more than one call per
// proposal — a short cooldown is enough to block abusive use (RPC read
// spam) without ever hindering normal use. No memory shared between
// invocations of a serverless function: the timestamp of the last patch
// per proposal is itself stored in the blob.
const PATCH_COOLDOWN_MS = 10_000;

const DEFAULT_INDEX = {
  updatedAt: null,
  lastBlock: "0",
  stats: {
    treasuryWei: "0",
    activeWolves: 0,
    dormantWolves: 0,
    cubs: 0,
    votesCast: 0,
    openProposals: 0,
  },
  proposals: [] as Record<string, unknown>[],
  memberActivity: {},
  topDonors: [] as { address: string; total: string }[],
  members: [] as { address: string; rank: number; dormant: boolean }[],
};

const DEFAULT_DISCORD_LINKS = {} as Record<string, { discordId: string; username: string; avatarUrl: string; linkedAt: string }>;

const DEFAULT_STATE = {
  lastBlock: null, // null = never run yet; sync-dao.js then falls back to CONTRACT_DEPLOY_BLOCK
  minted: [],
  burned: [],
  proposalIds: [],
  proposalAuthors: {},
  memberActivity: {},
  donations: {} as Record<string, string>,
};

async function handlePatchProposal(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!RPC_URL) return new Response("RPC_URL not configured on the server", { status: 500 });

  const body = (await req.json()) as { proposalId?: string; author?: string };
  const proposalId = body.proposalId;
  const author = body.author;
  if (!proposalId || !/^\d+$/.test(proposalId) || !author || !isAddress(author)) {
    return new Response("proposalId (integer) and author (address) required", { status: 400 });
  }

  const store = getStore("dao");

  const existing = await store.getWithMetadata("rate-limit", { type: "json" });
  const rateLimits = (existing?.data ?? {}) as Record<string, number>;
  const lastPatch = rateLimits[proposalId];
  if (lastPatch && Date.now() - lastPatch < PATCH_COOLDOWN_MS) {
    return new Response("Too many requests for this proposal, try again in a few seconds", { status: 429 });
  }
  rateLimits[proposalId] = Date.now();
  // Conditional write: if another concurrent request updated "rate-limit"
  // between our read and this write, `modified` comes back false — treat
  // it the same as losing the cooldown check above, no retry needed.
  const writeResult = await store.setJSON(
    "rate-limit",
    rateLimits,
    existing ? { onlyIfMatch: existing.etag! } : { onlyIfNew: true },
  );
  if (!writeResult.modified) {
    return new Response("Too many requests for this proposal, try again in a few seconds", { status: 429 });
  }

  const client = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
  const p = (await client.readContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "proposal",
    args: [BigInt(proposalId)],
  })) as {
    proposalType: number;
    target: Address;
    deadline: bigint;
    activeSnapshot: number;
    snapshotFrozen: boolean;
    executed: boolean;
    approveVotes: number;
    rejectVotes: number;
    postponeVotes: number;
    amount: bigint;
    reason: string;
  };

  const index = ((await store.get("index", { type: "json" })) ?? DEFAULT_INDEX) as typeof DEFAULT_INDEX;
  const patched = {
    id: proposalId,
    proposalType: Number(p.proposalType),
    target: p.target,
    author,
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

  const existingIndex = index.proposals.findIndex((existing) => existing.id === proposalId);
  const proposals =
    existingIndex >= 0
      ? index.proposals.map((existing, i) => (i === existingIndex ? patched : existing))
      : [patched, ...index.proposals];

  await store.setJSON("index", {
    ...index,
    updatedAt: new Date().toISOString(),
    proposals,
    stats: {
      ...index.stats,
      openProposals: proposals.filter((existing) => !existing.executed).length,
    },
  });

  return new Response("OK");
}

function membershipMessage(wallet: string, nonce: string): string {
  return `Je fais partie de La Meute (${wallet}) — ${nonce}`;
}

async function handleDiscordNonce(url: URL): Promise<Response> {
  const wallet = url.searchParams.get("wallet");
  if (!wallet || !isAddress(wallet)) return new Response("Missing wallet parameter", { status: 400 });
  // Defaults to "membership" (the original, only use case before the
  // unlink flow started requesting its own nonce) rather than requiring
  // the param — front and functions ship together on Netlify, but
  // defaulting costs nothing and avoids a hard failure for any caller that
  // hasn't been updated yet.
  const purpose = (url.searchParams.get("purpose") ?? "membership") as NoncePurpose;
  if (purpose !== "membership" && purpose !== "unlink") {
    return new Response("Invalid purpose parameter", { status: 400 });
  }
  return Response.json({ nonce: createNonce(wallet, purpose) });
}

/** Proof of Meute membership, reused by ?key=governance and by the
 *  ?key=index reread — verifies the balance live on-chain on EVERY
 *  initial call (never cached): a member who was just excluded can no
 *  longer obtain a new session. Returns the verified address, or an error
 *  Response to return as-is. */
async function verifyMembership(
  wallet: string | null,
  signature: string | null,
  nonce: string | null,
): Promise<Response | { wallet: string }> {
  if (!RPC_URL) return new Response("RPC_URL not configured on the server", { status: 500 });
  if (!wallet || !isAddress(wallet) || !signature || !nonce) {
    return new Response("wallet, signature and nonce required", { status: 400 });
  }
  if (!verifyNonce(nonce, wallet, "membership")) {
    return new Response("Invalid or expired nonce — restart the verification.", { status: 401 });
  }

  let recovered: string;
  try {
    recovered = await recoverMessageAddress({ message: membershipMessage(wallet, nonce), signature: signature as `0x${string}` });
  } catch {
    return new Response("Invalid signature", { status: 401 });
  }
  if (recovered.toLowerCase() !== wallet.toLowerCase()) {
    return new Response("Invalid signature", { status: 401 });
  }

  const client = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
  const balance = (await client.readContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "balanceOf",
    args: [wallet as Address],
  })) as bigint;
  if (balance === 0n) return new Response("Restricted to current members", { status: 403 });

  return { wallet };
}

/** Reserved to current members: the entire governance page (proposals,
 *  members, activity, donations, Discord identities) — not just the
 *  Discord table. See the de-anonymization discussion in docs/local/:
 *  rather than a masked-pseudonym system for visitors, we hide the data
 *  itself from anyone who isn't a member. A successful signature issues a
 *  short session (30 min) that avoids re-signing on every refresh (see
 *  ?key=index below). */
async function handleGovernance(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: { wallet?: string; signature?: string; nonce?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const verified = await verifyMembership(body.wallet ?? null, body.signature ?? null, body.nonce ?? null);
  if (verified instanceof Response) return verified;

  const store = getStore("dao");
  const index = (await store.get("index", { type: "json" })) ?? DEFAULT_INDEX;
  const discordLinks = (await store.get("discord-links", { type: "json" })) ?? DEFAULT_DISCORD_LINKS;
  return Response.json({ session: createSession(verified.wallet), index, discordLinks });
}

/** Rereads the snapshot for an already-authenticated member — only checks
 *  the session (HMAC + expiry), no new RPC call: the deliberate trade-off
 *  is that a member excluded mid-session keeps read access until
 *  expiration (30 min) or next reconnection, rather than asking for a
 *  signature again on every page refresh. */
async function handleIndexAuth(url: URL): Promise<Response> {
  const wallet = url.searchParams.get("wallet");
  const sessionToken = url.searchParams.get("session");
  if (!wallet || !isAddress(wallet) || !sessionToken) {
    return new Response("wallet and session required", { status: 400 });
  }
  if (!verifySession(sessionToken, wallet)) {
    return new Response("Invalid or expired session — reconnect your wallet.", { status: 401 });
  }
  const store = getStore("dao");
  const value = await store.get("index", { type: "json" });
  return Response.json(value ?? DEFAULT_INDEX);
}

export default async (req: Request) => {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");

  if (key === "patch-proposal") return handlePatchProposal(req);
  if (key === "discord-nonce") return handleDiscordNonce(url);
  if (key === "governance") return handleGovernance(req);
  if (key === "index" && req.method === "GET" && !req.headers.get("x-sync-secret")) return handleIndexAuth(url);

  if (key !== "index" && key !== "state") {
    return new Response(
      "Missing or invalid ?key= parameter (expected: index|state|discord-nonce|governance|patch-proposal)",
      { status: 400 },
    );
  }

  const requiresAuth = key === "state" || req.method === "POST";
  if (requiresAuth && req.headers.get("x-sync-secret") !== SYNC_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const store = getStore("dao");

  if (req.method === "GET") {
    const value = await store.get(key, { type: "json" });
    return Response.json(value ?? (key === "index" ? DEFAULT_INDEX : DEFAULT_STATE));
  }

  if (req.method === "POST") {
    const body = await req.json();
    await store.setJSON(key, body);
    return new Response("OK");
  }

  return new Response("Method Not Allowed", { status: 405 });
};
