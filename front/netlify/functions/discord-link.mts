// Lie une adresse de wallet à une identité Discord vérifiée, pour remplacer
// le pseudo auto-déclaré (et non vérifié) qui vivait autrefois on-chain
// (voir contracts/Meute.sol, pseudo/definirPseudo supprimés). Le résultat
// (pseudo de serveur, avatar) est stocké dans le même store Netlify Blobs
// que le reste (clé "discord-links"), réservé aux membres actuels et lu
// uniquement via dao-sync.mts (?key=gouvernance) — jamais public.
//
// GET ?action=start&wallet=0x…   → redirige vers Discord (écran d'autorisation)
// GET ?code=…&state=…            → callback Discord : échange le code, vérifie
//                                   l'appartenance au serveur, enregistre le lien,
//                                   puis redirige vers le front.
//
// `state` sert à empêcher un tiers de rediriger le callback d'un autre
// wallet que le sien (CSRF classique sur un flux OAuth) : on y encode
// l'adresse du wallet demandeur, signée avec DISCORD_STATE_SECRET, jamais
// transmise par le navigateur en clair sans preuve d'origine.

import { getStore } from "@netlify/blobs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { isAddress, recoverMessageAddress, type Address } from "viem";

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const STATE_SECRET = process.env.DISCORD_STATE_SECRET;

const SCOPES = "identify guilds.members.read";
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

function sign(payload: string): string {
  return createHmac("sha256", STATE_SECRET!).update(payload).digest("hex");
}

function makeState(wallet: string, returnTo: string): string {
  const payload = Buffer.from(JSON.stringify({ wallet, returnTo, ts: Date.now() })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifyState(state: string): { wallet: string; returnTo: string } | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  // Longueurs hex identiques (sortie HMAC-SHA256 fixe) — timingSafeEqual
  // exige des buffers de même taille, jamais garanti face à une entrée
  // arbitraire côté client sans ce contrôle préalable.
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
  // En local (netlify dev), le front tourne sur le même port que les
  // functions ; en prod aussi (Netlify sert les deux depuis le même
  // domaine) — l'origine de la requête suffit dans les deux cas.
  return `${url.protocol}//${url.host}`;
}

// Un returnTo forgé pourrait sinon rediriger la victime vers n'importe quel
// site après une vraie autorisation Discord (open redirect classique) —
// on n'accepte que la même origine que la requête en cours, jamais une
// valeur arbitraire fournie par le client.
function safeReturnTo(candidate: string | null, fallbackOrigin: string): string {
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

async function handleStart(req: Request, url: URL): Promise<Response> {
  const wallet = url.searchParams.get("wallet");
  if (!wallet || !isAddress(wallet)) return new Response("Paramètre wallet (adresse) requis", { status: 400 });
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

async function handleCallback(req: Request, url: URL): Promise<Response> {
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

  const pseudo = member.nick || user.username;
  const avatarUrl = member.avatar
    ? `https://cdn.discordapp.com/guilds/${GUILD_ID}/users/${user.id}/avatars/${member.avatar}.png`
    : user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
      : defaultAvatar(user.id);

  const store = getStore("dao");
  const links = ((await store.get("discord-links", { type: "json" })) ?? {}) as Record<
    string,
    { discordId: string; pseudo: string; avatarUrl: string; linkedAt: string }
  >;
  links[wallet.toLowerCase()] = { discordId: user.id, pseudo, avatarUrl, linkedAt: new Date().toISOString() };
  await store.setJSON("discord-links", links);

  return Response.redirect(withDiscordParam(returnTo, "linked"), 302);
}

// Message signé, jamais une simple requête HTTP : sans preuve de possession
// du wallet, n'importe qui aurait pu délier le compte Discord de n'importe
// quelle adresse en connaissant juste son adresse (publique par nature).
function messageADelier(wallet: string): string {
  return `Délier mon compte Discord de La Meute (${wallet})`;
}

async function handleUnlink(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const body = (await req.json()) as { wallet?: string; signature?: `0x${string}` };
  const wallet = body.wallet;
  const signature = body.signature;
  if (!wallet || !isAddress(wallet) || !signature) {
    return new Response("wallet et signature requis", { status: 400 });
  }

  let recovered: string;
  try {
    recovered = await recoverMessageAddress({ message: messageADelier(wallet), signature });
  } catch {
    return new Response("Signature invalide", { status: 401 });
  }
  if (recovered.toLowerCase() !== wallet.toLowerCase()) {
    return new Response("Signature invalide", { status: 401 });
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
    return new Response("Configuration Discord manquante côté serveur", { status: 500 });
  }

  if (url.searchParams.get("action") === "start") return handleStart(req, url);
  if (url.searchParams.get("code")) return handleCallback(req, url);
  return new Response("Paramètres manquants (attendu: action=start&wallet=… ou code=…&state=…)", { status: 400 });
};
