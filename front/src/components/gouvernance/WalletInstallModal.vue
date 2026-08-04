<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { useWallet } from "../../composables/useWallet";

const { t } = useI18n();
const { noWalletDetected, connect } = useWallet();

function retry() {
  noWalletDetected.value = false;
  connect();
}
function dismiss() {
  noWalletDetected.value = false;
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && noWalletDetected.value) dismiss();
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <div
    v-if="noWalletDetected"
    class="wim-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="wim-title"
    @click.self="dismiss"
  >
    <div class="wim-card">
      <button class="wim-close" type="button" :aria-label="t('walletInstall.close')" @click="dismiss">✕</button>
      <div class="wim-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
          <rect x="2" y="6" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
          <circle cx="17" cy="15" r="1" />
        </svg>
      </div>
      <p id="wim-title" class="wim-title">{{ t('walletInstall.title') }}</p>
      <p class="wim-text">{{ t('walletInstall.text') }}</p>
      <div class="wim-actions">
        <a class="btn btn-primary" href="https://metamask.io/download/" target="_blank" rel="noopener">
          {{ t('walletInstall.install') }}
        </a>
        <button class="btn btn-outline" type="button" @click="retry">{{ t('walletInstall.retry') }}</button>
      </div>

      <p class="wim-or">{{ t('walletInstall.or') }}</p>
      <button class="btn btn-outline wim-discord-btn" type="button" disabled>
        {{ t('walletInstall.continueWithDiscord') }}
        <span class="wim-soon-badge">{{ t('governance.dao.comingSoon') }}<span class="gv-tm">™</span></span>
      </button>
      <p class="wim-discord-note">{{ t('walletInstall.discordNote') }}</p>
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
  position: relative;
  background: $color-card-bg;
  border: 1px solid $color-border;
  border-radius: $radius-md;
  padding: $space-4;
  width: 100%;
  max-width: 380px;
  text-align: center;
}

.wim-close {
  position: absolute;
  top: $space-2;
  right: $space-2;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: $color-text-dim;
  font-size: $fs-h4;
  line-height: 1;
  cursor: pointer;
  border-radius: $radius-sm;

  &:hover,
  &:focus-visible {
    color: $color-black;
    background: $color-border;
  }
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
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $space-2;
  cursor: not-allowed;
  opacity: 0.5;
}

.wim-discord-note {
  font-size: $fs-caption;
  color: $color-text-dim;
  margin: $space-2 0 0;
}

// Same "Soon™" treatment as SubmitProposalPanel.vue/ProposalDetail.vue —
// kept visually identical for consistency across the app.
.wim-soon-badge {
  flex-shrink: 0;
  font-family: $font-mono;
  font-size: 1.05rem;
  font-weight: 700;
  border: 1px solid $color-orange-dark;
  border-radius: $radius-sm;
  padding: 0.15rem 0.6rem;
  color: $color-orange-dark;
}

.gv-tm {
  font-size: 1.3em;
  vertical-align: baseline;
}

</style>
