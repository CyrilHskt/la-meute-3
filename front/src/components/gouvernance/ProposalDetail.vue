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
      <span class="gv-stat-value--pending">{{ t('governance.dao.comingSoon') }}</span>
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

.gv-stat-value--pending {
  color: $color-text-dim;
  font-style: italic;
}
</style>
