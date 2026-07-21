<script setup lang="ts">
import { useWallet } from "../../composables/useWallet";

const { noWalletDetected, connect } = useWallet();

function retry() {
  noWalletDetected.value = false;
  connect();
}
function dismiss() {
  noWalletDetected.value = false;
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
      <p class="wim-title">Il te faut un wallet</p>
      <p class="wim-text">
        Un wallet, c'est ton identité sur la Meute — pas de compte à créer, pas de mot de passe. MetaMask est
        gratuit, s'installe en 2 minutes et fonctionne directement dans ton navigateur.
      </p>
      <div class="wim-actions">
        <a class="btn btn-primary" href="https://metamask.io/download/" target="_blank" rel="noopener">
          Installer MetaMask
        </a>
        <button class="btn btn-outline" type="button" @click="retry">J'ai déjà un wallet, réessayer</button>
      </div>
      <button class="wim-dismiss" type="button" @click="dismiss">Continuer sans wallet pour l'instant</button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.wim-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(10, 10, 10, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.wim-card {
  background: $color-card-bg;
  border-radius: 6px;
  padding: 1.8rem;
  width: 100%;
  max-width: 380px;
  text-align: center;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.25);
}

.wim-icon {
  width: 52px;
  height: 52px;
  margin: 0 auto 1rem;
  border-radius: 50%;
  background: rgba(249, 174, 60, 0.14);
  display: flex;
  align-items: center;
  justify-content: center;
  color: $color-orange-dark;
}

.wim-title {
  font-family: $font-display;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-size: $fs-h4;
  color: $color-black;
  margin: 0 0 0.7rem;
}

.wim-text {
  font-size: $fs-caption;
  color: $color-text-dim;
  line-height: 1.6;
  margin: 0 0 1.3rem;
}

.wim-actions {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;

  .btn { width: 100%; }
}

.wim-dismiss {
  background: none;
  border: none;
  color: $color-text-dim;
  font-size: $fs-caption;
  text-decoration: underline;
  cursor: pointer;
  margin-top: 0.6rem;
}
</style>
