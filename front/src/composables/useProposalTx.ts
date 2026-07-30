import { ref, type Ref } from "vue";
import { decodeEventLog, type Address, type Log, type PublicClient } from "viem";
import { CONTRACT_ABI } from "../contract";
import { friendlyContractError } from "./contractErrors";
import type { Proposal } from "./useMeute";

/** Runs a proposal-affecting transaction (create/vote/execute) and keeps the
 *  local + shared (Netlify Blobs) snapshots in sync afterward. See
 *  netlify/functions/dao-sync.mts for the shared-snapshot side. */
export function useProposalTx(deps: {
  publicClient: PublicClient;
  proposals: Readonly<Ref<readonly Proposal[]>>;
  refreshProposal: (id: bigint, author?: Address) => Promise<unknown>;
  loadAll: () => Promise<unknown>;
  refreshMembership: () => Promise<unknown>;
  loadBalance: () => Promise<unknown>;
  loadMyDonations: (address: Address | null) => Promise<unknown>;
  address: Ref<Address | null>;
  showToast: (message: string) => void;
  now: Ref<number>;
  t: (key: string, params?: Record<string, unknown>) => string;
}) {
  const txError = ref<string | null>(null);
  const txPending = ref(false);

  // A revert during simulation is caught before ever sending the
  // transaction — letting gas estimation fail silently and surface a
  // generic, unrelated RPC message (observed locally: "gas limit exceeds
  // cap"). A transaction that *creates* a proposal (application,
  // confirmation, exclusion, expense) only gets its id once mined —
  // impossible to know it ahead of time like for voting/executing. It's
  // already there, though, in the receipt's events: we decode the receipt
  // looking for a ProposalOpened to extract the id.
  function extractCreatedProposal(logs: readonly Log[]): { id: bigint; author: Address } | undefined {
    for (const log of logs) {
      try {
        const decoded = decodeEventLog({ abi: CONTRACT_ABI, data: log.data, topics: log.topics });
        if (decoded.eventName === "ProposalOpened") {
          const args = decoded.args as { proposalId: bigint; author: Address };
          return { id: args.proposalId, author: args.author };
        }
      } catch {
        // Log from another event (e.g. Transfer from the card mint on an
        // admission) — not the one we're looking for, keep going.
      }
    }
    return undefined;
  }

  // Reflects the action onto the *shared* snapshot (Netlify Blobs) right
  // away, so other members see it without waiting for the job's next pass
  // (up to 5 min). Never blocks the local display nor fails the transaction
  // if this call fails — the fallback job will catch up eventually anyway.
  // See netlify/functions/dao-sync.mts.
  async function patchProposalRemote(id: bigint) {
    const p = deps.proposals.value.find((existing) => existing.id === id);
    if (!p) return;
    try {
      await fetch("/.netlify/functions/dao-sync?key=patch-proposal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalId: id.toString(), author: p.author }),
      });
    } catch {
      // Best-effort — see comment above.
    }
  }

  async function runTx(
    simulateFn: () => Promise<unknown>,
    writeFn: () => Promise<`0x${string}`>,
    // Message shown as a toast once the transaction is confirmed — each
    // caller specifies its own to stay specific to the action.
    successMessage: string,
    // Known ahead of time for voting/executing (the id already exists) —
    // rereads this specific proposal live instead of reloading the whole
    // snapshot (see useMeute.ts). Without an id, the transaction just
    // *created* a proposal: its id and author are extracted from the
    // receipt, see extractCreatedProposal — the author only exists in the
    // event, never in the on-chain struct reread by refreshProposal.
    knownProposalId?: bigint,
  ) {
    txError.value = null;
    txPending.value = true;
    try {
      await simulateFn();
      const hash = await writeFn();
      const receipt = await deps.publicClient.waitForTransactionReceipt({ hash });
      const created = knownProposalId === undefined ? extractCreatedProposal(receipt.logs) : undefined;
      const affectedId = knownProposalId ?? created?.id;
      await Promise.all([
        affectedId !== undefined ? deps.refreshProposal(affectedId, created?.author) : deps.loadAll(),
        deps.refreshMembership(),
        deps.loadBalance(),
        deps.loadMyDonations(deps.address.value),
      ]);
      if (affectedId !== undefined) await patchProposalRemote(affectedId);
      deps.now.value = Number((await deps.publicClient.getBlock()).timestamp);
      deps.showToast(successMessage);
    } catch (e) {
      txError.value = friendlyContractError(e, deps.t);
    } finally {
      txPending.value = false;
    }
  }

  return { txError, txPending, runTx };
}
