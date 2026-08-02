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

// Clicking keeps native focus on the button, which keeps `:focus-within`
// true on `.addr-chip` after the mouse leaves — the address/username stayed
// hidden behind the "copied" checkmark indefinitely until something else
// stole focus. Blurring right after the click lets the swap revert to its
// normal hover-only behavior once the mouse actually moves away.
async function copy(event: MouseEvent) {
  // Captured before the `await`: the browser resets `event.currentTarget`
  // to null once the event's synchronous dispatch finishes, so reading it
  // after an await silently blurs nothing (the bug this fixes).
  const button = event.currentTarget as HTMLElement;
  await navigator.clipboard.writeText(props.address);
  copied.value = true;
  button.blur();
  setTimeout(() => (copied.value = false), 1500);
}
</script>

<template>
  <span class="addr-chip" :class="{ 'addr-chip--copied': copied }" :aria-label="`Adresse ${address}`">
    <span class="addr-value-slot">
      <span class="addr-value">
        <template v-if="link">
          <img class="addr-avatar" :src="link.avatarUrl" alt="" />
          <span class="addr-username" :title="address">{{ link.username }}</span>
        </template>
        <span v-else class="mono">{{ displayed() }}</span>
      </span>
      <span class="addr-actions" :class="{ 'addr-actions--visible': copied }">
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
  </span>
</template>

<style lang="scss" scoped>
.addr-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: $fs-caption;
}

.addr-value-slot {
  @media (hover: hover) {
    display: grid;
    grid-template-areas: "slot";
    // Grid's default `stretch` sized both overlaid children to the width
    // of the wider one (usually the address text) — the icon pair then
    // rendered pinned to that stretched box's own flex-start instead of
    // sitting where the text used to be, reading as "tiny and off in a
    // corner." Centering both in their shared cell keeps them where the
    // eye expects them regardless of which one is currently visible.
    justify-items: center;
    align-items: center;
  }
}

.addr-value {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;

  @media (hover: hover) {
    grid-area: slot;
    opacity: 1;
    transition: opacity 0.15s ease;

    .addr-chip:hover &,
    .addr-chip:focus-within &,
    // Keeps the value hidden for the full "copied" checkmark duration even
    // after the mouse leaves — otherwise, once focus no longer holds it
    // (see the blur() in copy()), the value and the checkmark briefly
    // showed at the same time, overlapping.
    .addr-chip--copied & {
      opacity: 0;
      // Was still interactive while merely invisible: at the exact pixels
      // where the icons now render, the mouse was actually hovering this
      // hidden text underneath (native `title` tooltip, default cursor,
      // clicks swallowed) instead of reaching the button/link on top.
      pointer-events: none;
    }
  }
}

.addr-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;

  @media (hover: hover) {
    grid-area: slot;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s ease;

    .addr-chip:hover &,
    .addr-chip:focus-within &,
    &--visible {
      opacity: 1;
      pointer-events: auto;
    }
  }
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
