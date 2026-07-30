<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<template>
  <div id="page-top" class="carnet">
    <!-- Intro -->
    <header class="intro">
      <div class="intro-text-block">
        <h1 class="brand-heading">{{ t('home.title') }}</h1>
        <p class="intro-text">{{ t('home.tagline') }}</p>
        <router-link to="/gouvernance?tab=presentation" class="intro-cta intro-cta--dao">{{ t('home.daoTeaser') }} &rarr;</router-link>
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
  // NavBar is `navbar-fixed-top` — content needs this offset or it renders
  // underneath it (observed: the title clipped behind the nav bar).
  padding-top: var(--navbar-height, 80px);
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
  min-height: calc(100vh - var(--navbar-height, 80px));
  padding-top: $space-5;
  text-align: center;
  color: $color-text;
  background: $color-page-bg;
}

.intro-text-block {
  padding: 0 $space-4;
}

.intro .brand-heading {
  font-size: $fs-section-title + 12px;
  font-family: $font-display;
  font-weight: 700;
  color: $color-black;
  margin: 0 0 $space-3;
}

.intro .intro-text {
  font-size: $fs-card-title;
  font-weight: 400;
  color: $color-text-dim;
  max-width: 42rem;
  margin: 0 auto $space-4;
}

.intro-cta {
  display: inline-block;
  font-size: $fs-body;
  font-weight: 600;
  color: $color-orange-dark;
  border-bottom: 1px solid currentColor;
  padding-bottom: 2px;
}
.intro-cta:hover,
.intro-cta:focus {
  color: $color-orange;
}

.intro-cta--dao {
  margin-top: $space-2;
  font-size: $fs-caption;
  color: $color-text-dim;
  border-bottom-color: $color-border;
}
.intro-cta--dao:hover,
.intro-cta--dao:focus {
  color: $color-orange-dark;
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
