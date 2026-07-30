<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { ProposalType, VoteChoice, type Proposal } from "../../composables/useMeute";
import AddressChip from "./AddressChip.vue";

const { t } = useI18n();

const props = defineProps<{
  proposal: Proposal;
  mode: "ongoing" | "past";
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
}>();
</script>

<template>
  <article
    class="gv-prop-card"
    :class="mode === 'past' && props.pastStatus ? `gv-prop-card--${props.pastStatus(proposal)}` : undefined"
  >
    <div class="gv-prop-head">
      <span class="gv-prop-head-left">
        <span class="gv-prop-type">{{ typeLabels[proposal.proposalType] }}</span>
        <span v-if="authorKnown(proposal)" class="gv-prop-author">
          {{ t('governance.dao.by') }} <AddressChip :address="proposal.author" short />
        </span>
      </span>
      <span v-if="mode === 'ongoing' && countdown && exactDate" class="gv-prop-deadline mono" :title="exactDate(proposal)">{{ countdown(proposal) }}</span>
      <span v-else-if="pastStatus && pastStatusLabels" class="gv-prop-statut" :class="`gv-prop-statut--${pastStatus(proposal)}`">
        {{ pastStatusLabels[pastStatus(proposal)] }}
      </span>
    </div>
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
    <div v-if="mode === 'ongoing'" class="gv-prop-actions">
      <template v-if="role === 'wolf' && now !== undefined && Number(proposal.deadline) > now && !isTargetInConflict?.(proposal)">
        <button class="btn btn-primary" :disabled="txPending" @click="emit('vote', proposal.id, VoteChoice.Approve)">{{ t('governance.dao.approve') }}</button>
        <button class="btn btn-outline-danger" :disabled="txPending" @click="emit('vote', proposal.id, VoteChoice.Reject)">{{ t('governance.dao.reject') }}</button>
        <button
          v-if="proposal.proposalType === ProposalType.Confirmation"
          class="btn btn-outline"
          :disabled="txPending || postponementBlocked?.(proposal)"
          :title="postponementBlocked?.(proposal) ? t('governance.dao.postponeMaxReached', { max: maxPostponements }) : ''"
          @click="emit('vote', proposal.id, VoteChoice.Postpone)"
        >
          {{ t('governance.dao.postpone') }}
        </button>
      </template>
      <p v-else-if="role === 'wolf' && now !== undefined && Number(proposal.deadline) > now && isTargetInConflict?.(proposal)" class="gv-card-note">
        {{ t('governance.dao.inConflictNote') }}
      </p>
      <button v-else-if="now !== undefined && Number(proposal.deadline) <= now" class="btn btn-outline" :disabled="txPending" @click="emit('execute', proposal.id)">
        {{ t('governance.dao.execute') }}
      </button>
    </div>
  </article>
</template>
