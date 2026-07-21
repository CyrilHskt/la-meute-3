<script setup lang="ts">
import { ref } from "vue";
import { CONTRACT_VERSION } from "../contract";
import { FRONT_VERSION, FRONT_CHANGELOG, CONTRACT_CHANGELOG } from "../changelog";

const open = ref(false);
</script>

<template>
  <button class="version-badge" type="button" @click="open = true">
    <span class="dot"></span> v3.0
  </button>

  <div v-if="open" class="vm-overlay" @click.self="open = false">
    <div class="vm-card">
      <div class="vm-head">
        <h2>Versions &amp; mises à jour</h2>
        <button class="vm-close" type="button" title="Fermer" @click="open = false">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <div class="vm-body">
        <div class="vm-section">
          <div class="vm-section-head">
            <p class="vm-section-title">Site &amp; dashboard</p>
            <span class="vm-section-version">front v{{ FRONT_VERSION }}</span>
          </div>
          <div v-for="entry in FRONT_CHANGELOG" :key="entry.date + entry.title" class="vm-entry">
            <div class="vm-entry-date">{{ entry.date }}</div>
            <div class="vm-entry-title">{{ entry.title }}</div>
          </div>
        </div>

        <div class="vm-section">
          <div class="vm-section-head">
            <p class="vm-section-title">Contrat</p>
            <span class="vm-section-version">contract v{{ CONTRACT_VERSION }}</span>
          </div>
          <div v-for="entry in CONTRACT_CHANGELOG" :key="entry.date + entry.title" class="vm-entry">
            <div class="vm-entry-date">{{ entry.date }}</div>
            <div class="vm-entry-title">{{ entry.title }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.version-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  padding: 0.3rem 0.8rem;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.55);
  cursor: pointer;
  font-family: $font-mono;

  &:hover { border-color: $color-orange; color: $color-orange; }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: $color-orange;
  }
}

.vm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 10, 10, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  z-index: 200;
}

.vm-card {
  background: $color-card-bg;
  border-radius: 6px;
  width: 100%;
  max-width: 480px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
  text-align: left;
}

.vm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.2rem 1.4rem;
  border-bottom: 1px solid $color-border;

  h2 {
    margin: 0;
    font-family: $font-display;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-size: 1rem;
    color: $color-black;
  }
}

.vm-close {
  background: none;
  border: none;
  color: $color-text-dim;
  cursor: pointer;
  padding: 0.2rem;

  &:hover { color: $color-orange-dark; }
}

.vm-body { padding: 1.2rem 1.4rem 1.6rem; }

.vm-section { margin-bottom: 1.6rem; }
.vm-section:last-child { margin-bottom: 0; }

.vm-section-head {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  margin-bottom: 0.9rem;
}

.vm-section-title {
  font-family: $font-display;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-size: $fs-caption;
  color: $color-orange-dark;
  margin: 0;
}

.vm-section-version {
  font-family: $font-mono;
  font-size: $fs-caption;
  color: $color-text-dim;
}

.vm-entry {
  padding: 0.75rem 0;
  border-bottom: 1px solid $color-border;

  &:last-child { border-bottom: none; padding-bottom: 0; }
}

.vm-entry-date {
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: $color-text-dim;
  margin-bottom: 0.25rem;
}

.vm-entry-title {
  font-size: $fs-h4;
  color: $color-black;
  font-weight: 600;
}
</style>
