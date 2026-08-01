<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useLocale } from "../composables/useLocale";
import { useTheme } from "../composables/useTheme";
import ThemeToggleIcon from "./ThemeToggleIcon.vue";

const { t } = useI18n();
const { locale, setLocale } = useLocale();
const { theme, toggleTheme } = useTheme();
</script>

<template>
  <div class="home-header">
    <button
      type="button"
      class="lang-toggle"
      :aria-label="locale === 'fr' ? 'Switch to English' : 'Passer en français'"
      @click="setLocale(locale === 'fr' ? 'en' : 'fr')"
    >
      {{ locale === 'fr' ? 'EN' : 'FR' }}
    </button>
    <button
      type="button"
      class="home-header__theme-toggle"
      :aria-label="theme === 'light' ? t('theme.switchToDark') : t('theme.switchToLight')"
      :title="theme === 'light' ? t('theme.switchToDark') : t('theme.switchToLight')"
      @click="toggleTheme"
    >
      <ThemeToggleIcon :theme="theme" />
    </button>
  </div>
</template>

<style lang="scss" scoped>
// Home-only floating control cluster, replacing the full NavBar on the
// hero page (see App.vue). Reuses the same `.lang-toggle` markup/behavior
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

.lang-toggle {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-family: $font-mono;
  font-size: $fs-caption;
  color: $color-text-dim;
  cursor: pointer;
  transition: color 0.15s ease;

  &:hover {
    color: $color-orange-dark;
  }
}

.home-header__theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 0;
  color: $color-text-dim;
  cursor: pointer;
  transition: color 0.15s ease;

  &:hover {
    color: $color-orange-dark;
  }
}
</style>
