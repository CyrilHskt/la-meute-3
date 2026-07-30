<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { ProposalType, VoteChoice, type Proposal } from "../../composables/useMeute";
import AddressChip from "./AddressChip.vue";

const { t } = useI18n();

const props = defineProps<{
  proposal: Proposal;
  mode: "ongoing" | "past";
  selected?: boolean;
  typeLabels: string[];
  authorKnown: (p: Proposal) => boolean;
  proposalPrefix: (p: Proposal) => string;
  proposalSuffix: (p: Proposal) => string;
  quorumTooltip: (p: Proposal) => string;
  requiredQuorum: (p: Proposal) => number;
  // "ongoing" mode only
  applicationWithoutDiscord?: (p: Proposal) => boolean;
  countdown?: (p: Proposal) => string;
  exactDate?: (p: Proposal) => string;
  role?: "wolf" | "cub" | "visitor";
  now?: number;
  txPending?: boolean;
  isTargetInConflict?: (p: Proposal) => boolean;
  postponementBlocked?: (p: Proposal) => boolean;
  maxPostponements?: number;
  // "past" mode only
  pastStatus?: (p: Proposal) => string;
  pastStatusLabels?: Record<string, string>;
}>();

const emit = defineEmits<{
  vote: [id: bigint, choice: number];
  execute: [id: bigint];
  select: [id: bigint];
}>();
</script>

<template>
  <article
    class="gv-prop-row"
    :class="[
      mode === 'past' && props.pastStatus ? `gv-prop-row--${props.pastStatus(proposal)}` : undefined,
      { 'gv-prop-row--selected': selected },
    ]"
    role="button"
    tabindex="0"
    @click="emit('select', proposal.id)"
    @keydown.enter="emit('select', proposal.id)"
  >
    <div class="gv-prop-row-type">
      <span class="gv-prop-type">{{ typeLabels[proposal.proposalType] }}</span>
      <span v-if="authorKnown(proposal)" class="gv-prop-author">
        {{ t('governance.dao.by') }} <AddressChip :address="proposal.author" short />
      </span>
    </div>

    <div class="gv-prop-row-title">
      <p class="gv-prop-title">
        {{ proposalPrefix(proposal) }} <AddressChip :address="proposal.target" short /> {{ proposalSuffix(proposal) }}
      </p>
      <p
        v-if="mode === 'ongoing' && applicationWithoutDiscord?.(proposal)"
        class="gv-discord-warning"
        :title="t('governance.dao.discordMissingTooltip')"
      >
        {{ t('governance.dao.discordMissingWarning') }}
      </p>
      <div class="gv-vote-line">
        <span class="gv-vote-count gv-vote-count--pour">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8.5 6.5 12 13 4.5" /></svg>
          {{ t('governance.dao.votesApprove', { count: proposal.approveVotes }) }}
        </span>
        <span class="gv-vote-count gv-vote-count--contre">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          {{ t('governance.dao.votesReject', { count: proposal.rejectVotes }) }}
        </span>
        <span v-if="proposal.proposalType === ProposalType.Confirmation" class="gv-vote-count gv-vote-count--ajourner">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M4 2h8M4 14h8M5 2c0 3 2.5 3.6 3 4.5.5-.9 3-1.5 3-4.5M5 14c0-3 2.5-3.6 3-4.5.5.9 3 1.5 3 4.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          {{ t('governance.dao.votesPostpone', { count: proposal.postponeVotes }) }}
        </span>
      </div>
      <div class="gv-quorum-line">
        <span :title="quorumTooltip(proposal)">
          {{
            t('governance.dao.quorumLine', {
              cast:
                proposal.approveVotes +
                proposal.rejectVotes +
                (mode === 'past' && proposal.proposalType === ProposalType.Confirmation ? proposal.postponeVotes : 0),
              required: requiredQuorum(proposal),
              total: proposal.activeSnapshot,
            })
          }}
        </span>
      </div>
    </div>

    <div class="gv-prop-row-status">
      <span v-if="mode === 'ongoing' && countdown && exactDate" class="gv-prop-deadline mono" :title="exactDate(proposal)">{{ countdown(proposal) }}</span>
      <span v-else-if="pastStatus && pastStatusLabels" class="gv-prop-statut" :class="`gv-prop-statut--${pastStatus(proposal)}`">
        {{ pastStatusLabels[pastStatus(proposal)] }}
      </span>
    </div>

    <div v-if="mode === 'ongoing'" class="gv-prop-row-actions gv-prop-actions">
      <template v-if="role === 'wolf' && now !== undefined && Number(proposal.deadline) > now && !isTargetInConflict?.(proposal)">
        <button class="btn btn-primary" :disabled="txPending" @click.stop="emit('vote', proposal.id, VoteChoice.Approve)">{{ t('governance.dao.approve') }}</button>
        <button class="btn btn-outline-danger" :disabled="txPending" @click.stop="emit('vote', proposal.id, VoteChoice.Reject)">{{ t('governance.dao.reject') }}</button>
        <button
          v-if="proposal.proposalType === ProposalType.Confirmation"
          class="btn btn-outline"
          :disabled="txPending || postponementBlocked?.(proposal)"
          :title="postponementBlocked?.(proposal) ? t('governance.dao.postponeMaxReached', { max: maxPostponements }) : ''"
          @click.stop="emit('vote', proposal.id, VoteChoice.Postpone)"
        >
          {{ t('governance.dao.postpone') }}
        </button>
      </template>
      <p v-else-if="role === 'wolf' && now !== undefined && Number(proposal.deadline) > now && isTargetInConflict?.(proposal)" class="gv-card-note">
        {{ t('governance.dao.inConflictNote') }}
      </p>
      <button v-else-if="now !== undefined && Number(proposal.deadline) <= now" class="btn btn-outline" :disabled="txPending" @click.stop="emit('execute', proposal.id)">
        {{ t('governance.dao.execute') }}
      </button>
    </div>
  </article>
</template>

<style lang="scss" scoped>
.mono {
  font-family: $font-mono;
}

.gv-card-note {
  color: $color-text-dim;
  font-size: $fs-caption;
}

// Dense, ledger-like row: one grid structure for both "ongoing" and
// "past" modes, reflowing to stacked areas under 700px instead of a
// second, separately-maintained mobile card markup.
.gv-prop-row {
  display: grid;
  grid-template-columns: 130px 1fr 150px;
  grid-template-areas:
    "type title status"
    "type title actions";
  align-items: start;
  gap: $space-2 $space-3;
  background: $color-card-bg;
  border: 1px solid $color-border;
  border-radius: $radius-md;
  padding: $space-3 $space-4;
  cursor: pointer;
  transition: border-color 0.15s ease;

  &:hover,
  &:focus-visible { border-color: $color-orange-dark; }
  &:focus-visible { outline: none; }
}

@media (max-width: 700px) {
  .gv-prop-row {
    grid-template-columns: 1fr;
    grid-template-areas:
      "type"
      "title"
      "status"
      "actions";
  }
}

.gv-prop-row--selected { border-color: $color-orange-dark; box-shadow: inset 0 0 0 1px $color-orange-dark; }

// Ledger row, not an elevated card: a colored left border marks a past
// proposal's outcome instead of a tinted background — keeps text readable
// (a pale red/green background degraded contrast) and reads at a glance
// while scanning a long list of rows.
.gv-prop-row {
  &--approved { border-left: 3px solid $color-success; }
  &--rejected { border-left: 3px solid $color-danger; }
  &--quorum { border-left: 3px solid $color-quorum; }
  &--postponed { border-left: 3px solid $color-cub; }
}

.gv-prop-statut {
  font-size: $fs-caption;
  font-weight: 600;

  &--approved { color: $color-success; }
  &--rejected { color: $color-danger; }
  &--quorum { color: $color-quorum; }
  &--postponed { color: $color-cub; }
}

.gv-prop-row-type { grid-area: type; display: flex; flex-direction: column; gap: $space-1; }
.gv-prop-row-title { grid-area: title; min-width: 0; }
.gv-prop-row-status { grid-area: status; text-align: right; }
.gv-prop-row-actions { grid-area: actions; display: flex; justify-content: flex-end; gap: $space-2; flex-wrap: wrap; }

@media (max-width: 700px) {
  .gv-prop-row-status,
  .gv-prop-row-actions { text-align: left; justify-content: flex-start; }
}

.gv-prop-type { font-size: $fs-caption; font-weight: 600; color: $color-orange-dark; text-transform: uppercase; letter-spacing: 0.03em; }
.gv-prop-deadline { font-size: $fs-caption; font-family: $font-mono; color: $color-text-dim; }
.gv-prop-title { font-size: $fs-h4; font-weight: 600; color: $color-black; margin: 0 0 $space-2; }
.gv-discord-warning {
  font-size: $fs-caption;
  color: $color-orange-dark;
  margin: -#{$space-1} 0 $space-2;
}
.gv-prop-author { font-size: $fs-caption; color: $color-text-dim; text-transform: none; font-weight: 400; }
.gv-vote-line {
  display: flex;
  gap: $space-4;
  flex-wrap: wrap;
  font-size: $fs-body;
  font-family: $font-mono;
  font-weight: 500;
  color: $color-black;
  margin-bottom: $space-1;
}
.gv-vote-count {
  display: inline-flex;
  align-items: center;
  gap: $space-1;

  &--pour svg { color: $color-success; }
  &--contre svg { color: $color-danger; }
  &--ajourner svg { color: $color-quorum; }
}
.gv-quorum-line {
  font-size: $fs-caption;
  font-family: $font-mono;
  color: $color-text-dim;

  span[title] { cursor: help; }
}
</style>
