// Canonical shape of the governance snapshot — the JSON the indexer
// publishes into Netlify Blobs and the front consumes.
//
// It used to be declared four independent times (scripts/sync-dao.js,
// netlify/functions/dao-sync.mts, useMeute.ts, demo/actions.js), so adding
// a field meant remembering four places with nothing to catch a miss. The
// two TypeScript sides now share this module; the two producers written in
// plain JS (the indexer and the demo) can't import a type, so they carry a
// pointer back here instead.
//
// Everything a contract returns as uint256 travels as a decimal string:
// JSON has no bigint, and going through Number would silently lose wei.
import type { Address } from "viem";

export interface SnapshotProposal {
  id: string;
  proposalType: number;
  target: Address;
  // Never in the on-chain struct, only in the ProposalOpened event — the
  // zero address stands for "opening never seen by the indexer".
  author: Address;
  deadline: string;
  activeSnapshot: number;
  snapshotFrozen: boolean;
  executed: boolean;
  approveVotes: number;
  rejectVotes: number;
  postponeVotes: number;
  amount: string;
  reason: string;
}

export interface MemberActivity {
  votesSubmitted: number;
  openProposals: number;
}

export interface DaoSnapshot {
  updatedAt: string | null;
  lastBlock: string;
  stats: {
    treasuryWei: string;
    activeWolves: number;
    dormantWolves: number;
    cubs: number;
    votesCast: number;
    openProposals: number;
  };
  // Read live by the indexer rather than hardcoded (see sync-dao.js's
  // DORMANCY_DELAY comment) — the front reads these from here instead of
  // live-calling the chain on every page mount, for every visitor.
  config: {
    feeWei: string;
    dormancyDelaySeconds: number;
    maxPostponements: number;
    voteDurationSeconds: number;
    now: number;
  };
  proposals: SnapshotProposal[];
  memberActivity: Record<string, MemberActivity>;
  // _hasVoted is private on the contract (no getter) — rebuilt off-chain
  // from VoteCast events by the indexer, same principle as memberActivity
  // just above. Keyed by lowercased voter address, values are proposal ids.
  votedProposalsByVoter: Record<string, string[]>;
  topDonors: { address: Address; total: string }[];
  members: { address: Address; rank: number; dormant: boolean }[];
}

/** What a reader gets before the indexer has ever published anything —
 *  every collection empty rather than absent, so no consumer has to guard
 *  against a missing field. */
export const EMPTY_SNAPSHOT: DaoSnapshot = {
  updatedAt: null,
  lastBlock: "0",
  stats: {
    treasuryWei: "0",
    activeWolves: 0,
    dormantWolves: 0,
    cubs: 0,
    votesCast: 0,
    openProposals: 0,
  },
  config: {
    feeWei: "0",
    dormancyDelaySeconds: 0,
    maxPostponements: 0,
    voteDurationSeconds: 0,
    now: 0,
  },
  proposals: [],
  memberActivity: {},
  votedProposalsByVoter: {},
  topDonors: [],
  members: [],
};
