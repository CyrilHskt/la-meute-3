// Point d'accès unique entre le job d'indexation (scripts/sync-dao.js), le
// front et une transaction qui vient de se produire, pour découpler la
// publication de la donnée du déploiement du site. Avant : le job
// committait le JSON dans le dépôt, ce qui forçait Netlify à reconstruire
// tout le site à chaque rafraîchissement (et avait déjà causé un bug
// distinct via "[skip ci]"). Maintenant : tout le monde écrit ici via une
// requête HTTP, stocké dans Netlify Blobs — aucun commit, aucun rebuild
// déclenché par une donnée qui change.
//
// Trois usages sur le même store :
//   "index" — l'instantané de gouvernance (stats, propositions, membres,
//             activité). Bien que ce soit déjà une donnée on-chain, on la
//             réserve aux membres actuels plutôt que de la rendre publique
//             sur le site — voir la discussion sur la désanonymisation dans
//             docs/local/. Lecture via ?key=gouvernance (1re fois, avec
//             signature) ou ?key=index&wallet=&session= (relectures).
//             Écriture toujours protégée par x-sync-secret (job d'indexation).
//   "state" — le curseur interne de l'indexeur (dernier bloc traité,
//             membres/propositions déjà vus) ; lecture ET écriture
//             protégées par un secret partagé, seul le job doit y toucher.
//   "patch-proposal" — appelé par le front juste après une transaction qui
//             affecte une proposition (candidature, vote, exécution...),
//             pour que l'instantané partagé reflète cette action pour tout
//             le monde immédiatement, sans attendre le prochain passage du
//             job (jusqu'à 5 min). Pas de secret requis : le client ne dit
//             jamais "voici la valeur, écris-la", seulement "relis la
//             proposition n°X" — la fonction lit elle-même la vérité
//             on-chain avant d'écrire, impossible d'y injecter une donnée
//             inventée depuis le navigateur.
//
// GET  ?key=state                       → état interne (header x-sync-secret requis)
// GET  ?key=discord-nonce&wallet=       → jeton à usage unique, préalable à ?key=gouvernance (voir plus bas)
// POST ?key=gouvernance                 → { wallet, signature, nonce } → { session, index, discordLinks },
//                                          réservé aux membres actuels (carte vérifiée en direct sur la
//                                          chaîne à cet appel) — voir la discussion sur la
//                                          désanonymisation dans docs/local/. Toute la page gouvernance
//                                          (propositions, membres, dons, identités Discord) est
//                                          réservée aux membres, pas seulement la table Discord.
// GET  ?key=index&wallet=&session=      → relit l'instantané avec la session obtenue via ?key=gouvernance
//                                          (pas de nouvelle signature tant qu'elle est valide, ~30 min)
// POST ?key=index|state                 → écrit le corps JSON (header x-sync-secret requis) — utilisé par
//                                          le job d'indexation, jamais par le front
// POST ?key=patch-proposal              → { proposalId, auteur } (aucune auth, mais rate-limité)

import { getStore } from "@netlify/blobs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createPublicClient, http, isAddress, recoverMessageAddress, type Address } from "viem";
import { sepolia } from "viem/chains";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../../src/contract.js";

const SYNC_SECRET = process.env.SYNC_SECRET;
const RPC_URL = process.env.RPC_URL;
// Même secret que discord-link.mts (déjà utilisé pour signer le `state`
// OAuth) — pas de nouvelle variable d'env à poser, même famille de jetons
// signés côté serveur, à courte durée de vie.
const STATE_SECRET = process.env.DISCORD_STATE_SECRET;
const NONCE_MAX_AGE_MS = 5 * 60 * 1000;
// Durée de la session gouvernance : assez courte pour qu'un membre exclu
// perde l'accès rapidement, assez longue pour ne pas redemander une
// signature à chaque vote ou changement d'onglet pendant une session de
// travail normale.
const SESSION_MAX_AGE_MS = 30 * 60 * 1000;

function signer(payload: string): string {
  return createHmac("sha256", STATE_SECRET!).update(payload).digest("hex");
}

function creerJeton(data: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify({ ...data, ts: Date.now() })).toString("base64url");
  return `${payload}.${signer(payload)}`;
}

/** Vérifie qu'un jeton (nonce ou session) a bien été émis par nous
 *  (signature HMAC), qu'il n'est pas expiré, et qu'il correspond au wallet
 *  qui l'utilise — sans avoir besoin de le stocker nulle part (pas de
 *  Blobs pour ça, juste une signature auto-vérifiable, même principe que
 *  `state` dans discord-link.mts). */
function verifierJeton(jeton: string, wallet: string, maxAgeMs: number): boolean {
  const [payload, sig] = (jeton ?? "").split(".");
  if (!payload || !sig) return false;
  const attendu = signer(payload);
  if (sig.length !== attendu.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(attendu))) return false;
  try {
    const { wallet: walletJeton, ts } = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      wallet: string;
      ts: number;
    };
    if (Date.now() - ts > maxAgeMs) return false;
    return walletJeton.toLowerCase() === wallet.toLowerCase();
  } catch {
    return false;
  }
}

function creerNonce(wallet: string): string {
  return creerJeton({ wallet });
}
function verifierNonce(nonce: string, wallet: string): boolean {
  return verifierJeton(nonce, wallet, NONCE_MAX_AGE_MS);
}
function creerSession(wallet: string): string {
  return creerJeton({ wallet });
}
function verifierSession(session: string, wallet: string): boolean {
  return verifierJeton(session, wallet, SESSION_MAX_AGE_MS);
}

// Une seule vraie transaction ne déclenche jamais plus d'un appel par
// proposition — un cooldown court suffit à bloquer un usage abusif
// (spam de lectures RPC) sans jamais gêner un usage normal. Pas de mémoire
// partagée entre invocations d'une fonction serverless : l'horodatage du
// dernier patch par proposition est lui-même stocké dans le blob.
const PATCH_COOLDOWN_MS = 10_000;

const DEFAULT_INDEX = {
  updatedAt: null,
  lastBlock: "0",
  stats: {
    treasuryWei: "0",
    loupsActifs: 0,
    loupsDormants: 0,
    louveteaux: 0,
    votesExprimes: 0,
    propositionsOuvertes: 0,
  },
  proposals: [] as Record<string, unknown>[],
  memberActivity: {},
  topDonateurs: [] as { adresse: string; total: string }[],
  members: [] as { address: string; rang: number; dormant: boolean }[],
};

const DEFAULT_DISCORD_LINKS = {} as Record<string, { discordId: string; pseudo: string; avatarUrl: string; linkedAt: string }>;

const DEFAULT_STATE = {
  lastBlock: null, // null = jamais lancé ; sync-dao.js retombe alors sur CONTRACT_DEPLOY_BLOCK
  minted: [],
  burned: [],
  proposalIds: [],
  proposalAuthors: {},
  memberActivity: {},
  dons: {} as Record<string, string>,
};

async function handlePatchProposal(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!RPC_URL) return new Response("RPC_URL non configuré côté serveur", { status: 500 });

  const body = (await req.json()) as { proposalId?: string; auteur?: string };
  const proposalId = body.proposalId;
  const auteur = body.auteur;
  if (!proposalId || !/^\d+$/.test(proposalId) || !auteur || !isAddress(auteur)) {
    return new Response("proposalId (entier) et auteur (adresse) requis", { status: 400 });
  }

  const store = getStore("dao");

  const rateLimits = ((await store.get("rate-limit", { type: "json" })) ?? {}) as Record<string, number>;
  const lastPatch = rateLimits[proposalId];
  if (lastPatch && Date.now() - lastPatch < PATCH_COOLDOWN_MS) {
    return new Response("Trop de requêtes pour cette proposition, réessaie dans quelques secondes", { status: 429 });
  }
  rateLimits[proposalId] = Date.now();
  await store.setJSON("rate-limit", rateLimits);

  const client = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
  const p = (await client.readContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "proposition",
    args: [BigInt(proposalId)],
  })) as {
    typeProp: number;
    cible: Address;
    echeance: bigint;
    snapshotActifs: number;
    snapshotFige: boolean;
    executee: boolean;
    votesApprouver: number;
    votesRejeter: number;
    votesAjourner: number;
    montant: bigint;
    motif: string;
  };

  const index = ((await store.get("index", { type: "json" })) ?? DEFAULT_INDEX) as typeof DEFAULT_INDEX;
  const patched = {
    id: proposalId,
    typeProp: Number(p.typeProp),
    cible: p.cible,
    auteur,
    echeance: p.echeance.toString(),
    snapshotActifs: Number(p.snapshotActifs),
    snapshotFige: p.snapshotFige,
    executee: p.executee,
    votesApprouver: Number(p.votesApprouver),
    votesRejeter: Number(p.votesRejeter),
    votesAjourner: Number(p.votesAjourner),
    montant: p.montant.toString(),
    motif: p.motif,
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
      propositionsOuvertes: proposals.filter((existing) => !existing.executee).length,
    },
  });

  return new Response("OK");
}

function messageAppartenance(wallet: string, nonce: string): string {
  return `Je fais partie de La Meute (${wallet}) — ${nonce}`;
}

async function handleDiscordNonce(url: URL): Promise<Response> {
  const wallet = url.searchParams.get("wallet");
  if (!wallet || !isAddress(wallet)) return new Response("Paramètre wallet requis", { status: 400 });
  return Response.json({ nonce: creerNonce(wallet) });
}

/** Preuve d'appartenance à la Meute, réutilisée par ?key=gouvernance et par
 *  la relecture ?key=index — vérifie le solde en direct sur la chaîne à
 *  CHAQUE appel initial (jamais en cache) : un membre qui vient d'être
 *  exclu ne peut plus obtenir de nouvelle session. Retourne l'adresse
 *  vérifiée, ou une Response d'erreur à renvoyer telle quelle. */
async function verifierAppartenance(
  wallet: string | null,
  signature: string | null,
  nonce: string | null,
): Promise<Response | { wallet: string }> {
  if (!RPC_URL) return new Response("RPC_URL non configuré côté serveur", { status: 500 });
  if (!wallet || !isAddress(wallet) || !signature || !nonce) {
    return new Response("wallet, signature et nonce requis", { status: 400 });
  }
  if (!verifierNonce(nonce, wallet)) {
    return new Response("Nonce invalide ou expiré — relance la vérification.", { status: 401 });
  }

  let recovered: string;
  try {
    recovered = await recoverMessageAddress({ message: messageAppartenance(wallet, nonce), signature: signature as `0x${string}` });
  } catch {
    return new Response("Signature invalide", { status: 401 });
  }
  if (recovered.toLowerCase() !== wallet.toLowerCase()) {
    return new Response("Signature invalide", { status: 401 });
  }

  const client = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
  const balance = (await client.readContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "balanceOf",
    args: [wallet as Address],
  })) as bigint;
  if (balance === 0n) return new Response("Réservé aux membres actuels", { status: 403 });

  return { wallet };
}

/** Réservée aux membres actuels : la page gouvernance entière (propositions,
 *  membres, activité, dons, identités Discord) — pas seulement la table
 *  Discord. Voir la discussion sur la désanonymisation dans docs/local/ :
 *  plutôt qu'un système de pseudos masqués pour les visiteurs, on masque
 *  directement la donnée à qui n'est pas membre. Une signature réussie
 *  délivre une session courte (30 min) qui évite de resigner à chaque
 *  rafraîchissement (voir ?key=index plus bas). */
async function handleGouvernance(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: { wallet?: string; signature?: string; nonce?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("JSON invalide", { status: 400 });
  }
  const verif = await verifierAppartenance(body.wallet ?? null, body.signature ?? null, body.nonce ?? null);
  if (verif instanceof Response) return verif;

  const store = getStore("dao");
  const index = (await store.get("index", { type: "json" })) ?? DEFAULT_INDEX;
  const discordLinks = (await store.get("discord-links", { type: "json" })) ?? DEFAULT_DISCORD_LINKS;
  return Response.json({ session: creerSession(verif.wallet), index, discordLinks });
}

/** Relit l'instantané pour un membre déjà authentifié — vérifie seulement
 *  la session (HMAC + expiration), pas de nouvel appel RPC : le compromis
 *  volontaire est qu'un membre exclu en cours de session garde l'accès en
 *  lecture jusqu'à expiration (30 min) ou prochaine reconnexion, plutôt que
 *  de redemander une signature à chaque rafraîchissement de la page. */
async function handleIndexAuth(url: URL): Promise<Response> {
  const wallet = url.searchParams.get("wallet");
  const jetonSession = url.searchParams.get("session");
  if (!wallet || !isAddress(wallet) || !jetonSession) {
    return new Response("wallet et session requis", { status: 400 });
  }
  if (!verifierSession(jetonSession, wallet)) {
    return new Response("Session invalide ou expirée — reconnecte ton wallet.", { status: 401 });
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
  if (key === "gouvernance") return handleGouvernance(req);
  if (key === "index" && req.method === "GET" && !req.headers.get("x-sync-secret")) return handleIndexAuth(url);

  if (key !== "index" && key !== "state") {
    return new Response(
      "Paramètre ?key= manquant ou invalide (attendu: index|state|discord-nonce|gouvernance|patch-proposal)",
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
