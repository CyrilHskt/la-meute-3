<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { formatEther, type Chain } from "viem";
import AddressChip from "./AddressChip.vue";
import { useDiscordLink } from "../../composables/useDiscordLink";
import type { Proposal } from "../../composables/useMeute";

const { t } = useI18n();

const props = defineProps<{
  address: `0x${string}`;
  balance: bigint;
  fee: bigint;
  application: Proposal | null;
  now: number;
  txPending: boolean;
  countdown: (p: Proposal) => string;
  exactDate: (p: Proposal) => string;
  activeChain: Chain;
}>();

// No faucet URL on viem's Chain type (it only carries protocol-level
// metadata) — one entry per chain this app actually targets, falling
// back to Sepolia's for a chain with no faucet of its own (shouldn't
// happen in practice, only reachable if DEPLOYMENTS in contract.ts grows
// a chain id this map hasn't caught up with yet).
const FAUCET_URLS: Record<number, string> = {
  11155111: "https://www.alchemy.com/faucets/ethereum-sepolia",
  84532: "https://www.alchemy.com/faucets/base-sepolia",
};
const faucetUrl = computed(() => FAUCET_URLS[props.activeChain.id] ?? FAUCET_URLS[11155111]);

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
    <p class="acl-title">{{ t('applicationChecklist.title') }}</p>

    <div class="acl-step acl-step--done">
      <div class="acl-marker">✓</div>
      <div class="acl-body">
        <div class="acl-step-title">{{ t('applicationChecklist.step1Title') }}</div>
        <div class="acl-note"><AddressChip :address="address" short /></div>
      </div>
    </div>

    <div class="acl-step" :class="`acl-step--${fundsStep}`">
      <div class="acl-marker">{{ fundsStep === "done" ? "✓" : 2 }}</div>
      <div class="acl-body">
        <div class="acl-step-title">{{ t('applicationChecklist.step2Title', { network: activeChain.name }) }}</div>
        <div class="acl-note">
          {{ t('applicationChecklist.availableEth', { amount: formatEther(balance) }) }}
          <template v-if="fundsStep === 'current'">{{ t('applicationChecklist.minimumRequired', { amount: formatEther(fee) }) }}</template>
        </div>
        <div v-if="fundsStep === 'current'" class="acl-action">
          <a class="acl-faucet-btn" :href="faucetUrl" target="_blank" rel="noopener">
            {{ t('applicationChecklist.getTestEth') }}
          </a>
          <button class="acl-refresh" type="button" :title="t('applicationChecklist.refreshBalance')" @click="emit('refresh-balance')">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2v3.5H10" /></svg>
            {{ t('common.refresh') }}
          </button>
        </div>
      </div>
    </div>

    <div class="acl-step" :class="`acl-step--${discordStep}`">
      <div class="acl-marker">{{ discordStep === "done" ? "✓" : 3 }}</div>
      <div class="acl-body">
        <div class="acl-step-title">{{ t('applicationChecklist.step3Title') }}</div>
        <div class="acl-note">
          <template v-if="myDiscord">{{ t('applicationChecklist.linkedAs', { username: myDiscord.username }) }}</template>
          <template v-else>{{ t('applicationChecklist.discordRequirement') }}</template>
        </div>
        <div v-if="discordStep === 'current'" class="acl-action">
          <button class="btn btn-primary" type="button" @click="requestDiscordLink(address)">{{ t('applicationChecklist.linkDiscord') }}</button>
        </div>
      </div>
    </div>

    <div class="acl-step" :class="`acl-step--${applyStep}`">
      <div class="acl-marker">{{ applyStep === "done" ? "✓" : 4 }}</div>
      <div class="acl-body">
        <div class="acl-step-title">{{ t('applicationChecklist.step4Title') }}</div>
        <div class="acl-note">{{ t('applicationChecklist.feeNote', { amount: formatEther(fee) }) }}</div>
        <div v-if="applyStep === 'current'" class="acl-action">
          <button class="btn btn-primary" :disabled="txPending" @click="emit('apply')">{{ t('applicationChecklist.step4Title') }}</button>
        </div>
      </div>
    </div>

    <div class="acl-step" :class="`acl-step--${voteStep}`">
      <div class="acl-marker">5</div>
      <div class="acl-body">
        <div class="acl-step-title">
          {{ voteStep === "current" ? t('applicationChecklist.voteInProgress') : t('applicationChecklist.waitForVote') }}
        </div>
        <template v-if="voteStep === 'current' && application">
          <div class="acl-note">
            {{ t('applicationChecklist.voteTally', {
              approve: application.approveVotes,
              reject: application.rejectVotes,
              required: Math.floor(application.activeSnapshot / 2) + 1,
            }) }}
          </div>
          <span class="acl-countdown" :title="exactDate(application)">{{ countdown(application) }}</span>
        </template>
        <div v-else class="acl-note">{{ t('applicationChecklist.voteDuration') }}</div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// No background/border here: this component always lives inside
// .gv-card-panel on the GovernanceDao.vue side, which already carries that box.
.acl-title {
  color: $color-orange-dark;
  font-family: $font-mono;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: $fs-caption;
  margin: 0 0 $space-3;
}

.acl-step {
  display: flex;
  gap: $space-2;
  padding: $space-3 0;
  border-bottom: 1px solid $color-border;

  &:last-child { border-bottom: none; }
}

.acl-marker {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: $font-mono;
  font-weight: 600;
  font-size: $fs-caption;
  margin-top: 0.1rem;
}
.acl-step--done .acl-marker { background: $color-success; color: $color-on-accent; }
.acl-step--current .acl-marker { background: $color-orange-dark; color: var(--color-rouille-contrast); }
.acl-step--todo .acl-marker { background: $color-page-bg; color: $color-text-dim; border: 1px solid $color-border; }

.acl-body { flex: 1; }
.acl-step-title { font-weight: 600; font-size: $fs-h4; color: $color-black; }
.acl-step--todo .acl-step-title { color: $color-text-dim; }
.acl-note { font-size: $fs-caption; color: $color-text-dim; margin-top: $space-1; }
.acl-action {
  margin-top: $space-2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $space-1;
}
.acl-faucet-btn {
  display: inline-block;
  background: $color-orange-dark;
  color: var(--color-rouille-contrast);
  border-radius: $radius-sm;
  padding: $space-1 $space-3;
  font-size: $fs-caption;
  text-decoration: none;

  &:hover { background: $color-orange; }
}
.acl-refresh {
  display: inline-flex;
  align-items: center;
  gap: $space-1;
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
  margin-top: $space-1;
  font-family: $font-mono;
  font-size: $fs-caption;
  background: $color-page-bg;
  border-radius: $radius-sm;
  padding: 0.15rem $space-2;
}
</style>
