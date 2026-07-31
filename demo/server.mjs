// Small local server to drive the demo scenarios from the
// demo/public/index.html page. Only listens on localhost, never deployed
// — see docs/local/soutenance-prep.md for context.
//
// Prerequisite before starting this server: `npx hardhat node` is already
// running in another terminal.
//
// Usage: node demo/server.mjs

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { isAddress, verifyMessage } from "ethers";
import { scenarios, findScenario } from "./scenarios/index.js";
import { createContext, reset, buildIndex, RESET_COMMAND } from "./actions.js";
import { rulesFor } from "./rules.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.DEMO_PORT ?? 4100;
const PUBLIC_DIR = join(__dirname, "public");

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript" };

let ctx = createContext();
let activeScenario = scenarios[0];
let currentIndex = 0;
let lastMessage = null;
let lastError = null;

// Real Discord OAuth flow, a replica of netlify/functions/discord-link.mts
// — same code, but the link lives here in memory (never in Netlify Blobs)
// and starts over on every scenario reset, just like the contract itself:
// no trace from one demo to the next. Requires a .env.local at the repo
// root (see .env.example) for the 4 DISCORD_* variables.
let discordLinks = {};

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;
const DISCORD_STATE_SECRET = process.env.DISCORD_STATE_SECRET;
const DISCORD_SCOPES = "identify guilds.members.read";
const DISCORD_STATE_MAX_AGE_MS = 10 * 60 * 1000;
const DISCORD_REDIRECT_URI = `http://127.0.0.1:${PORT}/discord/callback`;

function discordSign(payload) {
  return createHmac("sha256", DISCORD_STATE_SECRET).update(payload).digest("hex");
}

function makeDiscordState(wallet, returnTo) {
  const payload = Buffer.from(JSON.stringify({ wallet, returnTo, ts: Date.now() })).toString("base64url");
  return `${payload}.${discordSign(payload)}`;
}

function verifyDiscordState(state) {
  const [payload, sig] = (state ?? "").split(".");
  if (!payload || !sig) return null;
  const expected = discordSign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { wallet, returnTo, ts } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (Date.now() - ts > DISCORD_STATE_MAX_AGE_MS) return null;
    if (!isAddress(wallet)) return null;
    return { wallet, returnTo };
  } catch {
    return null;
  }
}

function defaultDiscordAvatar(discordId) {
  const index = Number((BigInt(discordId) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

const DEMO_FALLBACK_RETURN_TO = "http://localhost:5173/";

// A forged returnTo could otherwise redirect to any site after a real
// Discord authorization (classic open redirect) — we only accept a local
// origin (Vite's port changes from one session to the next, so no exact
// match is possible here, only the fact that it stays on the developer's
// machine).
function safeDemoReturnTo(candidate) {
  if (!candidate) return DEMO_FALLBACK_RETURN_TO;
  try {
    const parsed = new URL(candidate);
    if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") return DEMO_FALLBACK_RETURN_TO;
    return candidate;
  } catch {
    return DEMO_FALLBACK_RETURN_TO;
  }
}

function withDiscordParam(returnTo, result) {
  const url = new URL(returnTo);
  url.searchParams.set("discord", result);
  return url.toString();
}

// Demo usernames for the scenario's other actors — without this, only the
// wallet actually linked by hand (the founder/president, tested for real
// via OAuth) would show a username, everyone else stays a hash. The
// founder is deliberately excluded: it's the only account we want to be
// able to demonstrate the real OAuth flow live on, not fake data that
// would need overwriting on every demo.
// Enough distinct names to cover every account on the test node (30, see
// hardhat.config.ts) without ever falling back to a numeric suffix
// ("Croc 2") — flagged as sloppy-looking in practice.
const DEMO_CODENAMES = [
  "Fenrir", "Akela", "Nanook", "Balto", "Ombre", "Croc", "Griffe", "Ecaille",
  "Tempête", "Brume", "Sirius", "Blizzard", "Ronce", "Eclair", "Orage",
  "Cendre", "Silex", "Braise", "Rafale", "Echo", "Ferox", "Sylva", "Lupus",
  "Ulfric", "Runik", "Ambre", "Grondin", "Volk", "Ecorce", "Tundra",
];

function seedDemoDiscordLinks(ctx) {
  const accounts = (ctx.nodeAccounts ?? []).filter((addr) => addr.toLowerCase() !== ctx.founder?.toLowerCase());
  accounts.forEach((addr, i) => {
    discordLinks[addr.toLowerCase()] = {
      discordId: String(1000 + i),
      username: DEMO_CODENAMES[i % DEMO_CODENAMES.length],
      avatarUrl: defaultDiscordAvatar(String(1000 + i)),
      linkedAt: new Date().toISOString(),
    };
  });
}

async function handleDiscordStart(req, res, url) {
  const wallet = url.searchParams.get("wallet");
  if (!wallet || !isAddress(wallet)) {
    res.writeHead(400).end("Missing wallet parameter");
    return;
  }
  const returnTo = safeDemoReturnTo(url.searchParams.get("returnTo"));
  const authorizeUrl = new URL("https://discord.com/api/oauth2/authorize");
  authorizeUrl.searchParams.set("client_id", DISCORD_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", DISCORD_REDIRECT_URI);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", DISCORD_SCOPES);
  authorizeUrl.searchParams.set("state", makeDiscordState(wallet, returnTo));
  authorizeUrl.searchParams.set("prompt", "consent");
  res.writeHead(302, { Location: authorizeUrl.toString() }).end();
}

async function handleDiscordCallback(req, res, url) {
  const code = url.searchParams.get("code");
  const verified = verifyDiscordState(url.searchParams.get("state"));
  if (!code || !verified) {
    res.writeHead(302, { Location: withDiscordParam(DEMO_FALLBACK_RETURN_TO, "error") }).end();
    return;
  }
  const { wallet, returnTo } = verified;
  const fail = (reason) => res.writeHead(302, { Location: withDiscordParam(returnTo, reason) }).end();

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: DISCORD_REDIRECT_URI,
      }),
    });
    if (!tokenRes.ok) return fail("error");
    const { access_token: accessToken } = await tokenRes.json();
    const authHeaders = { Authorization: `Bearer ${accessToken}` };

    const userRes = await fetch("https://discord.com/api/users/@me", { headers: authHeaders });
    if (!userRes.ok) return fail("error");
    const user = await userRes.json();

    const memberRes = await fetch(`https://discord.com/api/users/@me/guilds/${DISCORD_GUILD_ID}/member`, { headers: authHeaders });
    if (memberRes.status === 404) return fail("not_member");
    if (!memberRes.ok) return fail("error");
    const member = await memberRes.json();

    const username = member.nick || user.username;
    const avatarUrl = member.avatar
      ? `https://cdn.discordapp.com/guilds/${DISCORD_GUILD_ID}/users/${user.id}/avatars/${member.avatar}.png`
      : user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : defaultDiscordAvatar(user.id);

    discordLinks[wallet.toLowerCase()] = { discordId: user.id, username, avatarUrl, linkedAt: new Date().toISOString() };
    res.writeHead(302, { Location: withDiscordParam(returnTo, "linked") }).end();
  } catch {
    fail("error");
  }
}

// Replica of dao-sync.mts's signed tokens (single-use nonce + short
// session) — same self-verifying HMAC principle, reuses
// DISCORD_STATE_SECRET (already in place for the OAuth `state`), no new
// env var for the demo. The entire governance page (not just the Discord
// table) is members-only — see dao-sync.mts for the full context.
const NONCE_MAX_AGE_MS = 5 * 60 * 1000;
const SESSION_MAX_AGE_MS = 30 * 60 * 1000;

function createToken(data) {
  const payload = Buffer.from(JSON.stringify({ ...data, ts: Date.now() })).toString("base64url");
  return `${payload}.${discordSign(payload)}`;
}

function verifyToken(token, wallet, maxAgeMs) {
  const [payload, sig] = (token ?? "").split(".");
  if (!payload || !sig) return false;
  const expected = discordSign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (Date.now() - data.ts > maxAgeMs) return false;
    if (data.wallet.toLowerCase() !== wallet.toLowerCase()) return false;
    return data;
  } catch {
    return false;
  }
}

const createNonce = (wallet, purpose) => createToken({ wallet, purpose });
function verifyNonce(nonce, wallet, purpose) {
  const data = verifyToken(nonce, wallet, NONCE_MAX_AGE_MS);
  if (!data) return false;
  return data.purpose === purpose;
}
const createSession = (wallet) => createToken({ wallet });
const verifySession = (session, wallet) => verifyToken(session, wallet, SESSION_MAX_AGE_MS);

function membershipMessage(wallet, nonce) {
  return `Je fais partie de La Meute (${wallet}) — ${nonce}`;
}

async function handleDiscordNonce(req, res, url) {
  const wallet = url.searchParams.get("wallet");
  if (!wallet || !isAddress(wallet)) {
    res.writeHead(400).end("Missing wallet parameter");
    return;
  }
  const purpose = url.searchParams.get("purpose") ?? "membership";
  if (purpose !== "membership" && purpose !== "unlink") {
    res.writeHead(400).end("Invalid purpose parameter");
    return;
  }
  sendJson(res, 200, { nonce: createNonce(wallet, purpose) });
}

// Replica of handleGovernance (dao-sync.mts): signature + nonce +
// balanceOf live on the local contract, never cached — a member excluded
// mid-demo can no longer obtain a new session. Returns the full snapshot
// (index + Discord table) plus a short session for rereads via
// /api/index without re-signing.
async function handleGovernance(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405).end("Method Not Allowed");
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    res.writeHead(400).end("JSON invalide");
    return;
  }
  const { wallet, signature, nonce } = body;
  if (!wallet || !isAddress(wallet) || !signature || !nonce) {
    res.writeHead(400).end("wallet, signature et nonce requis");
    return;
  }
  if (!verifyNonce(nonce, wallet, "membership")) {
    res.writeHead(401).end("Invalid or expired nonce — restart the verification.");
    return;
  }
  let recovered;
  try {
    recovered = verifyMessage(membershipMessage(wallet, nonce), signature);
  } catch {
    res.writeHead(401).end("Signature invalide");
    return;
  }
  if (recovered.toLowerCase() !== wallet.toLowerCase()) {
    res.writeHead(401).end("Signature invalide");
    return;
  }
  const balance = await ctx.contracts.get(ctx.founder).balanceOf(wallet);
  if (balance === 0n) {
    res.writeHead(403).end("Restricted to current members");
    return;
  }
  let index;
  try {
    index = await buildIndex(ctx);
  } catch (e) {
    res.writeHead(503).end(e.message ?? String(e));
    return;
  }
  sendJson(res, 200, { session: createSession(wallet), index, discordLinks });
}

// Rereads the snapshot for an already-authenticated member — only checks
// the session, no new on-chain call (same trade-off as in prod, see
// dao-sync.mts).
async function handleIndexAuth(req, res, url) {
  const wallet = url.searchParams.get("wallet");
  const sessionToken = url.searchParams.get("session");
  if (!wallet || !isAddress(wallet) || !sessionToken) {
    res.writeHead(400).end("wallet et session requis");
    return;
  }
  if (!verifySession(sessionToken, wallet)) {
    res.writeHead(401).end("Invalid or expired session — reconnect your wallet.");
    return;
  }
  try {
    // discordLinks alongside the index, exactly like /governance/verify:
    // without it a plain reread (page refresh, no new signature) showed
    // every member as unlinked. See dao-sync.mts for the prod counterpart.
    return sendJson(res, 200, { ...(await buildIndex(ctx)), discordLinks });
  } catch (e) {
    return sendJson(res, 503, { error: e.message ?? String(e) });
  }
}

// Replica of discord-link.mts's ?action=unlink route — same signed
// message, same verification by recovering the address from the
// signature (no RPC needed, pure cryptography).
async function handleDiscordUnlink(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405).end("Method Not Allowed");
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    res.writeHead(400).end("JSON invalide");
    return;
  }
  const { wallet, signature, nonce } = body;
  if (!wallet || !isAddress(wallet) || !signature || !nonce) {
    res.writeHead(400).end("wallet, signature et nonce requis");
    return;
  }
  if (!verifyNonce(nonce, wallet, "unlink")) {
    res.writeHead(401).end("Invalid or expired nonce — restart the verification.");
    return;
  }
  const message = `Délier mon compte Discord de La Meute (${wallet}) — ${nonce}`;
  let recovered;
  try {
    recovered = verifyMessage(message, signature);
  } catch {
    res.writeHead(401).end("Signature invalide");
    return;
  }
  if (recovered.toLowerCase() !== wallet.toLowerCase()) {
    res.writeHead(401).end("Signature invalide");
    return;
  }
  delete discordLinks[wallet.toLowerCase()];
  res.writeHead(200).end("OK");
}

// Progress of the currently running step (updated by the action itself
// via ctx.progress.tick()/setTotal(), read in parallel by the front which
// polls /api/progress while the POST /api/step request is still in
// flight). Only one step runs at a time (the front waits for the response
// before starting another), so a module-scope object is enough.
function freshProgress() {
  return {
    current: 0,
    total: 1,
    tick(n = 1) {
      this.current += n;
    },
    setTotal(n) {
      this.total = n;
    },
  };
}

function publicSteps() {
  return activeScenario.steps.map((step, i) => ({
    id: step.id,
    label: step.label,
    narration: step.narration,
    command: step.command,
    done: i < currentIndex,
    current: i === currentIndex,
  }));
}

function stateBody(extra = {}) {
  return {
    scenarios: scenarios.map((s) => ({ id: s.id, label: s.label, group: s.group })),
    activeScenarioId: activeScenario.id,
    rules: rulesFor(activeScenario.ruleIds),
    steps: publicSteps(),
    lastMessage,
    lastError,
    finished: currentIndex >= activeScenario.steps.length,
    contractAddress: ctx.contractAddress ?? null,
    resetCommand: RESET_COMMAND,
    ...extra,
  };
}

function sendJson(res, status, body) {
  // The front (served by Vite/Netlify on another port) must be able to
  // call this server locally — CORS wide open, no risk: nothing here ever
  // runs anywhere but locally, on the developer's machine.
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/state") {
    return sendJson(res, 200, stateBody());
  }

  if (req.method === "GET" && url.pathname === "/api/progress") {
    return sendJson(res, 200, { current: ctx.progress?.current ?? 0, total: ctx.progress?.total ?? 1 });
  }

  // Reserved to authenticated members (session obtained via
  // /governance/verify) — see dao-sync.mts for the same principle in prod.
  if (req.method === "GET" && url.pathname === "/api/index") {
    return handleIndexAuth(req, res, url);
  }

  // Switching scenarios always redeploys a fresh contract: test scenarios
  // start from an empty contract, not the state left by the previous
  // scenario.
  if (req.method === "POST" && url.pathname === "/api/select") {
    const { id } = await readBody(req);
    activeScenario = findScenario(id);
    currentIndex = 0;
    discordLinks = {};
    try {
      lastMessage = await reset(ctx);
      seedDemoDiscordLinks(ctx);
      lastError = null;
    } catch (e) {
      lastError = e.message ?? String(e);
    }
    return sendJson(res, 200, stateBody());
  }

  if (req.method === "POST" && url.pathname === "/api/reset") {
    discordLinks = {};
    try {
      lastMessage = await reset(ctx);
      seedDemoDiscordLinks(ctx);
      lastError = null;
      currentIndex = 0;
    } catch (e) {
      lastError = e.message ?? String(e);
    }
    return sendJson(res, 200, stateBody());
  }

  if (req.method === "POST" && url.pathname === "/api/step") {
    if (currentIndex >= activeScenario.steps.length) return sendJson(res, 400, { error: "Scénario déjà terminé." });
    if (!ctx.provider) {
      lastError = "Contrat non connecté — clique d'abord sur Réinitialiser.";
      return sendJson(res, 200, stateBody());
    }
    ctx.progress = freshProgress();
    try {
      lastMessage = await activeScenario.steps[currentIndex].run(ctx);
      lastError = null;
      currentIndex += 1;
    } catch (e) {
      lastError = e.message ?? String(e);
    }
    ctx.progress.current = ctx.progress.total; // full bar even if the action didn't tick all the way (error, short step)
    return sendJson(res, 200, stateBody());
  }

  sendJson(res, 404, { error: "Route inconnue." });
}

async function serveStatic(req, res, url) {
  const path = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = join(PUBLIC_DIR, path);
  if (!filePath.startsWith(PUBLIC_DIR)) return res.writeHead(403).end();
  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404).end("Introuvable.");
  }
}

const server = createServer((req, res) => {
  // The front (Vite on another port) and this server are two different
  // origins: without these headers on EVERY response (including the text
  // errors above, not just sendJson), the browser blocks reading the
  // response. And without answering OPTIONS ourselves, a POST with a JSON
  // body triggers a preflight request that falls into serveStatic (404,
  // no CORS header) — the real request never goes out, failing silently
  // on the fetch() side (observed: the membership card displays, read
  // live on-chain, but /governance/verify fails and the page stays stuck
  // in "members-only" mode).
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/discord/start") return void handleDiscordStart(req, res, url);
  if (url.pathname === "/discord/callback") return void handleDiscordCallback(req, res, url);
  if (url.pathname === "/discord/unlink") return void handleDiscordUnlink(req, res);
  if (url.pathname === "/discord/nonce") return void handleDiscordNonce(req, res, url);
  if (url.pathname === "/governance/verify") return void handleGovernance(req, res);
  if (url.pathname.startsWith("/api/")) return void handleApi(req, res, url);
  return void serveStatic(req, res, url);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Demo panel: http://127.0.0.1:${PORT}`);
  console.log("Make sure `npx hardhat node` is already running, then pick a scenario.");
  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !DISCORD_GUILD_ID || !DISCORD_STATE_SECRET) {
    console.log("(DISCORD_* variables missing — copy .env.example to .env.local to enable Discord linking in the demo.)");
  }
});
