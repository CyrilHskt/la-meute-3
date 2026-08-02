<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { ProposalType, VoteChoice, type Proposal } from "../../composables/useMeute";
import AddressChip from "./AddressChip.vue";
import ProposalDetail from "./ProposalDetail.vue";

const { t } = useI18n();

const props = defineProps<{
  proposal: Proposal;
  mode: "ongoing" | "past";
  expanded?: boolean;
  typeLabels: string[];
  authorKnown: (p: Proposal) => boolean;
  proposalPrefix: (p: Proposal) => string;
  quorumTooltip: (p: Proposal) => string;
  requiredQuorum: (p: Proposal) => number;
  // Derived from `deadline - VOTE_DURATION`, not stored on-chain as such
  // (the contract only keeps the vote's end date) — provided by the parent
  // since VOTE_DURATION is read once there rather than per-proposal here.
  proposedAt?: (p: Proposal) => string;
  // "ongoing" mode only
  applicationWithoutDiscord?: (p: Proposal) => boolean;
  countdown?: (p: Proposal) => string;
  exactDate?: (p: Proposal) => string;
  role?: "wolf" | "cub" | "visitor";
  now?: number;
  txPending?: boolean;
  isTargetInConflict?: (p: Proposal) => boolean;
  hasVoted?: (p: Proposal) => boolean;
  postponementBlocked?: (p: Proposal) => boolean;
  maxPostponements?: number;
  // "past" mode only
  pastStatus?: (p: Proposal) => string;
  pastStatusLabels?: Record<string, string>;
}>();

const emit = defineEmits<{
  vote: [id: bigint, choice: number];
  execute: [id: bigint];
  toggleDetail: [id: bigint];
}>();

// Every proposal type now has something to reveal in the accordion (the
// proposed date and the Discord link, moved out of the default view —
// see gov-6 simplification), so the toggle is no longer Expense-only.
const detailRegionId = computed(() => `gv-detail-${props.proposal.id}`);

// Postpone counts toward participation for a Confirmation vote the whole
// time it's open, not just once it's closed (Meute.sol, _executeConfirmation:
// `total = approveVotes + rejectVotes + postponeVotes` feeds the same
// quorum check regardless of when it's read) — gating this on `mode ===
// 'past'` under-counted an ongoing vote's real participation (observed:
// "0 vote sur 2" shown right after a Postpone vote had actually landed).
const castVotes = computed(
  () =>
    props.proposal.approveVotes +
    props.proposal.rejectVotes +
    (props.proposal.proposalType === ProposalType.Confirmation ? props.proposal.postponeVotes : 0),
);

// "X vote(s) sur Y nécessaire(s)" has two independent grammatical
// agreements — "vote(s)" agrees with `cast`, "nécessaire(s)" agrees with
// `required` — not the same count, so vue-i18n's single-choice plural
// mechanism (which picks ONE form for the whole sentence) can't express
// it correctly. Each word is resolved on its own here instead.
const quorumLineText = computed(() => {
  const cast = castVotes.value;
  const required = props.requiredQuorum(props.proposal);
  return t('governance.dao.quorumLine', {
    cast,
    castWord: t(cast <= 1 ? 'governance.dao.voteWordSingular' : 'governance.dao.voteWordPlural'),
    required,
    requiredWord: t(required <= 1 ? 'governance.dao.necessaryWordSingular' : 'governance.dao.necessaryWordPlural'),
  });
});

const quorumTitle = computed(
  () =>
    `${props.quorumTooltip(props.proposal)}\n\n${t('governance.dao.quorumDetail', {
      cast: castVotes.value,
      required: props.requiredQuorum(props.proposal),
      total: props.proposal.activeSnapshot,
    })}`,
);

const proposalTypeIcons: Partial<Record<number, string>> = {
  [ProposalType.Admission]: "/img/illustrations/motif-admission-gate.png",
  [ProposalType.Confirmation]: "/img/illustrations/motif-confirmation-arrow.png",
  [ProposalType.Exclusion]: "/img/illustrations/motif-exclusion.png",
  [ProposalType.Expense]: "/img/illustrations/motif-treasury-bag.png",
};

const proposalTypeIcon = computed(() => proposalTypeIcons[props.proposal.proposalType]);
</script>

<template>
  <article
    class="gv-prop-card"
    :class="[
      mode === 'past' && props.pastStatus ? `gv-prop-card--${props.pastStatus(proposal)}` : undefined,
      { 'gv-prop-card--expanded': expanded },
    ]"
  >
    <div class="gv-prop-card-icon" :class="{ 'gv-prop-card-icon--empty': !proposalTypeIcon }">
      <img
        v-if="proposalTypeIcon"
        :src="proposalTypeIcon"
        :alt="typeLabels[proposal.proposalType]"
        class="gv-prop-card-icon-img"
      />
    </div>

    <div class="gv-prop-card-body">
      <p class="gv-prop-title">
        {{ proposalPrefix(proposal) }} <AddressChip :address="proposal.target" short />
      </p>

      <p
        v-if="mode === 'ongoing' && applicationWithoutDiscord?.(proposal)"
        class="gv-discord-warning"
        :title="t('governance.dao.discordMissingTooltip')"
      >
        {{ t('governance.dao.discordMissingWarning') }}
      </p>

      <button
        type="button"
        class="gv-detail-toggle"
        :aria-expanded="!!expanded"
        :aria-controls="detailRegionId"
        @click="emit('toggleDetail', proposal.id)"
      >
        <svg class="gv-detail-toggle-chevron" :class="{ 'gv-detail-toggle-chevron--expanded': expanded }" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 6l4 4 4-4" />
        </svg>
        {{ expanded ? t('governance.dao.lessDetails') : t('governance.dao.moreDetails') }}
      </button>

      <div class="gv-prop-card-detail-wrapper" :class="{ 'gv-prop-card-detail-wrapper--expanded': expanded }">
        <div class="gv-prop-card-detail-inner">
          <div :id="detailRegionId" role="region" :aria-label="t('governance.dao.moreDetails')" class="gv-prop-card-detail">
            <ProposalDetail :proposal="proposal" :proposed-at="proposedAt?.(proposal)" :author-known="authorKnown" />
          </div>
        </div>
      </div>
    </div>

    <div class="gv-prop-card-middle">
      <span v-if="mode === 'ongoing' && countdown && exactDate" class="gv-prop-deadline mono" :title="exactDate(proposal)">{{ countdown(proposal) }}</span>
      <span v-else-if="pastStatus && pastStatusLabels" class="gv-prop-statut" :class="`gv-prop-statut--${pastStatus(proposal)}`">
        {{ pastStatusLabels[pastStatus(proposal)] }}
      </span>

      <div class="gv-vote-line">
        <span class="gv-vote-count gv-vote-count--pour" :title="t('governance.dao.votesApprove', { count: proposal.approveVotes })">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" /></svg>
          {{ proposal.approveVotes }}
        </span>
        <span class="gv-vote-count gv-vote-count--contre" :title="t('governance.dao.votesReject', { count: proposal.rejectVotes })">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          {{ proposal.rejectVotes }}
        </span>
        <span v-if="proposal.proposalType === ProposalType.Confirmation" class="gv-vote-count gv-vote-count--ajourner" :title="t('governance.dao.votesPostpone', { count: proposal.postponeVotes })">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path d="M4 2h8M4 14h8M5 2c0 3 2.5 3.6 3 4.5.5-.9 3-1.5 3-4.5M5 14c0-3 2.5-3.6 3-4.5.5.9 3 1.5 3 4.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          {{ proposal.postponeVotes }}
        </span>
      </div>
      <div class="gv-quorum-line">
        <span :title="quorumTitle">{{ quorumLineText }}</span>
      </div>
    </div>

    <div v-if="mode === 'ongoing'" class="gv-prop-card-actions">
      <template v-if="role === 'wolf' && now !== undefined && Number(proposal.deadline) > now && !isTargetInConflict?.(proposal)">
        <button
          class="btn btn-primary"
          :disabled="txPending || hasVoted?.(proposal)"
          :title="hasVoted?.(proposal) ? t('errors.alreadyVoted') : ''"
          @click.stop="emit('vote', proposal.id, VoteChoice.Approve)"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" /></svg>
          {{ t('governance.dao.approve') }}
        </button>
        <button
          class="btn btn-outline-danger"
          :disabled="txPending || hasVoted?.(proposal)"
          :title="hasVoted?.(proposal) ? t('errors.alreadyVoted') : ''"
          @click.stop="emit('vote', proposal.id, VoteChoice.Reject)"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          {{ t('governance.dao.reject') }}
        </button>
        <button
          v-if="proposal.proposalType === ProposalType.Confirmation"
          class="btn btn-outline"
          :disabled="txPending || hasVoted?.(proposal) || postponementBlocked?.(proposal)"
          :title="hasVoted?.(proposal) ? t('errors.alreadyVoted') : postponementBlocked?.(proposal) ? t('governance.dao.postponeMaxReached', { max: maxPostponements }) : ''"
          @click.stop="emit('vote', proposal.id, VoteChoice.Postpone)"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path d="M4 2h8M4 14h8M5 2c0 3 2.5 3.6 3 4.5.5-.9 3-1.5 3-4.5M5 14c0-3 2.5-3.6 3-4.5.5.9 3 1.5 3 4.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          {{ t('governance.dao.postpone') }}
        </button>
      </template>
      <p v-else-if="role === 'wolf' && now !== undefined && Number(proposal.deadline) > now && isTargetInConflict?.(proposal)" class="gv-card-note">
        {{ t('governance.dao.inConflictNote') }}
      </p>
      <button v-else-if="now !== undefined && Number(proposal.deadline) <= now" class="btn btn-outline" :disabled="txPending" @click.stop="emit('execute', proposal.id)">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 2 4 9h3l-1 5 6-8H8l1-4z" stroke-linejoin="round" /></svg>
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

// Horizontal card: a reserved icon slot, the socle common to every
// proposal type (badge/title/votes/quorum), a countdown/status column,
// then a stacked actions column — reflowing to stacked areas under
// 700px instead of a second, separately-maintained mobile card markup.
.gv-prop-card {
  display: grid;
  grid-template-columns: 124px 1fr 220px 170px;
  grid-template-areas: "icon body middle actions";
  // Was `stretch`: every column matched the tallest one (the 160px
  // icon) and its content sat pinned at the top of that tall cell,
  // reading as "crammed at the top with dead space below" for any
  // proposal whose default body content is short (most types, after
  // moving the date/Discord line into the accordion). Centering lets
  // each column's own content set its visual middle instead.
  align-items: center;
  gap: $space-2 $space-3;
  background: $color-card-bg;
  border: 1px solid $color-border;
  border-radius: $radius-md;
  padding: $space-3 $space-4;
  transition: border-color 0.15s ease;
}

@container (max-width: 700px) {
  .gv-prop-card {
    grid-template-columns: auto 1fr;
    grid-template-areas:
      "icon body"
      "middle middle"
      "actions actions";
  }

  // The 160px desktop icon spanning all 3 stacked rows ate close to half
  // of a phone-width card (verified against a 375px viewport) and pushed
  // "APPROUVER"/"REJETER" into overflow — shrunk to a small badge next to
  // the title row only, matching the reserved-icon-slot idea without
  // the desktop illustration's real estate.
  .gv-prop-card-icon {
    width: 64px;
    height: 64px;
  }

  .gv-prop-card-body {
    border-left: none;
    padding-left: 0;
  }
}

.gv-prop-card--expanded { border-color: $color-orange-dark; }

// Ledger row, not an elevated card: a colored left border marks a past
// proposal's outcome instead of a tinted background — keeps text readable
// (a pale red/green background degraded contrast) and reads at a glance
// while scanning a long list of rows.
.gv-prop-card {
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

// Falls back to a neutral empty square (background only, no image) for
// proposal types without a dedicated illustration yet (e.g. future polls).
.gv-prop-card-icon {
  grid-area: icon;
  width: 124px;
  height: 124px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gv-prop-card-icon--empty {
  background: $color-border;
}

.gv-prop-card-icon-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

// `align-self: stretch` on both: the grid's own `align-items: center`
// (set so short content doesn't sit pinned at the top of a tall row) also
// shrinks a column's box to its content height by default — which cut the
// border-left divider short, making it look like a stray fragment instead
// of a full-height separator. Stretching the box back to the full row
// height keeps the divider intact, while `justify-content: center` inside
// re-centers the actual content within that taller box.
.gv-prop-card-body {
  grid-area: body;
  min-width: 0;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  justify-content: center;
  border-left: 1px solid $color-border;
  padding-left: $space-4;
}
.gv-prop-card-middle {
  grid-area: middle;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: $space-1;
  text-align: right;
  border-left: 1px solid $color-border;
  padding-left: $space-4;
}
.gv-prop-card-actions {
  grid-area: actions;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: $space-2;
}

.gv-detail-toggle {
  display: inline-flex;
  align-items: center;
  gap: $space-1;
  margin-top: $space-1;
  background: none;
  border: none;
  padding: 0;
  color: $color-orange-dark;
  font-size: $fs-caption;
  font-family: $font-mono;
  cursor: pointer;

  &:hover { text-decoration: underline; }
}
.gv-detail-toggle-chevron {
  transition: transform 0.15s ease;

  &--expanded { transform: rotate(180deg); }
}

// Grid-rows trick (0fr -> 1fr) instead of measuring the content's real
// height in JS: `overflow: hidden` on the inner wrapper clips the content
// while its track is 0fr, no ResizeObserver/refs needed.
.gv-prop-card-detail-wrapper {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.2s ease;

  &--expanded { grid-template-rows: 1fr; }
}
.gv-prop-card-detail-inner {
  overflow: hidden;
}
.gv-prop-card-detail {
  padding-top: $space-2;
}

@container (max-width: 700px) {
  .gv-prop-card-middle {
    text-align: left;
    align-items: flex-start;
    border-left: none;
    padding-left: 0;
  }

  .gv-prop-card-actions {
    align-items: flex-start;
  }

  .gv-vote-line { justify-content: flex-start; }
}

.gv-prop-deadline { font-size: $fs-caption; font-family: $font-mono; color: $color-text-dim; }
.gv-prop-title {
  font-size: $fs-card-title;
  font-weight: 700;
  color: $color-orange-dark;
  margin: 0 0 $space-1;
  max-width: 70ch;

  // AddressChip fixes its own font-size ($fs-caption) and inherits text
  // color for its username/mono fallback — sized/tinted right for its
  // usual inline-in-a-caption contexts, but too small and wrongly orange
  // once nested inside this heading. Reset both, scoped to this title
  // only, so every other AddressChip usage elsewhere stays untouched.
  :deep(.addr-chip) {
    font-size: $fs-h4;
  }
  :deep(.addr-username),
  :deep(.mono) {
    color: $color-black;
  }
}
.gv-discord-warning {
  font-size: $fs-caption;
  color: $color-orange-dark;
  margin: 0 0 $space-2;
}
.gv-vote-line {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-end;
  gap: $space-1;
  font-size: $fs-caption;
  font-family: $font-mono;
  font-weight: 500;
  color: $color-black;
  margin-bottom: $space-1;
}
// The separator lives on the count itself (not a sibling span) so a
// wrap break always falls between two whole "icon + count" groups —
// never leaves a dangling "·" alone at the end of a line (observed with
// a standalone separator span in a narrow column).
.gv-vote-count:not(:last-child)::after {
  content: "·";
  margin-left: $space-1;
  color: $color-text-dim;
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
  max-width: 70ch;

  span[title] { cursor: help; }
}
</style>
