<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { formatEther } from "viem";
import { ProposalType, type Proposal } from "../../composables/useMeute";
import AddressChip from "./AddressChip.vue";

const { t } = useI18n();

defineProps<{
  proposal: Proposal;
  // Derived from `deadline - VOTE_DURATION` by the parent (see ProposalCard),
  // absent when the caller doesn't have `voteDuration` available yet.
  proposedAt?: string;
  authorKnown: (p: Proposal) => boolean;
}>();
</script>

<template>
  <div class="gv-detail-rows">
    <div v-if="authorKnown(proposal)" class="gv-stat-row">
      <span class="gv-stat-label">{{ t('governance.dao.by') }}</span>
      <AddressChip :address="proposal.author" short />
    </div>
    <div v-if="proposedAt" class="gv-stat-row">
      <span class="gv-stat-label">{{ t('governance.dao.proposedAtTooltip') }}</span>
      <span class="mono">{{ proposedAt }}</span>
    </div>
    <div class="gv-stat-row" :title="t('governance.dao.comingSoon')">
      <span class="gv-stat-label">{{ t('governance.dao.txHashLabel') }}</span>
      <span class="gv-stat-value--pending">{{ t('governance.dao.comingSoon') }}<span class="gv-tm">™</span></span>
    </div>
    <div v-if="proposal.proposalType === ProposalType.Expense" class="gv-stat-row">
      <span class="gv-stat-label">{{ t('governance.dao.amountPlaceholder') }}</span>
      <span class="mono">{{ formatEther(proposal.amount) }} ETH</span>
    </div>
    <div v-if="proposal.proposalType === ProposalType.Expense && proposal.reason" class="gv-stat-row">
      <span class="gv-stat-label">{{ t('governance.dao.reasonPlaceholder') }}</span>
      <span>{{ proposal.reason }}</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.mono {
  font-family: $font-mono;
}

.gv-detail-rows {
  margin: $space-2 0;

  .gv-stat-row span:last-child {
    max-width: 70ch;
  }
}

// Matches the reference `.gv-stat-row` pattern already established
// elsewhere on this page (the member card, the contract stats panel):
// label left, value right, aligned edge-to-edge like a ledger row —
// this component's own row previously defaulted to flex-start, reading
// as inconsistent with those other "table" rows on the same page.
.gv-stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: $space-1 0;
  border-bottom: 1px solid $color-border;
  font-size: $fs-caption;

  &:last-child { border-bottom: none; }
}

.gv-stat-label {
  color: $color-text-dim;
}

// Same treatment as the "Soon™" badge in SubmitProposalPanel.vue (accent
// color, bordered pill) rather than plain dim italic text — one "coming
// soon" marker, one look, wherever it shows up.
.gv-stat-value--pending {
  display: inline-block;
  font-family: $font-mono;
  font-size: 1.05rem;
  font-weight: 700;
  border: 1px solid $color-orange-dark;
  border-radius: $radius-sm;
  padding: 0.15rem 0.6rem;
  color: $color-orange-dark;
}

// Same fix as SubmitProposalPanel.vue's badge: the ™ glyph renders tiny
// by default, sized up and lifted back to baseline to stay legible.
.gv-tm {
  font-size: 1.3em;
  vertical-align: baseline;
}
</style>
