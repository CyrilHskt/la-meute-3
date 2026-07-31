<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useLocale } from "../../composables/useLocale";
import { useGuidedTour } from "../../composables/useGuidedTour";
import { formatEther, parseEther, type Address } from "viem";
import { driver } from "driver.js";
import { useWallet } from "../../composables/useWallet";
import { useMeute, ProposalType, VoteChoice, type Proposal } from "../../composables/useMeute";
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

const { t } = useI18n();
const { locale } = useLocale();
const { address, wrongNetwork, connect, readOnlyContract, writableContract, publicClient, restoreConnectionPromise } = useWallet();
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

function vote(id: bigint, choice: number) {
  const args = [id, choice] as const;
  return runTx(
    () => readOnlyContract().simulate.vote(args, { account: address.value! }),
    () => writableContract().write.vote(args),
    t('governance.dao.voteToast'),
    id,
  );
}
function execute(id: bigint) {
  const args = [id] as const;
  return runTx(
    () => readOnlyContract().simulate.execute(args, { account: address.value! }),
    () => writableContract().write.execute(args),
    t('governance.dao.executeToast'),
    id,
  );
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

// Master-detail selection, local to this component only — no route/query
// param, no second fetch: the detail panel is derived from the same
// `proposals` array already loaded above, and shares the single
// `runTx`/`txPending`/`txError` instance declared here (see vote/execute).
const selectedProposalId = ref<bigint | null>(null);
const selectedProposal = computed(() => {
  if (selectedProposalId.value === null) return null;
  return proposals.value.find((p) => p.id === selectedProposalId.value) ?? null;
});
function selectProposal(id: bigint) {
  selectedProposalId.value = selectedProposalId.value === id ? null : id;
}
const selectedProposalMode = computed<"ongoing" | "past">(() => {
  if (!selectedProposal.value) return "ongoing";
  return selectedProposal.value.executed ? "past" : "ongoing";
});

const { typeLabels, authorKnown, proposalPrefix, proposalSuffix, PAST_STATUS_LABELS, pastStatus } = useProposalFormatting(t);

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
  if (id > 0) startTour();
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
            { element: ".gv-card-panel", popover: { title: t('governance.dao.tour.visitorCardTitle'), description: t('governance.dao.tour.visitorCardText') } },
            { element: ".gv-stat-tile:first-child", popover: { title: t('governance.dao.tour.visitorTreasuryTitle'), description: t('governance.dao.tour.visitorTreasuryText') } },
            headcountStep,
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

    <div v-if="!isAuthorized && membershipError === 'network'" class="gv-gate">
      <p class="gv-gate-text">{{ t('governance.dao.gateNetworkErrorText') }}</p>
      <button class="btn btn-outline" type="button" @click="address && verifyMembershipAndLoad(address)">
        {{ t('governance.dao.gateRetry') }}
      </button>
    </div>

    <div v-else-if="!isAuthorized" class="gv-gate">
      <p class="gv-gate-text">{{ t('governance.dao.gateText') }}</p>
    </div>

    <div v-if="isAuthorized && stats" class="gv-stats-bar">
      <div class="gv-stat-tile" :title="eurTooltip(stats.treasuryWei)">
        <div class="value">{{ formatEther(stats.treasuryWei) }} <span class="unit">ETH</span></div>
        <div class="caption">{{ t('governance.dao.treasury') }}</div>
      </div>
      <div class="gv-stats-effectifs">
        <div class="gv-stat-tile">
          <div class="value">{{ stats.activeWolves }}</div>
          <div class="caption">{{ t('governance.dao.activeWolves') }}</div>
        </div>
        <div class="gv-stat-tile">
          <div class="value">{{ stats.dormantWolves }}</div>
          <div class="caption">{{ t('governance.dao.dormantWolves') }}</div>
        </div>
        <div class="gv-stat-tile">
          <div class="value">{{ stats.cubs }}</div>
          <div class="caption">{{ t('governance.dao.cubs') }}</div>
        </div>
      </div>
      <div class="gv-stat-tile">
        <div class="value">{{ stats.votesCast }}</div>
        <div class="caption">{{ t('governance.dao.votesCast') }}</div>
      </div>
      <div class="gv-stat-tile">
        <div class="value">{{ stats.openProposals }}</div>
        <div class="caption">{{ t('governance.dao.openProposalsStat') }}</div>
      </div>
    </div>
    <p v-else-if="loading" class="gv-loading">{{ t('common.loadingOnChain') }}</p>
    <p v-if="error" class="gv-error">{{ t('common.readError', { error }) }}</p>

    <div class="gv-layout">
      <main class="gv-main">
        <div class="gv-main-columns" :class="{ 'gv-main-columns--split': !!selectedProposal }">
        <div class="gv-main-list">
        <p v-if="txError" class="gv-error">{{ txError }}</p>

        <template v-if="isAuthorized">
        <h3 class="gv-card-title" style="margin-top: 2rem">{{ t('governance.dao.proposalsTitle') }}</h3>
        <div class="gv-tabs">
          <button class="gv-tab" :class="{ 'gv-tab--active': activeTab === 'ongoing' }" @click="activeTab = 'ongoing'">
            {{ t('governance.dao.ongoingTab', { count: ongoingProposals.length + closedNotExecutedProposals.length }) }}
          </button>
          <button class="gv-tab" :class="{ 'gv-tab--active': activeTab === 'past' }" @click="activeTab = 'past'">
            {{ t('governance.dao.pastTab', { count: pastProposals.length }) }}
          </button>
        </div>

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
            :selected="selectedProposalId === p.id"
            :type-labels="typeLabels"
            :author-known="authorKnown"
            :proposal-prefix="proposalPrefix"
            :proposal-suffix="proposalSuffix"
            :quorum-tooltip="quorumTooltip"
            :required-quorum="requiredQuorum"
            :application-without-discord="applicationWithoutDiscord"
            :countdown="countdown"
            :exact-date="exactDate"
            :role="role"
            :now="now"
            :tx-pending="txPending"
            :is-target-in-conflict="isTargetInConflict"
            :postponement-blocked="postponementBlocked"
            :max-postponements="maxPostponements"
            @vote="(id, choice) => vote(id, choice)"
            @execute="(id) => execute(id)"
            @select="selectProposal"
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
            :selected="selectedProposalId === p.id"
            :type-labels="typeLabels"
            :author-known="authorKnown"
            :proposal-prefix="proposalPrefix"
            :proposal-suffix="proposalSuffix"
            :quorum-tooltip="quorumTooltip"
            :required-quorum="requiredQuorum"
            :past-status="pastStatus"
            :past-status-labels="PAST_STATUS_LABELS"
            @select="selectProposal"
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
        </div>

        <aside v-if="selectedProposal" class="gv-detail-panel">
          <div class="gv-detail-head">
            <h3 class="gv-card-title">{{ t('governance.dao.detailTitle') }}</h3>
            <button class="icon-btn gv-detail-close" type="button" :aria-label="t('common.close')" @click="selectedProposalId = null">✕</button>
          </div>

          <p class="gv-detail-type">{{ typeLabels[selectedProposal.proposalType] }}</p>
          <p class="gv-prop-title">
            {{ proposalPrefix(selectedProposal) }} <AddressChip :address="selectedProposal.target" short /> {{ proposalSuffix(selectedProposal) }}
          </p>
          <p v-if="authorKnown(selectedProposal)" class="gv-prop-author">
            {{ t('governance.dao.by') }} <AddressChip :address="selectedProposal.author" short />
          </p>

          <div v-if="selectedProposal.proposalType === ProposalType.Expense" class="gv-detail-rows">
            <div class="gv-stat-row">
              <span>{{ t('governance.dao.amountPlaceholder') }}</span>
              <span>{{ formatEther(selectedProposal.amount) }} ETH</span>
            </div>
            <div v-if="selectedProposal.reason" class="gv-stat-row">
              <span>{{ t('governance.dao.reasonPlaceholder') }}</span>
              <span>{{ selectedProposal.reason }}</span>
            </div>
          </div>

          <p
            v-if="selectedProposalMode === 'ongoing' && applicationWithoutDiscord(selectedProposal)"
            class="gv-discord-warning"
            :title="t('governance.dao.discordMissingTooltip')"
          >
            {{ t('governance.dao.discordMissingWarning') }}
          </p>

          <div class="gv-vote-line">
            <span class="gv-vote-count gv-vote-count--pour">{{ t('governance.dao.votesApprove', { count: selectedProposal.approveVotes }) }}</span>
            <span class="gv-vote-count gv-vote-count--contre">{{ t('governance.dao.votesReject', { count: selectedProposal.rejectVotes }) }}</span>
            <span v-if="selectedProposal.proposalType === ProposalType.Confirmation" class="gv-vote-count gv-vote-count--ajourner">
              {{ t('governance.dao.votesPostpone', { count: selectedProposal.postponeVotes }) }}
            </span>
          </div>
          <div class="gv-quorum-line">
            <span :title="quorumTooltip(selectedProposal)">
              {{
                t('governance.dao.quorumLine', {
                  cast:
                    selectedProposal.approveVotes +
                    selectedProposal.rejectVotes +
                    (selectedProposalMode === 'past' && selectedProposal.proposalType === ProposalType.Confirmation ? selectedProposal.postponeVotes : 0),
                  required: requiredQuorum(selectedProposal),
                  total: selectedProposal.activeSnapshot,
                })
              }}
            </span>
          </div>

          <p v-if="selectedProposalMode === 'past'" class="gv-prop-statut" :class="`gv-prop-statut--${pastStatus(selectedProposal)}`">
            {{ PAST_STATUS_LABELS[pastStatus(selectedProposal)] }}
          </p>

          <div v-else class="gv-prop-actions">
            <template v-if="role === 'wolf' && Number(selectedProposal.deadline) > now && !isTargetInConflict(selectedProposal)">
              <button class="btn btn-primary" :disabled="txPending" @click="vote(selectedProposal.id, VoteChoice.Approve)">{{ t('governance.dao.approve') }}</button>
              <button class="btn btn-outline-danger" :disabled="txPending" @click="vote(selectedProposal.id, VoteChoice.Reject)">{{ t('governance.dao.reject') }}</button>
              <button
                v-if="selectedProposal.proposalType === ProposalType.Confirmation"
                class="btn btn-outline"
                :disabled="txPending || postponementBlocked(selectedProposal)"
                @click="vote(selectedProposal.id, VoteChoice.Postpone)"
              >
                {{ t('governance.dao.postpone') }}
              </button>
            </template>
            <p v-else-if="role === 'wolf' && Number(selectedProposal.deadline) > now && isTargetInConflict(selectedProposal)" class="gv-card-note">
              {{ t('governance.dao.inConflictNote') }}
            </p>
            <button v-else-if="Number(selectedProposal.deadline) <= now" class="btn btn-outline" :disabled="txPending" @click="execute(selectedProposal.id)">
              {{ t('governance.dao.execute') }}
            </button>
          </div>
        </aside>
        </div>
      </main>

      <aside class="gv-side-column">
      <div v-if="role === 'wolf'" class="gv-new-prop-panel">
        <h3 class="gv-card-title">{{ t('governance.dao.openProposalTitle') }}</h3>

        <SubmitProposalPanel @select-expense="expenseModalOpen = true" />
      </div>

      <aside class="gv-card-panel">
        <template v-if="!address">
          <p class="gv-card-title">{{ t('governance.dao.myCard') }}</p>
          <p class="gv-card-note">{{ t('governance.dao.connectToSeeCard') }}</p>
          <button class="btn btn-primary" @click="onConnect">{{ t('common.connectWallet') }}</button>
        </template>
        <template v-else-if="wrongNetwork">
          <p class="gv-error">{{ t('common.wrongNetwork') }}</p>
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
            @apply="applyForMembership"
            @refresh-balance="loadBalance"
          />
        </template>
        <template v-else>
          <div class="gv-badge-frame" :class="`gv-badge-frame--${role}`">
            <img v-if="cardImage" :src="cardImage" alt="Illustration de la carte de membre" />
          </div>
          <p class="gv-card-title" style="text-align: center">{{ t('governance.dao.myCardRankTitle', { rank: role === "wolf" ? t('governance.dao.rankWolf') : t('governance.dao.rankCub') }) }}</p>

          <button
            v-if="!myDiscord"
            class="btn btn-primary gv-discord-link-btn"
            type="button"
            @click="requestDiscordLink(address!)"
          >
            {{ t('governance.dao.linkDiscord') }}
          </button>
          <button
            v-else
            class="gv-discord-unlink-btn"
            type="button"
            :disabled="unlinkPending"
            :title="t('governance.dao.unlinkTooltip')"
            @click="onUnlinkDiscord"
          >
            {{ unlinkPending ? t('governance.dao.unlinking') : t('governance.dao.unlinkDiscord') }}
          </button>

          <p class="gv-card-note" style="text-align: center"><AddressChip v-if="address" :address="address" short /></p>
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
            <summary>{{ t('governance.dao.moreDetails') }}</summary>
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
          </details>
        </template>
      </aside>
      </aside>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.gv-loading,
.gv-card-note {
  color: $color-text-dim;
  font-size: $fs-caption;
}

.gv-gate {
  padding: $space-4;
  margin-bottom: $space-4;
  background: $color-card-bg;
  border: 1px solid $color-border;
  border-radius: $radius-md;
}

.gv-gate-text {
  color: $color-text;
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
  background: $color-card-bg;
  border: 1px solid $color-border;
  border-left: 3px solid $color-danger;
  border-radius: $radius-md;
  padding: $space-2 $space-3;
  margin: 0 0 $space-3;
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
  background: $color-page-bg;
  padding: $space-4 $space-3;
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
    letter-spacing: 0.04em;
  }
}

.gv-layout {
  max-width: 1080px;
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

@media (max-width: 820px) {
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
  border-radius: $radius-sm;
  border: none;
  background: transparent;
  color: $color-text-dim;
  cursor: pointer;
  padding: 0;

  &:hover:not(:disabled) { color: $color-orange-dark; background: $color-page-bg; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
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

.gv-card-more {
  margin-top: $space-2;

  summary {
    cursor: pointer;
    color: $color-text-dim;
    font-size: $fs-caption;
    padding: $space-1 0;
  }

  .gv-stat-row:last-child { border-bottom: none; }
}

.gv-reveil-btn {
  display: block;
  width: 100%;
  margin: $space-2 0;
  font-size: $fs-caption;
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
}

.gv-prop-list { display: flex; flex-direction: column; gap: $space-3; }

.gv-main-columns {
  display: grid;
  grid-template-columns: 1fr;
  gap: $space-4;
  align-items: start;
}
// The detail panel sits beside the list on wide viewports (list stays
// visible/reachable) and stacks full-width below it on narrow ones.
@media (min-width: 900px) {
  .gv-main-columns--split { grid-template-columns: minmax(0, 1fr) 340px; }
}
.gv-main-list { min-width: 0; }

.gv-detail-panel {
  background: $color-card-bg;
  border: 1px solid $color-orange-dark;
  border-radius: $radius-md;
  padding: $space-4;
  position: sticky;
  top: calc(var(--navbar-height, 80px) + #{$space-4});
}
.gv-detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: $space-2;
}
.gv-detail-close {
  width: 24px;
  height: 24px;
}
.gv-detail-type {
  font-size: $fs-caption;
  font-weight: 600;
  color: $color-orange-dark;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin: 0 0 $space-1;
}
.gv-detail-rows {
  margin: $space-2 0;
}

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
