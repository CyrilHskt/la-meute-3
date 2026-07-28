<script setup lang="ts">
import { computed } from "vue";
import { formatEther } from "viem";
import AddressChip from "./AddressChip.vue";
import { useDiscordLink } from "../../composables/useDiscordLink";
import type { Proposal } from "../../composables/useMeute";

const props = defineProps<{
  address: `0x${string}`;
  balance: bigint;
  fee: bigint;
  application: Proposal | null;
  now: number;
  txPending: boolean;
  countdown: (p: Proposal) => string;
  exactDate: (p: Proposal) => string;
}>();

const emit = defineEmits<{ apply: []; "refresh-balance": [] }>();

const { discordLinkFor, requestDiscordLink } = useDiscordLink();

const hasEnoughFunds = computed(() => props.balance >= props.fee);
// An applicant who bypasses the front and applies directly on the
// contract without having linked their Discord remains technically
// acceptable (no on-chain check, deliberately — see CLAUDE.md on the
// absence of a privileged role): this case is flagged to Wolves via
// applicationWithoutDiscord on the proposal card, not blocked here.
const myDiscord = computed(() => discordLinkFor(props.address));

type StepState = "done" | "current" | "todo";
const fundsStep = computed<StepState>(() => (hasEnoughFunds.value ? "done" : "current"));
const discordStep = computed<StepState>(() => {
  if (myDiscord.value) return "done";
  return hasEnoughFunds.value ? "current" : "todo";
});
const applyStep = computed<StepState>(() => {
  if (props.application) return "done";
  return hasEnoughFunds.value && myDiscord.value ? "current" : "todo";
});
const voteStep = computed<StepState>(() => (props.application ? "current" : "todo"));
</script>

<template>
  <div class="acl-card">
    <p class="acl-title">Devenir membre</p>

    <div class="acl-step acl-step--done">
      <div class="acl-marker">✓</div>
      <div class="acl-body">
        <div class="acl-step-title">Connecter ton wallet</div>
        <div class="acl-note"><AddressChip :address="address" short /></div>
      </div>
    </div>

    <div class="acl-step" :class="`acl-step--${fundsStep}`">
      <div class="acl-marker">{{ fundsStep === "done" ? "✓" : 2 }}</div>
      <div class="acl-body">
        <div class="acl-step-title">Avoir des ETH Sepolia</div>
        <div class="acl-note">
          {{ formatEther(balance) }} ETH disponibles
          <template v-if="fundsStep === 'current'">— il en faut au moins {{ formatEther(fee) }}</template>
        </div>
        <div v-if="fundsStep === 'current'" class="acl-action">
          <a class="acl-faucet-btn" href="https://www.alchemy.com/faucets/ethereum-sepolia" target="_blank" rel="noopener">
            Obtenir des ETH de test
          </a>
          <button class="acl-refresh" type="button" title="Vérifier à nouveau mon solde" @click="emit('refresh-balance')">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2v3.5H10" /></svg>
            Actualiser
          </button>
        </div>
      </div>
    </div>

    <div class="acl-step" :class="`acl-step--${discordStep}`">
      <div class="acl-marker">{{ discordStep === "done" ? "✓" : 3 }}</div>
      <div class="acl-body">
        <div class="acl-step-title">Lier ton compte Discord</div>
        <div class="acl-note">
          <template v-if="myDiscord">Lié en tant que {{ myDiscord.username }}</template>
          <template v-else>Nécessite d'avoir rejoint le serveur Discord de la Meute</template>
        </div>
        <div v-if="discordStep === 'current'" class="acl-action">
          <button class="btn btn-primary" type="button" @click="requestDiscordLink(address)">Lier mon compte Discord</button>
        </div>
      </div>
    </div>

    <div class="acl-step" :class="`acl-step--${applyStep}`">
      <div class="acl-marker">{{ applyStep === "done" ? "✓" : 4 }}</div>
      <div class="acl-body">
        <div class="acl-step-title">Candidater</div>
        <div class="acl-note">Cotisation : {{ formatEther(fee) }} ETH, remboursée si refusée</div>
        <div v-if="applyStep === 'current'" class="acl-action">
          <button class="btn btn-primary" :disabled="txPending" @click="emit('apply')">Candidater</button>
        </div>
      </div>
    </div>

    <div class="acl-step" :class="`acl-step--${voteStep}`">
      <div class="acl-marker">5</div>
      <div class="acl-body">
        <div class="acl-step-title">
          {{ voteStep === "current" ? "Vote en cours" : "Attendre le vote des Loups" }}
        </div>
        <template v-if="voteStep === 'current' && application">
          <div class="acl-note">
            {{ application.approveVotes }} pour · {{ application.rejectVotes }} contre ·
            {{ Math.floor(application.activeSnapshot / 2) + 1 }} requis
          </div>
          <span class="acl-countdown" :title="exactDate(application)">{{ countdown(application) }}</span>
        </template>
        <div v-else class="acl-note">Le vote dure 7 jours</div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// No background/border here: this component always lives inside
// .gv-card-panel on the GovernanceDao.vue side, which already carries that box.
.acl-title {
  color: $color-orange;
  font-family: $font-display;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-size: $fs-h4;
  margin: 0 0 1.2rem;
}

.acl-step {
  display: flex;
  gap: 0.8rem;
  padding: 0.85rem 0;
  border-bottom: 1px solid $color-border;

  &:last-child { border-bottom: none; }
}

.acl-marker {
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
.acl-step--done .acl-marker { background: #2e9e5b; color: #fff; }
.acl-step--current .acl-marker { background: $color-orange; color: #fff; }
.acl-step--todo .acl-marker { background: $color-page-bg; color: $color-text-dim; border: 1px solid $color-border; }

.acl-body { flex: 1; }
.acl-step-title { font-weight: 700; font-size: $fs-h4; color: $color-black; }
.acl-step--todo .acl-step-title { color: $color-text-dim; }
.acl-note { font-size: $fs-caption; color: $color-text-dim; margin-top: 0.2rem; }
.acl-action {
  margin-top: 0.6rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}
.acl-faucet-btn {
  display: inline-block;
  background: $color-orange;
  color: #fff;
  border-radius: 3px;
  padding: 0.45rem 1rem;
  font-size: $fs-caption;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  text-decoration: none;

  &:hover { background: $color-orange-dark; color: #fff; }
}
.acl-refresh {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: none;
  border: none;
  color: $color-text-dim;
  font-size: $fs-caption;
  cursor: pointer;
  padding: 0;

  &:hover { color: $color-orange-dark; }
}
.acl-countdown {
  display: inline-block;
  margin-top: 0.4rem;
  font-family: $font-mono;
  font-size: $fs-caption;
  background: $color-page-bg;
  border-radius: 3px;
  padding: 0.15rem 0.5rem;
}
</style>
