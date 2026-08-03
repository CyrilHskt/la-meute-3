<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useLocale } from "../../composables/useLocale";
import { useGuidedTour } from "../../composables/useGuidedTour";
import { formatEther, parseEther, type Address } from "viem";
import { driver } from "driver.js";
import { useWallet } from "../../composables/useWallet";
import { useMeute, ProposalType, type Proposal } from "../../composables/useMeute";
import { useEthPrice } from "../../composables/useEthPrice";
import { friendlyContractError } from "../../composables/contractErrors";
import { useToast } from "../../composables/useToast";
import { useDiscordLink } from "../../composables/useDiscordLink";
import { useLocalAutoRefresh } from "../../composables/useLocalAutoRefresh";
import { usePagination } from "../../composables/usePagination";
import { useProposalTx } from "../../composables/useProposalTx";
import { useProposalFormatting, type PastProposalStatus } from "../../composables/useProposalFormatting";
import AddressChip from "./AddressChip.vue";
import ProposalCard from "./ProposalCard.vue";
import SubmitProposalPanel from "./SubmitProposalPanel.vue";
import ApplicationChecklist from "./ApplicationChecklist.vue";
import WalletInstallModal from "./WalletInstallModal.vue";
import DiscordConsentModal from "./DiscordConsentModal.vue";
import ExpenseProposalModal from "./ExpenseProposalModal.vue";
import GovernanceMembers from "./GovernanceMembers.vue";

const props = defineProps<{ initialSubTab?: "proposals" | "members" }>();

const { t } = useI18n();
const { locale } = useLocale();
const {
  address,
  wrongNetwork,
  connect,
  readOnlyContract,
  writableContract,
  publicClient,
  restoreConnectionPromise,
  ensureContractAddressSynced,
  isLocal,
  contractDeployBlock,
  activeChain,
} = useWallet();
const {
  stats,
  proposals,
  memberActivity,
  topDonors,
  members,
  myDonations,
  error,
  isAuthorized,
  membershipError,
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
    showToast(t('governance.dao.discordUnlinked'));
  } catch (e) {
    showToast(t('governance.dao.discordUnlinkFailed'), "error");
  } finally {
    unlinkPending.value = false;
  }
}

const role = ref<"visitor" | "cub" | "wolf">("visitor");
const card = ref<{ rank: number; lastActivity: number; postponements: number } | null>(null);
const fee = ref<bigint>(0n);
const cardImage = ref<string | null>(null);
// Declared here, not near its other usages further down: refreshMembership
// (below) resets it on disconnect and runs from a watch(address, ...,
// { immediate: true }) registered above the ref's original declaration
// site — referencing it before that point threw a ReferenceError (TDZ) on
// every load without a connected wallet, i.e. every first-time visitor.
const expandedProposalId = ref<bigint | null>(null);
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
// VOTE_DURATION is a constant (7 days), never changes once deployed —
// read once on mount rather than on every proposal. The contract only
// stores `deadline` (vote end), not an opening date: `deadline -
// VOTE_DURATION` reliably derives the proposal's opening date without
// needing to store it on-chain.
const voteDuration = ref(7 * 24 * 60 * 60);

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

// `_hasVoted` is private in the contract (no getter) — the vote/reject/
// postpone buttons must still gray out once the connected wallet has
// already voted, to avoid sending it into a guaranteed AlreadyVoted
// revert. VoteCast is indexed on `voter`, so a single filtered log query
// gets every proposal this address has voted on, without one read per
// proposal (Meute.sol, VoteCast, line ~216).
const myVotedProposalIds = ref<Set<string>>(new Set());
async function loadMyVotedProposals() {
  if (!address.value) {
    myVotedProposalIds.value = new Set();
    return;
  }
  // contractDeployBlock resolves to the active remote chain's real
  // deployment block (DEPLOYMENTS in contract.ts) — on the local demo
  // chain the contract redeploys fresh every reset at a near-zero block
  // height, so using that same value as `fromBlock` there would silently
  // return zero logs (the bug this fixes: every vote looked like it had
  // never happened, on local demo specifically).
  const logs = await readOnlyContract().getEvents.VoteCast(
    { voter: address.value },
    { fromBlock: isLocal ? 0n : contractDeployBlock },
  );
  myVotedProposalIds.value = new Set(logs.map((log) => log.args.proposalId!.toString()));
}
function hasVoted(p: Proposal): boolean {
  return myVotedProposalIds.value.has(p.id.toString());
}

// For the applicant checklist ("have {network} ETH" step) — the wallet's
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
  // Before any read below: loadAll() only resolves the demo contract
  // address on the authorized path, so these one-time constants would
  // otherwise be read against the stale pre-sync address.
  await ensureContractAddressSynced();
  await loadAll();
  await loadMyVotedProposals();
  fee.value = (await readOnlyContract().read.fee()) as bigint;
  dormancyDelay.value = Number((await readOnlyContract().read.DORMANCY_DELAY()) as bigint);
  maxPostponements.value = Number(await readOnlyContract().read.MAX_POSTPONEMENTS());
  voteDuration.value = Number((await readOnlyContract().read.VOTE_DURATION()) as bigint);
  now.value = Number((await publicClient.getBlock()).timestamp);

  const discordResult = consumeDiscordCallbackParam();
  if (discordResult === "linked") showToast(t('governance.dao.discordLinked'));
  else if (discordResult === "not_member") showToast(t('governance.dao.discordNotMember'));
  else if (discordResult === "error") showToast(t('governance.dao.discordLinkFailed'));
  // Discord's return is a full-page redirect (not an SPA navigation): the
  // whole governance session (isAuthorized) was therefore lost on return,
  // even though the wallet is already silently reconnected
  // (tryRestoreConnection) — observed: no more proposals after linking a
  // Discord account mid-scenario. Here we just finished an explicit action
  // (linking Discord), so asking for a signature again is legitimate, not
  // a surprise.
  if (discordResult) {
    await restoreConnectionPromise;
    if (address.value) void verifyMembershipAndLoad(address.value);
  }
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

// The dedicated `.gv-gate` banner that used to surface this was removed
// (redundant with each panel's own locked note) — without a toast, a
// network failure during membership verification became silent: the page
// just stayed in its locked state with no indication of why.
watch(membershipError, (reason) => {
  if (reason === "network") showToast(t('governance.dao.gateNetworkErrorText'), "error");
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
    // These three are fire-and-forget, so an RPC failure (contract address
    // briefly pointing at un-deployed code, flaky node) used to reject
    // unhandled and leave `role` silently stuck on "visitor" with nothing
    // logged anywhere.
    void refreshMembership().catch((e) => console.error("refreshMembership failed", e));
    void loadBalance().catch((e) => console.error("loadBalance failed", e));
    void loadMyDonations(address.value).catch((e) => console.error("loadMyDonations failed", e));
    void loadMyVotedProposals().catch((e) => console.error("loadMyVotedProposals failed", e));
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
    // The expanded proposal card is reset here too: invisible today only
    // because `proposals` empties out at the same time, but a dormant bug
    // otherwise (a stale id lingering in state after disconnect).
    role.value = "visitor";
    card.value = null;
    cardImage.value = null;
    expandedProposalId.value = null;
    return;
  }
  await ensureContractAddressSynced();
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

const { txError, txPending, runTx } = useProposalTx({
  publicClient,
  proposals,
  refreshProposal,
  loadAll,
  refreshMembership,
  loadBalance,
  loadMyDonations,
  address,
  showToast,
  now,
  t,
});

async function onConnect() {
  txError.value = null;
  try {
    await connect();
    await Promise.all([refreshMembership(), loadBalance()]);
  } catch (e) {
    txError.value = friendlyContractError(e, t);
  }
}

function applyForMembership() {
  return runTx(
    () => readOnlyContract().simulate.applyForMembership({ account: address.value!, value: fee.value }),
    () => writableContract().write.applyForMembership({ value: fee.value }),
    t('governance.dao.applicationToast'),
  );
}

const expenseModalOpen = ref(false);

function toPickerOption(addr: string) {
  const link = discordLinkFor(addr as Address);
  return { address: addr, username: link?.username, avatarUrl: link?.avatarUrl };
}

// Expense stays free-text (a beneficiary can be any address, not
// necessarily a member) — these suggestions are just a convenience, built
// from everything the front has already seen. Confirm/Exclude have their
// own dedicated page ("Members" tab): those always target an existing
// member, better suited to a browsable list than a field to search in.
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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

async function proposeExpense(expenseAddress: string, expenseAmount: string | number, expenseReason: string) {
  const args = [expenseAddress as `0x${string}`, parseEther(String(expenseAmount || "0")), expenseReason] as const;
  await runTx(
    () => readOnlyContract().simulate.proposeExpense(args, { account: address.value! }),
    () => writableContract().write.proposeExpense(args),
    t('governance.dao.expenseToast'),
  );
  if (!txError.value) expenseModalOpen.value = false;
}

// A target's `postponements` counter moves when a Confirmation is
// executed (Meute.sol, _execute), so the cache above goes stale after any
// transaction touching a Confirmation — leaving the Postpone button
// enabled past MAX_POSTPONEMENTS and sending the user straight into an
// InvalidChoice revert. Dropping the entry makes the watch on `proposals`
// reread it.
async function invalidatePostponements(id: bigint) {
  const proposal = proposals.value.find((p) => p.id === id);
  if (!proposal || proposal.proposalType !== ProposalType.Confirmation) return;
  postponementsByTarget.value.delete(proposal.target.toLowerCase());
  await loadConfirmationPostponements();
}

async function vote(id: bigint, choice: number) {
  const args = [id, choice] as const;
  await runTx(
    () => readOnlyContract().simulate.vote(args, { account: address.value! }),
    () => writableContract().write.vote(args),
    t('governance.dao.voteToast'),
    id,
  );
  if (!txError.value) {
    await invalidatePostponements(id);
    await loadMyVotedProposals();
  }
}
async function execute(id: bigint) {
  const args = [id] as const;
  await runTx(
    () => readOnlyContract().simulate.execute(args, { account: address.value! }),
    () => writableContract().write.execute(args),
    t('governance.dao.executeToast'),
    id,
  );
  if (!txError.value) await invalidatePostponements(id);
}

const isDormant = computed(() => !!card.value && now.value - card.value.lastActivity > dormancyDelay.value);
const dormancyDelayDays = computed(() => Math.round(dormancyDelay.value / (24 * 60 * 60)));
const statusTooltip = computed(() => {
  if (role.value !== "wolf") return undefined;
  return isDormant.value
    ? t('governance.dao.dormantTooltip', { days: dormancyDelayDays.value })
    : t('governance.dao.activeTooltip', { days: dormancyDelayDays.value });
});

// imHere(): a Wolf explicitly wakes up without waiting for a vote to
// pass, to be recounted in the quorum before a decision opens (§7.5) —
// the only case where a dormant Wolf has an action to take from their
// card rather than by voting.
function wakeUp() {
  return runTx(
    () => readOnlyContract().simulate.imHere({ account: address.value! }),
    () => writableContract().write.imHere(),
    t('governance.dao.wakeUpToast'),
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
const {
  page: ongoingPage,
  totalPages: totalOngoingPages,
  pageItems: ongoingProposalsPage,
} = usePagination(allOngoingProposals, PAGE_SIZE);
const {
  page: pastPage,
  totalPages: totalPastPages,
  pageItems: pastProposalsPage,
  reset: resetPastPage,
} = usePagination(filteredPastProposals, PAGE_SIZE);

watch(pastStatusFilters, resetPastPage);

const activeTab = ref<"ongoing" | "past">("ongoing");

// The top-level "Members" tab was merged into this one as a sub-tab
// (product decision, see docs) — this local state replaces the routing
// that used to switch between the two components in Dashboard.vue.
const activeSubTab = ref<"proposals" | "members">(props.initialSubTab ?? "proposals");

// `stats` (set by the same applyIndex() call as `proposals`) is what
// distinguishes "authorized but the snapshot hasn't landed yet" from
// "authorized and genuinely empty" — showing "(0)" in either case would
// falsely claim there are no proposals before we actually know that.
const statsResolved = computed(() => isAuthorized.value && !!stats.value);
const ongoingTabLabel = computed(() =>
  statsResolved.value
    ? t('governance.dao.ongoingTab', { count: ongoingProposals.value.length + closedNotExecutedProposals.value.length })
    : t('governance.dao.ongoingTabNoCount'),
);
const pastTabLabel = computed(() =>
  statsResolved.value ? t('governance.dao.pastTab', { count: pastProposals.value.length }) : t('governance.dao.pastTabNoCount'),
);

// Single-card accordion, local to this component only — a `bigint | null`
// rather than a `Set`: multi-expand was never requested and would just be
// speculative complexity. Declared near the top of the script (see there
// for why).
function toggleProposalDetail(id: bigint) {
  expandedProposalId.value = expandedProposalId.value === id ? null : id;
}

const { typeLabels, authorKnown, proposalPrefix, PAST_STATUS_LABELS, pastStatus } = useProposalFormatting(t);

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

// Conflict of interest (Meute.sol, vote() -> ConflictOfInterest): the
// target of an exclusion or an expense can't vote on their own case.
function hasConflictType(p: Proposal): boolean {
  return p.proposalType === ProposalType.Exclusion || p.proposalType === ProposalType.Expense;
}

function isTargetInConflict(p: Proposal): boolean {
  if (!address.value) return false;
  return hasConflictType(p) && p.target.toLowerCase() === address.value.toLowerCase();
}

function quorumTooltip(p: Proposal): string {
  const base = t('governance.dao.quorumTooltip');
  return hasConflictType(p) ? `${base}\n\n${t('governance.dao.conflictTooltip')}` : base;
}

function exactDate(p: Proposal): string {
  return new Date(Number(p.deadline) * 1000).toLocaleString(locale.value);
}

// The contract only stores `deadline`, not an opening date — derived here
// as `deadline - VOTE_DURATION` rather than stored redundantly on-chain.
function proposedAt(p: Proposal): string {
  return new Date((Number(p.deadline) - voteDuration.value) * 1000).toLocaleDateString(locale.value);
}

function countdown(p: Proposal): string {
  const diff = Number(p.deadline) - now.value;
  if (diff <= 0) return t('governance.dao.closedToExecute');
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  if (days > 0) return t('governance.dao.remainingDaysHours', { days, hours });
  const minutes = Math.floor((diff % 3600) / 60);
  return t('governance.dao.remainingHoursMinutes', { hours, minutes });
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
  return `≈ ${eur.toLocaleString(locale.value, { maximumFractionDigits: 0, style: "currency", currency: "EUR" })}`;
}

// The tour highlight (a single driver.js step pointing at the "Guided
// tour" button) lives in Dashboard.vue, which owns the active tab and the
// button itself. This component only needs to react to a launch request,
// via useGuidedTour's shared state.
const { tourRequestId } = useGuidedTour();

watch(tourRequestId, (id) => {
  if (id <= 0) return;
  // Every tour step targets an element from the "Proposals" sub-tab (or
  // the side column) — none from "Members management": force it back so
  // the tour never misses an element just because the user happened to be
  // looking at the other sub-tab when they clicked "Guided tour".
  activeSubTab.value = "proposals";
  startTour();
});

// Guided tour: never launched automatically, one short tour per role,
// replayable at will from the dedicated button. Reuses the style and
// content already validated in the mockup (Artifact), driver.js just
// replaces the hand-rolled positioning engine.
function startTour() {
  const headcountStep = {
    element: ".gv-stats-effectifs",
    popover: { title: t('governance.dao.tour.headcountTitle'), description: t('governance.dao.tour.headcountText') },
  };

  const steps =
    role.value === "wolf"
      ? [
          { element: ".gv-card-panel", popover: { title: t('governance.dao.tour.wolfCardTitle'), description: t('governance.dao.tour.wolfCardText') } },
          { element: ".gv-new-prop-panel", popover: { title: t('governance.dao.tour.wolfNewPropTitle'), description: t('governance.dao.tour.wolfNewPropText') } },
          { element: ".gv-prop-actions", popover: { title: t('governance.dao.tour.wolfVoteTitle'), description: t('governance.dao.tour.wolfVoteText') } },
          headcountStep,
        ]
      : role.value === "cub"
        ? [
            { element: ".gv-card-panel", popover: { title: t('governance.dao.tour.cubCardTitle'), description: t('governance.dao.tour.cubCardText') } },
            { element: ".gv-stat-row", popover: { title: t('governance.dao.tour.cubProbationTitle'), description: t('governance.dao.tour.cubProbationText') } },
            headcountStep,
          ]
        : [
            // No treasury/headcount step here: both live inside the
            // `isAuthorized && stats` stats panel (see template below),
            // which never renders for a visitor — a pure visitor never
            // gets a signed session, so the tour would point at a DOM
            // element that simply doesn't exist for this role.
            { element: ".gv-card-panel", popover: { title: t('governance.dao.tour.visitorCardTitle'), description: t('governance.dao.tour.visitorCardText') } },
          ];

  driver({
    showProgress: true,
    nextBtnText: t('governance.dao.tour.next'),
    prevBtnText: t('governance.dao.tour.previous'),
    doneBtnText: t('governance.dao.tour.done'),
    steps,
  }).drive();
}
</script>

<template>
  <section id="gouvernance-dao" class="gv-dao">
    <WalletInstallModal />
    <DiscordConsentModal />
    <ExpenseProposalModal
      :open="expenseModalOpen"
      :known-beneficiaries="knownBeneficiaries"
      :tx-pending="txPending"
      :tx-error="txError"
      @close="expenseModalOpen = false"
      @submit="proposeExpense"
    />

    <p v-if="error" class="gv-error">{{ t('common.readError', { error }) }}</p>

    <div class="gv-layout">
      <main class="gv-main">
        <div class="gv-main-columns">
        <div class="gv-main-list">
        <p v-if="txError" class="gv-error">{{ txError }}</p>

        <div class="gv-subtabs">
          <button class="gv-subtab" :class="{ 'gv-subtab--active': activeSubTab === 'proposals' }" @click="activeSubTab = 'proposals'">
            {{ t('governance.dao.subTabProposals') }}
          </button>
          <button class="gv-subtab" :class="{ 'gv-subtab--active': activeSubTab === 'members' }" @click="activeSubTab = 'members'">
            {{ t('governance.dao.subTabMembers') }}
          </button>
        </div>

        <div v-show="activeSubTab === 'proposals'">
        <div class="gv-tabs" style="margin-top: 2rem">
          <button class="gv-tab" :class="{ 'gv-tab--active': activeTab === 'ongoing' }" :disabled="!isAuthorized" @click="activeTab = 'ongoing'">
            {{ ongoingTabLabel }}
          </button>
          <button class="gv-tab" :class="{ 'gv-tab--active': activeTab === 'past' }" :disabled="!isAuthorized" @click="activeTab = 'past'">
            {{ pastTabLabel }}
          </button>
        </div>

        <!-- `stats` (set by the same applyIndex() call as `proposals`) is
             what distinguishes "authorized but the snapshot hasn't landed
             yet" from "authorized and genuinely empty" — showing the
             filters/list on `isAuthorized` alone showed a confident, wrong
             "0 ongoing / 0 past" for as long as the fetch took. -->
        <template v-if="isAuthorized && stats">
        <div v-if="activeTab === 'past'" class="gv-statut-filters">
          <span class="gv-statut-filters-label">{{ t('governance.dao.filterLabel') }}</span>
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
            {{ t('governance.dao.clearFilter') }}
          </button>
        </div>

        <div v-if="activeTab === 'ongoing'" class="gv-prop-list">
          <ProposalCard
            v-for="p in ongoingProposalsPage"
            :key="p.id.toString()"
            mode="ongoing"
            :proposal="p"
            :expanded="expandedProposalId === p.id"
            :type-labels="typeLabels"
            :author-known="authorKnown"
            :proposal-prefix="proposalPrefix"
            :quorum-tooltip="quorumTooltip"
            :required-quorum="requiredQuorum"
            :application-without-discord="applicationWithoutDiscord"
            :countdown="countdown"
            :exact-date="exactDate"
            :proposed-at="proposedAt"
            :role="role"
            :now="now"
            :tx-pending="txPending"
            :is-target-in-conflict="isTargetInConflict"
            :has-voted="hasVoted"
            :postponement-blocked="postponementBlocked"
            :max-postponements="maxPostponements"
            @vote="(id, choice) => vote(id, choice)"
            @execute="(id) => execute(id)"
            @toggle-detail="toggleProposalDetail"
          />
          <p v-if="!allOngoingProposals.length" class="gv-card-note">
            {{ t('governance.dao.noOngoingProposals') }}
          </p>
          <nav v-if="totalOngoingPages > 1" class="gv-pagination">
            <button class="gv-page-btn" :disabled="ongoingPage === 1" @click="ongoingPage--">{{ t('governance.dao.previous') }}</button>
            <span class="gv-page-indicator">{{ t('governance.dao.pageIndicator', { page: ongoingPage, total: totalOngoingPages }) }}</span>
            <button class="gv-page-btn" :disabled="ongoingPage === totalOngoingPages" @click="ongoingPage++">{{ t('governance.dao.next') }}</button>
          </nav>
        </div>

        <div v-else class="gv-prop-list">
          <ProposalCard
            v-for="p in pastProposalsPage"
            :key="p.id.toString()"
            mode="past"
            :proposal="p"
            :expanded="expandedProposalId === p.id"
            :type-labels="typeLabels"
            :author-known="authorKnown"
            :proposal-prefix="proposalPrefix"
            :quorum-tooltip="quorumTooltip"
            :required-quorum="requiredQuorum"
            :past-status="pastStatus"
            :past-status-labels="PAST_STATUS_LABELS"
            :proposed-at="proposedAt"
            @toggle-detail="toggleProposalDetail"
          />
          <p v-if="!pastProposals.length" class="gv-card-note">{{ t('governance.dao.noPastProposals') }}</p>
          <div v-else-if="!filteredPastProposals.length" class="gv-card-note gv-statut-empty">
            <p>{{ t('governance.dao.noFilterMatch') }}</p>
            <button class="btn btn-outline" type="button" @click="resetStatusFilter">{{ t('governance.dao.resetFilter') }}</button>
          </div>
          <nav v-if="totalPastPages > 1" class="gv-pagination">
            <button class="gv-page-btn" :disabled="pastPage === 1" @click="pastPage--">{{ t('governance.dao.previous') }}</button>
            <span class="gv-page-indicator">{{ t('governance.dao.pageIndicator', { page: pastPage, total: totalPastPages }) }}</span>
            <button class="gv-page-btn" :disabled="pastPage === totalPastPages" @click="pastPage++">{{ t('governance.dao.next') }}</button>
          </nav>
        </div>
        </template>
        <p v-else-if="isAuthorized && !error" class="gv-loading gv-statut-empty">{{ t('common.loadingOnChain') }}</p>
        <p v-else-if="!isAuthorized" class="gv-card-note gv-statut-empty">{{ t('governance.dao.proposalsLockedNote') }}</p>
        </div>
        </div>

        <GovernanceMembers v-show="activeSubTab === 'members'" :role="role" />

        </div>
      </main>

      <aside class="gv-side-column">
      <div class="gv-new-prop-panel">
        <h3 class="gv-card-title">{{ t('governance.dao.openProposalTitle') }}</h3>

        <p v-if="!isAuthorized" class="gv-card-note">{{ t('governance.dao.submitLockedNote') }}</p>
        <p v-else-if="role !== 'wolf'" class="gv-card-note">{{ t('governance.dao.submitWolvesOnlyNote') }}</p>
        <SubmitProposalPanel v-else @select-expense="expenseModalOpen = true" />
      </div>

      <aside class="gv-card-panel">
        <template v-if="!address">
          <p class="gv-card-title">{{ t('governance.dao.myCard') }}</p>
          <p class="gv-card-note">{{ t('governance.dao.connectToSeeCard') }}</p>
          <button class="btn btn-primary gv-card-connect-btn" @click="onConnect">{{ t('common.connectWallet') }}</button>
        </template>
        <template v-else-if="wrongNetwork">
          <p class="gv-error">{{ t('common.wrongNetwork', { network: activeChain.name }) }}</p>
        </template>
        <template v-else-if="role === 'visitor'">
          <p v-if="myExclusion && !myOpenApplication" class="gv-exclusion-note">
            {{ t('governance.dao.excludedNote', { date: new Date(Number(myExclusion.deadline) * 1000).toLocaleDateString(locale) }) }}
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
            :active-chain="activeChain"
            @apply="applyForMembership"
            @refresh-balance="loadBalance"
          />
        </template>
        <template v-else>
          <div class="gv-badge-frame" :class="`gv-badge-frame--${role}`">
            <img v-if="cardImage" :src="cardImage" alt="Illustration de la carte de membre" />
          </div>
          <p class="gv-card-title" style="text-align: center">{{ t('governance.dao.myCardRankTitle', { rank: role === "wolf" ? t('governance.dao.rankWolf') : t('governance.dao.rankCub') }) }}</p>

          <!-- The pseudo/address is this card's most identity-carrying
               info — sized up and centered here instead of reading like
               just another caption-sized note. -->
          <p class="gv-card-identity">
            <AddressChip v-if="address" :address="address" short />
          </p>

          <button
            v-if="!myDiscord"
            class="btn btn-primary gv-discord-link-btn"
            type="button"
            @click="requestDiscordLink(address!)"
          >
            {{ t('governance.dao.linkDiscord') }}
          </button>
          <div class="gv-stat-row" :title="statusTooltip">
            <span>{{ t('governance.dao.status') }}</span>
            <span>{{ isDormant ? t('governance.dao.dormant') : t('governance.dao.active') }}</span>
          </div>
          <button
            v-if="role === 'wolf' && isDormant"
            class="btn btn-primary gv-reveil-btn"
            :disabled="txPending"
            @click="wakeUp"
          >
            {{ t('governance.dao.wakeUp') }}
          </button>
          <div class="gv-stat-row">
            <span>{{ t('governance.dao.lastActivity') }}</span>
            <span>{{ card ? new Date(card.lastActivity * 1000).toLocaleDateString(locale) : "—" }}</span>
          </div>
          <div class="gv-stat-row" v-if="role === 'cub'">
            <span>{{ t('governance.dao.postponements') }}</span>
            <span>{{ card?.postponements ?? 0 }} / {{ maxPostponements }}</span>
          </div>
          <details class="gv-card-more">
            <summary>
              <svg class="gv-card-more-chevron" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M4 6l4 4 4-4" />
              </svg>
              <span class="gv-card-more-label-closed">{{ t('governance.dao.moreDetails') }}</span>
              <span class="gv-card-more-label-open">{{ t('governance.dao.lessDetails') }}</span>
            </summary>
            <div class="gv-stat-row gv-stat-row--sub">
              <span>{{ t('governance.dao.votesSubmitted') }}</span>
              <span>{{ myActivity.votesSubmitted }}</span>
            </div>
            <div class="gv-stat-row gv-stat-row--sub">
              <span>{{ t('governance.dao.myOpenProposals') }}</span>
              <span>{{ myActivity.openProposals }}</span>
            </div>
            <div class="gv-stat-row gv-stat-row--sub">
              <span>{{ t('governance.dao.totalDonations') }}</span>
              <span>{{ formatEther(myDonations) }} ETH</span>
            </div>
            <div v-if="myDiscord" class="gv-stat-row gv-stat-row--sub">
              <span>{{ t('governance.dao.discordAccountLabel') }}</span>
              <button
                class="gv-discord-unlink-icon"
                type="button"
                :disabled="unlinkPending"
                :title="t('governance.dao.unlinkTooltip')"
                @click="onUnlinkDiscord"
              >
                {{ unlinkPending ? t('governance.dao.unlinking') : t('governance.dao.unlinkDiscordShort') }}
              </button>
            </div>
          </details>
        </template>
      </aside>

      <aside class="gv-card-panel gv-stats-panel">
        <p class="gv-card-title">{{ t('governance.dao.contractStatsTitle') }}</p>
        <template v-if="statsResolved">
          <div class="gv-stat-row gv-stat-row--treasury" :title="eurTooltip(stats!.treasuryWei)">
            <span>{{ t('governance.dao.treasury') }}</span>
            <span>{{ formatEther(stats!.treasuryWei) }} ETH</span>
          </div>
          <div class="gv-stats-effectifs">
            <div class="gv-stat-row">
              <span>{{ t('governance.dao.activeWolves') }}</span>
              <span>{{ stats!.activeWolves }}</span>
            </div>
            <div class="gv-stat-row">
              <span>{{ t('governance.dao.dormantWolves') }}</span>
              <span>{{ stats!.dormantWolves }}</span>
            </div>
            <div class="gv-stat-row">
              <span>{{ t('governance.dao.cubs') }}</span>
              <span>{{ stats!.cubs }}</span>
            </div>
          </div>
          <div class="gv-stat-row">
            <span>{{ t('governance.dao.votesCast') }}</span>
            <span>{{ stats!.votesCast }}</span>
          </div>
          <div class="gv-stat-row">
            <span>{{ t('governance.dao.openProposalsStat') }}</span>
            <span>{{ stats!.openProposals }}</span>
          </div>
        </template>
        <p v-else-if="isAuthorized && !error" class="gv-loading">{{ t('common.loadingOnChain') }}</p>
        <p v-else class="gv-card-note">{{ t('governance.dao.statsLockedNote') }}</p>
      </aside>
      </aside>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.gv-dao {
  // Overrides the legacy Aries template's `section { background-color:
  // #f9f9f9; color: #333; overflow: hidden }` (public/css/theme.css),
  // which otherwise bleeds through as a visible white/beige seam wherever
  // this section's own children don't have an opaque background of their
  // own (e.g. the gaps in `.gv-layout`) — same class of bug already fixed
  // on the Brand page's `<section>` elements.
  background: $color-page-bg;
  color: $color-text;
}

.gv-loading,
.gv-card-note {
  color: $color-text-dim;
  font-size: $fs-caption;
}

.gv-error {
  color: $color-danger;
  font-size: $fs-caption;
}

.gv-exclusion-note {
  font-size: $fs-caption;
  color: $color-danger;
  background: $color-card-bg;
  border: 1px solid $color-border;
  border-left: 3px solid $color-danger;
  border-radius: $radius-md;
  padding: $space-2 $space-3;
  margin: 0 0 $space-3;
  line-height: 1.5;
}

// A plain box (not `display: contents`) so driver.js can target it as a
// single zone in the guided tour — a `display: contents` wrapper has no
// rect of its own (measured as 0×0), which broke the popover's
// positioning.
.gv-stats-effectifs {
  display: flex;
  flex-direction: column;
}

.gv-layout {
  // Derived from row ergonomics, not a screenshot: fixed 300px right
  // column + gap + a proposals-list column capped around ~1250-1300px —
  // past that, a proposal row starts reading as a shallow banner rather
  // than a card, so further viewport width should become page margin
  // instead of feeding the list column indefinitely.
  max-width: 1600px;
  margin: 0 auto;
  padding: $space-5 $space-3 ($space-5 * 2);
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  // Without this, the card panel stretches by default over the whole
  // height of the proposals column (default grid behavior) — a giant
  // empty rectangle as soon as its content is short (visitor/applicant).
  align-items: start;
  gap: $space-4;
}

@container (max-width: 820px) {
  .gv-layout {
    grid-template-columns: 1fr;
  }
}

.gv-side-column {
  display: flex;
  flex-direction: column;
  gap: $space-4;
}

.gv-new-prop-panel {
  background: $color-card-bg;
  border: 1px solid $color-border;
  border-radius: $radius-md;
  padding: $space-4;
}

// The card panel renders directly in .gv-side-column, tuned for that
// narrow (300px) column.
.gv-card-panel {
  background: $color-card-bg;
  border: 1px solid $color-border;
  border-radius: $radius-md;
  padding: $space-3;
}

.gv-card-connect-btn {
  display: block;
  margin: $space-3 auto 0;
}

// Direct-child combinator, not a descendant selector: `:last-child` also
// matched "Louveteaux" (the last row inside the nested `.gv-stats-effectifs`
// group), silently dropping the separator between it and "Votes exprimés"
// — this must only strip the border off the panel's actual last row
// ("Propositions ouvertes").
.gv-stats-panel > .gv-stat-row:last-child {
  border-bottom: none;
}

.gv-card-title {
  color: $color-orange-dark;
  font-family: $font-mono;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: $fs-caption;
  margin: 0 0 $space-3;
}

.gv-discord-link-btn {
  display: block;
  margin: $space-2 auto 0.6rem;
  font-size: $fs-caption;
  padding: 0.4rem 0.9rem;
}

// The pseudo/address is this card's most identity-carrying info — was
// sized the same $fs-caption as every other note/caption on the card,
// reading as "just another line" instead of the thing to read first
// after the rank badge.
.gv-card-identity {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $space-1;
  margin: 0 0 $space-2;

  :deep(.addr-chip) {
    font-size: $fs-h4;
  }
  :deep(.addr-username) {
    font-weight: 700;
    color: $color-text;
  }
}

// Matches AddressChip's own `.icon-btn` (20×20, dim by default, orange on
// hover) — unlinking moved here from a full-width underlined text button
// above the identity block, so a rare account-management action no longer
// outweighs the identity it now sits right next to.
// A wordless icon at 12px couldn't carry a meaning this specific
// ("unlink this Discord account") on its own — tried twice, neither read
// clearly at a glance. A short label is the honest fix: still far
// quieter than the original full-width underlined button, just legible.
.gv-discord-unlink-icon {
  border: none;
  background: transparent;
  color: $color-text-dim;
  font-size: $fs-caption;
  cursor: pointer;
  padding: 0;
  transition: color 0.15s ease;

  &:hover:not(:disabled) {
    color: $color-orange-dark;
    text-decoration: underline;
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.gv-badge-frame {
  width: 64px;
  height: 64px;
  margin: 0 auto $space-2;
  border-radius: 50%;
  background: $color-page-bg;
  border: 2px solid;
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 40px;
    height: 40px;
  }

  &--wolf { border-color: $color-wolf; }
  &--cub { border-color: $color-cub; }
}

.gv-stat-row {
  display: flex;
  justify-content: space-between;
  padding: $space-1 0;
  border-bottom: 1px solid $color-border;
  font-size: $fs-caption;

  &--sub { color: $color-text-dim; }
  &[title] { cursor: help; }
}

// Matches `.gv-detail-toggle` in ProposalCard.vue (chevron + rotation,
// color, font, hover underline) — this was still the browser's bare,
// unstyled `<summary>` marker, reading as a different control entirely
// from the identical "Plus de détails" affordance on proposal cards.
.gv-card-more {
  margin-top: $space-2;

  summary {
    display: inline-flex;
    align-items: center;
    gap: $space-1;
    cursor: pointer;
    color: $color-orange-dark;
    font-family: $font-mono;
    font-size: $fs-caption;
    padding: $space-1 0;
    list-style: none;

    &:hover { text-decoration: underline; }
    &::-webkit-details-marker { display: none; }
  }

  .gv-card-more-chevron {
    transition: transform 0.15s ease;
  }

  .gv-card-more-label-open { display: none; }

  &[open] {
    .gv-card-more-chevron { transform: rotate(180deg); }
    .gv-card-more-label-closed { display: none; }
    .gv-card-more-label-open { display: inline; }
  }

  .gv-stat-row:last-child { border-bottom: none; }
}

.gv-reveil-btn {
  display: block;
  width: 100%;
  margin: $space-2 0;
  font-size: $fs-caption;
}

// A section-level nav (which page am I on), not a filter — styled as an
// underline-indicator tab bar rather than the filled-pill treatment
// `.gv-tab` uses just below it for "En cours/Passées". Sharing the same
// look for both made two different kinds of control (navigate vs. filter)
// read as one repeated row (observed). Only one level keeps the loud
// solid-orange fill, per the page's existing "One Loud Action" rule.
.gv-subtabs {
  display: flex;
  gap: $space-5;
  border-bottom: 2px solid $color-border;
  margin-bottom: $space-4;
}
.gv-subtab {
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  color: $color-text-dim;
  border-radius: 0;
  padding: $space-2 $space-1 $space-3;
  font-family: $font-display;
  font-weight: 700;
  font-size: $fs-h4;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  cursor: pointer;

  &--active { background: transparent; color: $color-orange-dark; border-bottom-color: $color-orange-dark; }
}

.gv-tabs {
  display: flex;
  gap: $space-2;
  border-bottom: 1px solid $color-border;
  padding-bottom: $space-3;
  margin-bottom: $space-4;
}
.gv-tab {
  background: transparent;
  border: 1px solid $color-border;
  color: $color-text-dim;
  border-radius: $radius-md;
  padding: $space-1 $space-3;
  font-family: $font-mono;
  font-size: $fs-caption;
  cursor: pointer;

  &--active { background: $color-orange-dark; border-color: $color-orange-dark; color: var(--color-rouille-contrast); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}

.gv-statut-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: $space-2;
  margin-bottom: $space-4;
}
.gv-statut-filters-label {
  font-size: $fs-caption;
  color: $color-text-dim;
  margin-right: $space-1;
}
// Same colors as the corresponding cards' border (see .gv-prop-card--*)
// — the visual link between a chip and the cards it filters must be
// immediate, without having to read the label.
.gv-statut-chip {
  background: transparent;
  border: 1px solid $color-border;
  color: $color-text-dim;
  border-radius: $radius-md;
  padding: $space-1 $space-3;
  font-size: $fs-caption;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;

  &--approved.gv-statut-chip--active { background: $color-success; border-color: $color-success; color: $color-on-accent; }
  &--rejected.gv-statut-chip--active { background: $color-danger; border-color: $color-danger; color: $color-on-accent; }
  &--quorum.gv-statut-chip--active { background: $color-text-dim; border-color: $color-text-dim; color: $color-on-accent; }
  &--postponed.gv-statut-chip--active { background: $color-cub; border-color: $color-cub; color: $color-on-accent; }
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
  gap: $space-2;
  padding: $space-5 0;
  text-align: center;
}

.gv-prop-list { display: flex; flex-direction: column; gap: $space-3; container-type: inline-size; }

// `.gv-main` (not `.gv-layout`/the viewport) is what actually constrains
// how much room `.gv-main-columns` has — since #107 gave `.gv-layout` a
// 300px right column, `.gv-main`'s own width is capped well below
// `.gv-layout`'s 1080px max-width regardless of viewport size. A
// viewport-width media query for the split breakpoint (the previous
// `@media (min-width: 900px)`) could therefore never fire correctly: past
// a certain viewport width, `.gv-layout` simply stops growing, so `.gv-main`
// never reaches 900px no matter how wide the browser window gets — the
// split kept triggering anyway (viewport ≥900px, easy to satisfy) while
// `.gv-main`'s real width was only ~750px, squeezing the list column into
// single-word line wraps. A container query measures `.gv-main`'s actual
// available width instead of the viewport's, so it only splits when there's
// truly enough room.
.gv-main {
  container-type: inline-size;
}

.gv-main-columns {
  display: grid;
  grid-template-columns: 1fr;
  gap: $space-4;
  align-items: start;
}
.gv-main-list { min-width: 0; }

.gv-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $space-3;
  margin-top: $space-1;
}
.gv-page-indicator { font-size: $fs-caption; color: $color-text-dim; }
.gv-page-btn {
  background: transparent;
  border: 1px solid $color-border;
  border-radius: $radius-md;
  padding: $space-1 $space-3;
  font-size: $fs-caption;
  color: $color-text;
  cursor: pointer;

  &:hover:not(:disabled) { border-color: $color-orange-dark; color: $color-orange-dark; }
  &:disabled { color: $color-text-dim; opacity: 0.5; cursor: not-allowed; }
}
</style>
