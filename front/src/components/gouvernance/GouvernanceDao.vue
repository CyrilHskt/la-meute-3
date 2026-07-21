<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { formatEther, parseEther } from "viem";
import { useWallet } from "../../composables/useWallet";
import { useMeute, TypeProposition, ChoixVote, type Proposal } from "../../composables/useMeute";

const { address, wrongNetwork, connect, readOnlyContract, writableContract, publicClient } = useWallet();
const { stats, proposals, memberActivity, loading, error, loadAll } = useMeute();

const txError = ref<string | null>(null);
const txPending = ref(false);

const role = ref<"visiteur" | "louveteau" | "loup">("visiteur");
const carte = ref<{ rang: number; derniereActivite: number; ajournements: number } | null>(null);
const cotisation = ref<bigint>(0n);

onMounted(async () => {
  await loadAll();
  cotisation.value = (await readOnlyContract().read.cotisation()) as bigint;
});

async function refreshMembership() {
  if (!address.value) return;
  const contract = readOnlyContract();
  const balance = (await contract.read.balanceOf([address.value])) as bigint;
  if (balance === 0n) {
    role.value = "visiteur";
    carte.value = null;
    return;
  }
  const c = (await contract.read.carte([address.value])) as { rang: number; derniereActivite: number; ajournements: number };
  carte.value = c;
  role.value = c.rang === 1 ? "loup" : "louveteau";
}

async function onConnect() {
  txError.value = null;
  try {
    await connect();
    await refreshMembership();
  } catch (e) {
    txError.value = e instanceof Error ? e.message : String(e);
  }
}

async function runTx(fn: () => Promise<`0x${string}`>) {
  txError.value = null;
  txPending.value = true;
  try {
    const hash = await fn();
    await publicClient.waitForTransactionReceipt({ hash });
    await Promise.all([loadAll(), refreshMembership()]);
  } catch (e) {
    txError.value = e instanceof Error ? e.message : String(e);
  } finally {
    txPending.value = false;
  }
}

function candidater() {
  return runTx(() => writableContract().write.candidater({ value: cotisation.value }));
}

const titulariserAddr = ref("");
const exclureAddr = ref("");
const depenseAddr = ref("");
const depenseMontant = ref("");
const depenseMotif = ref("");

function ouvrirTitularisation() {
  return runTx(() => writableContract().write.ouvrirTitularisation([titulariserAddr.value as `0x${string}`]));
}
function proposerExclusion() {
  return runTx(() => writableContract().write.proposerExclusion([exclureAddr.value as `0x${string}`]));
}
function proposerDepense() {
  return runTx(() =>
    writableContract().write.proposerDepense([
      depenseAddr.value as `0x${string}`,
      parseEther(depenseMontant.value || "0"),
      depenseMotif.value,
    ]),
  );
}
function voter(id: bigint, choix: number) {
  return runTx(() => writableContract().write.voter([id, choix]));
}
function executer(id: bigint) {
  return runTx(() => writableContract().write.executer([id]));
}

const now = ref(Math.floor(Date.now() / 1000));

const propositionsEnCours = computed(() => proposals.value.filter((p) => !p.executee && Number(p.echeance) > now.value));
const propositionsClotureesNonExecutees = computed(() =>
  proposals.value.filter((p) => !p.executee && Number(p.echeance) <= now.value),
);
const propositionsPassees = computed(() => proposals.value.filter((p) => p.executee));

const activeTab = ref<"encours" | "passees">("encours");

const typeLabels = ["Admission", "Titularisation", "Exclusion", "Dépense"];

function propositionTitre(p: Proposal): string {
  const short = `${p.cible.slice(0, 6)}…${p.cible.slice(-4)}`;
  switch (p.typeProp) {
    case TypeProposition.Admission:
      return `Candidature de ${short}`;
    case TypeProposition.Titularisation:
      return `Titularisation de ${short}`;
    case TypeProposition.Exclusion:
      return `Exclusion de ${short}`;
    default:
      return `Dépense pour ${short} — ${formatEther(p.montant)} ETH (${p.motif})`;
  }
}

function seuil(p: Proposal): number {
  return Math.floor(p.snapshotActifs / 2) + 1;
}

const monActivite = computed(() => {
  if (!address.value) return { votesSoumis: 0, propositionsOuvertes: 0 };
  return memberActivity.value.get(address.value.toLowerCase()) ?? { votesSoumis: 0, propositionsOuvertes: 0 };
});
</script>

<template>
  <section id="gouvernance-dao" class="gv-dao">
    <div v-if="stats" class="gv-stats-bar">
      <div class="gv-stat-tile">
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
          <p class="gv-card-title">Rejoindre la Meute</p>
          <p class="gv-card-note">
            Aucune carte associée à cette adresse. Ta cotisation
            ({{ formatEther(cotisation) }} ETH) est remboursée si ta candidature est refusée.
          </p>
          <button class="btn btn-primary" :disabled="txPending" @click="candidater">Candidater</button>
        </template>
        <template v-else>
          <p class="gv-card-title">Ma carte — {{ role === "loup" ? "Loup" : "Louveteau" }}</p>
          <p class="gv-card-note mono">{{ address }}</p>
          <div class="gv-stat-row">
            <span>Statut</span>
            <span>{{ carte && Math.floor(Date.now() / 1000) - carte.derniereActivite > 365 * 24 * 60 * 60 ? "Dormant" : "Actif" }}</span>
          </div>
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
          <article v-for="p in [...propositionsClotureesNonExecutees, ...propositionsEnCours]" :key="p.id.toString()" class="gv-prop-card">
            <div class="gv-prop-head">
              <span class="gv-prop-type">{{ typeLabels[p.typeProp] }}</span>
              <span class="gv-prop-deadline mono">
                {{ Number(p.echeance) > now ? "clôture " + new Date(Number(p.echeance) * 1000).toLocaleString("fr-FR") : "clôturé, à exécuter" }}
              </span>
            </div>
            <p class="gv-prop-title">{{ propositionTitre(p) }}</p>
            <div class="gv-vote-legend">
              <span>{{ p.votesApprouver }} pour</span>
              <span>{{ p.votesRejeter }} contre</span>
              <span v-if="p.typeProp === TypeProposition.Titularisation">{{ p.votesAjourner }} ajourner</span>
              <span>seuil : {{ seuil(p) }} / {{ p.snapshotActifs }} actifs</span>
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
          <p v-if="!propositionsEnCours.length && !propositionsClotureesNonExecutees.length" class="gv-card-note">
            Aucune proposition en cours.
          </p>
        </div>

        <div v-else class="gv-prop-list">
          <article v-for="p in propositionsPassees" :key="p.id.toString()" class="gv-prop-card">
            <div class="gv-prop-head">
              <span class="gv-prop-type">{{ typeLabels[p.typeProp] }}</span>
              <span class="gv-prop-deadline mono">clôturé</span>
            </div>
            <p class="gv-prop-title">{{ propositionTitre(p) }}</p>
            <div class="gv-vote-legend">
              <span>{{ p.votesApprouver }} pour</span>
              <span>{{ p.votesRejeter }} contre</span>
              <span>seuil : {{ seuil(p) }} / {{ p.snapshotActifs }} actifs</span>
            </div>
          </article>
          <p v-if="!propositionsPassees.length" class="gv-card-note">Aucune proposition passée.</p>
        </div>
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

.gv-error {
  color: $color-danger;
  font-size: $fs-caption;
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

.gv-stat-row {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid $color-border;
  font-size: $fs-caption;

  &--sub { color: $color-text-dim; }
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
.gv-vote-legend { display: flex; gap: 1rem; flex-wrap: wrap; font-size: $fs-caption; color: $color-text-dim; margin-bottom: 1rem; }
.gv-prop-actions { display: flex; gap: 0.6rem; flex-wrap: wrap; }
</style>
