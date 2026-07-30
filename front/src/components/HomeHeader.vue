<script setup lang="ts">
import { useLocale } from "../composables/useLocale";

const { locale, setLocale } = useLocale();

// Placeholder for future dark-mode work: a single light theme was
// deliberately shipped (see src/styles/_tokens.scss header note), this
// button just reserves the UI slot for a real toggle later. Intentionally
// non-functional — not a forgotten TODO.
function onDarkModeTogglePlaceholderClick() {
  // no-op: dark mode isn't implemented yet.
}
</script>

<template>
  <div class="home-header">
    <div class="lang-switch">
      <button type="button" :class="{ active: locale === 'fr' }" @click="setLocale('fr')">FR</button>
      <span aria-hidden="true">/</span>
      <button type="button" :class="{ active: locale === 'en' }" @click="setLocale('en')">EN</button>
    </div>
    <button
      type="button"
      class="home-header__dark-mode-placeholder"
      aria-label="Mode sombre (bientôt disponible)"
      aria-disabled="true"
      title="Mode sombre (bientôt disponible)"
      @click="onDarkModeTogglePlaceholderClick"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linejoin="round"
        />
      </svg>
    </button>
  </div>
</template>

<style lang="scss" scoped>
// Home-only floating control cluster, replacing the full NavBar on the
// hero page (see App.vue). Reuses the same `.lang-switch` markup/behavior
// as NavBar.vue's masthead version, just in a compact floating shell.
.home-header {
  position: fixed;
  top: $space-3;
  right: $space-3;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: $space-2;
  padding: $space-2 $space-3;
  background: $color-page-bg;
  border: 1px solid $color-border;
  border-radius: $radius-sm;
  font-family: $font-body;
}

.lang-switch {
  display: flex;
  align-items: center;
  gap: $space-1;
}
.lang-switch button {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-family: $font-mono;
  font-size: $fs-caption;
  color: $color-text-dim;
  cursor: pointer;
}
.lang-switch button.active {
  color: $color-orange-dark;
  font-weight: 700;
}
.lang-switch span {
  color: $color-text-dim;
}

.home-header__dark-mode-placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 0;
  color: $color-text-dim;
  cursor: not-allowed;
  opacity: 0.5;
}
</style>
