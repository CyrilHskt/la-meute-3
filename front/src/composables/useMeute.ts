import { ref } from "vue";
import type { Address } from "viem";
import { useWallet } from "./useWallet";

// Les stats/propositions viennent d'un instantané maintenu par un job
// GitHub Actions (scripts/sync-dao.js), lu via une fonction Netlify
// (netlify/functions/dao-sync.mts) — jamais scannées en direct par le
// navigateur, ni en local ni en prod. Scanner soi-même tout l'historique
// du contrat à chaque chargement de page se heurtait aux limites d'un RPC
// gratuit (plage de blocs, débit) et n'aurait fait qu'empirer avec le
// temps — voir la discussion dans docs/local/soutenance-prep.md. La
// donnée elle-même vit dans Netlify Blobs, pas committée dans le dépôt :
// publier un rafraîchissement ne doit jamais déclencher un rebuild du
// site, ces deux choses n'ont aucun rapport.
//
// En local : lancer `npm run dev:netlify` (pas juste `npm run dev`) pour
// servir la fonction en plus du front, et exécuter `scripts/sync-dao.js`
// pointé sur
// le nœud Hardhat local (RPC_URL=http://127.0.0.1:8545,
// SYNC_ENDPOINT=http://localhost:8888/.netlify/functions/dao-sync) après
// chaque action de test (seed-local.js, vote...) pour rafraîchir
// l'instantané avant de recharger la page.

export const Rang = { Louveteau: 0, Loup: 1 } as const;
export const TypeProposition = { Admission: 0, Titularisation: 1, Exclusion: 2, Depense: 3 } as const;
export const ChoixVote = { Approuver: 0, Rejeter: 1, Ajourner: 2 } as const;

export interface Carte {
  rang: number;
  derniereActivite: number;
  ajournements: number;
}

export interface Proposal {
  id: bigint;
  typeProp: number;
  cible: Address;
  auteur: Address;
  echeance: bigint;
  snapshotActifs: number;
  snapshotFige: boolean;
  executee: boolean;
  votesApprouver: number;
  votesRejeter: number;
  votesAjourner: number;
  montant: bigint;
  motif: string;
}

export interface Stats {
  treasuryWei: bigint;
  loupsActifs: number;
  loupsDormants: number;
  louveteaux: number;
  votesExprimes: number;
  propositionsOuvertes: number;
}

export interface Donateur {
  adresse: Address;
  total: bigint;
}

interface DaoIndex {
  stats: {
    treasuryWei: string;
    loupsActifs: number;
    loupsDormants: number;
    louveteaux: number;
    votesExprimes: number;
    propositionsOuvertes: number;
  };
  proposals: {
    id: string;
    typeProp: number;
    cible: Address;
    auteur: Address;
    echeance: string;
    snapshotActifs: number;
    snapshotFige: boolean;
    executee: boolean;
    votesApprouver: number;
    votesRejeter: number;
    votesAjourner: number;
    montant: string;
    motif: string;
  }[];
  memberActivity: Record<string, { votesSoumis: number; propositionsOuvertes: number }>;
  topDonateurs: { adresse: Address; total: string }[];
}

const stats = ref<Stats | null>(null);
const proposals = ref<Proposal[]>([]);
const memberActivity = ref<Map<string, { votesSoumis: number; propositionsOuvertes: number }>>(new Map());
const topDonateurs = ref<Donateur[]>([]);
// Don individuel : donnée "à moi", lue en direct (pas via l'instantané
// partagé, même principe que le solde ou le pseudo) — partagée entre la
// carte de membre (ligne stat) et l'onglet Dons (formulaire + rappel).
const mesDons = ref<bigint>(0n);
const loading = ref(false);
const error = ref<string | null>(null);

// En local (VITE_CHAIN=local), la vue d'ensemble vient du panneau de démo
// (demo/server.mjs) plutôt que de dao-sync/Sepolia — même format JSON des
// deux côtés, donc une seule ligne change, pas une deuxième implémentation.
// DEV, pas seulement VITE_CHAIN : DEV est figé à `false` par Vite pour
// tout `vite build` (production), même si un .env.local avec
// VITE_CHAIN=local traînait par erreur — élimination garantie à la
// compilation, cette branche n'existe même pas dans le code livré.
const isLocal = import.meta.env.DEV && import.meta.env.VITE_CHAIN === "local";
const INDEX_URL = isLocal ? "http://127.0.0.1:4100/api/index" : "/.netlify/functions/dao-sync?key=index";

export function useMeute() {
  const { readOnlyContract, syncLocalContractAddress } = useWallet();

  async function loadAll() {
    loading.value = true;
    error.value = null;
    try {
      if (isLocal) await syncLocalContractAddress();
      const res = await fetch(INDEX_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`Impossible de charger l'instantané DAO (HTTP ${res.status})`);
      const index = (await res.json()) as DaoIndex;

      stats.value = { ...index.stats, treasuryWei: BigInt(index.stats.treasuryWei) };

      proposals.value = index.proposals
        .map((p) => ({
          ...p,
          id: BigInt(p.id),
          echeance: BigInt(p.echeance),
          montant: BigInt(p.montant),
        }))
        .sort((a, b) => (a.id > b.id ? -1 : 1));

      memberActivity.value = new Map(Object.entries(index.memberActivity));

      topDonateurs.value = (index.topDonateurs ?? []).map((d) => ({ adresse: d.adresse, total: BigInt(d.total) }));
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  // Lecture directe d'une seule proposition, à appeler juste après une
  // transaction qui la modifie (vote, exécution) — l'instantané n'est
  // rafraîchi que toutes les 15 min en prod (par le job planifié), donc
  // voter puis relire `loadAll()` ne montrerait pas encore le nouveau
  // vote. Une lecture ciblée est négligeable (aucun scan d'historique),
  // donc on peut se le permettre à chaque transaction.
  // `connuAuteur` : pour une proposition qu'on vient tout juste de créer,
  // l'appelant l'a déjà extrait de l'event PropositionOuverte du reçu (la
  // struct on-chain relue ci-dessous ne contient pas ce champ) — sans ça,
  // une proposition neuve retomberait sur l'adresse zéro le temps que le
  // prochain passage de l'indexeur la corrige.
  async function refreshProposal(id: bigint, connuAuteur?: Address) {
    const contract = readOnlyContract();
    const p = (await contract.read.proposition([id])) as Omit<Proposal, "id" | "auteur">;
    const index = proposals.value.findIndex((existing) => existing.id === id);
    const existingAuteur = connuAuteur ?? (index >= 0 ? proposals.value[index].auteur : ("0x0000000000000000000000000000000000000000" as Address));
    const updated: Proposal = { ...p, id, auteur: existingAuteur };
    if (index >= 0) {
      proposals.value = proposals.value.map((existing, i) => (i === index ? updated : existing));
    } else {
      proposals.value = [updated, ...proposals.value];
    }
  }

  async function loadMesDons(address: Address | null) {
    if (!address) {
      mesDons.value = 0n;
      return;
    }
    mesDons.value = (await readOnlyContract().read.donsCumules([address])) as bigint;
  }

  return { stats, proposals, memberActivity, topDonateurs, mesDons, loading, error, loadAll, refreshProposal, loadMesDons };
}
