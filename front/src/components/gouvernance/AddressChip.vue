<script setup lang="ts">
import { computed, ref } from "vue";
import type { Address } from "viem";
import { useDiscordLink } from "../../composables/useDiscordLink";

const props = defineProps<{
  address: string;
  short?: boolean;
  // Force l'affichage du hash même si un pseudo Discord existe — pour les
  // endroits (ex: GouvernanceMembres.vue) où le pseudo est déjà affiché
  // séparément juste au-dessus : sans ça, ce composant le réaffichait une
  // deuxième fois (constaté par l'utilisateur, doublon visuel).
  addressOnly?: boolean;
  // Icônes/texte clairs, pour un usage sur fond sombre (dashboard #111).
  dark?: boolean;
}>();

const { discordLinkFor } = useDiscordLink();
// L'identité Discord vérifiée prime sur le hash dès qu'elle existe — plus
// lisible pour les Loups qui votent, l'adresse reste toujours disponible
// juste à côté (copier/Etherscan) pour qui veut vérifier. La page entière
// n'est de toute façon accessible qu'aux membres authentifiés (voir
// useMeute.ts, estAutorise) : pas besoin d'un mode "masqué" séparé ici.
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
      <span class="addr-pseudo" :title="address">{{ link.pseudo }}</span>
    </template>
    <span v-else class="mono">{{ displayed() }}</span>
    <span class="addr-actions">
      <button
        class="icon-btn"
        :class="{ 'icon-btn--success': copied }"
        type="button"
        :title="copied ? 'Copié !' : 'Copier l\'adresse'"
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
        title="Voir sur Etherscan"
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

.addr-chip--dark {
  color: rgba(255, 255, 255, 0.5);

  .icon-btn {
    color: rgba(255, 255, 255, 0.5);

    &:hover {
      color: $color-orange;
      background: rgba(249, 174, 60, 0.16);
    }
  }
}

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

.addr-pseudo {
  font-weight: 600;
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
  transition: color 0.15s ease, background 0.15s ease, transform 0.15s ease;

  &:hover {
    color: $color-orange-dark;
    background: rgba(249, 174, 60, 0.12);
  }

  &--success {
    color: #2e9e5b;
    background: rgba(46, 158, 91, 0.12);
    transform: scale(1.15);
  }
}
</style>
