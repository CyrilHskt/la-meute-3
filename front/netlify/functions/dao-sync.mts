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
//   "index" — l'instantané public (stats, propositions, activité), lu par
//             n'importe qui sans authentification (c'est déjà une donnée
//             publique on-chain, pas la peine de la protéger en lecture).
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
// GET  ?key=index                 → instantané public (aucune auth)
// GET  ?key=state                 → état interne (header x-sync-secret requis)
// POST ?key=index|state           → écrit le corps JSON (header x-sync-secret requis)
// POST ?key=patch-proposal        → { proposalId, auteur } (aucune auth, mais rate-limité)

import { getStore } from "@netlify/blobs";
import { createPublicClient, http, isAddress, type Address } from "viem";
import { sepolia } from "viem/chains";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../../src/contract.js";

const SYNC_SECRET = process.env.SYNC_SECRET;
const RPC_URL = process.env.RPC_URL;

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
};

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

export default async (req: Request) => {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");

  if (key === "patch-proposal") return handlePatchProposal(req);

  if (key !== "index" && key !== "state") {
    return new Response("Paramètre ?key= manquant ou invalide (attendu: index|state|patch-proposal)", { status: 400 });
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
