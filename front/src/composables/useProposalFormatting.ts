import { computed } from "vue";
import { zeroAddress } from "viem";
import { ProposalType, type Proposal } from "./useMeute";

type Translate = (key: string, params?: Record<string, unknown>) => string;

// Two conditions, like in the contract (Meute.sol, _isPassed): a
// participation quorum (75% of the active Wolves at snapshot time must
// have voted, yes or no), then "yes" must exceed "no" among the votes
// cast — not a simple "yes" threshold against the active count.
//
// Sole front-side definition: every component goes through this composable
// rather than recomputing the ratio. Two copies remain outside TypeScript
// and can't be shared away — Meute.sol (_quorumReached, the authority) and
// scripts/sync-dao.js (requiredQuorum, for the Discord message). All three
// must move together.
const QUORUM_NUM = 3;
const QUORUM_DEN = 4;

// Visual status of a past proposal — Confirmation has 3 possible outcomes
// (see Meute.sol, _executeConfirmation): quorum there is computed on
// for+against+postpone (not just for+against), and "postponed" is
// neither a success nor a failure — the Cub gets another chance.
export type PastProposalStatus = "approved" | "rejected" | "quorum" | "postponed";

export function useProposalFormatting(t: Translate) {
  const typeLabels = computed(() => [
    t('governance.dao.typeAdmission'),
    t('governance.dao.typeConfirmation'),
    t('governance.dao.typeExclusion'),
    t('governance.dao.typeExpense'),
  ]);

  // The author isn't in the on-chain struct (only in the ProposalOpened
  // event) — an entry whose author was never captured (e.g. refreshProposal
  // without local history) falls back to the zero address, no point
  // displaying "opened by 0x000...000".
  function authorKnown(p: Proposal): boolean {
    return p.author.toLowerCase() !== zeroAddress;
  }

  function proposalPrefix(p: Proposal): string {
    switch (p.proposalType) {
      case ProposalType.Admission:
        return t('governance.dao.prefixAdmission');
      case ProposalType.Confirmation:
        return t('governance.dao.prefixConfirmation');
      case ProposalType.Exclusion:
        return t('governance.dao.prefixExclusion');
      default:
        return t('governance.dao.prefixExpense');
    }
  }

  const PAST_STATUS_LABELS = computed<Record<PastProposalStatus, string>>(() => ({
    approved: t('governance.dao.statusApproved'),
    rejected: t('governance.dao.statusRejected'),
    quorum: t('governance.dao.statusQuorum'),
    postponed: t('governance.dao.statusPostponed'),
  }));

  /** Smallest number of votes that reaches the quorum — the inverse of
   *  `cast * DEN > snapshot * NUM`, shown as "X votes out of Y needed".
   *  Independent of the proposal type: which votes count toward `cast`
   *  varies (postponements only count for a Confirmation, see
   *  ProposalCard.vue), the threshold itself doesn't. */
  function requiredQuorum(p: Proposal): number {
    return Math.floor((p.activeSnapshot * QUORUM_NUM) / QUORUM_DEN) + 1;
  }

  function pastStatus(p: Proposal): PastProposalStatus {
    const isConfirmation = p.proposalType === ProposalType.Confirmation;
    const cast = p.approveVotes + p.rejectVotes + (isConfirmation ? p.postponeVotes : 0);
    const quorumOk = cast * QUORUM_DEN > p.activeSnapshot * QUORUM_NUM;
    if (!quorumOk) return "quorum";

    if (isConfirmation) {
      if (p.approveVotes > p.rejectVotes && p.approveVotes > p.postponeVotes) return "approved";
      if (p.rejectVotes > p.approveVotes && p.rejectVotes > p.postponeVotes) return "rejected";
      return "postponed";
    }
    return p.approveVotes > p.rejectVotes ? "approved" : "rejected";
  }

  return { typeLabels, authorKnown, proposalPrefix, PAST_STATUS_LABELS, pastStatus, requiredQuorum };
}
