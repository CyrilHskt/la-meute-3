<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useGuidedTour } from "../../composables/useGuidedTour";
import { decodeEventLog, formatEther, parseEther, type Address, type Log } from "viem";
import { driver } from "driver.js";
import { useWallet } from "../../composables/useWallet";
import { useMeute, ProposalType, VoteChoice, type Proposal } from "../../composables/useMeute";
import { useEthPrice } from "../../composables/useEthPrice";
import { friendlyContractError } from "../../composables/contractErrors";
import { useToast } from "../../composables/useToast";
import { useDiscordLink } from "../../composables/useDiscordLink";
import { useLocalAutoRefresh } from "../../composables/useLocalAutoRefresh";
import { CONTRACT_ABI } from "../../contract";
import AddressChip from "./AddressChip.vue";
import ApplicationChecklist from "./ApplicationChecklist.vue";
import MemberPicker from "./MemberPicker.vue";
import WalletInstallModal from "./WalletInstallModal.vue";
import DiscordConsentModal from "./DiscordConsentModal.vue";

const { address, wrongNetwork, connect, readOnlyContract, writableContract, publicClient } = useWallet();
const {
  stats,
  proposals,
  memberActivity,
  topDonors,
  members,
  myDonations,
  loading,
  error,
  isAuthorized,
  loadAll,
  verifyMembershipAndLoad,
  refreshProposal,
  loadMyDonations,
} = useMeute();
const { eurPerEth } = useEthPrice();
const { showToast } = useToast();
const { discordLinkFor, requestDiscordLink, unlinkDiscord, consumeDiscordCallbackParam } = useDiscordLink();
const unlinkPending = ref(false);
async function onUnlinkDiscord() {
  if (!address.value) return;
  unlinkPending.value = true;
  try {
    await unlinkDiscord(address.value);
    showToast("Compte Discord délié.");
  } catch (e) {
    showToast("Échec du déliage, réessaie.", "error");
  } finally {
    unlinkPending.value = false;
  }
}

const txError = ref<string | null>(null);
const txPending = ref(false);

const role = ref<"visitor" | "cub" | "wolf">("visitor");
const card = ref<{ rank: number; lastActivity: number; postponements: number } | null>(null);
const fee = ref<bigint>(0n);
const cardImage = ref<string | null>(null);
// The browser's clock has nothing to do with the chain's clock once you
// manipulate time on a local node (evm_increaseTime): we read the
// timestamp of the latest block rather than Date.now().
const now = ref(0);

// Read from the chain, never hardcoded here — a delay hardcoded to 365
// days (1 year) had ended up silently diverging from the contract's real
// DORMANCY_DELAY (180 days), showing "Active" for a Wolf who was actually
// dormant and hiding the "Wake up" button for 6 months.
const dormancyDelay = ref(180 * 24 * 60 * 60);
// Same: read from the chain on mount, never hardcoded (see the "/2" below
// that still was).
const maxPostponements = ref(2);

const myDiscord = computed(() => discordLinkFor(address.value));

// Count of postponements already used by the target of a Confirmation —
// not exposed by the indexed snapshot (which describes proposals, not the
// detail of each targeted member), so read live for the relevant
// proposals. Once MAX_POSTPONEMENTS is reached, the contract refuses
// Postpone (InvalidChoice): better to gray out the button with an
// explanation than let the user hit a revert (observed).
const postponementsByTarget = ref<Map<string, number>>(new Map());
async function loadConfirmationPostponements() {
  const targets = new Set(
    proposals.value
      .filter((p) => p.proposalType === ProposalType.Confirmation && !p.executed)
      .map((p) => p.target.toLowerCase()),
  );
  for (const target of targets) {
    if (postponementsByTarget.value.has(target)) continue;
    const c = (await readOnlyContract().read.card([target as Address])) as { postponements: number };
    postponementsByTarget.value.set(target, Number(c.postponements));
  }
}
function postponementBlocked(p: Proposal): boolean {
  return (postponementsByTarget.value.get(p.target.toLowerCase()) ?? 0) >= maxPostponements.value;
}
// `proposals` is a shared ref (useMeute) that changes after loadAll(),
// refreshProposal() or the demo-mode refresh — a single watch here covers
// all three cases instead of manually calling
// loadConfirmationPostponements everywhere.
watch(proposals, loadConfirmationPostponements, { immediate: true });

// For the applicant checklist ("have Sepolia ETH" step) — the wallet's
// balance, not the contract's.
const myBalance = ref(0n);
async function loadBalance() {
  if (!address.value) {
    myBalance.value = 0n;
    return;
  }
  myBalance.value = await publicClient.getBalance({ address: address.value });
}

onMounted(async () => {
  await loadAll();
  fee.value = (await readOnlyContract().read.fee()) as bigint;
  dormancyDelay.value = Number((await readOnlyContract().read.DORMANCY_DELAY()) as bigint);
  maxPostponements.value = Number(await readOnlyContract().read.MAX_POSTPONEMENTS());
  now.value = Number((await publicClient.getBlock()).timestamp);

  const discordResult = consumeDiscordCallbackParam();
  if (discordResult === "linked") showToast("Compte Discord lié !");
  else if (discordResult === "not_member") showToast("Tu dois d'abord rejoindre le serveur Discord de la Meute.");
  else if (discordResult === "error") showToast("Échec de la liaison Discord, réessaie.");
  // Discord's return is a full-page redirect (not an SPA navigation): the
  // whole governance session (isAuthorized) was therefore lost on return,
  // even though the wallet is already silently reconnected
  // (tryRestoreConnection) — observed: no more proposals after linking a
  // Discord account mid-scenario. Here we just finished an explicit action
  // (linking Discord), so asking for a signature again is legitimate, not
  // a surprise.
  if (discordResult && address.value) void verifyMembershipAndLoad(address.value);
});

// Local demo mode only (see useLocalAutoRefresh): the demo panel advances
// time and votes accounts in another tab — without this, coming back to
// this page could show a stale status (e.g. "Dormant" when the account
// had actually become active again in the meantime).
useLocalAutoRefresh(async () => {
  await loadAll();
  now.value = Number((await publicClient.getBlock()).timestamp);
  await refreshMembership();
  await loadBalance();
  await loadMyDonations(address.value);
});

// When isAuthorized flips back to false (disconnect, switch to a
// non-member account...), all the reserved content (stats, proposals)
// disappears at once and the page shrinks a lot. Without resetting scroll
// to 0, the position stays where it was on a much shorter page: the
// browser clamps it, and the "members-only" message ends up stuck under
// the sticky tab bar (observed — disappeared on refresh, which resets
// scroll to 0 anyway).
watch(isAuthorized, (authorized) => {
  if (!authorized) window.scrollTo({ top: 0 });
});

// { immediate: true } covers two cases with the same code: the address
// changes from MetaMask (switching account mid-use) AND the address is
// already known *on mount* of the component (e.g. navigating between
// pages, wallet already connected from before) — this second case never
// triggers a plain `watch` without immediate, since the value doesn't
// "change" in Vue's sense. Without this, coming back to this page with a
// wallet already connected left the role and balance stuck on their
// default values (observed: "Become a member" card shown to a Wolf
// already confirmed).
watch(
  address,
  () => {
    refreshMembership();
    loadBalance();
    loadMyDonations(address.value);
  },
  { immediate: true },
);

// The card image is never recreated on the front: we read tokenURI() as
// is and display the image it contains. If _svg() changes in the
// contract, this image changes with it, nothing to touch here — no
// duplicated drawing that could silently diverge from the real token.
async function loadCardImage() {
  if (!address.value) {
    cardImage.value = null;
    return;
  }
  const contract = readOnlyContract();
  const tokenId = BigInt(address.value);
  const tokenUri = (await contract.read.tokenURI([tokenId])) as string;
  const json = JSON.parse(atob(tokenUri.replace("data:application/json;base64,", ""))) as { image: string };
  cardImage.value = json.image;
}

async function refreshMembership() {
  if (!address.value) {
    // Without this reset, a disconnect left `role` stuck on its last
    // value ("wolf") — the "Open a proposal" panel stayed displayed
    // (observed), even though no wallet is connected to use it anymore.
    role.value = "visitor";
    card.value = null;
    cardImage.value = null;
    return;
  }
  const contract = readOnlyContract();
  const balance = (await contract.read.balanceOf([address.value])) as bigint;
  if (balance === 0n) {
    role.value = "visitor";
    card.value = null;
    cardImage.value = null;
    return;
  }
  const c = (await contract.read.card([address.value])) as { rank: number; lastActivity: number; postponements: number };
  card.value = c;
  role.value = c.rank === 1 ? "wolf" : "cub";
  await loadCardImage();
}

async function onConnect() {
  txError.value = null;
  try {
    await connect();
    await Promise.all([refreshMembership(), loadBalance()]);
  } catch (e) {
    txError.value = friendlyContractError(e);
  }
}

// Simulates the call before sending it: this recovers the real Solidity
// revert reason (e.g. AlreadyVoted) for a clear message, instead of
// letting gas estimation fail silently and surface a generic, unrelated
// RPC message (observed locally: "gas limit exceeds cap"). A transaction
// that *creates* a proposal (application, confirmation, exclusion,
// expense) only gets its id once mined — impossible to know it ahead of
// time like for voting/executing. It's already there, though, in the
// receipt's events: we decode the receipt looking for a ProposalOpened to
// extract the id.
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
  const p = proposals.value.find((existing) => existing.id === id);
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
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const created = knownProposalId === undefined ? extractCreatedProposal(receipt.logs) : undefined;
    const affectedId = knownProposalId ?? created?.id;
    await Promise.all([
      affectedId !== undefined ? refreshProposal(affectedId, created?.author) : loadAll(),
      refreshMembership(),
      loadBalance(),
      loadMyDonations(address.value),
    ]);
    if (affectedId !== undefined) await patchProposalRemote(affectedId);
    now.value = Number((await publicClient.getBlock()).timestamp);
    showToast(successMessage);
  } catch (e) {
    txError.value = friendlyContractError(e);
  } finally {
    txPending.value = false;
  }
}

function applyForMembership() {
  return runTx(
    () => readOnlyContract().simulate.applyForMembership({ account: address.value!, value: fee.value }),
    () => writableContract().write.applyForMembership({ value: fee.value }),
    "Candidature enregistrée — synchronisation blockchain en cours",
  );
}

const expenseAddr = ref("");
const expenseAmount = ref("");
const expenseReason = ref("");

function toPickerOption(addr: string) {
  const link = discordLinkFor(addr as Address);
  return { address: addr, username: link?.username, avatarUrl: link?.avatarUrl };
}

// Expense stays free-text (a beneficiary can be any address, not
// necessarily a member) — these suggestions are just a convenience, built
// from everything the front has already seen. Confirm/Exclude have their
// own dedicated page ("Members" tab): those always target an existing
// member, better suited to a browsable list than a field to search in.
const knownBeneficiaries = computed(() => {
  const addrs = new Set<string>([
    ...members.value.map((m) => m.address),
    ...memberActivity.value.keys(),
    ...proposals.value.flatMap((p) => [p.author, p.target]),
    ...topDonors.value.map((d) => d.address),
  ]);
  addrs.delete(ZERO_ADDRESS);
  return [...addrs].map(toPickerOption);
});

function proposeExpense() {
  const args = [expenseAddr.value as `0x${string}`, parseEther(expenseAmount.value || "0"), expenseReason.value] as const;
  return runTx(
    () => readOnlyContract().simulate.proposeExpense(args, { account: address.value! }),
    () => writableContract().write.proposeExpense(args),
    "Proposition de dépense enregistrée — synchronisation blockchain en cours",
  );
}
function vote(id: bigint, choice: number) {
  const args = [id, choice] as const;
  return runTx(
    () => readOnlyContract().simulate.vote(args, { account: address.value! }),
    () => writableContract().write.vote(args),
    "Vote enregistré — synchronisation blockchain en cours",
    id,
  );
}
function execute(id: bigint) {
  const args = [id] as const;
  return runTx(
    () => readOnlyContract().simulate.execute(args, { account: address.value! }),
    () => writableContract().write.execute(args),
    "Exécution enregistrée — synchronisation blockchain en cours",
    id,
  );
}

const isDormant = computed(() => !!card.value && now.value - card.value.lastActivity > dormancyDelay.value);
const dormancyDelayDays = computed(() => Math.round(dormancyDelay.value / (24 * 60 * 60)));
const statusTooltip = computed(() => {
  if (role.value !== "wolf") return undefined;
  return isDormant.value
    ? `Ce Loup n'a voté ni agi depuis plus de ${dormancyDelayDays.value} jours — il ne compte plus dans le quorum tant qu'il ne se manifeste pas (vote ou « Se réveiller »).`
    : `Vote ou action dans les ${dormancyDelayDays.value} derniers jours. Sans activité pendant ce délai, ce Loup deviendrait dormant et sortirait du quorum.`;
});

// imHere(): a Wolf explicitly wakes up without waiting for a vote to
// pass, to be recounted in the quorum before a decision opens (§7.5) —
// the only case where a dormant Wolf has an action to take from their
// card rather than by voting.
function wakeUp() {
  return runTx(
    () => readOnlyContract().simulate.imHere({ account: address.value! }),
    () => writableContract().write.imHere(),
    "Réveil enregistré — synchronisation blockchain en cours",
  );
}

const ongoingProposals = computed(() => proposals.value.filter((p) => !p.executed && Number(p.deadline) > now.value));
const closedNotExecutedProposals = computed(() =>
  proposals.value.filter((p) => !p.executed && Number(p.deadline) <= now.value),
);
const pastProposals = computed(() => proposals.value.filter((p) => p.executed));
const allOngoingProposals = computed(() => [...closedNotExecutedProposals.value, ...ongoingProposals.value]);

// Status filter on the Past tab only — "Ongoing" has too few entries for a
// filter to be useful (UX agent's opinion). No chip selected = show
// everything (default state), not a "nothing" filter.
const pastStatusFilters = ref<Set<PastProposalStatus>>(new Set());
function toggleStatusFilter(status: PastProposalStatus) {
  if (pastStatusFilters.value.has(status)) pastStatusFilters.value.delete(status);
  else pastStatusFilters.value.add(status);
  // A Set mutated in place doesn't trigger Vue reactivity — reassign so
  // downstream computeds (filteredPastProposals, etc.) recompute.
  pastStatusFilters.value = new Set(pastStatusFilters.value);
}
function resetStatusFilter() {
  pastStatusFilters.value = new Set();
}
const filteredPastProposals = computed(() => {
  if (pastStatusFilters.value.size === 0) return pastProposals.value;
  return pastProposals.value.filter((p) => pastStatusFilters.value.has(pastStatus(p)));
});

const PAGE_SIZE = 5;
const ongoingPage = ref(1);
const pastPage = ref(1);

const totalOngoingPages = computed(() => Math.max(1, Math.ceil(allOngoingProposals.value.length / PAGE_SIZE)));
const totalPastPages = computed(() => Math.max(1, Math.ceil(filteredPastProposals.value.length / PAGE_SIZE)));

// If the list shrinks (new data loaded, or filter changed) and we were on
// a page that no longer exists, go back to the last valid page rather
// than showing an empty page.
watch(totalOngoingPages, (max) => { if (ongoingPage.value > max) ongoingPage.value = max; });
watch(totalPastPages, (max) => { if (pastPage.value > max) pastPage.value = max; });
watch(pastStatusFilters, () => { pastPage.value = 1; });

const ongoingProposalsPage = computed(() => {
  const start = (ongoingPage.value - 1) * PAGE_SIZE;
  return allOngoingProposals.value.slice(start, start + PAGE_SIZE);
});
const pastProposalsPage = computed(() => {
  const start = (pastPage.value - 1) * PAGE_SIZE;
  return filteredPastProposals.value.slice(start, start + PAGE_SIZE);
});

const activeTab = ref<"ongoing" | "past">("ongoing");

const typeLabels = ["Admission", "Titularisation", "Exclusion", "Dépense"];

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// The author isn't in the on-chain struct (only in the ProposalOpened
// event) — an entry whose author was never captured (e.g. refreshProposal
// without local history) falls back to the zero address, no point
// displaying "opened by 0x000...000".
function authorKnown(p: Proposal): boolean {
  return p.author.toLowerCase() !== ZERO_ADDRESS;
}

function proposalPrefix(p: Proposal): string {
  switch (p.proposalType) {
    case ProposalType.Admission:
      return "Candidature de";
    case ProposalType.Confirmation:
      return "Titularisation de";
    case ProposalType.Exclusion:
      return "Exclusion de";
    default:
      return "Dépense pour";
  }
}

function proposalSuffix(p: Proposal): string {
  return p.proposalType === ProposalType.Expense ? `— ${formatEther(p.amount)} ETH (${p.reason})` : "";
}

// The Discord link isn't required anywhere on-chain (no privileged role
// to check it): an applicant who calls applyForMembership() directly,
// without going through the front's checklist, can very well exist. This
// badge just gives Wolves the information to vote with full knowledge —
// enforcing the rule stays a voting choice, never a front-side block.
function applicationWithoutDiscord(p: Proposal): boolean {
  return p.proposalType === ProposalType.Admission && !p.executed && !discordLinkFor(p.target);
}

// Two conditions, like in the contract (Meute.sol, _isPassed): a
// participation quorum (75% of the active Wolves at snapshot time must
// have voted, yes or no), then "yes" must exceed "no" among the votes
// cast — not a simple "yes" threshold against the active count.
const QUORUM_NUM = 3;
const QUORUM_DEN = 4;

function requiredQuorum(p: Proposal): number {
  return Math.floor((p.activeSnapshot * QUORUM_NUM) / QUORUM_DEN) + 1;
}

function quorumReached(p: Proposal): boolean {
  const cast = p.approveVotes + p.rejectVotes;
  return cast * QUORUM_DEN > p.activeSnapshot * QUORUM_NUM;
}

function isApproved(p: Proposal): boolean {
  return quorumReached(p) && p.approveVotes > p.rejectVotes;
}

// Visual status of a past proposal — distinct from isApproved() above,
// which only handles the binary case (Admission/Exclusion/Expense).
// Confirmation has 3 possible outcomes (see Meute.sol, _executeConfirmation):
// quorum there is computed on for+against+postpone (not just for+against),
// and "postponed" is neither a success nor a failure — the Cub gets
// another chance.
type PastProposalStatus = "approved" | "rejected" | "quorum" | "postponed";

const PAST_STATUS_LABELS: Record<PastProposalStatus, string> = {
  approved: "Approuvée",
  rejected: "Refusée",
  quorum: "Quorum non atteint",
  postponed: "Ajournée",
};

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

// Conflict of interest (Meute.sol, vote() -> ConflictOfInterest): the
// target of an exclusion or an expense can't vote on their own case.
function hasConflictType(p: Proposal): boolean {
  return p.proposalType === ProposalType.Exclusion || p.proposalType === ProposalType.Expense;
}

function isTargetInConflict(p: Proposal): boolean {
  if (!address.value) return false;
  return hasConflictType(p) && p.target.toLowerCase() === address.value.toLowerCase();
}

const QUORUM_TOOLTIP =
  "Quorum : au moins 75% des Loups actifs au moment de l'ouverture doivent voter (oui ou non). Une fois le quorum atteint, le nombre de oui doit dépasser le nombre de non.";
const CONFLICT_TOOLTIP = "La personne visée ne peut pas voter sur cette proposition (conflit d'intérêt).";

function quorumTooltip(p: Proposal): string {
  return hasConflictType(p) ? `${QUORUM_TOOLTIP}\n\n${CONFLICT_TOOLTIP}` : QUORUM_TOOLTIP;
}

function exactDate(p: Proposal): string {
  return new Date(Number(p.deadline) * 1000).toLocaleString("fr-FR");
}

function countdown(p: Proposal): string {
  const diff = Number(p.deadline) - now.value;
  if (diff <= 0) return "clôturé, à exécuter";
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  if (days > 0) return `${days}j ${hours}h restantes`;
  const minutes = Math.floor((diff % 3600) / 60);
  return `${hours}h ${minutes}min restantes`;
}

const myActivity = computed(() => {
  if (!address.value) return { votesSubmitted: 0, openProposals: 0 };
  return memberActivity.value.get(address.value.toLowerCase()) ?? { votesSubmitted: 0, openProposals: 0 };
});

// applyForMembership() doesn't mint anything until the vote passes:
// balanceOf stays at 0 for the whole application, so role alone doesn't
// distinguish "visitor" from "pending applicant" — you have to cross-
// reference the already-loaded proposals to know.
const myOpenApplication = computed(() => {
  if (!address.value) return null;
  return (
    proposals.value.find(
      (p) => p.proposalType === ProposalType.Admission && !p.executed && p.target.toLowerCase() === address.value!.toLowerCase(),
    ) ?? null
  );
});

// Exclusion isn't a distinct status on the contract side (the card is
// just burned, like for a resignation): to display it, we have to find an
// executed and approved Exclusion proposal targeting this address in the
// already-loaded history. Nothing technically prevents reapplying
// afterwards — this is just a reminder, not a block we'd pretend to
// enforce on the front without it existing on-chain.
const myExclusion = computed(() => {
  if (!address.value) return null;
  return (
    proposals.value.find(
      (p) =>
        p.proposalType === ProposalType.Exclusion &&
        p.executed &&
        p.target.toLowerCase() === address.value!.toLowerCase() &&
        isApproved(p),
    ) ?? null
  );
});

function eurTooltip(wei: bigint): string {
  if (eurPerEth.value === null) return "";
  const eur = Number(formatEther(wei)) * eurPerEth.value;
  return `≈ ${eur.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
}

// The tour highlight (a single driver.js step pointing at the "Guided
// tour" button) lives in Dashboard.vue, which owns the active tab and the
// button itself. This component only needs to react to a launch request,
// via useGuidedTour's shared state.
const { tourRequestId } = useGuidedTour();

watch(tourRequestId, (id) => {
  if (id > 0) startTour();
});

// Guided tour: never launched automatically, one short tour per role,
// replayable at will from the dedicated button. Reuses the style and
// content already validated in the mockup (Artifact), driver.js just
// replaces the hand-rolled positioning engine.
function startTour() {
  const headcountStep = {
    element: ".gv-stats-effectifs",
    popover: { title: "Les effectifs de la meute", description: "Ici tu retrouves les effectifs de la meute : Loups actifs, Loups dormants et Louveteaux." },
  };

  const steps =
    role.value === "wolf"
      ? [
          { element: ".gv-card-panel", popover: { title: "Ta carte de Loup", description: "Ton statut, ton ancienneté et ton activité (votes, propositions ouvertes) sont visibles ici." } },
          { element: ".gv-new-prop-panel", popover: { title: "Ouvrir une proposition", description: "Titularisation, exclusion ou dépense : chaque type de décision a son propre formulaire, ici." } },
          { element: ".gv-prop-actions", popover: { title: "Voter", description: "Un vote reste ouvert 7 jours. Le seuil affiché s'ajuste automatiquement au nombre de Loups réellement actifs." } },
          headcountStep,
        ]
      : role.value === "cub"
        ? [
            { element: ".gv-card-panel", popover: { title: "Ta carte de Louveteau", description: "Ton statut et ta contribution sont à jour en direct — c'est la même carte qui deviendra Loup après titularisation." } },
            { element: ".gv-stat-row", popover: { title: "En période de probation", description: "Tu peux suivre les propositions en cours, mais le droit de vote arrive avec ta titularisation." } },
            headcountStep,
          ]
        : [
            { element: ".gv-card-panel", popover: { title: "Ton wallet, c'est ta carte", description: "Pas de compte à créer : ton wallet est ton identité ici, du candidat au Loup." } },
            { element: ".gv-stat-tile:first-child", popover: { title: "Le trésor, en direct", description: "Ce montant vient du solde réel du contrat sur la blockchain — personne ne peut l'afficher faux." } },
            headcountStep,
          ];

  driver({ showProgress: true, nextBtnText: "Suivant", prevBtnText: "Précédent", doneBtnText: "Terminer", steps }).drive();
}
</script>

<template>
  <section id="gouvernance-dao" class="gv-dao">
    <WalletInstallModal />
    <DiscordConsentModal />

    <div v-if="!isAuthorized" class="gv-gate">
      <p class="gv-gate-text">
        Les statistiques et propositions de la Meute sont réservées aux membres — connecte le wallet que tu utilises
        pour voter afin d'y accéder. Sans wallet membre, tu peux toujours candidater ci-dessous.
      </p>
    </div>

    <div v-if="isAuthorized && stats" class="gv-stats-bar">
      <div class="gv-stat-tile" :title="eurTooltip(stats.treasuryWei)">
        <div class="value">{{ formatEther(stats.treasuryWei) }} <span class="unit">ETH</span></div>
        <div class="caption">Trésor</div>
      </div>
      <div class="gv-stats-effectifs">
        <div class="gv-stat-tile">
          <div class="value">{{ stats.activeWolves }}</div>
          <div class="caption">Loups actifs</div>
        </div>
        <div class="gv-stat-tile">
          <div class="value">{{ stats.dormantWolves }}</div>
          <div class="caption">Loups dormants</div>
        </div>
        <div class="gv-stat-tile">
          <div class="value">{{ stats.cubs }}</div>
          <div class="caption">Louveteaux</div>
        </div>
      </div>
      <div class="gv-stat-tile">
        <div class="value">{{ stats.votesCast }}</div>
        <div class="caption">Votes exprimés</div>
      </div>
      <div class="gv-stat-tile">
        <div class="value">{{ stats.openProposals }}</div>
        <div class="caption">Propositions ouvertes</div>
      </div>
    </div>
    <p v-else-if="loading" class="gv-loading">Chargement des données on-chain…</p>
    <p v-if="error" class="gv-error">Erreur de lecture : {{ error }}</p>

    <div class="gv-layout">
      <aside class="gv-card-panel">
        <template v-if="!address">
          <p class="gv-card-title">Ma carte</p>
          <p class="gv-card-note">Connecte ton wallet pour voir ta carte de membre ou candidater.</p>
          <button class="btn btn-primary" @click="onConnect">Connecter mon wallet</button>
        </template>
        <template v-else-if="wrongNetwork">
          <p class="gv-error">Mauvais réseau — connecte-toi à Sepolia dans MetaMask.</p>
        </template>
        <template v-else-if="role === 'visitor'">
          <p v-if="myExclusion && !myOpenApplication" class="gv-exclusion-note">
            Tu as été exclu de la Meute par vote des Loups le
            {{ new Date(Number(myExclusion.deadline) * 1000).toLocaleDateString("fr-FR") }}. Tu peux retenter ta
            chance si tu le souhaites.
          </p>
          <ApplicationChecklist
            :address="address!"
            :balance="myBalance"
            :fee="fee"
            :application="myOpenApplication"
            :now="now"
            :tx-pending="txPending"
            :countdown="countdown"
            :exact-date="exactDate"
            @apply="applyForMembership"
            @refresh-balance="loadBalance"
          />
        </template>
        <template v-else>
          <div class="gv-badge-frame" :class="`gv-badge-frame--${role}`">
            <img v-if="cardImage" :src="cardImage" alt="Illustration de la carte de membre" />
          </div>
          <p class="gv-card-title" style="text-align: center">Ma carte — {{ role === "wolf" ? "Loup" : "Louveteau" }}</p>

          <button
            v-if="!myDiscord"
            class="btn btn-primary gv-discord-link-btn"
            type="button"
            @click="requestDiscordLink(address!)"
          >
            Lier mon compte Discord
          </button>
          <button
            v-else
            class="gv-discord-unlink-btn"
            type="button"
            :disabled="unlinkPending"
            title="Retire ton pseudo et ton avatar de l'affichage public — ton historique de votes/dons déjà rendu public le reste."
            @click="onUnlinkDiscord"
          >
            {{ unlinkPending ? "Déliage…" : "Délier mon compte Discord" }}
          </button>

          <p class="gv-card-note" style="text-align: center"><AddressChip v-if="address" :address="address" short /></p>
          <div class="gv-stat-row" :title="statusTooltip">
            <span>Statut</span>
            <span>{{ isDormant ? "Dormant" : "Actif" }}</span>
          </div>
          <button
            v-if="role === 'wolf' && isDormant"
            class="btn btn-primary gv-reveil-btn"
            :disabled="txPending"
            @click="wakeUp"
          >
            Se réveiller
          </button>
          <div class="gv-stat-row">
            <span>Dernière activité</span>
            <span>{{ card ? new Date(card.lastActivity * 1000).toLocaleDateString("fr-FR") : "—" }}</span>
          </div>
          <div class="gv-stat-row" v-if="role === 'cub'">
            <span>Ajournements</span>
            <span>{{ card?.postponements ?? 0 }} / {{ maxPostponements }}</span>
          </div>
          <div class="gv-stat-row gv-stat-row--sub">
            <span>↳ Votes soumis</span>
            <span>{{ myActivity.votesSubmitted }}</span>
          </div>
          <div class="gv-stat-row gv-stat-row--sub">
            <span>↳ Propositions ouvertes</span>
            <span>{{ myActivity.openProposals }}</span>
          </div>
          <div class="gv-stat-row gv-stat-row--sub">
            <span>↳ Dons cumulés</span>
            <span>{{ formatEther(myDonations) }} ETH</span>
          </div>
        </template>
      </aside>

      <main class="gv-main">
        <div v-if="role === 'wolf'" class="gv-new-prop-panel">
          <h3 class="gv-card-title">Ouvrir une proposition</h3>

          <div class="gv-prop-form">
            <p class="gv-form-label">Proposer une dépense</p>
            <div class="gv-form-row gv-form-row--wrap">
              <MemberPicker v-model="expenseAddr" :options="knownBeneficiaries" placeholder="0x… bénéficiaire" />
              <input v-model="expenseAmount" type="number" min="0" step="any" inputmode="decimal" placeholder="Montant en ETH" />
              <input v-model="expenseReason" placeholder="Motif" />
              <button
                class="btn btn-primary"
                :disabled="txPending || !expenseAddr || !expenseAmount"
                @click="proposeExpense"
              >
                Ouvrir
              </button>
            </div>
          </div>
        </div>

        <p v-if="txError" class="gv-error">{{ txError }}</p>

        <template v-if="isAuthorized">
        <h3 class="gv-card-title" style="margin-top: 2rem">Propositions</h3>
        <div class="gv-tabs">
          <button class="gv-tab" :class="{ 'gv-tab--active': activeTab === 'ongoing' }" @click="activeTab = 'ongoing'">
            En cours ({{ ongoingProposals.length + closedNotExecutedProposals.length }})
          </button>
          <button class="gv-tab" :class="{ 'gv-tab--active': activeTab === 'past' }" @click="activeTab = 'past'">
            Passées ({{ pastProposals.length }})
          </button>
        </div>

        <div v-if="activeTab === 'past'" class="gv-statut-filters">
          <span class="gv-statut-filters-label">Filtrer :</span>
          <button
            v-for="status in (['approved', 'rejected', 'quorum', 'postponed'] as PastProposalStatus[])"
            :key="status"
            type="button"
            class="gv-statut-chip"
            :class="[`gv-statut-chip--${status}`, { 'gv-statut-chip--active': pastStatusFilters.has(status) }]"
            @click="toggleStatusFilter(status)"
          >
            {{ PAST_STATUS_LABELS[status] }}
          </button>
          <button v-if="pastStatusFilters.size" class="gv-statut-clear" type="button" @click="resetStatusFilter">
            ✕ effacer
          </button>
        </div>

        <div v-if="activeTab === 'ongoing'" class="gv-prop-list">
          <article v-for="p in ongoingProposalsPage" :key="p.id.toString()" class="gv-prop-card">
            <div class="gv-prop-head">
              <span class="gv-prop-head-left">
                <span class="gv-prop-type">{{ typeLabels[p.proposalType] }}</span>
                <span v-if="authorKnown(p)" class="gv-prop-author">
                  par <AddressChip :address="p.author" short />
                </span>
              </span>
              <span class="gv-prop-deadline mono" :title="exactDate(p)">{{ countdown(p) }}</span>
            </div>
            <p class="gv-prop-title">
              {{ proposalPrefix(p) }} <AddressChip :address="p.target" short /> {{ proposalSuffix(p) }}
            </p>
            <p v-if="applicationWithoutDiscord(p)" class="gv-discord-warning" title="Ce candidat n'a pas lié de compte Discord vérifié — à vérifier avant de voter.">
              ⚠️ Pas de Discord lié
            </p>
            <div class="gv-vote-line">
              <span class="gv-vote-count gv-vote-count--pour">
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8.5 6.5 12 13 4.5" /></svg>
                {{ p.approveVotes }} pour
              </span>
              <span class="gv-vote-count gv-vote-count--contre">
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                {{ p.rejectVotes }} contre
              </span>
              <span v-if="p.proposalType === ProposalType.Confirmation" class="gv-vote-count gv-vote-count--ajourner">
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6">
                  <path d="M4 2h8M4 14h8M5 2c0 3 2.5 3.6 3 4.5.5-.9 3-1.5 3-4.5M5 14c0-3 2.5-3.6 3-4.5.5.9 3 1.5 3 4.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                {{ p.postponeVotes }} ajourner
              </span>
            </div>
            <div class="gv-quorum-line">
              <span :title="quorumTooltip(p)">
                Quorum : {{ p.approveVotes + p.rejectVotes }}/{{ requiredQuorum(p) }} votes exprimés (sur {{ p.activeSnapshot }} Loups actifs)
              </span>
            </div>
            <div class="gv-prop-actions">
              <template v-if="role === 'wolf' && Number(p.deadline) > now && !isTargetInConflict(p)">
                <button class="btn btn-primary" :disabled="txPending" @click="vote(p.id, VoteChoice.Approve)">Approuver</button>
                <button class="btn btn-outline-danger" :disabled="txPending" @click="vote(p.id, VoteChoice.Reject)">Rejeter</button>
                <button
                  v-if="p.proposalType === ProposalType.Confirmation"
                  class="btn btn-outline"
                  :disabled="txPending || postponementBlocked(p)"
                  :title="postponementBlocked(p) ? `Nombre maximal d'ajournements (${maxPostponements}) déjà atteint pour ce Louveteau.` : ''"
                  @click="vote(p.id, VoteChoice.Postpone)"
                >
                  Ajourner
                </button>
              </template>
              <p v-else-if="role === 'wolf' && Number(p.deadline) > now && isTargetInConflict(p)" class="gv-card-note">
                Tu es directement concerné par cette proposition, tu ne peux pas voter dessus.
              </p>
              <button v-else-if="Number(p.deadline) <= now" class="btn btn-outline" :disabled="txPending" @click="execute(p.id)">
                Exécuter
              </button>
            </div>
          </article>
          <p v-if="!allOngoingProposals.length" class="gv-card-note">
            Aucune proposition en cours.
          </p>
          <nav v-if="totalOngoingPages > 1" class="gv-pagination">
            <button class="gv-page-btn" :disabled="ongoingPage === 1" @click="ongoingPage--">Précédent</button>
            <span class="gv-page-indicator">Page {{ ongoingPage }} / {{ totalOngoingPages }}</span>
            <button class="gv-page-btn" :disabled="ongoingPage === totalOngoingPages" @click="ongoingPage++">Suivant</button>
          </nav>
        </div>

        <div v-else class="gv-prop-list">
          <article
            v-for="p in pastProposalsPage"
            :key="p.id.toString()"
            class="gv-prop-card"
            :class="`gv-prop-card--${pastStatus(p)}`"
          >
            <div class="gv-prop-head">
              <span class="gv-prop-head-left">
                <span class="gv-prop-type">{{ typeLabels[p.proposalType] }}</span>
                <span v-if="authorKnown(p)" class="gv-prop-author">
                  par <AddressChip :address="p.author" short />
                </span>
              </span>
              <span class="gv-prop-statut" :class="`gv-prop-statut--${pastStatus(p)}`">
                {{ PAST_STATUS_LABELS[pastStatus(p)] }}
              </span>
            </div>
            <p class="gv-prop-title">
              {{ proposalPrefix(p) }} <AddressChip :address="p.target" short /> {{ proposalSuffix(p) }}
            </p>
            <div class="gv-vote-line">
              <span class="gv-vote-count gv-vote-count--pour">
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8.5 6.5 12 13 4.5" /></svg>
                {{ p.approveVotes }} pour
              </span>
              <span class="gv-vote-count gv-vote-count--contre">
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                {{ p.rejectVotes }} contre
              </span>
              <span v-if="p.proposalType === ProposalType.Confirmation" class="gv-vote-count gv-vote-count--ajourner">
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6">
                  <path d="M4 2h8M4 14h8M5 2c0 3 2.5 3.6 3 4.5.5-.9 3-1.5 3-4.5M5 14c0-3 2.5-3.6 3-4.5.5.9 3 1.5 3 4.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                {{ p.postponeVotes }} ajourner
              </span>
            </div>
            <div class="gv-quorum-line">
              <span :title="quorumTooltip(p)">
                Quorum : {{ p.approveVotes + p.rejectVotes + (p.proposalType === ProposalType.Confirmation ? p.postponeVotes : 0) }}/{{ requiredQuorum(p) }} votes exprimés (sur {{ p.activeSnapshot }} Loups actifs)
              </span>
            </div>
          </article>
          <p v-if="!pastProposals.length" class="gv-card-note">Aucune proposition passée.</p>
          <div v-else-if="!filteredPastProposals.length" class="gv-card-note gv-statut-empty">
            <p>Aucune proposition ne correspond à ce filtre.</p>
            <button class="btn btn-outline" type="button" @click="resetStatusFilter">Réinitialiser le filtre</button>
          </div>
          <nav v-if="totalPastPages > 1" class="gv-pagination">
            <button class="gv-page-btn" :disabled="pastPage === 1" @click="pastPage--">Précédent</button>
            <span class="gv-page-indicator">Page {{ pastPage }} / {{ totalPastPages }}</span>
            <button class="gv-page-btn" :disabled="pastPage === totalPastPages" @click="pastPage++">Suivant</button>
          </nav>
        </div>
        </template>
      </main>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.mono {
  font-family: $font-mono;
}

.gv-loading,
.gv-card-note {
  color: $color-text-dim;
  font-size: $fs-caption;
}

.gv-gate {
  padding: 1.4rem 1.6rem;
  margin-bottom: 1.5rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
}

.gv-gate-text {
  color: rgba(255, 255, 255, 0.75);
  font-size: $fs-body;
  margin: 0;
}

.gv-error {
  color: $color-danger;
  font-size: $fs-caption;
}

.gv-exclusion-note {
  font-size: $fs-caption;
  color: $color-danger;
  background: rgba(217, 83, 79, 0.08);
  border: 1px solid rgba(217, 83, 79, 0.25);
  border-radius: 4px;
  padding: 0.7rem 0.9rem;
  margin: 0 0 1rem;
  line-height: 1.5;
}

// Flex rather than grid: .gv-stats-effectifs needs a real box (its own
// size/position) so driver.js can target it as a single zone in the
// guided tour — a `display: contents` wrapper has no rect of its own
// (measured as 0×0), which broke the popover's positioning.
.gv-stats-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 1px;
  background: $color-border;
  border-bottom: 1px solid $color-border;

  > .gv-stat-tile {
    flex: 1 1 120px;
  }
}

.gv-stats-effectifs {
  display: flex;
  flex: 3 1 360px;
  gap: 1px;

  .gv-stat-tile {
    flex: 1 1 120px;
  }
}

.gv-stat-tile {
  background: $color-card-bg;
  padding: 1.2rem 1rem;
  text-align: center;

  .value {
    font-family: $font-mono;
    font-size: 1.3rem;
    font-weight: 700;
    color: $color-black;
  }
  .unit {
    font-size: $fs-caption;
    color: $color-text-dim;
  }
  .caption {
    font-size: $fs-caption;
    color: $color-text-dim;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
}

.gv-layout {
  max-width: 1080px;
  margin: 0 auto;
  padding: 2.4rem 1.6rem 4rem;
  display: grid;
  grid-template-columns: 300px 1fr;
  // Without this, the card panel stretches by default over the whole
  // height of the proposals column (default grid behavior) — a giant
  // empty rectangle as soon as its content is short (visitor/applicant).
  align-items: start;
  gap: 1.8rem;
}
@media (max-width: 820px) { .gv-layout { grid-template-columns: 1fr; } }

.gv-card-panel,
.gv-new-prop-panel,
.gv-prop-card {
  background: $color-card-bg;
  border: 1px solid $color-border;
  border-radius: 4px;
  padding: 1.6rem;
}

// Status of a past proposal: colored left border rather than a tinted
// background on the whole card — keeps black-on-white text readable
// (observed: a pale red/green background degraded contrast), and stays
// readable at a glance while scrolling a long list of cards.
.gv-prop-card {
  &--approved { border-left: 4px solid $color-success; }
  &--rejected { border-left: 4px solid $color-danger; }
  &--quorum { border-left: 4px solid $color-text-dim; }
  &--postponed { border-left: 4px solid $color-cub; }
}

.gv-prop-statut {
  font-size: $fs-caption;
  font-weight: 700;

  &--approved { color: $color-success; }
  &--rejected { color: $color-danger; }
  &--quorum { color: $color-text-dim; }
  &--postponed { color: $color-cub; }
}

.gv-card-title {
  color: $color-orange;
  font-family: $font-display;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-size: $fs-h4;
  margin: 0 0 1rem;
}

.gv-discord-link-btn {
  display: block;
  margin: 0 auto 0.6rem;
  font-size: $fs-caption;
  padding: 0.4rem 0.9rem;
}

.gv-discord-unlink-btn {
  display: block;
  margin: 0 auto 0.6rem;
  background: none;
  border: none;
  color: $color-text-dim;
  font-size: 0.72rem;
  text-decoration: underline;
  cursor: pointer;

  &:hover:not(:disabled) {
    color: $color-orange-dark;
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 3px;
  border: none;
  background: transparent;
  color: $color-text-dim;
  cursor: pointer;
  padding: 0;

  &:hover:not(:disabled) { color: $color-orange-dark; background: rgba(249, 174, 60, 0.12); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}

.gv-badge-frame {
  width: 110px;
  height: 110px;
  margin: 0 auto 1rem;
  border-radius: 50%;
  background: #fff;
  border: 3px solid;
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 68px;
    height: 68px;
  }

  &--wolf { border-color: $color-wolf; }
  &--cub { border-color: $color-cub; }
}

.gv-stat-row {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid $color-border;
  font-size: $fs-caption;

  &--sub { color: $color-text-dim; }
  &[title] { cursor: help; }
}

.gv-reveil-btn {
  display: block;
  width: 100%;
  margin: 0.5rem 0;
  font-size: $fs-caption;
}

.gv-form-label {
  font-size: $fs-caption;
  font-weight: 700;
  color: $color-black;
  margin: 0 0 0.5rem;
}
.gv-prop-form { margin-bottom: 1.4rem; }
.gv-form-row {
  display: flex;
  gap: 0.6rem;

  &--wrap { flex-wrap: wrap; }

  input {
    flex: 1;
    min-width: 120px;
    box-sizing: border-box;
    border: 1px solid $color-border;
    border-radius: 3px;
    padding: 0.5rem 0.7rem;
    font: inherit;

    // Hides the native spin arrows (+/-) on `type="number"` fields: they
    // inflated the field's height relative to its neighbors and clashed
    // with the rest of the form's style (user feedback: "a bit broken").
    &::-webkit-inner-spin-button,
    &::-webkit-outer-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    &[type="number"] {
      -moz-appearance: textfield;
    }
  }

  :deep(.mp-root) {
    flex: 1;
    min-width: 160px;
  }
}

.gv-tabs {
  display: flex;
  gap: 0.5rem;
  border-bottom: 1px solid $color-border;
  padding-bottom: 1rem;
  margin-bottom: 1.2rem;
}
.gv-tab {
  background: transparent;
  border: 1px solid $color-border;
  color: $color-text-dim;
  border-radius: 3px;
  padding: 0.4rem 0.9rem;
  font-size: $fs-caption;
  text-transform: uppercase;
  cursor: pointer;

  &--active { background: $color-orange; border-color: $color-orange; color: #fff; }
}

.gv-statut-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1.2rem;
}
.gv-statut-filters-label {
  font-size: $fs-caption;
  color: $color-text-dim;
  margin-right: 0.2rem;
}
// Same colors as the corresponding cards' border (see .gv-prop-card--*)
// — the visual link between a chip and the cards it filters must be
// immediate, without having to read the label.
.gv-statut-chip {
  background: transparent;
  border: 1px solid $color-border;
  color: $color-text-dim;
  border-radius: 999px;
  padding: 0.3rem 0.8rem;
  font-size: $fs-caption;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;

  &--approved.gv-statut-chip--active { background: $color-success; border-color: $color-success; color: #fff; }
  &--rejected.gv-statut-chip--active { background: $color-danger; border-color: $color-danger; color: #fff; }
  &--quorum.gv-statut-chip--active { background: $color-text-dim; border-color: $color-text-dim; color: #fff; }
  &--postponed.gv-statut-chip--active { background: $color-cub; border-color: $color-cub; color: #fff; }
}
.gv-statut-clear {
  background: none;
  border: none;
  color: $color-text-dim;
  font-size: $fs-caption;
  text-decoration: underline;
  cursor: pointer;
}
.gv-statut-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.8rem;
}

.gv-prop-list { display: flex; flex-direction: column; gap: 1rem; }
.gv-prop-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem; }
.gv-prop-head-left { display: flex; align-items: baseline; gap: 0.4rem; }
.gv-prop-type { font-size: $fs-caption; font-weight: 700; color: $color-orange-dark; text-transform: uppercase; }
.gv-prop-deadline { font-size: $fs-caption; color: $color-text-dim; }
.gv-prop-title { font-size: $fs-h4; color: $color-black; margin: 0 0 0.8rem; }
.gv-discord-warning {
  font-size: $fs-caption;
  color: $color-orange-dark;
  margin: -0.5rem 0 0.8rem;
}
.gv-prop-author { font-size: $fs-caption; color: $color-text-dim; text-transform: none; font-weight: 400; }
.gv-vote-line {
  display: flex;
  justify-content: center;
  gap: 1.2rem;
  flex-wrap: wrap;
  font-size: $fs-body;
  font-weight: 700;
  color: $color-black;
  margin-bottom: 0.3rem;
}
.gv-vote-count {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;

  &--pour svg { color: #2e9e5b; }
  &--contre svg { color: $color-danger; }
  &--ajourner svg { color: $color-text-dim; }
}
.gv-quorum-line {
  text-align: center;
  font-size: $fs-caption;
  color: $color-text-dim;
  margin-bottom: 1rem;

  span[title] { cursor: help; }
}
.gv-prop-actions { display: flex; justify-content: center; gap: 0.6rem; flex-wrap: wrap; }

.gv-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 0.4rem;
}
.gv-page-indicator { font-size: $fs-caption; color: $color-text-dim; }
.gv-page-btn {
  background: transparent;
  border: 1px solid $color-border;
  border-radius: 3px;
  padding: 0.4rem 0.9rem;
  font-size: $fs-caption;
  color: $color-text;
  cursor: pointer;

  &:hover:not(:disabled) { border-color: $color-orange; color: $color-orange-dark; }
  &:disabled { color: #ccc; cursor: not-allowed; }
}
</style>
