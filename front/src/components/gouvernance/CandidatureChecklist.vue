<script setup lang="ts">
import { computed } from "vue";
import { formatEther } from "viem";
import AddressChip from "./AddressChip.vue";
import type { Proposal } from "../../composables/useMeute";

const props = defineProps<{
  address: `0x${string}`;
  balance: bigint;
  cotisation: bigint;
  candidature: Proposal | null;
  now: number;
  txPending: boolean;
  compteARebours: (p: Proposal) => string;
  dateExacte: (p: Proposal) => string;
}>();

const emit = defineEmits<{ candidater: [] }>();

const aAssezDeFonds = computed(() => props.balance >= props.cotisation);

type EtatEtape = "done" | "current" | "todo";
const etapeFonds = computed<EtatEtape>(() => (aAssezDeFonds.value ? "done" : "current"));
const etapeCandidater = computed<EtatEtape>(() => {
  if (props.candidature) return "done";
  return aAssezDeFonds.value ? "current" : "todo";
});
const etapeVote = computed<EtatEtape>(() => (props.candidature ? "current" : "todo"));
</script>

<template>
  <div class="ccl-card">
    <p class="ccl-title">Devenir membre</p>

    <div class="ccl-step ccl-step--done">
      <div class="ccl-marker">✓</div>
      <div class="ccl-body">
        <div class="ccl-step-title">Connecter ton wallet</div>
        <div class="ccl-note"><AddressChip :address="address" short /></div>
      </div>
    </div>

    <div class="ccl-step" :class="`ccl-step--${etapeFonds}`">
      <div class="ccl-marker">{{ etapeFonds === "done" ? "✓" : 2 }}</div>
      <div class="ccl-body">
        <div class="ccl-step-title">Avoir des ETH Sepolia</div>
        <div class="ccl-note">
          {{ formatEther(balance) }} ETH disponibles
          <template v-if="etapeFonds === 'current'">— il en faut au moins {{ formatEther(cotisation) }}</template>
        </div>
      </div>
    </div>

    <div class="ccl-step" :class="`ccl-step--${etapeCandidater}`">
      <div class="ccl-marker">{{ etapeCandidater === "done" ? "✓" : 3 }}</div>
      <div class="ccl-body">
        <div class="ccl-step-title">Candidater</div>
        <div class="ccl-note">Cotisation : {{ formatEther(cotisation) }} ETH, remboursée si refusée</div>
        <div v-if="etapeCandidater === 'current'" class="ccl-action">
          <button class="btn btn-primary" :disabled="txPending" @click="emit('candidater')">Candidater</button>
        </div>
      </div>
    </div>

    <div class="ccl-step" :class="`ccl-step--${etapeVote}`">
      <div class="ccl-marker">4</div>
      <div class="ccl-body">
        <div class="ccl-step-title">
          {{ etapeVote === "current" ? "Vote en cours" : "Attendre le vote des Loups" }}
        </div>
        <template v-if="etapeVote === 'current' && candidature">
          <div class="ccl-note">
            {{ candidature.votesApprouver }} pour · {{ candidature.votesRejeter }} contre ·
            {{ Math.floor(candidature.snapshotActifs / 2) + 1 }} requis
          </div>
          <span class="ccl-countdown" :title="dateExacte(candidature)">{{ compteARebours(candidature) }}</span>
        </template>
        <div v-else class="ccl-note">Le vote dure 7 jours</div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// Pas de fond/bordure ici : ce composant vit toujours à l'intérieur de
// .gv-card-panel côté GouvernanceDao.vue, qui porte déjà cette boîte.
.ccl-title {
  color: $color-orange;
  font-family: $font-display;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-size: $fs-h4;
  margin: 0 0 1.2rem;
}

.ccl-step {
  display: flex;
  gap: 0.8rem;
  padding: 0.85rem 0;
  border-bottom: 1px solid $color-border;

  &:last-child { border-bottom: none; }
}

.ccl-marker {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: $font-display;
  font-weight: 700;
  font-size: $fs-caption;
  margin-top: 0.1rem;
}
.ccl-step--done .ccl-marker { background: #2e9e5b; color: #fff; }
.ccl-step--current .ccl-marker { background: $color-orange; color: #fff; }
.ccl-step--todo .ccl-marker { background: $color-page-bg; color: $color-text-dim; border: 1px solid $color-border; }

.ccl-body { flex: 1; }
.ccl-step-title { font-weight: 700; font-size: $fs-h4; color: $color-black; }
.ccl-step--todo .ccl-step-title { color: $color-text-dim; }
.ccl-note { font-size: $fs-caption; color: $color-text-dim; margin-top: 0.2rem; }
.ccl-action { margin-top: 0.5rem; }
.ccl-countdown {
  display: inline-block;
  margin-top: 0.4rem;
  font-family: $font-mono;
  font-size: $fs-caption;
  background: $color-page-bg;
  border-radius: 3px;
  padding: 0.15rem 0.5rem;
}
</style>
