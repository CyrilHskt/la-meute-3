<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useGuidedTour } from "../../composables/useGuidedTour";
import { decodeEventLog, formatEther, parseEther, type Address, type Log } from "viem";
import { driver } from "driver.js";
import { useWallet } from "../../composables/useWallet";
import { useMeute, TypeProposition, ChoixVote, type Proposal } from "../../composables/useMeute";
import { useEthPrice } from "../../composables/useEthPrice";
import { friendlyContractError } from "../../composables/contractErrors";
import { useToast } from "../../composables/useToast";
import { useDiscordLink } from "../../composables/useDiscordLink";
import { useLocalAutoRefresh } from "../../composables/useLocalAutoRefresh";
import { CONTRACT_ABI } from "../../contract";
import AddressChip from "./AddressChip.vue";
import CandidatureChecklist from "./CandidatureChecklist.vue";
import MemberPicker from "./MemberPicker.vue";
import WalletInstallModal from "./WalletInstallModal.vue";
import DiscordConsentModal from "./DiscordConsentModal.vue";

const { address, wrongNetwork, connect, readOnlyContract, writableContract, publicClient } = useWallet();
const {
  stats,
  proposals,
  memberActivity,
  topDonateurs,
  members,
  mesDons,
  loading,
  error,
  estAutorise,
  loadAll,
  verifierAppartenanceEtCharger,
  refreshProposal,
  loadMesDons,
} = useMeute();
const { eurPerEth } = useEthPrice();
const { showToast } = useToast();
const { discordLinkFor, requestDiscordLink, unlinkDiscord, consumeDiscordCallbackParam } = useDiscordLink();
const unlinkPending = ref(false);
async function onUnlinkDiscord() {
  if (!address.value) return;
  unlinkPending.value = true;
  try {
    await unlinkDiscord(address.value);
    showToast("Compte Discord délié.");
  } catch (e) {
    showToast("Échec du déliage, réessaie.", "error");
  } finally {
    unlinkPending.value = false;
  }
}

const txError = ref<string | null>(null);
const txPending = ref(false);

const role = ref<"visiteur" | "louveteau" | "loup">("visiteur");
const carte = ref<{ rang: number; derniereActivite: number; ajournements: number } | null>(null);
const cotisation = ref<bigint>(0n);
const cardImage = ref<string | null>(null);
// L'heure du navigateur n'a aucun rapport avec l'horloge de la chaîne dès
// qu'on manipule le temps sur un nœud local (evm_increaseTime) : on lit le
// timestamp du dernier bloc plutôt que Date.now().
const now = ref(0);

// Lu sur la chaîne, jamais dupliqué en dur ici — un delai hardcodé à 365
// jours (1 an) avait fini par diverger silencieusement du vrai
// DELAI_DORMANCE du contrat (180 jours), affichant "Actif" à un Loup
// réellement dormant et masquant le bouton "Se réveiller" pendant 6 mois.
const delaiDormance = ref(180 * 24 * 60 * 60);
// Idem : lu sur la chaîne au montage, jamais dupliqué en dur (voir plus bas
// le "/2" qui l'était encore).
const ajournementsMax = ref(2);

const monDiscord = computed(() => discordLinkFor(address.value));

// Compteur d'ajournements déjà consommés par la cible d'une Titularisation
// — pas exposé par l'instantané indexé (qui décrit les propositions, pas le
// détail de chaque membre visé), donc lu en direct pour les propositions
// concernées. Une fois AJOURNEMENTS_MAX atteint, le contrat refuse
// Ajourner (ChoixInvalide) : mieux vaut griser le bouton avec une
// explication que laisser l'utilisateur se prendre un revert (constaté).
const ajournementsParCible = ref<Map<string, number>>(new Map());
async function chargerAjournementsTitularisations() {
  const cibles = new Set(
    proposals.value
      .filter((p) => p.typeProp === TypeProposition.Titularisation && !p.executee)
      .map((p) => p.cible.toLowerCase()),
  );
  for (const cible of cibles) {
    if (ajournementsParCible.value.has(cible)) continue;
    const c = (await readOnlyContract().read.carte([cible as Address])) as { ajournements: number };
    ajournementsParCible.value.set(cible, Number(c.ajournements));
  }
}
function ajournementBloque(p: Proposal): boolean {
  return (ajournementsParCible.value.get(p.cible.toLowerCase()) ?? 0) >= ajournementsMax.value;
}
// `proposals` est une ref partagée (useMeute) qui change après loadAll(),
// refreshProposal() ou le rafraîchissement du mode démo — un seul watch ici
// couvre les trois cas plutôt que d'appeler chargerAjournementsTitularisations
// manuellement à chaque endroit.
watch(proposals, chargerAjournementsTitularisations, { immediate: true });

// Pour la checklist candidat (étape "avoir des ETH Sepolia") — le solde du
// wallet, pas celui du contrat.
const monSolde = ref(0n);
async function loadSolde() {
  if (!address.value) {
    monSolde.value = 0n;
    return;
  }
  monSolde.value = await publicClient.getBalance({ address: address.value });
}

onMounted(async () => {
  await loadAll();
  cotisation.value = (await readOnlyContract().read.cotisation()) as bigint;
  delaiDormance.value = Number((await readOnlyContract().read.DELAI_DORMANCE()) as bigint);
  ajournementsMax.value = Number(await readOnlyContract().read.AJOURNEMENTS_MAX());
  now.value = Number((await publicClient.getBlock()).timestamp);

  const discordResult = consumeDiscordCallbackParam();
  if (discordResult === "linked") showToast("Compte Discord lié !");
  else if (discordResult === "not_member") showToast("Tu dois d'abord rejoindre le serveur Discord de la Meute.");
  else if (discordResult === "error") showToast("Échec de la liaison Discord, réessaie.");
  // Le retour de Discord est une redirection pleine page (pas une
  // navigation SPA) : toute la session gouvernance (estAutorise) était donc
  // perdue au retour, alors que le wallet est déjà silencieusement
  // reconnecté (tryRestoreConnection) — constaté : plus de propositions
  // après avoir lié son compte Discord en plein milieu d'un scénario. Ici
  // on vient de terminer une action explicite (lier Discord), donc
  // redemander une signature est légitime, pas une surprise.
  if (discordResult && address.value) void verifierAppartenanceEtCharger(address.value);
});

// Mode démo locale uniquement (voir useLocalAutoRefresh) : le panneau de
// démo fait avancer le temps et voter des comptes dans un autre onglet —
// sans ça, revenir sur cette page pouvait afficher un statut périmé
// (ex: "Dormant" alors que le compte était redevenu actif entre-temps).
useLocalAutoRefresh(async () => {
  await loadAll();
  now.value = Number((await publicClient.getBlock()).timestamp);
  await refreshMembership();
  await loadSolde();
  await loadMesDons(address.value);
});

// Quand estAutorise repasse à false (déconnexion, changement de compte non
// membre...), tout le contenu réservé (stats, propositions) disparaît d'un
// coup et la page rétrécit fortement. Sans remettre le scroll à 0, la
// position reste celle d'avant sur une page bien plus courte : le
// navigateur la clampe, et le message "réservé aux membres" se retrouve
// coincé sous la barre d'onglets sticky (constaté — disparaissait au
// refresh, qui remet le scroll à 0 par ailleurs).
watch(estAutorise, (autorise) => {
  if (!autorise) window.scrollTo({ top: 0 });
});

// { immediate: true } couvre deux cas avec le même code : l'adresse change
// depuis MetaMask (switch de compte en cours d'utilisation) ET l'adresse
// est déjà connue *au montage* du composant (ex: navigation entre pages,
// wallet déjà connecté depuis avant) — ce deuxième cas ne déclenche jamais
// un simple `watch` sans immediate, puisque la valeur ne "change" pas au
// sens de Vue. Sans ça, revenir sur cette page avec un wallet déjà connecté
// laissait le rôle et le solde bloqués sur leurs valeurs par défaut
// (constaté : carte "Devenir membre" affichée à un Loup déjà titularisé).
watch(
  address,
  () => {
    refreshMembership();
    loadSolde();
    loadMesDons(address.value);
  },
  { immediate: true },
);

// L'image de la carte n'est jamais recréée côté front : on lit tokenURI()
// tel quel et on affiche l'image qu'il contient. Si _svg() change dans le
// contrat, cette image change avec lui, sans rien à retoucher ici — pas de
// dessin dupliqué qui pourrait diverger silencieusement du vrai token.
async function loadCardImage() {
  if (!address.value) {
    cardImage.value = null;
    return;
  }
  const contract = readOnlyContract();
  const tokenId = BigInt(address.value);
  const tokenUri = (await contract.read.tokenURI([tokenId])) as string;
  const json = JSON.parse(atob(tokenUri.replace("data:application/json;base64,", ""))) as { image: string };
  cardImage.value = json.image;
}

async function refreshMembership() {
  if (!address.value) {
    // Sans ce reset, une déconnexion laissait `role` bloqué sur sa dernière
    // valeur ("loup") — le panneau "Ouvrir une proposition" restait affiché
    // (constaté), alors qu'aucun wallet n'est plus connecté pour l'utiliser.
    role.value = "visiteur";
    carte.value = null;
    cardImage.value = null;
    return;
  }
  const contract = readOnlyContract();
  const balance = (await contract.read.balanceOf([address.value])) as bigint;
  if (balance === 0n) {
    role.value = "visiteur";
    carte.value = null;
    cardImage.value = null;
    return;
  }
  const c = (await contract.read.carte([address.value])) as { rang: number; derniereActivite: number; ajournements: number };
  carte.value = c;
  role.value = c.rang === 1 ? "loup" : "louveteau";
  await loadCardImage();
}

async function onConnect() {
  txError.value = null;
  try {
    await connect();
    await Promise.all([refreshMembership(), loadSolde()]);
  } catch (e) {
    txError.value = friendlyContractError(e);
  }
}

// Simule l'appel avant de l'envoyer : ça récupère la vraie raison Solidity
// du revert (ex: DejaVote) pour un message clair, au lieu de laisser
// l'estimation de gas échouer en silence et remonter un message RPC
// générique sans rapport (constaté en local : "gas limit exceeds cap").
// Une transaction qui *crée* une proposition (candidature, titularisation,
// exclusion, dépense) ne donne son id qu'une fois minée — impossible de le
// connaître à l'avance comme pour voter/exécuter. Il est cependant déjà
// là, dans les events du reçu : on décode le reçu à la recherche d'un
// PropositionOuverte pour en extraire l'id.
function extractCreatedProposal(logs: readonly Log[]): { id: bigint; auteur: Address } | undefined {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({ abi: CONTRACT_ABI, data: log.data, topics: log.topics });
      if (decoded.eventName === "PropositionOuverte") {
        const args = decoded.args as { proposalId: bigint; auteur: Address };
        return { id: args.proposalId, auteur: args.auteur };
      }
    } catch {
      // Log d'un autre event (ex: Transfer du mint de carte pour une
      // admission) — pas celui qu'on cherche, on continue.
    }
  }
  return undefined;
}

// Répercute l'action sur l'instantané *partagé* (Netlify Blobs) tout de
// suite, pour que les autres membres la voient sans attendre le prochain
// passage du job (jusqu'à 5 min). Ne bloque jamais l'affichage local ni ne
// fait échouer la transaction si cet appel rate — le job de secours finira
// par rattraper de toute façon. Voir netlify/functions/dao-sync.mts.
async function patchProposalRemote(id: bigint) {
  const p = proposals.value.find((existing) => existing.id === id);
  if (!p) return;
  try {
    await fetch("/.netlify/functions/dao-sync?key=patch-proposal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proposalId: id.toString(), auteur: p.auteur }),
    });
  } catch {
    // Best-effort — voir commentaire ci-dessus.
  }
}

async function runTx(
  simulateFn: () => Promise<unknown>,
  writeFn: () => Promise<`0x${string}`>,
  // Message affiché en toast une fois la transaction confirmée — chaque
  // appelant précise le sien pour rester spécifique à l'action.
  successMessage: string,
  // Connu à l'avance pour voter/exécuter (l'id existe déjà) — relit cette
  // proposition précise en direct au lieu de recharger tout l'instantané
  // (voir useMeute.ts). Sans id, la transaction vient de *créer* une
  // proposition : son id et son auteur sont extraits du reçu, voir
  // extractCreatedProposal — l'auteur n'existe que dans l'event, jamais
  // dans la struct on-chain relue par refreshProposal.
  knownProposalId?: bigint,
) {
  txError.value = null;
  txPending.value = true;
  try {
    await simulateFn();
    const hash = await writeFn();
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const created = knownProposalId === undefined ? extractCreatedProposal(receipt.logs) : undefined;
    const affectedId = knownProposalId ?? created?.id;
    await Promise.all([
      affectedId !== undefined ? refreshProposal(affectedId, created?.auteur) : loadAll(),
      refreshMembership(),
      loadSolde(),
      loadMesDons(address.value),
    ]);
    if (affectedId !== undefined) await patchProposalRemote(affectedId);
    now.value = Number((await publicClient.getBlock()).timestamp);
    showToast(successMessage);
  } catch (e) {
    txError.value = friendlyContractError(e);
  } finally {
    txPending.value = false;
  }
}

function candidater() {
  return runTx(
    () => readOnlyContract().simulate.candidater({ account: address.value!, value: cotisation.value }),
    () => writableContract().write.candidater({ value: cotisation.value }),
    "Candidature enregistrée — synchronisation blockchain en cours",
  );
}

const depenseAddr = ref("");
const depenseMontant = ref("");
const depenseMotif = ref("");

function toPickerOption(addr: string) {
  const link = discordLinkFor(addr as Address);
  return { address: addr, pseudo: link?.pseudo, avatarUrl: link?.avatarUrl };
}

// Dépense reste en saisie libre (un bénéficiaire peut être n'importe quelle
// adresse, pas forcément un membre) — ces suggestions ne sont qu'un
// confort, construites à partir de tout ce que le front a déjà croisé.
// Titulariser/Exclure ont leur propre page dédiée (onglet "Membres") : ce
// sont toujours des actions ciblant un membre existant, plus adaptées à une
// liste parcourable qu'à un champ à chercher dedans.
const beneficiairesConnus = computed(() => {
  const addrs = new Set<string>([
    ...members.value.map((m) => m.address),
    ...memberActivity.value.keys(),
    ...proposals.value.flatMap((p) => [p.auteur, p.cible]),
    ...topDonateurs.value.map((d) => d.adresse),
  ]);
  addrs.delete(ADRESSE_ZERO);
  return [...addrs].map(toPickerOption);
});

function proposerDepense() {
  const args = [depenseAddr.value as `0x${string}`, parseEther(depenseMontant.value || "0"), depenseMotif.value] as const;
  return runTx(
    () => readOnlyContract().simulate.proposerDepense(args, { account: address.value! }),
    () => writableContract().write.proposerDepense(args),
    "Proposition de dépense enregistrée — synchronisation blockchain en cours",
  );
}
function voter(id: bigint, choix: number) {
  const args = [id, choix] as const;
  return runTx(
    () => readOnlyContract().simulate.voter(args, { account: address.value! }),
    () => writableContract().write.voter(args),
    "Vote enregistré — synchronisation blockchain en cours",
    id,
  );
}
function executer(id: bigint) {
  const args = [id] as const;
  return runTx(
    () => readOnlyContract().simulate.executer(args, { account: address.value! }),
    () => writableContract().write.executer(args),
    "Exécution enregistrée — synchronisation blockchain en cours",
    id,
  );
}

const estDormant = computed(() => !!carte.value && now.value - carte.value.derniereActivite > delaiDormance.value);
const delaiDormanceJours = computed(() => Math.round(delaiDormance.value / (24 * 60 * 60)));
const statutTooltip = computed(() => {
  if (role.value !== "loup") return undefined;
  return estDormant.value
    ? `Ce Loup n'a voté ni agi depuis plus de ${delaiDormanceJours.value} jours — il ne compte plus dans le quorum tant qu'il ne se manifeste pas (vote ou « Se réveiller »).`
    : `Vote ou action dans les ${delaiDormanceJours.value} derniers jours. Sans activité pendant ce délai, ce Loup deviendrait dormant et sortirait du quorum.`;
});

// jeSuisLa() : un Loup se réveille explicitement sans attendre qu'un vote
// passe, pour être recompté dans le quorum avant qu'une décision ne
// s'ouvre (§7.5) — le seul cas où un Loup dormant a une action à faire
// depuis sa carte plutôt qu'en votant.
function seReveiller() {
  return runTx(
    () => readOnlyContract().simulate.jeSuisLa({ account: address.value! }),
    () => writableContract().write.jeSuisLa(),
    "Réveil enregistré — synchronisation blockchain en cours",
  );
}

const propositionsEnCours = computed(() => proposals.value.filter((p) => !p.executee && Number(p.echeance) > now.value));
const propositionsClotureesNonExecutees = computed(() =>
  proposals.value.filter((p) => !p.executee && Number(p.echeance) <= now.value),
);
const propositionsPassees = computed(() => proposals.value.filter((p) => p.executee));
const propositionsEnCoursToutes = computed(() => [...propositionsClotureesNonExecutees.value, ...propositionsEnCours.value]);

// Filtre par statut sur l'onglet Passées uniquement — "En cours" a trop peu
// d'entrées pour qu'un filtre serve à quelque chose (avis agent UX). Aucune
// puce sélectionnée = tout afficher (état par défaut), pas un filtre "rien".
const filtresStatutPassee = ref<Set<StatutPropositionPassee>>(new Set());
function toggleFiltreStatut(statut: StatutPropositionPassee) {
  if (filtresStatutPassee.value.has(statut)) filtresStatutPassee.value.delete(statut);
  else filtresStatutPassee.value.add(statut);
  // Un Set muté en place ne déclenche pas la réactivité de Vue — réassigner
  // pour que les computed en aval (propositionsPasseesFiltrees, etc.) se
  // recalculent.
  filtresStatutPassee.value = new Set(filtresStatutPassee.value);
}
function reinitialiserFiltreStatut() {
  filtresStatutPassee.value = new Set();
}
const propositionsPasseesFiltrees = computed(() => {
  if (filtresStatutPassee.value.size === 0) return propositionsPassees.value;
  return propositionsPassees.value.filter((p) => filtresStatutPassee.value.has(statutPassee(p)));
});

const PAGE_SIZE = 5;
const pageEncours = ref(1);
const pagePassees = ref(1);

const totalPagesEncours = computed(() => Math.max(1, Math.ceil(propositionsEnCoursToutes.value.length / PAGE_SIZE)));
const totalPagesPassees = computed(() => Math.max(1, Math.ceil(propositionsPasseesFiltrees.value.length / PAGE_SIZE)));

// Si la liste rétrécit (nouvelle donnée chargée, ou filtre changé) et qu'on
// était sur une page qui n'existe plus, on revient à la dernière page
// valide plutôt que d'afficher une page vide.
watch(totalPagesEncours, (max) => { if (pageEncours.value > max) pageEncours.value = max; });
watch(totalPagesPassees, (max) => { if (pagePassees.value > max) pagePassees.value = max; });
watch(filtresStatutPassee, () => { pagePassees.value = 1; });

const propositionsEnCoursPage = computed(() => {
  const start = (pageEncours.value - 1) * PAGE_SIZE;
  return propositionsEnCoursToutes.value.slice(start, start + PAGE_SIZE);
});
const propositionsPasseesPage = computed(() => {
  const start = (pagePassees.value - 1) * PAGE_SIZE;
  return propositionsPasseesFiltrees.value.slice(start, start + PAGE_SIZE);
});

const activeTab = ref<"encours" | "passees">("encours");

const typeLabels = ["Admission", "Titularisation", "Exclusion", "Dépense"];

const ADRESSE_ZERO = "0x0000000000000000000000000000000000000000";

// L'auteur n'est pas dans la struct on-chain (seulement dans l'event
// PropositionOuverte) — une entrée dont l'auteur n'a jamais été capturé
// (ex: refreshProposal sans historique local) retombe sur l'adresse zéro,
// pas la peine d'afficher "ouverte par 0x000...000".
function auteurConnu(p: Proposal): boolean {
  return p.auteur.toLowerCase() !== ADRESSE_ZERO;
}

function propositionPrefixe(p: Proposal): string {
  switch (p.typeProp) {
    case TypeProposition.Admission:
      return "Candidature de";
    case TypeProposition.Titularisation:
      return "Titularisation de";
    case TypeProposition.Exclusion:
      return "Exclusion de";
    default:
      return "Dépense pour";
  }
}

function propositionSuffixe(p: Proposal): string {
  return p.typeProp === TypeProposition.Depense ? `— ${formatEther(p.montant)} ETH (${p.motif})` : "";
}

// Le lien Discord n'est requis nulle part on-chain (pas de rôle privilégié
// pour le vérifier) : un candidat qui appelle candidater() directement,
// sans passer par la checklist du front, peut très bien exister. Ce badge
// donne juste aux Loups l'information pour voter en connaissance de cause —
// l'application de la règle reste un choix de vote, jamais un blocage.
function candidatureSansDiscord(p: Proposal): boolean {
  return p.typeProp === TypeProposition.Admission && !p.executee && !discordLinkFor(p.cible);
}

// Deux conditions, comme dans le contrat (Meute.sol, _approuvee) : un
// quorum de participation (75% des Loups actifs au moment du snapshot
// doivent s'être exprimés, oui ou non), puis "oui" doit dépasser "non"
// parmi les votes exprimés — pas un simple seuil de "oui" face aux actifs.
const QUORUM_NUM = 3;
const QUORUM_DEN = 4;

function quorumRequis(p: Proposal): number {
  return Math.floor((p.snapshotActifs * QUORUM_NUM) / QUORUM_DEN) + 1;
}

function quorumAtteint(p: Proposal): boolean {
  const exprimes = p.votesApprouver + p.votesRejeter;
  return exprimes * QUORUM_DEN > p.snapshotActifs * QUORUM_NUM;
}

function estApprouvee(p: Proposal): boolean {
  return quorumAtteint(p) && p.votesApprouver > p.votesRejeter;
}

// Statut visuel d'une proposition passée — distinct de estApprouvee() ci-
// dessus, qui ne gère que le cas binaire (Admission/Exclusion/Dépense).
// Titularisation a 3 issues possibles (voir Meute.sol, _executerTitularisation) :
// le quorum s'y calcule sur pour+contre+ajourner (pas juste pour+contre), et
// "ajournée" n'est ni un succès ni un échec — le Louveteau retente sa chance.
type StatutPropositionPassee = "approuvee" | "refusee" | "quorum" | "ajournee";

const STATUT_PASSEE_LABELS: Record<StatutPropositionPassee, string> = {
  approuvee: "Approuvée",
  refusee: "Refusée",
  quorum: "Quorum non atteint",
  ajournee: "Ajournée",
};

function statutPassee(p: Proposal): StatutPropositionPassee {
  const estTitularisation = p.typeProp === TypeProposition.Titularisation;
  const exprimes = p.votesApprouver + p.votesRejeter + (estTitularisation ? p.votesAjourner : 0);
  const quorumOk = exprimes * QUORUM_DEN > p.snapshotActifs * QUORUM_NUM;
  if (!quorumOk) return "quorum";

  if (estTitularisation) {
    if (p.votesApprouver > p.votesRejeter && p.votesApprouver > p.votesAjourner) return "approuvee";
    if (p.votesRejeter > p.votesApprouver && p.votesRejeter > p.votesAjourner) return "refusee";
    return "ajournee";
  }
  return p.votesApprouver > p.votesRejeter ? "approuvee" : "refusee";
}

// Conflit d'intérêt (Meute.sol, voter() -> ConflitInteret) : la cible d'une
// exclusion ou d'une dépense ne peut pas voter sur son propre cas.
function estTypeAvecConflit(p: Proposal): boolean {
  return p.typeProp === TypeProposition.Exclusion || p.typeProp === TypeProposition.Depense;
}

function estCibleEnConflit(p: Proposal): boolean {
  if (!address.value) return false;
  return estTypeAvecConflit(p) && p.cible.toLowerCase() === address.value.toLowerCase();
}

const QUORUM_TOOLTIP =
  "Quorum : au moins 75% des Loups actifs au moment de l'ouverture doivent voter (oui ou non). Une fois le quorum atteint, le nombre de oui doit dépasser le nombre de non.";
const CONFLICT_TOOLTIP = "La personne visée ne peut pas voter sur cette proposition (conflit d'intérêt).";

function quorumTooltip(p: Proposal): string {
  return estTypeAvecConflit(p) ? `${QUORUM_TOOLTIP}\n\n${CONFLICT_TOOLTIP}` : QUORUM_TOOLTIP;
}

function dateExacte(p: Proposal): string {
  return new Date(Number(p.echeance) * 1000).toLocaleString("fr-FR");
}

function compteARebours(p: Proposal): string {
  const diff = Number(p.echeance) - now.value;
  if (diff <= 0) return "clôturé, à exécuter";
  const jours = Math.floor(diff / 86400);
  const heures = Math.floor((diff % 86400) / 3600);
  if (jours > 0) return `${jours}j ${heures}h restantes`;
  const minutes = Math.floor((diff % 3600) / 60);
  return `${heures}h ${minutes}min restantes`;
}

const monActivite = computed(() => {
  if (!address.value) return { votesSoumis: 0, propositionsOuvertes: 0 };
  return memberActivity.value.get(address.value.toLowerCase()) ?? { votesSoumis: 0, propositionsOuvertes: 0 };
});

// candidater() ne mint rien tant que le vote n'est pas passé : balanceOf
// reste à 0 pendant toute la candidature, donc le rôle seul ne distingue
// pas "visiteur" de "candidat en attente" — il faut croiser avec les
// propositions déjà chargées pour le savoir.
const maCandidatureOuverte = computed(() => {
  if (!address.value) return null;
  return (
    proposals.value.find(
      (p) => p.typeProp === TypeProposition.Admission && !p.executee && p.cible.toLowerCase() === address.value!.toLowerCase(),
    ) ?? null
  );
});

// L'exclusion n'est pas un statut distinct côté contrat (la carte est juste
// brûlée, comme pour une démission) : pour l'afficher, il faut retrouver
// une proposition d'Exclusion exécutée et approuvée ciblant cette adresse
// dans l'historique déjà chargé. Rien n'empêche techniquement de
// recandidater après — ce n'est qu'un rappel, pas un blocage qu'on ferait
// semblant d'appliquer côté front sans qu'il existe on-chain.
const monExclusion = computed(() => {
  if (!address.value) return null;
  return (
    proposals.value.find(
      (p) =>
        p.typeProp === TypeProposition.Exclusion &&
        p.executee &&
        p.cible.toLowerCase() === address.value!.toLowerCase() &&
        estApprouvee(p),
    ) ?? null
  );
});

function eurTooltip(wei: bigint): string {
  if (eurPerEth.value === null) return "";
  const eur = Number(formatEther(wei)) * eurPerEth.value;
  return `≈ ${eur.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
}

// La mise en avant du tour (un unique step driver.js pointant sur le
// bouton "Visite guidée") vit dans Dashboard.vue, qui possède l'onglet actif
// et le bouton lui-même. Ce composant n'a besoin que de réagir à une
// demande de lancement, via l'état partagé de useGuidedTour.
const { tourRequestId } = useGuidedTour();

watch(tourRequestId, (id) => {
  if (id > 0) startTour();
});

// Visite guidée : jamais lancée automatiquement, un tour court par rôle,
// rejouable à volonté depuis le bouton dédié. Reprend le style et le
// contenu déjà validés dans la maquette (Artifact), driver.js remplace
// juste le moteur de positionnement fait main.
function startTour() {
  const effectifsStep = {
    element: ".gv-stats-effectifs",
    popover: { title: "Les effectifs de la meute", description: "Ici tu retrouves les effectifs de la meute : Loups actifs, Loups dormants et Louveteaux." },
  };

  const steps =
    role.value === "loup"
      ? [
          { element: ".gv-card-panel", popover: { title: "Ta carte de Loup", description: "Ton statut, ton ancienneté et ton activité (votes, propositions ouvertes) sont visibles ici." } },
          { element: ".gv-new-prop-panel", popover: { title: "Ouvrir une proposition", description: "Titularisation, exclusion ou dépense : chaque type de décision a son propre formulaire, ici." } },
          { element: ".gv-prop-actions", popover: { title: "Voter", description: "Un vote reste ouvert 7 jours. Le seuil affiché s'ajuste automatiquement au nombre de Loups réellement actifs." } },
          effectifsStep,
        ]
      : role.value === "louveteau"
        ? [
            { element: ".gv-card-panel", popover: { title: "Ta carte de Louveteau", description: "Ton statut et ta contribution sont à jour en direct — c'est la même carte qui deviendra Loup après titularisation." } },
            { element: ".gv-stat-row", popover: { title: "En période de probation", description: "Tu peux suivre les propositions en cours, mais le droit de vote arrive avec ta titularisation." } },
            effectifsStep,
          ]
        : [
            { element: ".gv-card-panel", popover: { title: "Ton wallet, c'est ta carte", description: "Pas de compte à créer : ton wallet est ton identité ici, du candidat au Loup." } },
            { element: ".gv-stat-tile:first-child", popover: { title: "Le trésor, en direct", description: "Ce montant vient du solde réel du contrat sur la blockchain — personne ne peut l'afficher faux." } },
            effectifsStep,
          ];

  driver({ showProgress: true, nextBtnText: "Suivant", prevBtnText: "Précédent", doneBtnText: "Terminer", steps }).drive();
}
</script>

<template>
  <section id="gouvernance-dao" class="gv-dao">
    <WalletInstallModal />
    <DiscordConsentModal />

    <div v-if="!estAutorise" class="gv-gate">
      <p class="gv-gate-text">
        Les statistiques et propositions de la Meute sont réservées aux membres — connecte le wallet que tu utilises
        pour voter afin d'y accéder. Sans wallet membre, tu peux toujours candidater ci-dessous.
      </p>
    </div>

    <div v-if="estAutorise && stats" class="gv-stats-bar">
      <div class="gv-stat-tile" :title="eurTooltip(stats.treasuryWei)">
        <div class="value">{{ formatEther(stats.treasuryWei) }} <span class="unit">ETH</span></div>
        <div class="caption">Trésor</div>
      </div>
      <div class="gv-stats-effectifs">
        <div class="gv-stat-tile">
          <div class="value">{{ stats.loupsActifs }}</div>
          <div class="caption">Loups actifs</div>
        </div>
        <div class="gv-stat-tile">
          <div class="value">{{ stats.loupsDormants }}</div>
          <div class="caption">Loups dormants</div>
        </div>
        <div class="gv-stat-tile">
          <div class="value">{{ stats.louveteaux }}</div>
          <div class="caption">Louveteaux</div>
        </div>
      </div>
      <div class="gv-stat-tile">
        <div class="value">{{ stats.votesExprimes }}</div>
        <div class="caption">Votes exprimés</div>
      </div>
      <div class="gv-stat-tile">
        <div class="value">{{ stats.propositionsOuvertes }}</div>
        <div class="caption">Propositions ouvertes</div>
      </div>
    </div>
    <p v-else-if="loading" class="gv-loading">Chargement des données on-chain…</p>
    <p v-if="error" class="gv-error">Erreur de lecture : {{ error }}</p>

    <div class="gv-layout">
      <aside class="gv-card-panel">
        <template v-if="!address">
          <p class="gv-card-title">Ma carte</p>
          <p class="gv-card-note">Connecte ton wallet pour voir ta carte de membre ou candidater.</p>
          <button class="btn btn-primary" @click="onConnect">Connecter mon wallet</button>
        </template>
        <template v-else-if="wrongNetwork">
          <p class="gv-error">Mauvais réseau — connecte-toi à Sepolia dans MetaMask.</p>
        </template>
        <template v-else-if="role === 'visiteur'">
          <p v-if="monExclusion && !maCandidatureOuverte" class="gv-exclusion-note">
            Tu as été exclu de la Meute par vote des Loups le
            {{ new Date(Number(monExclusion.echeance) * 1000).toLocaleDateString("fr-FR") }}. Tu peux retenter ta
            chance si tu le souhaites.
          </p>
          <CandidatureChecklist
            :address="address!"
            :balance="monSolde"
            :cotisation="cotisation"
            :candidature="maCandidatureOuverte"
            :now="now"
            :tx-pending="txPending"
            :compte-a-rebours="compteARebours"
            :date-exacte="dateExacte"
            @candidater="candidater"
            @refresh-solde="loadSolde"
          />
        </template>
        <template v-else>
          <div class="gv-badge-frame" :class="`gv-badge-frame--${role}`">
            <img v-if="cardImage" :src="cardImage" alt="Illustration de la carte de membre" />
          </div>
          <p class="gv-card-title" style="text-align: center">Ma carte — {{ role === "loup" ? "Loup" : "Louveteau" }}</p>

          <button
            v-if="!monDiscord"
            class="btn btn-primary gv-discord-link-btn"
            type="button"
            @click="requestDiscordLink(address!)"
          >
            Lier mon compte Discord
          </button>
          <button
            v-else
            class="gv-discord-unlink-btn"
            type="button"
            :disabled="unlinkPending"
            title="Retire ton pseudo et ton avatar de l'affichage public — ton historique de votes/dons déjà rendu public le reste."
            @click="onUnlinkDiscord"
          >
            {{ unlinkPending ? "Déliage…" : "Délier mon compte Discord" }}
          </button>

          <p class="gv-card-note" style="text-align: center"><AddressChip v-if="address" :address="address" short /></p>
          <div class="gv-stat-row" :title="statutTooltip">
            <span>Statut</span>
            <span>{{ estDormant ? "Dormant" : "Actif" }}</span>
          </div>
          <button
            v-if="role === 'loup' && estDormant"
            class="btn btn-primary gv-reveil-btn"
            :disabled="txPending"
            @click="seReveiller"
          >
            Se réveiller
          </button>
          <div class="gv-stat-row">
            <span>Dernière activité</span>
            <span>{{ carte ? new Date(carte.derniereActivite * 1000).toLocaleDateString("fr-FR") : "—" }}</span>
          </div>
          <div class="gv-stat-row" v-if="role === 'louveteau'">
            <span>Ajournements</span>
            <span>{{ carte?.ajournements ?? 0 }} / {{ ajournementsMax }}</span>
          </div>
          <div class="gv-stat-row gv-stat-row--sub">
            <span>↳ Votes soumis</span>
            <span>{{ monActivite.votesSoumis }}</span>
          </div>
          <div class="gv-stat-row gv-stat-row--sub">
            <span>↳ Propositions ouvertes</span>
            <span>{{ monActivite.propositionsOuvertes }}</span>
          </div>
          <div class="gv-stat-row gv-stat-row--sub">
            <span>↳ Dons cumulés</span>
            <span>{{ formatEther(mesDons) }} ETH</span>
          </div>
        </template>
      </aside>

      <main class="gv-main">
        <div v-if="role === 'loup'" class="gv-new-prop-panel">
          <h3 class="gv-card-title">Ouvrir une proposition</h3>

          <div class="gv-prop-form">
            <p class="gv-form-label">Proposer une dépense</p>
            <div class="gv-form-row gv-form-row--wrap">
              <MemberPicker v-model="depenseAddr" :options="beneficiairesConnus" placeholder="0x… bénéficiaire" />
              <input v-model="depenseMontant" type="number" min="0" step="any" inputmode="decimal" placeholder="Montant en ETH" />
              <input v-model="depenseMotif" placeholder="Motif" />
              <button
                class="btn btn-primary"
                :disabled="txPending || !depenseAddr || !depenseMontant"
                @click="proposerDepense"
              >
                Ouvrir
              </button>
            </div>
          </div>
        </div>

        <p v-if="txError" class="gv-error">{{ txError }}</p>

        <template v-if="estAutorise">
        <h3 class="gv-card-title" style="margin-top: 2rem">Propositions</h3>
        <div class="gv-tabs">
          <button class="gv-tab" :class="{ 'gv-tab--active': activeTab === 'encours' }" @click="activeTab = 'encours'">
            En cours ({{ propositionsEnCours.length + propositionsClotureesNonExecutees.length }})
          </button>
          <button class="gv-tab" :class="{ 'gv-tab--active': activeTab === 'passees' }" @click="activeTab = 'passees'">
            Passées ({{ propositionsPassees.length }})
          </button>
        </div>

        <div v-if="activeTab === 'passees'" class="gv-statut-filters">
          <span class="gv-statut-filters-label">Filtrer :</span>
          <button
            v-for="statut in (['approuvee', 'refusee', 'quorum', 'ajournee'] as StatutPropositionPassee[])"
            :key="statut"
            type="button"
            class="gv-statut-chip"
            :class="[`gv-statut-chip--${statut}`, { 'gv-statut-chip--active': filtresStatutPassee.has(statut) }]"
            @click="toggleFiltreStatut(statut)"
          >
            {{ STATUT_PASSEE_LABELS[statut] }}
          </button>
          <button v-if="filtresStatutPassee.size" class="gv-statut-clear" type="button" @click="reinitialiserFiltreStatut">
            ✕ effacer
          </button>
        </div>

        <div v-if="activeTab === 'encours'" class="gv-prop-list">
          <article v-for="p in propositionsEnCoursPage" :key="p.id.toString()" class="gv-prop-card">
            <div class="gv-prop-head">
              <span class="gv-prop-head-left">
                <span class="gv-prop-type">{{ typeLabels[p.typeProp] }}</span>
                <span v-if="auteurConnu(p)" class="gv-prop-author">
                  par <AddressChip :address="p.auteur" short />
                </span>
              </span>
              <span class="gv-prop-deadline mono" :title="dateExacte(p)">{{ compteARebours(p) }}</span>
            </div>
            <p class="gv-prop-title">
              {{ propositionPrefixe(p) }} <AddressChip :address="p.cible" short /> {{ propositionSuffixe(p) }}
            </p>
            <p v-if="candidatureSansDiscord(p)" class="gv-discord-warning" title="Ce candidat n'a pas lié de compte Discord vérifié — à vérifier avant de voter.">
              ⚠️ Pas de Discord lié
            </p>
            <div class="gv-vote-line">
              <span class="gv-vote-count gv-vote-count--pour">
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8.5 6.5 12 13 4.5" /></svg>
                {{ p.votesApprouver }} pour
              </span>
              <span class="gv-vote-count gv-vote-count--contre">
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                {{ p.votesRejeter }} contre
              </span>
              <span v-if="p.typeProp === TypeProposition.Titularisation" class="gv-vote-count gv-vote-count--ajourner">
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6">
                  <path d="M4 2h8M4 14h8M5 2c0 3 2.5 3.6 3 4.5.5-.9 3-1.5 3-4.5M5 14c0-3 2.5-3.6 3-4.5.5.9 3 1.5 3 4.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                {{ p.votesAjourner }} ajourner
              </span>
            </div>
            <div class="gv-quorum-line">
              <span :title="quorumTooltip(p)">
                Quorum : {{ p.votesApprouver + p.votesRejeter }}/{{ quorumRequis(p) }} votes exprimés (sur {{ p.snapshotActifs }} Loups actifs)
              </span>
            </div>
            <div class="gv-prop-actions">
              <template v-if="role === 'loup' && Number(p.echeance) > now && !estCibleEnConflit(p)">
                <button class="btn btn-primary" :disabled="txPending" @click="voter(p.id, ChoixVote.Approuver)">Approuver</button>
                <button class="btn btn-outline-danger" :disabled="txPending" @click="voter(p.id, ChoixVote.Rejeter)">Rejeter</button>
                <button
                  v-if="p.typeProp === TypeProposition.Titularisation"
                  class="btn btn-outline"
                  :disabled="txPending || ajournementBloque(p)"
                  :title="ajournementBloque(p) ? `Nombre maximal d'ajournements (${ajournementsMax}) déjà atteint pour ce Louveteau.` : ''"
                  @click="voter(p.id, ChoixVote.Ajourner)"
                >
                  Ajourner
                </button>
              </template>
              <p v-else-if="role === 'loup' && Number(p.echeance) > now && estCibleEnConflit(p)" class="gv-card-note">
                Tu es directement concerné par cette proposition, tu ne peux pas voter dessus.
              </p>
              <button v-else-if="Number(p.echeance) <= now" class="btn btn-outline" :disabled="txPending" @click="executer(p.id)">
                Exécuter
              </button>
            </div>
          </article>
          <p v-if="!propositionsEnCoursToutes.length" class="gv-card-note">
            Aucune proposition en cours.
          </p>
          <nav v-if="totalPagesEncours > 1" class="gv-pagination">
            <button class="gv-page-btn" :disabled="pageEncours === 1" @click="pageEncours--">Précédent</button>
            <span class="gv-page-indicator">Page {{ pageEncours }} / {{ totalPagesEncours }}</span>
            <button class="gv-page-btn" :disabled="pageEncours === totalPagesEncours" @click="pageEncours++">Suivant</button>
          </nav>
        </div>

        <div v-else class="gv-prop-list">
          <article
            v-for="p in propositionsPasseesPage"
            :key="p.id.toString()"
            class="gv-prop-card"
            :class="`gv-prop-card--${statutPassee(p)}`"
          >
            <div class="gv-prop-head">
              <span class="gv-prop-head-left">
                <span class="gv-prop-type">{{ typeLabels[p.typeProp] }}</span>
                <span v-if="auteurConnu(p)" class="gv-prop-author">
                  par <AddressChip :address="p.auteur" short />
                </span>
              </span>
              <span class="gv-prop-statut" :class="`gv-prop-statut--${statutPassee(p)}`">
                {{ STATUT_PASSEE_LABELS[statutPassee(p)] }}
              </span>
            </div>
            <p class="gv-prop-title">
              {{ propositionPrefixe(p) }} <AddressChip :address="p.cible" short /> {{ propositionSuffixe(p) }}
            </p>
            <div class="gv-vote-line">
              <span class="gv-vote-count gv-vote-count--pour">
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8.5 6.5 12 13 4.5" /></svg>
                {{ p.votesApprouver }} pour
              </span>
              <span class="gv-vote-count gv-vote-count--contre">
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                {{ p.votesRejeter }} contre
              </span>
              <span v-if="p.typeProp === TypeProposition.Titularisation" class="gv-vote-count gv-vote-count--ajourner">
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6">
                  <path d="M4 2h8M4 14h8M5 2c0 3 2.5 3.6 3 4.5.5-.9 3-1.5 3-4.5M5 14c0-3 2.5-3.6 3-4.5.5.9 3 1.5 3 4.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                {{ p.votesAjourner }} ajourner
              </span>
            </div>
            <div class="gv-quorum-line">
              <span :title="quorumTooltip(p)">
                Quorum : {{ p.votesApprouver + p.votesRejeter + (p.typeProp === TypeProposition.Titularisation ? p.votesAjourner : 0) }}/{{ quorumRequis(p) }} votes exprimés (sur {{ p.snapshotActifs }} Loups actifs)
              </span>
            </div>
          </article>
          <p v-if="!propositionsPassees.length" class="gv-card-note">Aucune proposition passée.</p>
          <div v-else-if="!propositionsPasseesFiltrees.length" class="gv-card-note gv-statut-empty">
            <p>Aucune proposition ne correspond à ce filtre.</p>
            <button class="btn btn-outline" type="button" @click="reinitialiserFiltreStatut">Réinitialiser le filtre</button>
          </div>
          <nav v-if="totalPagesPassees > 1" class="gv-pagination">
            <button class="gv-page-btn" :disabled="pagePassees === 1" @click="pagePassees--">Précédent</button>
            <span class="gv-page-indicator">Page {{ pagePassees }} / {{ totalPagesPassees }}</span>
            <button class="gv-page-btn" :disabled="pagePassees === totalPagesPassees" @click="pagePassees++">Suivant</button>
          </nav>
        </div>
        </template>
      </main>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.mono {
  font-family: $font-mono;
}

.gv-loading,
.gv-card-note {
  color: $color-text-dim;
  font-size: $fs-caption;
}

.gv-gate {
  padding: 1.4rem 1.6rem;
  margin-bottom: 1.5rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
}

.gv-gate-text {
  color: rgba(255, 255, 255, 0.75);
  font-size: $fs-body;
  margin: 0;
}

.gv-error {
  color: $color-danger;
  font-size: $fs-caption;
}

.gv-exclusion-note {
  font-size: $fs-caption;
  color: $color-danger;
  background: rgba(217, 83, 79, 0.08);
  border: 1px solid rgba(217, 83, 79, 0.25);
  border-radius: 4px;
  padding: 0.7rem 0.9rem;
  margin: 0 0 1rem;
  line-height: 1.5;
}

// Flex plutôt que grid : .gv-stats-effectifs doit avoir une vraie boîte
// (sa propre taille/position) pour que driver.js puisse la cibler comme
// une seule zone dans la visite guidée — un wrapper en `display: contents`
// n'a pas de rect propre (mesuré à 0×0), ce qui cassait le positionnement
// du popover.
.gv-stats-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 1px;
  background: $color-border;
  border-bottom: 1px solid $color-border;

  > .gv-stat-tile {
    flex: 1 1 120px;
  }
}

.gv-stats-effectifs {
  display: flex;
  flex: 3 1 360px;
  gap: 1px;

  .gv-stat-tile {
    flex: 1 1 120px;
  }
}

.gv-stat-tile {
  background: $color-card-bg;
  padding: 1.2rem 1rem;
  text-align: center;

  .value {
    font-family: $font-mono;
    font-size: 1.3rem;
    font-weight: 700;
    color: $color-black;
  }
  .unit {
    font-size: $fs-caption;
    color: $color-text-dim;
  }
  .caption {
    font-size: $fs-caption;
    color: $color-text-dim;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
}

.gv-layout {
  max-width: 1080px;
  margin: 0 auto;
  padding: 2.4rem 1.6rem 4rem;
  display: grid;
  grid-template-columns: 300px 1fr;
  // Sans ça, le panneau de carte s'étire par défaut sur toute la hauteur
  // de la colonne des propositions (comportement grid par défaut) — un
  // rectangle vide géant dès que son contenu est court (visiteur/candidat).
  align-items: start;
  gap: 1.8rem;
}
@media (max-width: 820px) { .gv-layout { grid-template-columns: 1fr; } }

.gv-card-panel,
.gv-new-prop-panel,
.gv-prop-card {
  background: $color-card-bg;
  border: 1px solid $color-border;
  border-radius: 4px;
  padding: 1.6rem;
}

// Statut d'une proposition passée : bordure gauche colorée plutôt qu'un
// fond teinté sur toute la carte — garde le texte noir sur blanc lisible
// (constaté : un fond rouge/vert pâle dégradait le contraste), et reste
// lisible d'un coup d'œil en scrollant une longue liste de cartes.
.gv-prop-card {
  &--approuvee { border-left: 4px solid $color-success; }
  &--refusee { border-left: 4px solid $color-danger; }
  &--quorum { border-left: 4px solid $color-text-dim; }
  &--ajournee { border-left: 4px solid $color-louveteau; }
}

.gv-prop-statut {
  font-size: $fs-caption;
  font-weight: 700;

  &--approuvee { color: $color-success; }
  &--refusee { color: $color-danger; }
  &--quorum { color: $color-text-dim; }
  &--ajournee { color: $color-louveteau; }
}

.gv-card-title {
  color: $color-orange;
  font-family: $font-display;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-size: $fs-h4;
  margin: 0 0 1rem;
}

.gv-discord-link-btn {
  display: block;
  margin: 0 auto 0.6rem;
  font-size: $fs-caption;
  padding: 0.4rem 0.9rem;
}

.gv-discord-unlink-btn {
  display: block;
  margin: 0 auto 0.6rem;
  background: none;
  border: none;
  color: $color-text-dim;
  font-size: 0.72rem;
  text-decoration: underline;
  cursor: pointer;

  &:hover:not(:disabled) {
    color: $color-orange-dark;
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 3px;
  border: none;
  background: transparent;
  color: $color-text-dim;
  cursor: pointer;
  padding: 0;

  &:hover:not(:disabled) { color: $color-orange-dark; background: rgba(249, 174, 60, 0.12); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}

.gv-badge-frame {
  width: 110px;
  height: 110px;
  margin: 0 auto 1rem;
  border-radius: 50%;
  background: #fff;
  border: 3px solid;
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 68px;
    height: 68px;
  }

  &--loup { border-color: $color-loup; }
  &--louveteau { border-color: $color-louveteau; }
}

.gv-stat-row {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid $color-border;
  font-size: $fs-caption;

  &--sub { color: $color-text-dim; }
  &[title] { cursor: help; }
}

.gv-reveil-btn {
  display: block;
  width: 100%;
  margin: 0.5rem 0;
  font-size: $fs-caption;
}

.gv-form-label {
  font-size: $fs-caption;
  font-weight: 700;
  color: $color-black;
  margin: 0 0 0.5rem;
}
.gv-prop-form { margin-bottom: 1.4rem; }
.gv-form-row {
  display: flex;
  gap: 0.6rem;

  &--wrap { flex-wrap: wrap; }

  input {
    flex: 1;
    min-width: 120px;
    box-sizing: border-box;
    border: 1px solid $color-border;
    border-radius: 3px;
    padding: 0.5rem 0.7rem;
    font: inherit;

    // Cache les flèches natives (+/-) des champs `type="number"` : elles
    // gonflaient la hauteur du champ par rapport à ses voisins et
    // détonnaient avec le style du reste du formulaire (retour utilisateur
    // : "un peu pété").
    &::-webkit-inner-spin-button,
    &::-webkit-outer-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    &[type="number"] {
      -moz-appearance: textfield;
    }
  }

  :deep(.mp-root) {
    flex: 1;
    min-width: 160px;
  }
}

.gv-tabs {
  display: flex;
  gap: 0.5rem;
  border-bottom: 1px solid $color-border;
  padding-bottom: 1rem;
  margin-bottom: 1.2rem;
}
.gv-tab {
  background: transparent;
  border: 1px solid $color-border;
  color: $color-text-dim;
  border-radius: 3px;
  padding: 0.4rem 0.9rem;
  font-size: $fs-caption;
  text-transform: uppercase;
  cursor: pointer;

  &--active { background: $color-orange; border-color: $color-orange; color: #fff; }
}

.gv-statut-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1.2rem;
}
.gv-statut-filters-label {
  font-size: $fs-caption;
  color: $color-text-dim;
  margin-right: 0.2rem;
}
// Mêmes couleurs que la bordure des cartes correspondantes (voir
// .gv-prop-card--*) — le lien visuel entre une puce et les cartes qu'elle
// filtre doit être immédiat, sans avoir à lire le libellé.
.gv-statut-chip {
  background: transparent;
  border: 1px solid $color-border;
  color: $color-text-dim;
  border-radius: 999px;
  padding: 0.3rem 0.8rem;
  font-size: $fs-caption;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;

  &--approuvee.gv-statut-chip--active { background: $color-success; border-color: $color-success; color: #fff; }
  &--refusee.gv-statut-chip--active { background: $color-danger; border-color: $color-danger; color: #fff; }
  &--quorum.gv-statut-chip--active { background: $color-text-dim; border-color: $color-text-dim; color: #fff; }
  &--ajournee.gv-statut-chip--active { background: $color-louveteau; border-color: $color-louveteau; color: #fff; }
}
.gv-statut-clear {
  background: none;
  border: none;
  color: $color-text-dim;
  font-size: $fs-caption;
  text-decoration: underline;
  cursor: pointer;
}
.gv-statut-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.8rem;
}

.gv-prop-list { display: flex; flex-direction: column; gap: 1rem; }
.gv-prop-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem; }
.gv-prop-head-left { display: flex; align-items: baseline; gap: 0.4rem; }
.gv-prop-type { font-size: $fs-caption; font-weight: 700; color: $color-orange-dark; text-transform: uppercase; }
.gv-prop-deadline { font-size: $fs-caption; color: $color-text-dim; }
.gv-prop-title { font-size: $fs-h4; color: $color-black; margin: 0 0 0.8rem; }
.gv-discord-warning {
  font-size: $fs-caption;
  color: $color-orange-dark;
  margin: -0.5rem 0 0.8rem;
}
.gv-prop-author { font-size: $fs-caption; color: $color-text-dim; text-transform: none; font-weight: 400; }
.gv-vote-line {
  display: flex;
  justify-content: center;
  gap: 1.2rem;
  flex-wrap: wrap;
  font-size: $fs-body;
  font-weight: 700;
  color: $color-black;
  margin-bottom: 0.3rem;
}
.gv-vote-count {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;

  &--pour svg { color: #2e9e5b; }
  &--contre svg { color: $color-danger; }
  &--ajourner svg { color: $color-text-dim; }
}
.gv-quorum-line {
  text-align: center;
  font-size: $fs-caption;
  color: $color-text-dim;
  margin-bottom: 1rem;

  span[title] { cursor: help; }
}
.gv-prop-actions { display: flex; justify-content: center; gap: 0.6rem; flex-wrap: wrap; }

.gv-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 0.4rem;
}
.gv-page-indicator { font-size: $fs-caption; color: $color-text-dim; }
.gv-page-btn {
  background: transparent;
  border: 1px solid $color-border;
  border-radius: 3px;
  padding: 0.4rem 0.9rem;
  font-size: $fs-caption;
  color: $color-text;
  cursor: pointer;

  &:hover:not(:disabled) { border-color: $color-orange; color: $color-orange-dark; }
  &:disabled { color: #ccc; cursor: not-allowed; }
}
</style>
