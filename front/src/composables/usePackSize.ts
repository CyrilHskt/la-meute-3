import { ref } from "vue";

// Placeholder pending issue #99: the contract doesn't expose public
// totalWolves()/totalCubs() getters yet, so there's nothing to read from
// chain here. Once #99 ships (Solidity change + redeploy), this composable
// becomes the only place to touch — call
// readOnlyContract().read.totalWolves() / .read.totalCubs() here and
// GovernanceAssociation.vue keeps rendering whatever comes out, "—" or a
// real number, without any template change.
const totalWolves = ref<number | null>(null);
const totalCubs = ref<number | null>(null);

export function usePackSize() {
  return { totalWolves, totalCubs };
}
