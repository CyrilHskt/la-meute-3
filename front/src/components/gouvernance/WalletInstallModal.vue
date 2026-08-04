<script setup lang="ts">
import { defineAsyncComponent, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useWallet } from "../../composables/useWallet";

const { t } = useI18n();
const { noWalletDetected, connect, connectEmbedded, activeChain, isLocal } = useWallet();

function retry() {
  noWalletDetected.value = false;
  connect();
}
function dismiss() {
  noWalletDetected.value = false;
  showDiscordOption.value = false;
  discordError.value = null;
}

// Real trigger for the embedded-wallet path (issue #121) — only loaded
// (and only offered) once the member actually clicks it. Never shown in
// local demo mode: MetaMask Embedded Wallets needs a real connection to
// its own servers, which local mode (isLocal) never has.
const showDiscordOption = ref(false);
const discordError = ref<string | null>(null);
const EmbeddedWalletProvider = defineAsyncComponent(() => import("./EmbeddedWalletProvider.vue"));
const EmbeddedWalletConnectButton = defineAsyncComponent(() => import("./EmbeddedWalletConnectButton.vue"));

function openDiscordOption() {
  discordError.value = null;
  showDiscordOption.value = true;
}

async function onEmbeddedConnected(provider: Parameters<typeof connectEmbedded>[0]) {
  await connectEmbedded(provider);
  noWalletDetected.value = false;
  showDiscordOption.value = false;
}

function onEmbeddedFailed(message: string) {
  discordError.value = message;
}
</script>

<template>
  <div v-if="noWalletDetected" class="wim-overlay" @click.self="dismiss">
    <div class="wim-card">
      <div class="wim-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <rect x="2" y="6" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
          <circle cx="17" cy="15" r="1" />
        </svg>
      </div>
      <p class="wim-title">{{ t('walletInstall.title') }}</p>
      <p class="wim-text">{{ t('walletInstall.text') }}</p>
      <div class="wim-actions">
        <a class="btn btn-primary" href="https://metamask.io/download/" target="_blank" rel="noopener">
          {{ t('walletInstall.install') }}
        </a>
        <button class="btn btn-outline" type="button" @click="retry">{{ t('walletInstall.retry') }}</button>
      </div>

      <template v-if="!isLocal">
        <p class="wim-or">{{ t('walletInstall.or') }}</p>
        <template v-if="!showDiscordOption">
          <button class="btn btn-outline wim-discord-btn" type="button" @click="openDiscordOption">
            {{ t('walletInstall.continueWithDiscord') }}
          </button>
        </template>
        <template v-else>
          <EmbeddedWalletProvider :chain="activeChain">
            <EmbeddedWalletConnectButton @connected="onEmbeddedConnected" @failed="onEmbeddedFailed" />
          </EmbeddedWalletProvider>
          <p v-if="discordError" class="wim-discord-error">{{ t('walletInstall.discordFailed') }}</p>
        </template>
      </template>

      <button class="wim-dismiss" type="button" @click="dismiss">{{ t('walletInstall.dismiss') }}</button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.wim-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(27, 26, 24, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: $space-4;
}

.wim-card {
  background: $color-card-bg;
  border: 1px solid $color-border;
  border-radius: $radius-md;
  padding: $space-4;
  width: 100%;
  max-width: 380px;
  text-align: center;
}

.wim-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto $space-3;
  border-radius: 50%;
  border: 1px solid $color-border;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $color-orange-dark;
}

.wim-title {
  font-family: $font-display;
  font-weight: 700;
  font-size: $fs-h4;
  color: $color-black;
  margin: 0 0 $space-2;
}

.wim-text {
  font-size: $fs-caption;
  color: $color-text-dim;
  line-height: 1.6;
  margin: 0 0 $space-4;
}

.wim-actions {
  display: flex;
  flex-direction: column;
  gap: $space-2;

  .btn { width: 100%; }
}

.wim-or {
  font-size: $fs-caption;
  color: $color-text-dim;
  margin: $space-3 0 $space-2;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.wim-discord-btn {
  width: 100%;
}

.wim-discord-error {
  color: $color-danger;
  font-size: $fs-caption;
  margin-top: $space-2;
}

.wim-dismiss {
  background: none;
  border: none;
  color: $color-text-dim;
  font-size: $fs-caption;
  text-decoration: underline;
  cursor: pointer;
  margin-top: $space-2;
}
</style>
