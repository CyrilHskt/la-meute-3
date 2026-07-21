<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { formatEther, parseEther } from "viem";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useWallet } from "../../composables/useWallet";
import { useMeute, TypeProposition, ChoixVote, type Proposal } from "../../composables/useMeute";
import { useEthPrice } from "../../composables/useEthPrice";
import { friendlyContractError } from "../../composables/contractErrors";
import AddressChip from "./AddressChip.vue";
import CandidatureChecklist from "./CandidatureChecklist.vue";
import WalletInstallModal from "./WalletInstallModal.vue";

const { address, wrongNetwork, connect, readOnlyContract, writableContract, publicClient } = useWallet();
const { stats, proposals, memberActivity, loading, error, loadAll } = useMeute();
const { eurPerEth } = useEthPrice();

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

// Le pseudo est un registre à part, ouvert à n'importe quelle adresse (pas
// seulement aux membres) : chargé indépendamment du rôle/de la carte.
const monPseudo = ref("");
const editingPseudo = ref(false);
const pseudoInput = ref("");

async function loadPseudo() {
  if (!address.value) {
    monPseudo.value = "";
    return;
  }
  monPseudo.value = (await readOnlyContract().read.pseudo([address.value])) as string;
}

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

function startEditPseudo() {
  pseudoInput.value = monPseudo.value;
  editingPseudo.value = true;
}
function cancelEditPseudo() {
  editingPseudo.value = false;
}
async function savePseudo() {
  const nouveau = pseudoInput.value.trim();
  // On garde le formulaire ouvert (juste désactivé via txPending) tant que
  // la transaction n'est pas confirmée — le fermer tout de suite faisait
  // réapparaître l'ancien pseudo ("Pas encore de pseudo") pendant les
  // quelques secondes d'attente sur Sepolia, avant que loadPseudo() ne
  // rattrape la vraie valeur.
  await runTx(
    () => readOnlyContract().simulate.definirPseudo([nouveau], { account: address.value! }),
    () => writableContract().write.definirPseudo([nouveau]),
  );
  editingPseudo.value = false;
}

onMounted(async () => {
  await loadAll();
  cotisation.value = (await readOnlyContract().read.cotisation()) as bigint;
  now.value = Number((await publicClient.getBlock()).timestamp);
});

// Se resynchronise tout seul si l'adresse change depuis MetaMask (switch de
// compte) sans que l'utilisateur reclique sur "Connecter mon wallet" — la
// route par défaut avant, qui laissait l'ancien état affiché indéfiniment.
watch(address, () => {
  refreshMembership();
  loadPseudo();
  loadSolde();
});

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
  if (!address.value) return;
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
    await Promise.all([refreshMembership(), loadPseudo(), loadSolde()]);
  } catch (e) {
    txError.value = friendlyContractError(e);
  }
}

// Simule l'appel avant de l'envoyer : ça récupère la vraie raison Solidity
// du revert (ex: DejaVote) pour un message clair, au lieu de laisser
// l'estimation de gas échouer en silence et remonter un message RPC
// générique sans rapport (constaté en local : "gas limit exceeds cap").
async function runTx(
  simulateFn: () => Promise<unknown>,
  writeFn: () => Promise<`0x${string}`>,
) {
  txError.value = null;
  txPending.value = true;
  try {
    await simulateFn();
    const hash = await writeFn();
    await publicClient.waitForTransactionReceipt({ hash });
    await Promise.all([loadAll(), refreshMembership(), loadPseudo(), loadSolde()]);
    now.value = Number((await publicClient.getBlock()).timestamp);
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
  );
}

const titulariserAddr = ref("");
const exclureAddr = ref("");
const depenseAddr = ref("");
const depenseMontant = ref("");
const depenseMotif = ref("");

function ouvrirTitularisation() {
  const args = [titulariserAddr.value as `0x${string}`] as const;
  return runTx(
    () => readOnlyContract().simulate.ouvrirTitularisation(args, { account: address.value! }),
    () => writableContract().write.ouvrirTitularisation(args),
  );
}
function proposerExclusion() {
  const args = [exclureAddr.value as `0x${string}`] as const;
  return runTx(
    () => readOnlyContract().simulate.proposerExclusion(args, { account: address.value! }),
    () => writableContract().write.proposerExclusion(args),
  );
}
function proposerDepense() {
  const args = [depenseAddr.value as `0x${string}`, parseEther(depenseMontant.value || "0"), depenseMotif.value] as const;
  return runTx(
    () => readOnlyContract().simulate.proposerDepense(args, { account: address.value! }),
    () => writableContract().write.proposerDepense(args),
  );
}
function voter(id: bigint, choix: number) {
  const args = [id, choix] as const;
  return runTx(
    () => readOnlyContract().simulate.voter(args, { account: address.value! }),
    () => writableContract().write.voter(args),
  );
}
function executer(id: bigint) {
  const args = [id] as const;
  return runTx(
    () => readOnlyContract().simulate.executer(args, { account: address.value! }),
    () => writableContract().write.executer(args),
  );
}

const DELAI_DORMANCE = 365 * 24 * 60 * 60;
const estDormant = computed(() => !!carte.value && now.value - carte.value.derniereActivite > DELAI_DORMANCE);
const statutTooltip = computed(() => {
  if (role.value !== "loup") return undefined;
  return estDormant.value
    ? "Ce Loup n'a voté ni agi depuis plus d'un an — il ne compte plus dans le quorum tant qu'il ne se manifeste pas (vote ou « Se réveiller »)."
    : "Vote ou action dans les 365 derniers jours. Sans activité pendant un an, ce Loup deviendrait dormant et sortirait du quorum.";
});

// jeSuisLa() : un Loup se réveille explicitement sans attendre qu'un vote
// passe, pour être recompté dans le quorum avant qu'une décision ne
// s'ouvre (§7.5) — le seul cas où un Loup dormant a une action à faire
// depuis sa carte plutôt qu'en votant.
function seReveiller() {
  return runTx(
    () => readOnlyContract().simulate.jeSuisLa({ account: address.value! }),
    () => writableContract().write.jeSuisLa(),
  );
}

const propositionsEnCours = computed(() => proposals.value.filter((p) => !p.executee && Number(p.echeance) > now.value));
const propositionsClotureesNonExecutees = computed(() =>
  proposals.value.filter((p) => !p.executee && Number(p.echeance) <= now.value),
);
const propositionsPassees = computed(() => proposals.value.filter((p) => p.executee));
const propositionsEnCoursToutes = computed(() => [...propositionsClotureesNonExecutees.value, ...propositionsEnCours.value]);

const PAGE_SIZE = 5;
const pageEncours = ref(1);
const pagePassees = ref(1);

const totalPagesEncours = computed(() => Math.max(1, Math.ceil(propositionsEnCoursToutes.value.length / PAGE_SIZE)));
const totalPagesPassees = computed(() => Math.max(1, Math.ceil(propositionsPassees.value.length / PAGE_SIZE)));

// Si la liste rétrécit (nouvelle donnée chargée) et qu'on était sur une
// page qui n'existe plus, on revient à la dernière page valide plutôt que
// d'afficher une page vide.
watch(totalPagesEncours, (max) => { if (pageEncours.value > max) pageEncours.value = max; });
watch(totalPagesPassees, (max) => { if (pagePassees.value > max) pagePassees.value = max; });

const propositionsEnCoursPage = computed(() => {
  const start = (pageEncours.value - 1) * PAGE_SIZE;
  return propositionsEnCoursToutes.value.slice(start, start + PAGE_SIZE);
});
const propositionsPasseesPage = computed(() => {
  const start = (pagePassees.value - 1) * PAGE_SIZE;
  return propositionsPassees.value.slice(start, start + PAGE_SIZE);
});

const activeTab = ref<"encours" | "passees">("encours");

const typeLabels = ["Admission", "Titularisation", "Exclusion", "Dépense"];

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

function seuil(p: Proposal): number {
  return Math.floor(p.snapshotActifs / 2) + 1;
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
        p.votesApprouver >= seuil(p),
    ) ?? null
  );
});

function eurTooltip(wei: bigint): string {
  if (eurPerEth.value === null) return "";
  const eur = Number(formatEther(wei)) * eurPerEth.value;
  return `≈ ${eur.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
}

// Visite guidée : jamais lancée automatiquement, un tour court par rôle,
// rejouable à volonté depuis le bouton dédié. Reprend le style et le
// contenu déjà validés dans la maquette (Artifact), driver.js remplace
// juste le moteur de positionnement fait main.
function startTour() {
  const steps =
    role.value === "loup"
      ? [
          { element: ".gv-card-panel", popover: { title: "Ta carte de Loup", description: "Ton statut, ton ancienneté et ton activité (votes, propositions ouvertes) sont visibles ici." } },
          { element: ".gv-new-prop-panel", popover: { title: "Ouvrir une proposition", description: "Titularisation, exclusion ou dépense : chaque type de décision a son propre formulaire, ici." } },
          { element: ".gv-prop-actions", popover: { title: "Voter", description: "Un vote reste ouvert 7 jours. Le seuil affiché s'ajuste automatiquement au nombre de Loups réellement actifs." } },
        ]
      : role.value === "louveteau"
        ? [
            { element: ".gv-card-panel", popover: { title: "Ta carte de Louveteau", description: "Ton statut et ta contribution sont à jour en direct — c'est la même carte qui deviendra Loup après titularisation." } },
            { element: ".gv-stat-row", popover: { title: "En période de probation", description: "Tu peux suivre les propositions en cours, mais le droit de vote arrive avec ta titularisation." } },
          ]
        : [
            { element: ".gv-card-panel", popover: { title: "Ton wallet, c'est ta carte", description: "Pas de compte à créer : ton wallet est ton identité ici, du candidat au Loup." } },
            { element: ".gv-stat-tile:first-child", popover: { title: "Le trésor, en direct", description: "Ce montant vient du solde réel du contrat sur la blockchain — personne ne peut l'afficher faux." } },
          ];

  driver({ showProgress: true, nextBtnText: "Suivant", prevBtnText: "Précédent", doneBtnText: "Terminer", steps }).drive();
}
</script>

<template>
  <section id="gouvernance-dao" class="gv-dao">
    <WalletInstallModal />
    <div class="gv-tour-bar">
      <button class="gv-tour-trigger" type="button" @click="startTour">Visite guidée</button>
    </div>

    <div v-if="stats" class="gv-stats-bar">
      <div class="gv-stat-tile" :title="eurTooltip(stats.treasuryWei)">
        <div class="value">{{ formatEther(stats.treasuryWei) }} <span class="unit">ETH</span></div>
        <div class="caption">Trésor</div>
      </div>
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

          <p v-if="!editingPseudo" class="gv-pseudo">
            {{ monPseudo || "Pas encore de pseudo" }}
            <button class="icon-btn" type="button" title="Modifier mon pseudo" @click="startEditPseudo">
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M11 2l3 3-8 8H3v-3l8-8Z" /></svg>
            </button>
          </p>
          <form v-else class="gv-pseudo-edit" @submit.prevent="savePseudo">
            <template v-if="txPending">
              <span class="gv-pseudo-spinner" aria-hidden="true"></span>
              <span class="gv-pseudo-pending">Enregistrement…</span>
            </template>
            <template v-else>
              <input v-model="pseudoInput" maxlength="32" placeholder="Ton pseudo (32 car. max)" autofocus />
              <button class="icon-btn" type="submit" title="Enregistrer">
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 8.5 6.5 12 13 4.5" /></svg>
              </button>
              <button class="icon-btn" type="button" title="Annuler" @click="cancelEditPseudo">
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </template>
          </form>

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
            <span>{{ carte?.ajournements ?? 0 }} / 2</span>
          </div>
          <div class="gv-stat-row gv-stat-row--sub">
            <span>↳ Votes soumis</span>
            <span>{{ monActivite.votesSoumis }}</span>
          </div>
          <div class="gv-stat-row gv-stat-row--sub">
            <span>↳ Propositions ouvertes</span>
            <span>{{ monActivite.propositionsOuvertes }}</span>
          </div>
        </template>
      </aside>

      <main class="gv-main">
        <div v-if="role === 'loup'" class="gv-new-prop-panel">
          <h3 class="gv-card-title">Ouvrir une proposition</h3>

          <div class="gv-prop-form">
            <p class="gv-form-label">Titulariser un Louveteau</p>
            <div class="gv-form-row">
              <input v-model="titulariserAddr" placeholder="0x… adresse du Louveteau" />
              <button class="btn btn-primary" :disabled="txPending || !titulariserAddr" @click="ouvrirTitularisation">
                Ouvrir
              </button>
            </div>
          </div>

          <div class="gv-prop-form">
            <p class="gv-form-label">Proposer une exclusion</p>
            <div class="gv-form-row">
              <input v-model="exclureAddr" placeholder="0x… adresse du membre" />
              <button class="btn btn-outline-danger" :disabled="txPending || !exclureAddr" @click="proposerExclusion">
                Ouvrir
              </button>
            </div>
          </div>

          <div class="gv-prop-form">
            <p class="gv-form-label">Proposer une dépense</p>
            <div class="gv-form-row gv-form-row--wrap">
              <input v-model="depenseAddr" placeholder="0x… bénéficiaire" />
              <input v-model="depenseMontant" placeholder="Montant en ETH" />
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

        <h3 class="gv-card-title" style="margin-top: 2rem">Propositions</h3>
        <div class="gv-tabs">
          <button class="gv-tab" :class="{ 'gv-tab--active': activeTab === 'encours' }" @click="activeTab = 'encours'">
            En cours ({{ propositionsEnCours.length + propositionsClotureesNonExecutees.length }})
          </button>
          <button class="gv-tab" :class="{ 'gv-tab--active': activeTab === 'passees' }" @click="activeTab = 'passees'">
            Passées ({{ propositionsPassees.length }})
          </button>
        </div>

        <div v-if="activeTab === 'encours'" class="gv-prop-list">
          <article v-for="p in propositionsEnCoursPage" :key="p.id.toString()" class="gv-prop-card">
            <div class="gv-prop-head">
              <span class="gv-prop-type">{{ typeLabels[p.typeProp] }}</span>
              <span class="gv-prop-deadline mono" :title="dateExacte(p)">{{ compteARebours(p) }}</span>
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
              <span v-if="p.typeProp === TypeProposition.Titularisation">{{ p.votesAjourner }} ajourner</span>
            </div>
            <div class="gv-quorum-line">
              <span title="Majorité absolue des Loups actifs au moment de l'ouverture du vote">
                {{ seuil(p) }} votes « pour » requis (sur {{ p.snapshotActifs }} Loups actifs)
              </span>
            </div>
            <div class="gv-prop-actions">
              <template v-if="role === 'loup' && Number(p.echeance) > now">
                <button class="btn btn-primary" :disabled="txPending" @click="voter(p.id, ChoixVote.Approuver)">Approuver</button>
                <button class="btn btn-outline-danger" :disabled="txPending" @click="voter(p.id, ChoixVote.Rejeter)">Rejeter</button>
                <button
                  v-if="p.typeProp === TypeProposition.Titularisation"
                  class="btn btn-outline"
                  :disabled="txPending"
                  @click="voter(p.id, ChoixVote.Ajourner)"
                >
                  Ajourner
                </button>
              </template>
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
          <article v-for="p in propositionsPasseesPage" :key="p.id.toString()" class="gv-prop-card">
            <div class="gv-prop-head">
              <span class="gv-prop-type">{{ typeLabels[p.typeProp] }}</span>
              <span class="gv-prop-deadline mono" :title="dateExacte(p)">clôturé</span>
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
            </div>
            <div class="gv-quorum-line">
              <span title="Majorité absolue des Loups actifs au moment de l'ouverture du vote">
                {{ seuil(p) }} votes « pour » requis (sur {{ p.snapshotActifs }} Loups actifs)
              </span>
            </div>
          </article>
          <p v-if="!propositionsPassees.length" class="gv-card-note">Aucune proposition passée.</p>
          <nav v-if="totalPagesPassees > 1" class="gv-pagination">
            <button class="gv-page-btn" :disabled="pagePassees === 1" @click="pagePassees--">Précédent</button>
            <span class="gv-page-indicator">Page {{ pagePassees }} / {{ totalPagesPassees }}</span>
            <button class="gv-page-btn" :disabled="pagePassees === totalPagesPassees" @click="pagePassees++">Suivant</button>
          </nav>
        </div>
      </main>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.mono {
  font-family: $font-mono;
}

.gv-tour-bar {
  display: flex;
  justify-content: flex-end;
  padding: 0.7rem 1.6rem;
  background: #111;
}

.gv-tour-trigger {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: rgba(255, 255, 255, 0.85);
  border-radius: 999px;
  padding: 0.4rem 0.9rem;
  font-size: $fs-caption;
  cursor: pointer;

  &:hover { border-color: $color-orange; color: $color-orange; }
}

.gv-loading,
.gv-card-note {
  color: $color-text-dim;
  font-size: $fs-caption;
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

.gv-stats-bar {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 1px;
  background: $color-border;
  border-bottom: 1px solid $color-border;
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

.gv-card-title {
  color: $color-orange;
  font-family: $font-display;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-size: $fs-h4;
  margin: 0 0 1rem;
}

.gv-pseudo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  font-weight: 700;
  color: $color-black;
  margin: 0 0 0.3rem;
}

.gv-pseudo-edit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  margin: 0 0 0.3rem;

  input {
    max-width: 150px;
    border: 1px solid $color-border;
    border-radius: 3px;
    padding: 0.3rem 0.5rem;
    font: inherit;
    font-size: $fs-caption;
  }
}

.gv-pseudo-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid $color-border;
  border-top-color: $color-orange;
  border-radius: 50%;
  animation: gv-spin 0.7s linear infinite;
}
.gv-pseudo-pending {
  font-size: $fs-caption;
  color: $color-text-dim;
}
@keyframes gv-spin {
  to { transform: rotate(360deg); }
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
    border: 1px solid $color-border;
    border-radius: 3px;
    padding: 0.5rem 0.7rem;
    font: inherit;
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

.gv-prop-list { display: flex; flex-direction: column; gap: 1rem; }
.gv-prop-head { display: flex; justify-content: space-between; margin-bottom: 0.5rem; }
.gv-prop-type { font-size: $fs-caption; font-weight: 700; color: $color-orange-dark; text-transform: uppercase; }
.gv-prop-deadline { font-size: $fs-caption; color: $color-text-dim; }
.gv-prop-title { font-size: $fs-h4; color: $color-black; margin: 0 0 0.8rem; }
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
