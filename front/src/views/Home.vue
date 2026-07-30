<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<template>
  <div id="page-top" class="carnet">
    <!-- Intro -->
    <header class="intro">
      <div class="intro-text-block">
        <h1 class="brand-heading">{{ t('home.heroTitle') }}</h1>
        <p class="brand-subtitle">{{ t('home.subtitle') }}</p>
        <p class="intro-motto">{{ t('home.motto') }}</p>
        <nav class="intro-nav" aria-label="Navigation principale">
          <router-link to="/gouvernance?tab=presentation" class="intro-nav__link">{{ t('nav.clan') }}</router-link>
          <span class="intro-nav__sep" aria-hidden="true">&middot;</span>
          <router-link to="/gouvernance?tab=dao" class="intro-nav__link">{{ t('nav.governance') }}</router-link>
        </nav>
      </div>
      <img
        src="/img/illustrations/hero-wolf-pack-panorama.png"
        alt="Une meute de loups veillant sur un panorama de montagnes enneigées et de forêts"
        class="intro-illustration"
      />
    </header>
  </div>
</template>

<style lang="scss" scoped>
// Full rework of the v2 "Aries" template hero/sections into the
// "Carnet de meute" (field notebook) direction: paper background instead
// of a dark full-bleed photo hero, no animated scroll chevron, no
// uppercase-letter-spaced display type. All copy (t() calls, v-html
// content, alt/title text) is untouched — this is a structural/visual
// rework only.
.carnet {
  // Now that the hero-only home is short, it no longer fills the legacy
  // Aries template's `body { background-color: #000 }` (public/css/theme.css)
  // — without this, the black body bled through below the footer on
  // anything taller than a short viewport.
  min-height: 100vh;
  // Home replaces NavBar with the floating HomeHeader (see App.vue), so
  // unlike every other page it has no fixed masthead to offset for.
  background: $color-page-bg;
  color: $color-text;
}

.intro {
  // Fills the screen below the navbar rather than sitting in a narrow
  // Bootstrap `.col-md-8.col-md-offset-2` column (leftover from the old
  // template — left the rest of a wide viewport as dead whitespace, and
  // the hero read as a small floating block instead of "a grand hommage"
  // (Cyril's words) filling the screen. The illustration is pinned to the
  // bottom edge (the pack "walking" along the foot of the screen) with the
  // title block above it — the rest of the page (footer) stays reachable
  // by scrolling further down.
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 100vh;
  padding-top: $space-5;
  text-align: center;
  color: $color-text;
  background: $color-page-bg;
}

.intro-text-block {
  padding: 0 $space-4;
}

.intro .brand-heading {
  font-size: $fs-section-title + 64px;
  font-family: $font-display;
  font-weight: 700;
  color: $color-black;
  margin: 0;
  line-height: 1;
}

.intro .brand-subtitle {
  font-size: $fs-body;
  font-weight: 500;
  font-family: $font-body;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: $color-text-dim;
  margin: $space-3 0 0;
}

.intro .intro-motto {
  font-family: $font-script;
  font-weight: 600;
  font-size: $fs-section-title + 20px;
  color: $color-orange-dark;
  max-width: 46rem;
  margin: $space-5 auto 0;
  line-height: 1.3;
}

.intro-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $space-2;
  margin: $space-4 0 0;
}

.intro-nav__link {
  font-family: $font-mono;
  font-size: $fs-body;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: $color-text-dim;
  padding: $space-1 $space-2;
}
.intro-nav__link:hover,
.intro-nav__link:focus {
  color: $color-orange;
}

.intro-nav__sep {
  color: $color-text-dim;
}

.intro-illustration {
  display: block;
  width: 100%;
  max-width: none;
  height: auto;
  max-height: 55vh;
  object-fit: cover;
  object-position: bottom;
  opacity: 0.92;
  filter: sepia(35%) saturate(70%) contrast(95%);
}

</style>
