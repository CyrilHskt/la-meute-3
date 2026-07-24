// Point d'accès unique entre le job d'indexation (scripts/sync-dao.js) et
// le front, pour découpler la publication de la donnée du déploiement du
// site. Avant : le job committait le JSON dans le dépôt, ce qui forçait
// Netlify à reconstruire tout le site à chaque rafraîchissement (et avait
// déjà causé un bug distinct via "[skip ci]"). Maintenant : le job écrit
// ici via une requête HTTP, stocké dans Netlify Blobs, lu par le front de
// la même façon — aucun commit, aucun rebuild déclenché par une donnée qui
// change.
//
// Deux clés dans le même store :
//   "index" — l'instantané public (stats, propositions, activité), lu par
//             n'importe qui sans authentification (c'est déjà une donnée
//             publique on-chain, pas la peine de la protéger en lecture).
//   "state" — le curseur interne de l'indexeur (dernier bloc traité,
//             membres/propositions déjà vus) ; lecture ET écriture
//             protégées par un secret partagé, seul le job doit y toucher.
//
// GET  ?key=index          → instantané public (aucune auth)
// GET  ?key=state          → état interne (header x-sync-secret requis)
// POST ?key=index|state    → écrit le corps JSON (header x-sync-secret requis)

import { getStore } from "@netlify/blobs";

const SYNC_SECRET = process.env.SYNC_SECRET;

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
  proposals: [],
  memberActivity: {},
};

const DEFAULT_STATE = {
  lastBlock: null, // null = jamais lancé ; sync-dao.js retombe alors sur CONTRACT_DEPLOY_BLOCK
  minted: [],
  burned: [],
  proposalIds: [],
  proposalAuthors: {},
  memberActivity: {},
};

export default async (req: Request) => {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (key !== "index" && key !== "state") {
    return new Response("Paramètre ?key= manquant ou invalide (attendu: index|state)", { status: 400 });
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
