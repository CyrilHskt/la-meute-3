<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { Address } from "viem";
import { useDiscordLink } from "../../composables/useDiscordLink";

const { t } = useI18n();

const props = defineProps<{
  address: string;
  short?: boolean;
  // Forces the hash to display even if a Discord username exists — for
  // places (e.g. GovernanceMembers.vue) where the username is already
  // shown separately just above: without this, this component displayed
  // it a second time (observed by the user, visual duplicate).
  addressOnly?: boolean;
  // Historically used to switch to bright icons/text for the dashboard's
  // old dark shell (#111). The dashboard is light now (carnet-de-meute),
  // so this currently has no visual effect — kept as a no-op prop rather
  // than removed, since dark surfaces may come back later (e.g. a future
  // explicit dark theme toggle) and callers already pass it.
  dark?: boolean;
}>();

const { discordLinkFor } = useDiscordLink();
// The verified Discord identity takes priority over the hash as soon as
// it exists — more readable for Wolves who vote, the address always
// stays available right next to it (copy/Etherscan) for anyone who wants
// to verify. The whole page is only accessible to authenticated members
// anyway (see useMeute.ts, isAuthorized): no need for a separate
// "hidden" mode here.
const link = computed(() => (props.addressOnly ? null : discordLinkFor(props.address as Address)));

const copied = ref(false);

function displayed(): string {
  if (!props.short) return props.address;
  return `${props.address.slice(0, 6)}…${props.address.slice(-4)}`;
}

async function copy() {
  await navigator.clipboard.writeText(props.address);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}
</script>

<template>
  <span class="addr-chip" :class="{ 'addr-chip--dark': dark }">
    <template v-if="link">
      <img class="addr-avatar" :src="link.avatarUrl" alt="" />
      <span class="addr-username" :title="address">{{ link.username }}</span>
    </template>
    <span v-else class="mono">{{ displayed() }}</span>
    <span class="addr-actions">
      <button
        class="icon-btn"
        :class="{ 'icon-btn--success': copied }"
        type="button"
        :title="copied ? t('addressChip.copied') : t('addressChip.copy')"
        @click="copy"
      >
        <svg v-if="copied" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M3 8.5 6.5 12 13 4.5" />
        </svg>
        <svg v-else viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4">
          <rect x="5" y="5" width="9" height="9" rx="1.5" />
          <path d="M3 11V3a1.5 1.5 0 0 1 1.5-1.5H11" />
        </svg>
      </button>
      <a
        class="icon-btn"
        :href="`https://sepolia.etherscan.io/address/${address}`"
        target="_blank"
        rel="noopener"
        :title="t('addressChip.viewOnEtherscan')"
      >
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4">
          <path d="M6.5 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V10.5" />
          <path d="M9 2h5v5M13.5 2.5 7 9" />
        </svg>
      </a>
    </span>
  </span>
</template>

<style lang="scss" scoped>
.addr-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: $fs-caption;
}

// No-op today (see the `dark` prop's comment above) — this class is only
// applied by callers that opt in via the `dark` prop, none currently do.

.addr-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
}

.addr-avatar {
  width: 16px;
  height: 16px;
  border-radius: 50%;
}

.addr-username {
  font-weight: 600;
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
  transition: color 0.15s ease, background 0.15s ease, transform 0.15s ease;

  &:hover {
    color: $color-orange-dark;
    background: $color-page-bg;
  }

  &--success {
    color: $color-success;
    background: $color-page-bg;
    transform: scale(1.15);
  }
}
</style>
