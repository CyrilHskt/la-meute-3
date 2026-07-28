<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type { Address } from "viem";
import { useWallet } from "../../composables/useWallet";
import { useMeute, ProposalType, type Member } from "../../composables/useMeute";
import { useDiscordLink } from "../../composables/useDiscordLink";
import { useToast } from "../../composables/useToast";
import { friendlyContractError } from "../../composables/contractErrors";
import { useLocalAutoRefresh } from "../../composables/useLocalAutoRefresh";
import AddressChip from "./AddressChip.vue";

const { address, connect, readOnlyContract, writableContract, publicClient } = useWallet();
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
    txError.value = friendlyContractError(e);
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
    showToast(type === "confirm" ? "Titularisation proposée" : "Exclusion proposée");
    confirmation.value = null;
    await loadAll();
  } catch (e) {
    txError.value = friendlyContractError(e);
  } finally {
    txPending.value = false;
  }
}
</script>

<template>
  <div class="gm-page">
    <h2 class="gm-title">Membres de la Meute</h2>

    <div v-if="!isAuthorized" class="gm-gate">
      <p class="gm-gate-text">
        La liste des membres est réservée aux Loups et Louveteaux de la Meute — connecte le wallet que tu utilises
        pour voter afin de la consulter.
      </p>
      <button class="btn btn-primary" type="button" @click="onConnect">Connecter mon wallet</button>
      <p v-if="txError" class="gm-error">{{ txError }}</p>
    </div>

    <template v-else>
      <p class="gm-intro">
        {{ rows.length }} membre{{ rows.length > 1 ? "s" : "" }} — Loups, Louveteaux et candidatures en cours.
      </p>

      <p v-if="loading" class="gm-status">Chargement des données on-chain…</p>
      <p v-else-if="error" class="gm-status gm-status--error">
        Erreur de lecture : {{ error }} — la liste ci-dessous peut être incomplète.
      </p>

      <div class="gm-search-wrap">
      <svg class="gm-search-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" />
        <path d="M13.5 13.5 10.6 10.6" stroke-linecap="round" />
      </svg>
      <input v-model="search" class="gm-search" type="text" placeholder="Rechercher un membre…" />
    </div>

    <ul class="gm-list">
      <li v-for="m in rows" :key="m.address" class="gm-row">
        <img v-if="m.avatarUrl" class="gm-avatar" :src="m.avatarUrl" alt="" />
        <span v-else class="gm-avatar gm-avatar--placeholder" aria-hidden="true"></span>

        <div class="gm-identity">
          <span v-if="m.username" class="gm-username">{{ m.username }}</span>
          <span v-else class="gm-username gm-username--none">Discord non lié</span>
          <AddressChip :address="m.address" short address-only dark />
        </div>

        <span
          v-if="m.rank === -1"
          class="gm-badge gm-badge--applicant"
          title="Candidature d'admission en cours de vote"
        >
          Candidat
        </span>
        <span
          v-else
          class="gm-badge"
          :class="[`gm-badge--${m.rank === 0 ? 'cub' : 'wolf'}`, { 'gm-badge--dormant': m.dormant }]"
        >
          {{ m.rank === 0 ? "Louveteau" : "Loup" }}{{ m.dormant ? " · dormant" : "" }}
        </span>

        <div
          v-if="amIAWolf && m.rank !== -1 && m.address.toLowerCase() !== address?.toLowerCase()"
          class="gm-actions"
        >
          <button
            v-if="m.rank === 0"
            class="gm-action gm-action--up"
            type="button"
            title="Proposer la titularisation"
            @click="requestAction('confirm', m)"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M8 12.5V3.5M4 7.5 8 3.5l4 4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <button
            class="gm-action gm-action--x"
            type="button"
            title="Proposer l'exclusion"
            @click="requestAction('exclude', m)"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </li>
      <li v-if="!rows.length" class="gm-empty">Aucun membre trouvé.</li>
      </ul>

      <div v-if="confirmation" class="gm-overlay" @click.self="cancel">
        <div class="gm-modal">
          <p class="gm-modal-title">
            {{ confirmation.type === "confirm" ? "Proposer la titularisation de" : "Proposer l'exclusion de" }}
            <strong>{{ confirmation.member.username ?? confirmation.member.address }}</strong> ?
          </p>
          <p class="gm-modal-note">Les Loups actifs voteront ensuite pendant 7 jours.</p>
          <p v-if="txError" class="gm-error">{{ txError }}</p>
          <div class="gm-modal-actions">
            <button class="btn btn-outline" type="button" :disabled="txPending" @click="cancel">Annuler</button>
            <button class="btn btn-primary" type="button" :disabled="txPending" @click="confirmAction">
              {{ txPending ? "En cours…" : "Confirmer" }}
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
  padding: 2.5rem 1.5rem 4rem;
}

.gm-title {
  color: $color-orange;
  font-family: $font-display;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-size: $fs-section-title;
  margin: 0 0 0.4rem;
}

.gm-intro {
  color: rgba(255, 255, 255, 0.75);
  font-size: $fs-body;
  margin: 0 0 1.5rem;
}

.gm-gate {
  padding: 2rem 1.5rem;
  text-align: center;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
}

.gm-gate-text {
  color: rgba(255, 255, 255, 0.75);
  font-size: $fs-body;
  margin: 0 0 1.2rem;
}

.gm-status {
  color: rgba(255, 255, 255, 0.75);
  font-size: $fs-caption;
  margin: -0.8rem 0 1.2rem;

  &--error {
    color: #e05a47;
  }
}

.gm-search-wrap {
  position: relative;
  margin: 1.5rem 0;
}

.gm-search-icon {
  position: absolute;
  top: 50%;
  left: 0.85rem;
  transform: translateY(-50%);
  color: rgba(255, 255, 255, 0.45);
  pointer-events: none;
}

.gm-search {
  width: 100%;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 0.65rem 0.9rem 0.65rem 2.3rem;
  font: inherit;
  font-size: $fs-body;
  color: #fff;

  &::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }

  &:focus {
    outline: none;
    border-color: $color-orange;
    box-shadow: 0 0 0 3px rgba(249, 174, 60, 0.18);
  }
}

// Translucent rows on the dashboard's black background rather than a
// single opaque white slab — the list then feels part of the dark
// dashboard instead of floating on top of it like a separate page
// (feedback from a UX agent).
.gm-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.gm-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.85rem 1.1rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.07);
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
  padding: 1.5rem;
  text-align: center;
  color: rgba(255, 255, 255, 0.55);
  font-size: $fs-caption;
}

.gm-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 2px solid rgba(255, 255, 255, 0.15);

  &--placeholder {
    background: rgba(255, 255, 255, 0.06);
  }
}

.gm-identity {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  min-width: 0;
  flex: 1;
}

.gm-username {
  font-weight: 700;
  font-size: $fs-body;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &--none {
    font-weight: 400;
    font-style: italic;
    color: rgba(255, 255, 255, 0.45);
  }
}

.gm-badge {
  flex-shrink: 0;
  // Fixed width rather than content-based: "Loup", "Louveteau · dormant"
  // and "Candidat" aren't the same length, and leaving it to content
  // shifted the action icons from one row to the next (user feedback).
  width: 150px;
  text-align: center;
  font-size: $fs-caption;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 0.4rem 0.6rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.6);

  &--wolf {
    background: rgba(232, 146, 90, 0.18);
    color: #e8925a;
  }
  &--cub {
    background: rgba(199, 159, 224, 0.18);
    color: #c79fe0;
  }
  // Muted role rather than a separate badge — "dormant Wolf" stays a
  // Wolf, not a second disjoint piece of info (feedback from a UX agent).
  &--dormant {
    opacity: 0.55;
  }
  &--applicant {
    background: rgba(249, 174, 60, 0.18);
    color: $color-orange;
  }
}

.gm-actions {
  display: flex;
  gap: 0.4rem;
  flex-shrink: 0;
}

.gm-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
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
    background: rgba(46, 158, 91, 0.16);
    border-color: #2e9e5b;
    color: #2e9e5b;
  }
  &--x:hover {
    background: rgba(192, 57, 43, 0.14);
    border-color: #e05a47;
    color: #e05a47;
  }
}

.gm-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(10, 10, 10, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.gm-modal {
  background: $color-card-bg;
  border-radius: 6px;
  padding: 1.8rem;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.25);
}

.gm-modal-title {
  font-size: $fs-h4;
  color: $color-black;
  margin: 0 0 0.6rem;
}

.gm-modal-note {
  font-size: $fs-caption;
  color: $color-text-dim;
  margin: 0 0 1.2rem;
}

.gm-error {
  font-size: $fs-caption;
  color: #c0392b;
  margin: 0 0 1rem;
}

.gm-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
}
</style>
