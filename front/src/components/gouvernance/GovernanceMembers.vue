<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { Address } from "viem";
import { useWallet } from "../../composables/useWallet";
import { useMeute, ProposalType, type Member } from "../../composables/useMeute";
import { useDiscordLink } from "../../composables/useDiscordLink";
import { useToast } from "../../composables/useToast";
import { friendlyContractError } from "../../composables/contractErrors";
import { useLocalAutoRefresh } from "../../composables/useLocalAutoRefresh";
import AddressChip from "./AddressChip.vue";

const { t } = useI18n();
const { address, connect, readOnlyContract, writableContract, publicClient, ensureContractAddressSynced } = useWallet();
const { members, proposals, loading, error, isAuthorized, loadAll } = useMeute();

// Purely front-side marker (never a real Rank value on the contract side,
// which only has Cub=0/Wolf=1): an applicant doesn't have a card at all
// yet, just an open Admission proposal — we still mix them into the
// members list (we already interact with them in practice), without
// confirm/exclude actions since they're voted on via their own
// application.
const APPLICANT_RANK = -1;
const { discordLinkFor } = useDiscordLink();
const { showToast } = useToast();

// Current visitor's role — not exposed by useMeute (which describes
// members in general, not "me" specifically): a targeted read is enough,
// no need to duplicate all of GovernanceDao.vue's logic.
const myRank = ref<number | null>(null);
async function loadMyRank() {
  if (!address.value) {
    myRank.value = null;
    return;
  }
  await ensureContractAddressSynced();
  const balance = (await readOnlyContract().read.balanceOf([address.value])) as bigint;
  if (balance === 0n) {
    myRank.value = null;
    return;
  }
  const card = (await readOnlyContract().read.card([address.value])) as { rank: number };
  myRank.value = Number(card.rank);
}
const amIAWolf = computed(() => myRank.value === 1);

onMounted(async () => {
  await loadAll();
  loadMyRank();
});
watch(address, loadMyRank);

// See GovernanceDao.vue: without resetting scroll to 0 when the members
// list disappears (disconnect), the scroll position stays where it was on
// a much shorter page.
watch(isAuthorized, (authorized) => {
  if (!authorized) window.scrollTo({ top: 0 });
});

// Local demo mode only — see GovernanceDao.vue for context (the demo
// panel changes state in another tab, without notifying this one).
useLocalAutoRefresh(async () => {
  await loadAll();
  await loadMyRank();
});

interface Row extends Member {
  username?: string;
  avatarUrl?: string;
}

const search = ref("");
const rows = computed<Row[]>(() => {
  const q = search.value.trim().toLowerCase();

  const applicants: Row[] = proposals.value
    .filter((p) => p.proposalType === ProposalType.Admission && !p.executed)
    .map((p) => ({ address: p.target, rank: APPLICANT_RANK, dormant: false }));

  return [...members.value, ...applicants]
    .map((m) => {
      const link = discordLinkFor(m.address);
      return { ...m, username: link?.username, avatarUrl: link?.avatarUrl };
    })
    .filter((m) => !q || (m.username ?? "").toLowerCase().includes(q) || m.address.toLowerCase().includes(q))
    .sort((a, b) => (a.username ?? a.address).localeCompare(b.username ?? b.address));
});

type ActionType = "confirm" | "exclude";
const confirmation = ref<{ type: ActionType; member: Row } | null>(null);
const txPending = ref(false);
const txError = ref<string | null>(null);

function requestAction(type: ActionType, member: Row) {
  txError.value = null;
  confirmation.value = { type, member };
}
function cancel() {
  confirmation.value = null;
  txError.value = null;
}

// GovernanceDao.vue and GovernanceDonations.vue already go through a
// handler that displays the error — this page called `connect` raw, so a
// cancelled click on the MetaMask popup turned into an unhandled promise
// rejection, with no visible feedback to the user.
async function onConnect() {
  txError.value = null;
  try {
    await connect();
  } catch (e) {
    txError.value = friendlyContractError(e, t);
  }
}

async function confirmAction() {
  if (!confirmation.value) return;
  const { type, member } = confirmation.value;
  const target = member.address as Address;
  txPending.value = true;
  txError.value = null;
  try {
    if (type === "confirm") {
      await readOnlyContract().simulate.openConfirmationVote([target], { account: address.value! });
      const hash = await writableContract().write.openConfirmationVote([target]);
      await publicClient.waitForTransactionReceipt({ hash });
    } else {
      await readOnlyContract().simulate.proposeExclusion([target], { account: address.value! });
      const hash = await writableContract().write.proposeExclusion([target]);
      await publicClient.waitForTransactionReceipt({ hash });
    }
    showToast(type === "confirm" ? t('governance.members.confirmationProposed') : t('governance.members.exclusionProposed'));
    confirmation.value = null;
    await loadAll();
  } catch (e) {
    txError.value = friendlyContractError(e, t);
  } finally {
    txPending.value = false;
  }
}
</script>

<template>
  <div class="gm-page">
    <h2 class="gm-title">{{ t('governance.members.title') }}</h2>

    <div v-if="!isAuthorized" class="gm-gate">
      <p class="gm-gate-text">{{ t('governance.members.gateText') }}</p>
      <button class="btn btn-primary" type="button" @click="onConnect">{{ t('common.connectWallet') }}</button>
      <p v-if="txError" class="gm-error">{{ txError }}</p>
    </div>

    <template v-else>
      <p class="gm-intro">{{ t('governance.members.intro', { count: rows.length }, rows.length) }}</p>

      <p v-if="loading" class="gm-status">{{ t('common.loadingOnChain') }}</p>
      <p v-else-if="error" class="gm-status gm-status--error">{{ t('governance.members.readError', { error }) }}</p>

      <div class="gm-search-wrap">
      <svg class="gm-search-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" />
        <path d="M13.5 13.5 10.6 10.6" stroke-linecap="round" />
      </svg>
      <input v-model="search" class="gm-search" type="text" :placeholder="t('governance.members.searchPlaceholder')" />
    </div>

    <ul class="gm-list">
      <li v-for="m in rows" :key="m.address" class="gm-row">
        <img v-if="m.avatarUrl" class="gm-avatar" :src="m.avatarUrl" alt="" />
        <span v-else class="gm-avatar gm-avatar--placeholder" aria-hidden="true"></span>

        <div class="gm-identity">
          <span v-if="m.username" class="gm-username">{{ m.username }}</span>
          <span v-else class="gm-username gm-username--none">{{ t('governance.members.noDiscordLinked') }}</span>
          <AddressChip :address="m.address" short address-only />
        </div>

        <span
          v-if="m.rank === -1"
          class="gm-badge gm-badge--applicant"
          :title="t('governance.members.applicantTooltip')"
        >
          {{ t('governance.members.applicant') }}
        </span>
        <span
          v-else
          class="gm-badge"
          :class="[`gm-badge--${m.rank === 0 ? 'cub' : 'wolf'}`, { 'gm-badge--dormant': m.dormant }]"
        >
          {{ m.rank === 0 ? t('governance.dao.rankCub') : t('governance.dao.rankWolf') }}{{ m.dormant ? t('governance.members.dormantSuffix') : "" }}
        </span>

        <div
          v-if="amIAWolf && m.rank !== -1 && m.address.toLowerCase() !== address?.toLowerCase()"
          class="gm-actions"
        >
          <button
            v-if="m.rank === 0"
            class="gm-action gm-action--up"
            type="button"
            :title="t('governance.members.proposeConfirmation')"
            @click="requestAction('confirm', m)"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M8 12.5V3.5M4 7.5 8 3.5l4 4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <button
            class="gm-action gm-action--x"
            type="button"
            :title="t('governance.members.proposeExclusion')"
            @click="requestAction('exclude', m)"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </li>
      <li v-if="!rows.length" class="gm-empty">{{ t('memberPicker.noMatch') }}</li>
      </ul>

      <div v-if="confirmation" class="gm-overlay" @click.self="cancel">
        <div class="gm-modal">
          <p class="gm-modal-title">
            {{ confirmation.type === "confirm" ? t('governance.members.confirmModalConfirm') : t('governance.members.confirmModalExclude') }}
            <strong>{{ confirmation.member.username ?? confirmation.member.address }}</strong> ?
          </p>
          <p class="gm-modal-note">{{ t('governance.members.confirmModalNote') }}</p>
          <p v-if="txError" class="gm-error">{{ txError }}</p>
          <div class="gm-modal-actions">
            <button class="btn btn-outline" type="button" :disabled="txPending" @click="cancel">{{ t('common.cancel') }}</button>
            <button class="btn btn-primary" type="button" :disabled="txPending" @click="confirmAction">
              {{ txPending ? t('common.inProgress') : t('common.confirm') }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.gm-page {
  max-width: 900px;
  margin: 0 auto;
  padding: $space-5 $space-3 ($space-5 * 2);
  background: $color-page-bg;
}

.gm-title {
  color: $color-black;
  font-family: $font-display;
  font-weight: 700;
  font-size: $fs-section-title;
  margin: 0 0 $space-1;
}

.gm-intro {
  color: $color-text-dim;
  font-size: $fs-body;
  margin: 0 0 $space-4;
}

.gm-gate {
  padding: $space-4;
  text-align: center;
  background: $color-card-bg;
  border: 1px solid $color-border;
  border-radius: $radius-md;
}

.gm-gate-text {
  color: $color-text;
  font-size: $fs-body;
  margin: 0 0 $space-3;
}

.gm-status {
  color: $color-text-dim;
  font-size: $fs-caption;
  margin: -#{$space-2} 0 $space-3;

  &--error {
    color: $color-danger;
  }
}

.gm-search-wrap {
  position: relative;
  margin: $space-4 0;
}

.gm-search-icon {
  position: absolute;
  top: 50%;
  left: $space-3;
  transform: translateY(-50%);
  color: $color-text-dim;
  pointer-events: none;
}

.gm-search {
  width: 100%;
  box-sizing: border-box;
  background: $color-card-bg;
  border: 1px solid $color-border;
  border-radius: $radius-md;
  padding: $space-2 $space-3 $space-2 ($space-5 + 4px);
  font: inherit;
  font-size: $fs-body;
  color: $color-text;

  &::placeholder {
    color: $color-text-dim;
  }

  &:focus {
    outline: none;
    border-color: $color-orange-dark;
  }
}

// Hairline-separated rows on the paper background, matching the ledger
// aesthetic used elsewhere (ProposalCard, GovernanceDao stat rows).
.gm-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.gm-row {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-3;
  background: $color-card-bg;
  border: 1px solid $color-border;
  border-top: none;
  transition: background 0.15s ease;

  &:first-child {
    border-top: 1px solid $color-border;
    border-radius: $radius-md $radius-md 0 0;
  }
  &:last-child {
    border-radius: 0 0 $radius-md $radius-md;
  }
  &:only-child {
    border-radius: $radius-md;
  }

  &:hover {
    background: $color-page-bg;
  }

  // Actions only reach their full visual weight on row hover — otherwise
  // 2 icons x N rows compete with the usernames when reading (feedback
  // from a UX agent).
  &:hover .gm-action,
  &:focus-within .gm-action {
    opacity: 1;
  }
}

.gm-empty {
  padding: $space-4;
  text-align: center;
  color: $color-text-dim;
  font-size: $fs-caption;
}

.gm-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 2px solid $color-border;

  &--placeholder {
    background: $color-page-bg;
  }
}

.gm-identity {
  display: flex;
  align-items: baseline;
  gap: $space-2;
  min-width: 0;
  flex: 1;
}

.gm-username {
  font-weight: 600;
  font-size: $fs-body;
  color: $color-black;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &--none {
    font-weight: 400;
    font-style: italic;
    color: $color-text-dim;
  }
}

.gm-badge {
  flex-shrink: 0;
  // Fixed width rather than content-based: "Loup", "Louveteau · dormant"
  // and "Candidat" aren't the same length, and leaving it to content
  // shifted the action icons from one row to the next (user feedback).
  width: 150px;
  text-align: center;
  font-family: $font-mono;
  font-size: $fs-caption;
  font-weight: 500;
  padding: $space-1 $space-2;
  border: 1px solid $color-border;
  border-radius: $radius-sm;
  color: $color-text-dim;

  &--wolf {
    border-color: $color-wolf;
    color: $color-wolf;
  }
  &--cub {
    border-color: $color-cub;
    color: $color-cub;
  }
  // Muted role rather than a separate badge — "dormant Wolf" stays a
  // Wolf, not a second disjoint piece of info (feedback from a UX agent).
  &--dormant {
    opacity: 0.55;
  }
  &--applicant {
    border-color: $color-orange-dark;
    color: $color-orange-dark;
  }
}

.gm-actions {
  display: flex;
  gap: $space-1;
  flex-shrink: 0;
}

.gm-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: $radius-sm;
  border: 1px solid $color-border;
  background: transparent;
  color: $color-text-dim;
  opacity: 0.55;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;

  &:hover {
    opacity: 1;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.3 !important;
  }

  &--up:hover:not(:disabled) {
    background: $color-page-bg;
    border-color: $color-success;
    color: $color-success;
  }
  &--x:hover {
    background: $color-page-bg;
    border-color: $color-danger;
    color: $color-danger;
  }
}

.gm-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(27, 26, 24, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: $space-4;
}

.gm-modal {
  background: $color-card-bg;
  border: 1px solid $color-border;
  border-radius: $radius-md;
  padding: $space-4;
  width: 100%;
  max-width: 400px;
}

.gm-modal-title {
  font-size: $fs-h4;
  color: $color-black;
  margin: 0 0 $space-2;
}

.gm-modal-note {
  font-size: $fs-caption;
  color: $color-text-dim;
  margin: 0 0 $space-4;
}

.gm-error {
  font-size: $fs-caption;
  color: $color-danger;
  margin: 0 0 $space-3;
}

.gm-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: $space-2;
}
</style>
