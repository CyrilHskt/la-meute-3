import { ref } from "vue";
import type { Address } from "viem";
import { useWallet } from "./useWallet";
import { useDiscordLink } from "./useDiscordLink";

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

export const TypeProposition = { Admission: 0, Titularisation: 1, Exclusion: 2, Depense: 3 } as const;
export const ChoixVote = { Approuver: 0, Rejeter: 1, Ajourner: 2 } as const;

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
  members: { address: Address; rang: number; dormant: boolean }[];
}

export interface Member {
  address: Address;
  rang: number;
  dormant: boolean;
}

const stats = ref<Stats | null>(null);
const proposals = ref<Proposal[]>([]);
const memberActivity = ref<Map<string, { votesSoumis: number; propositionsOuvertes: number }>>(new Map());
const topDonateurs = ref<Donateur[]>([]);
const members = ref<Member[]>([]);
// Don individuel : donnée "à moi", lue en direct (pas via l'instantané
// partagé, même principe que le solde). Affichée uniquement sur la carte de
// membre (GouvernanceDao.vue) — l'onglet Dons appelle aussi loadMesDons()
// pour garder cette valeur partagée à jour après un don, mais ne l'affiche
// pas lui-même ("tu as déjà donné" retiré à la demande de l'utilisateur :
// pas utile une fois qu'on est déjà sur le formulaire de don).
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
const NONCE_URL = isLocal ? "http://127.0.0.1:4100/discord/nonce" : "/.netlify/functions/dao-sync?key=discord-nonce";
const GOUVERNANCE_URL = isLocal
  ? "http://127.0.0.1:4100/gouvernance/verifier"
  : "/.netlify/functions/dao-sync?key=gouvernance";
const INDEX_URL = isLocal ? "http://127.0.0.1:4100/api/index" : "/.netlify/functions/dao-sync?key=index";

// La page gouvernance (propositions, membres, activité, dons) est réservée
// aux membres actuels de la Meute — cf. la discussion sur la
// désanonymisation dans docs/local/ : plutôt qu'un système de pseudos
// masqués pour les visiteurs (tordu, abandonné), on masque directement la
// donnée elle-même à qui n'est pas membre. Une seule preuve d'appartenance
// (signature + vérification on-chain live du solde de la carte) délivre un
// jeton de session signé côté serveur, valable 30 min, gardé en mémoire
// seulement (jamais persisté) : un rechargement de page redemande une
// signature, conformément au choix "une fois par session".
const session = ref<string | null>(null);
const estAutorise = ref(false);

// connect() (clic explicite) ET l'événement `accountsChanged` de MetaMask
// (déclenché par ce même clic, dès la toute première autorisation) peuvent
// tous les deux appeler verifierAppartenanceEtCharger() pour la même
// adresse en quasi-simultané — sans déduplication, ça déclenchait deux
// demandes de signature coup sur coup (constaté). Une seule vérification en
// vol par wallet ; un second appel pour le même wallet réutilise la
// promesse déjà en cours plutôt que de repartir de zéro.
let promesseVerification: Promise<void> | null = null;
let walletEnVerification: string | null = null;

// Compteur de génération : incrémenté à chaque nouvelle vérification lancée
// ET à chaque reset (déconnexion/changement de compte). Une vérification en
// vol qui se termine après avoir été supplantée (ex: l'utilisateur change de
// compte MetaMask pendant que la signature du compte précédent est encore en
// attente) ne doit JAMAIS appliquer son résultat — sans ce garde-fou, un
// résultat tardif pour l'ancien wallet pouvait écraser session/estAutorise/
// l'index avec les données de CE wallet alors que l'UI affiche déjà le
// nouveau (constaté en revue de code, pas juste théorique).
let generationVerification = 0;

function appliquerIndex(index: DaoIndex) {
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
  members.value = index.members ?? [];
}

export function useMeute() {
  const { address, readOnlyContract, signMessage, syncLocalContractAddress } = useWallet();
  const { setLinks } = useDiscordLink();

  /** Efface toute trace de la session précédente — à appeler dès que le
   *  wallet se déconnecte ou change de compte (voir useWallet.ts,
   *  accountsChanged). Sans ça, la page restait affichée comme si
   *  l'ancien compte était toujours authentifié : la session/le solde
   *  vérifiés ne concernent plus le compte actuellement sélectionné. */
  function reinitialiserSession() {
    generationVerification++;
    estAutorise.value = false;
    session.value = null;
    stats.value = null;
    proposals.value = [];
    memberActivity.value = new Map();
    topDonateurs.value = [];
    members.value = [];
    mesDons.value = 0n;
    setLinks({});
  }

  /** Preuve d'appartenance à la Meute : vérifie le solde on-chain, signe un
   *  message contenant un nonce à usage unique, puis échange cette preuve
   *  contre un jeton de session et l'instantané complet (propositions,
   *  membres, dons, identités Discord). Ne fait rien de bruyant en cas
   *  d'échec (non-membre, signature refusée, réseau) : la page reste
   *  simplement dans son état "réservé aux membres". Appelée uniquement
   *  depuis le clic explicite sur "Connecter mon wallet" (useWallet.ts,
   *  connect()) — jamais depuis la reconnexion silencieuse au chargement.
   */
  async function verifierAppartenanceEtCharger(address: Address) {
    const wallet = address.toLowerCase();
    if (promesseVerification && walletEnVerification === wallet) return promesseVerification;
    walletEnVerification = wallet;
    generationVerification++;
    const generation = generationVerification;
    promesseVerification = executerVerification(address, generation).finally(() => {
      if (walletEnVerification === wallet) {
        promesseVerification = null;
        walletEnVerification = null;
      }
    });
    return promesseVerification;
  }

  async function executerVerification(address: Address, generation: number) {
    // À chaque étape asynchrone, on vérifie qu'aucune vérification plus
    // récente n'a démarré entre-temps (nouveau wallet, déconnexion) — sinon
    // on abandonne sans toucher à `estAutorise`/`session` : les appliquer
    // ici écraserait l'état déjà mis à jour pour le wallet actuellement
    // affiché avec le résultat, périmé, de cet ancien wallet.
    const perime = () => generation !== generationVerification;

    try {
      const balance = (await readOnlyContract().read.balanceOf([address])) as bigint;
      if (perime()) return;
      if (balance === 0n) {
        estAutorise.value = false;
        return;
      }
    } catch {
      if (!perime()) estAutorise.value = false;
      return;
    }

    let nonce: string;
    try {
      const nonceRes = await fetch(`${NONCE_URL}${isLocal ? "?" : "&"}wallet=${address}`);
      if (perime()) return;
      if (!nonceRes.ok) {
        estAutorise.value = false;
        return;
      }
      ({ nonce } = (await nonceRes.json()) as { nonce: string });
      if (perime()) return;
    } catch {
      if (!perime()) estAutorise.value = false;
      return;
    }

    const message = `Je fais partie de La Meute (${address}) — ${nonce}`;
    let signature: `0x${string}`;
    try {
      signature = await signMessage(message);
      if (perime()) return;
    } catch {
      // Signature refusée/annulée — pas une erreur à afficher bruyamment,
      // la page reste réservée aux membres.
      return;
    }

    try {
      const res = await fetch(GOUVERNANCE_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: address, signature, nonce }),
      });
      if (perime()) return;
      if (!res.ok) {
        estAutorise.value = false;
        return;
      }
      const body = (await res.json()) as { session: string; index: DaoIndex; discordLinks: Record<string, unknown> };
      if (perime()) return;
      session.value = body.session;
      appliquerIndex(body.index);
      setLinks(body.discordLinks as Parameters<typeof setLinks>[0]);
      estAutorise.value = true;
    } catch {
      if (!perime()) estAutorise.value = false;
    }
  }

  /** Rafraîchit l'instantané avec la session déjà obtenue — pas de
   *  nouvelle signature tant qu'elle est valide (~30 min), pour ne pas
   *  redemander une signature à chaque vote ou changement d'onglet. Ne
   *  fait rien si la session n'est pas (encore) établie. */
  async function loadAll() {
    if (!estAutorise.value || !session.value || !address.value) return;
    loading.value = true;
    error.value = null;
    try {
      if (isLocal) await syncLocalContractAddress();
      const url = `${INDEX_URL}${isLocal ? "?" : "&"}wallet=${address.value}&session=${session.value}`;
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 401) {
        // Session expirée — on purge tout (pas juste estAutorise/session) :
        // sans ça, propositions/membres/dons déjà chargés restaient affichés
        // partout ailleurs (ex: le sélecteur de bénéficiaire d'une nouvelle
        // proposition) alors que la page est censée redevenir "réservée aux
        // membres" en attendant une nouvelle preuve d'appartenance.
        reinitialiserSession();
        return;
      }
      if (!res.ok) throw new Error(`Impossible de charger l'instantané DAO (HTTP ${res.status})`);
      appliquerIndex((await res.json()) as DaoIndex);
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

  return {
    stats,
    proposals,
    memberActivity,
    topDonateurs,
    members,
    mesDons,
    loading,
    error,
    estAutorise,
    verifierAppartenanceEtCharger,
    reinitialiserSession,
    loadAll,
    refreshProposal,
    loadMesDons,
  };
}
