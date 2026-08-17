// A proposal's author only ever exists in the ProposalOpened event, never
// in the on-chain struct read back by `proposal(id)` — so, unlike every
// other field of the snapshot, it can't simply be reread. It used to be
// copied from the browser's request body, which made the displayed author
// of any proposal forgeable by anyone until the next indexer pass.
//
// It is now decoded server-side, out of the receipt of the very
// transaction that opened the proposal. Kept here, away from the HTTP
// handler and any RPC client, so the decoding itself stays a pure function
// over logs — testable without a chain.

import { decodeEventLog, type Address, type Hex } from "viem";
import { CONTRACT_ABI } from "../../../src/contract.js";

export interface EventLog {
  address: string;
  data: Hex;
  topics: [] | [signature: Hex, ...args: Hex[]];
}

/** The author announced by the ProposalOpened log of `proposalId`, or null
 *  if these logs contain no such event — a vote or an execution, a
 *  transaction that opened a different proposal, or logs emitted by
 *  another contract entirely. Never throws on unrelated logs: a single
 *  transaction routinely emits several (a card mint alongside an
 *  admission, for instance). */
export function authorFromLogs(logs: readonly EventLog[], proposalId: string, contractAddress: string): Address | null {
  for (const log of logs) {
    if (log.address.toLowerCase() !== contractAddress.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: CONTRACT_ABI, data: log.data, topics: log.topics });
      if (decoded.eventName !== "ProposalOpened") continue;
      const args = decoded.args as unknown as { proposalId: bigint; author: Address };
      if (args.proposalId.toString() === proposalId) return args.author;
    } catch {
      // Log from an event this ABI doesn't describe — keep going.
    }
  }
  return null;
}
