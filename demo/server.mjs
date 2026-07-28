// Petit serveur local pour piloter les scénarios de démo depuis la page
// demo/public/index.html. N'écoute que sur localhost, jamais déployé —
// voir docs/local/soutenance-prep.md pour le contexte.
//
// Prérequis avant de lancer ce serveur : `npx hardhat node` tourne déjà
// dans un autre terminal.
//
// Usage : node demo/server.mjs

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

// Vrai flux OAuth Discord, réplique de netlify/functions/discord-link.mts —
// même code, mais le lien vit ici en mémoire (jamais dans Netlify Blobs) et
// repart de zéro à chaque reset de scénario, comme le contrat lui-même :
// aucune trace d'une démo à l'autre. Nécessite un .env.local à la racine
// (voir .env.example) pour les 4 variables DISCORD_*.
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

// Un returnTo forgé pourrait sinon rediriger vers n'importe quel site après
// une vraie autorisation Discord (open redirect classique) — on n'accepte
// qu'une origine locale (le port de Vite change d'une session à l'autre,
// donc pas de correspondance exacte possible ici, seulement le fait que ça
// reste sur la machine du développeur).
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

// Pseudos de démo pour les autres acteurs du scénario — sans ça, seul le
// wallet réellement lié à la main (le fondateur/président, testé en vrai
// via OAuth) affiche un pseudo, tous les autres restent des hash. Le
// fondateur est délibérément exclu : c'est le seul compte pour lequel on
// veut pouvoir démontrer le vrai flux OAuth en direct, pas une donnée
// bidon qu'il faudrait re-écraser à chaque démo.
// Assez de noms distincts pour couvrir tous les comptes du nœud de test
// (30, voir hardhat.config.ts) sans jamais recourir au suffixe numérique
// ("Croc 2") — repéré comme peu soigné à l'usage.
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
      pseudo: DEMO_CODENAMES[i % DEMO_CODENAMES.length],
      avatarUrl: defaultDiscordAvatar(String(1000 + i)),
      linkedAt: new Date().toISOString(),
    };
  });
}

async function handleDiscordStart(req, res, url) {
  const wallet = url.searchParams.get("wallet");
  if (!wallet || !isAddress(wallet)) {
    res.writeHead(400).end("Paramètre wallet requis");
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

    const pseudo = member.nick || user.username;
    const avatarUrl = member.avatar
      ? `https://cdn.discordapp.com/guilds/${DISCORD_GUILD_ID}/users/${user.id}/avatars/${member.avatar}.png`
      : user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : defaultDiscordAvatar(user.id);

    discordLinks[wallet.toLowerCase()] = { discordId: user.id, pseudo, avatarUrl, linkedAt: new Date().toISOString() };
    res.writeHead(302, { Location: withDiscordParam(returnTo, "linked") }).end();
  } catch {
    fail("error");
  }
}

// Réplique des jetons signés de dao-sync.mts (nonce à usage unique + session
// courte) — même principe HMAC auto-vérifiable, réutilise DISCORD_STATE_SECRET
// (déjà en place pour le `state` OAuth), pas de nouvelle variable d'env pour
// la démo. La page gouvernance entière (pas juste la table Discord) est
// réservée aux membres — voir dao-sync.mts pour le contexte complet.
const NONCE_MAX_AGE_MS = 5 * 60 * 1000;
const SESSION_MAX_AGE_MS = 30 * 60 * 1000;

function creerJeton(data) {
  const payload = Buffer.from(JSON.stringify({ ...data, ts: Date.now() })).toString("base64url");
  return `${payload}.${discordSign(payload)}`;
}

function verifierJeton(jeton, wallet, maxAgeMs) {
  const [payload, sig] = (jeton ?? "").split(".");
  if (!payload || !sig) return false;
  const attendu = discordSign(payload);
  if (sig.length !== attendu.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(attendu))) return false;
  try {
    const { wallet: walletJeton, ts } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (Date.now() - ts > maxAgeMs) return false;
    return walletJeton.toLowerCase() === wallet.toLowerCase();
  } catch {
    return false;
  }
}

const creerNonce = (wallet) => creerJeton({ wallet });
const verifierNonce = (nonce, wallet) => verifierJeton(nonce, wallet, NONCE_MAX_AGE_MS);
const creerSession = (wallet) => creerJeton({ wallet });
const verifierSession = (session, wallet) => verifierJeton(session, wallet, SESSION_MAX_AGE_MS);

function messageAppartenance(wallet, nonce) {
  return `Je fais partie de La Meute (${wallet}) — ${nonce}`;
}

async function handleDiscordNonce(req, res, url) {
  const wallet = url.searchParams.get("wallet");
  if (!wallet || !isAddress(wallet)) {
    res.writeHead(400).end("Paramètre wallet requis");
    return;
  }
  sendJson(res, 200, { nonce: creerNonce(wallet) });
}

// Réplique de handleGouvernance (dao-sync.mts) : signature + nonce +
// balanceOf en direct sur le contrat local, jamais mis en cache — un membre
// exclu en cours de démo ne peut plus obtenir de nouvelle session. Renvoie
// l'instantané complet (index + table Discord) plus une session courte pour
// les relectures via /api/index sans re-signer.
async function handleGouvernance(req, res) {
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
  if (!verifierNonce(nonce, wallet)) {
    res.writeHead(401).end("Nonce invalide ou expiré — relance la vérification.");
    return;
  }
  let recovered;
  try {
    recovered = verifyMessage(messageAppartenance(wallet, nonce), signature);
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
    res.writeHead(403).end("Réservé aux membres actuels");
    return;
  }
  let index;
  try {
    index = await buildIndex(ctx);
  } catch (e) {
    res.writeHead(503).end(e.message ?? String(e));
    return;
  }
  sendJson(res, 200, { session: creerSession(wallet), index, discordLinks });
}

// Relecture de l'instantané pour un membre déjà authentifié — vérifie
// seulement la session, pas de nouvel appel on-chain (même compromis
// qu'en prod, voir dao-sync.mts).
async function handleIndexAuth(req, res, url) {
  const wallet = url.searchParams.get("wallet");
  const jetonSession = url.searchParams.get("session");
  if (!wallet || !isAddress(wallet) || !jetonSession) {
    res.writeHead(400).end("wallet et session requis");
    return;
  }
  if (!verifierSession(jetonSession, wallet)) {
    res.writeHead(401).end("Session invalide ou expirée — reconnecte ton wallet.");
    return;
  }
  try {
    return sendJson(res, 200, await buildIndex(ctx));
  } catch (e) {
    return sendJson(res, 503, { error: e.message ?? String(e) });
  }
}

// Réplique de la route ?action=unlink de discord-link.mts — même message
// signé, même vérification par récupération de l'adresse depuis la
// signature (pas de RPC nécessaire, pure cryptographie).
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
  const { wallet, signature } = body;
  if (!wallet || !isAddress(wallet) || !signature) {
    res.writeHead(400).end("wallet et signature requis");
    return;
  }
  const message = `Délier mon compte Discord de La Meute (${wallet})`;
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

// Progression d'une étape en cours (mise à jour par l'action elle-même via
// ctx.progress.tick()/setTotal(), lue en parallèle par le front qui poll
// /api/progress pendant que la requête POST /api/step est encore en vol).
// Une seule étape à la fois tourne (le front attend la réponse avant d'en
// relancer une autre), donc un objet module-scope suffit.
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
  // Le front (servi par Vite/Netlify sur un autre port) doit pouvoir
  // appeler ce serveur en local — CORS ouvert, sans risque : rien ici ne
  // tourne jamais ailleurs qu'en local, sur la machine du développeur.
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

  // Réservé aux membres authentifiés (session obtenue via /gouvernance/verifier)
  // — voir dao-sync.mts pour le même principe en prod.
  if (req.method === "GET" && url.pathname === "/api/index") {
    return handleIndexAuth(req, res, url);
  }

  // Changer de scénario redéploie systématiquement un contrat neuf : les
  // scénarios de test partent d'un contrat vide, pas de l'état laissé par
  // le scénario précédent.
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
    ctx.progress.current = ctx.progress.total; // barre pleine même si l'action n'a pas tick jusqu'au bout (erreur, étape courte)
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
  // Le front (Vite sur un autre port) et ce serveur sont deux origines
  // différentes : sans ces en-têtes sur TOUTES les réponses (y compris les
  // erreurs texte ci-dessus, pas seulement sendJson), le navigateur bloque
  // la lecture de la réponse. Et sans répondre nous-mêmes à OPTIONS, un
  // POST avec un corps JSON déclenche une pré-requête preflight qui tombe
  // dans serveStatic (404, sans en-tête CORS) — la vraie requête ne part
  // jamais, en échouant silencieusement côté fetch() (constaté : la carte
  // de membre s'affiche, lue en direct on-chain, mais /gouvernance/verifier
  // échoue et la page reste bloquée en mode "réservé aux membres").
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
  if (url.pathname === "/gouvernance/verifier") return void handleGouvernance(req, res);
  if (url.pathname.startsWith("/api/")) return void handleApi(req, res, url);
  return void serveStatic(req, res, url);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Panneau de démo : http://127.0.0.1:${PORT}`);
  console.log("Assure-toi que `npx hardhat node` tourne déjà, puis choisis un scénario.");
  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !DISCORD_GUILD_ID || !DISCORD_STATE_SECRET) {
    console.log("(Variables DISCORD_* absentes — copie .env.example en .env.local pour activer le lien Discord en démo.)");
  }
});
