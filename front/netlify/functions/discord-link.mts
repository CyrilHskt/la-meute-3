// Links a wallet address to a verified Discord identity, to replace the
// self-declared (and unverified) username that used to live on-chain (see
// contracts/Meute.sol, pseudo/definirPseudo removed). The result (server
// username, avatar) is stored in the same Netlify Blobs store as the rest
// (key "discord-links"), reserved to current members and read only via
// dao-sync.mts (?key=governance) — never public.
//
// GET ?action=start&wallet=0x…   → redirects to Discord (authorization screen)
// GET ?code=…&state=…            → Discord callback: exchanges the code, verifies
//                                   guild membership, records the link,
//                                   then redirects to the front.
//
// `state` prevents a third party from redirecting another wallet's
// callback than their own (classic CSRF on an OAuth flow): it encodes the
// requesting wallet's address, signed with DISCORD_STATE_SECRET, never
// transmitted by the browser in clear without proof of origin.

import { getStore } from "@netlify/blobs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { isAddress, recoverMessageAddress, type Address } from "viem";
import { verifyNonce } from "./lib/tokens.js";

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const STATE_SECRET = process.env.DISCORD_STATE_SECRET;

const SCOPES = "identify guilds.members.read";
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

function sign(payload: string): string {
  return createHmac("sha256", STATE_SECRET!).update(payload).digest("hex");
}

export function makeState(wallet: string, returnTo: string): string {
  const payload = Buffer.from(JSON.stringify({ wallet, returnTo, ts: Date.now() })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyState(state: string): { wallet: string; returnTo: string } | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  // Identical hex lengths (fixed HMAC-SHA256 output) — timingSafeEqual
  // requires buffers of the same size, never guaranteed against arbitrary
  // client-side input without this prior check.
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { wallet, returnTo, ts } = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      wallet: string;
      returnTo: string;
      ts: number;
    };
    if (Date.now() - ts > STATE_MAX_AGE_MS) return null;
    if (!isAddress(wallet)) return null;
    return { wallet, returnTo };
  } catch {
    return null;
  }
}

function redirectUriFor(url: URL): string {
  return `${url.protocol}//${url.host}/.netlify/functions/discord-link`;
}

function frontOrigin(url: URL): string {
  // Locally (netlify dev), the front runs on the same port as the
  // functions; in prod too (Netlify serves both from the same domain) —
  // the request's origin is enough in both cases.
  return `${url.protocol}//${url.host}`;
}

// A forged returnTo could otherwise redirect the victim to any site after
// a real Discord authorization (classic open redirect) — we only accept
// the same origin as the current request, never an arbitrary value
// supplied by the client.
export function safeReturnTo(candidate: string | null, fallbackOrigin: string): string {
  if (!candidate) return `${fallbackOrigin}/`;
  try {
    const parsed = new URL(candidate);
    if (parsed.origin !== fallbackOrigin) return `${fallbackOrigin}/`;
    return candidate;
  } catch {
    return `${fallbackOrigin}/`;
  }
}

function withDiscordParam(returnTo: string, result: "linked" | "error" | "not_member"): string {
  const url = new URL(returnTo);
  url.searchParams.set("discord", result);
  return url.toString();
}

function defaultAvatar(discordId: string): string {
  const index = Number((BigInt(discordId) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

async function handleStart(_req: Request, url: URL): Promise<Response> {
  const wallet = url.searchParams.get("wallet");
  if (!wallet || !isAddress(wallet)) return new Response("Missing wallet parameter (address required)", { status: 400 });
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"), frontOrigin(url));

  const authorizeUrl = new URL("https://discord.com/api/oauth2/authorize");
  authorizeUrl.searchParams.set("client_id", CLIENT_ID!);
  authorizeUrl.searchParams.set("redirect_uri", redirectUriFor(url));
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", SCOPES);
  authorizeUrl.searchParams.set("state", makeState(wallet, returnTo));
  authorizeUrl.searchParams.set("prompt", "consent");

  return new Response(null, { status: 302, headers: { Location: authorizeUrl.toString() } });
}

async function handleCallback(_req: Request, url: URL): Promise<Response> {
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const fallbackOrigin = frontOrigin(url);
  const fallback = (result: "error" | "not_member") => Response.redirect(withDiscordParam(`${fallbackOrigin}/`, result), 302);

  if (!code || !stateParam) return fallback("error");
  const verified = verifyState(stateParam);
  if (!verified) return fallback("error");
  const wallet = verified.wallet as Address;
  const returnTo = verified.returnTo;

  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUriFor(url),
    }),
  });
  if (!tokenRes.ok) return fallback("error");
  const { access_token: accessToken } = (await tokenRes.json()) as { access_token: string };

  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  const userRes = await fetch("https://discord.com/api/users/@me", { headers: authHeaders });
  if (!userRes.ok) return fallback("error");
  const user = (await userRes.json()) as { id: string; username: string; avatar: string | null };

  const memberRes = await fetch(`https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`, { headers: authHeaders });
  if (memberRes.status === 404) return fallback("not_member");
  if (!memberRes.ok) return fallback("error");
  const member = (await memberRes.json()) as { nick: string | null; avatar: string | null };

  const username = member.nick || user.username;
  const avatarUrl = member.avatar
    ? `https://cdn.discordapp.com/guilds/${GUILD_ID}/users/${user.id}/avatars/${member.avatar}.png`
    : user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
      : defaultAvatar(user.id);

  const store = getStore("dao");
  const links = ((await store.get("discord-links", { type: "json" })) ?? {}) as Record<
    string,
    { discordId: string; username: string; avatarUrl: string; linkedAt: string }
  >;
  links[wallet.toLowerCase()] = { discordId: user.id, username, avatarUrl, linkedAt: new Date().toISOString() };
  await store.setJSON("discord-links", links);

  return Response.redirect(withDiscordParam(returnTo, "linked"), 302);
}

// Signed message, never a plain HTTP request: without proof of wallet
// ownership, anyone could have unlinked any address's Discord account
// just by knowing its address (public by nature). The nonce (single-use,
// short-lived, purpose-bound) prevents a captured/replayed signature from
// unlinking the account again later — same principle as membershipMessage
// in dao-sync.mts.
function unlinkMessage(wallet: string, nonce: string): string {
  return `Délier mon compte Discord de La Meute (${wallet}) — ${nonce}`;
}

async function handleUnlink(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const body = (await req.json()) as { wallet?: string; signature?: `0x${string}`; nonce?: string };
  const wallet = body.wallet;
  const signature = body.signature;
  const nonce = body.nonce;
  if (!wallet || !isAddress(wallet) || !signature || !nonce) {
    return new Response("wallet, signature and nonce required", { status: 400 });
  }
  if (!verifyNonce(nonce, wallet, "unlink")) {
    return new Response("Invalid or expired nonce — restart the verification.", { status: 401 });
  }

  let recovered: string;
  try {
    recovered = await recoverMessageAddress({ message: unlinkMessage(wallet, nonce), signature });
  } catch {
    return new Response("Invalid signature", { status: 401 });
  }
  if (recovered.toLowerCase() !== wallet.toLowerCase()) {
    return new Response("Invalid signature", { status: 401 });
  }

  const store = getStore("dao");
  const links = ((await store.get("discord-links", { type: "json" })) ?? {}) as Record<string, unknown>;
  delete links[wallet.toLowerCase()];
  await store.setJSON("discord-links", links);
  return new Response("OK");
}

export default async (req: Request) => {
  const url = new URL(req.url);
  if (url.searchParams.get("action") === "unlink") return handleUnlink(req);

  if (!CLIENT_ID || !CLIENT_SECRET || !GUILD_ID || !STATE_SECRET) {
    return new Response("Discord configuration missing on the server", { status: 500 });
  }

  if (url.searchParams.get("action") === "start") return handleStart(req, url);
  if (url.searchParams.get("code")) return handleCallback(req, url);
  return new Response("Missing parameters (expected: action=start&wallet=… or code=…&state=…)", { status: 400 });
};
