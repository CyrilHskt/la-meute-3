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
        <p class="intro-motto-source">{{ t('home.mottoSource') }}</p>
        <nav class="intro-nav" aria-label="Navigation principale">
          <router-link to="/gouvernance?tab=presentation" class="intro-nav__link">{{ t('nav.clan') }}</router-link>
          <span class="intro-nav__sep" aria-hidden="true">|</span>
          <router-link to="/gouvernance?tab=dao" class="intro-nav__link">{{ t('home.navGovernance') }}</router-link>
        </nav>
      </div>
      <img
        src="/img/illustrations/hero-wolf-pack-panorama-v2.webp"
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
  // First attempt overlaid the text on an `object-fit: cover` image
  // stretched to fill a `min-height: 100vh` box — on this asset's aspect
  // ratio (~2.5:1, much wider/flatter than a typical viewport) that meant
  // scaling the image up a lot just to cover the extra height, which read
  // as an ugly, over-zoomed crop rather than "a landscape." Cyril's ask:
  // the illustration keeps its own natural landscape proportions (never
  // cropped/zoomed to force-fill the viewport).
  //
  // A second version positioned the text absolutely at `top: 6%` of this
  // 100vh container — fragile: that percentage is relative to the
  // *viewport*, not to the image, so the gap between the title and the
  // artwork changed unpredictably with screen height (too tight on a
  // short laptop, an oversized void on a tall monitor) and needed a
  // separate hand-tuned mobile breakpoint to avoid the text overlapping
  // the image entirely. Plain flow + `margin-top: auto` on the image
  // fixes both: the text block sits at its natural size wherever it
  // falls, the image is pushed to the bottom of whatever room is left,
  // and it degrades to a normal stack on short screens automatically —
  // no viewport-relative math, no separate mobile rule needed.
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding-top: $space-5 * 2;
  text-align: center;
  color: $color-text;
  background: $color-page-bg;
}

.intro-text-block {
  padding: 0 $space-4;
  margin: 0 auto $space-5;
  max-width: 900px;
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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $space-3;
  font-size: $fs-body;
  font-weight: 500;
  font-family: $font-body;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: $color-text-dim;
  margin: $space-3 0 0;
}
.intro .brand-subtitle::before,
.intro .brand-subtitle::after {
  content: "";
  width: 32px;
  height: 1px;
  background: $color-text-dim;
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

.intro-motto-source {
  font-family: $font-body;
  font-style: italic;
  font-size: $fs-caption;
  color: $color-text-dim;
  margin: $space-2 0 0;
}

.intro-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $space-2;
  margin: $space-5 0 0;
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.6em;
  line-height: 1;
  color: $color-text-dim;
}

.intro-illustration {
  // Full width, natural aspect ratio (no cover-crop, no forced height) —
  // the landscape stays a landscape at every screen size instead of being
  // zoomed/cropped to fill an arbitrary viewport height. `margin-top: auto`
  // is what pushes it to the bottom of `.intro`'s flex column, independent
  // of viewport height or text length (see the comment on `.intro`).
  display: block;
  width: 100%;
  height: auto;
  margin-top: auto;
  opacity: 0.92;
  filter: sepia(35%) saturate(70%) contrast(95%);

  [data-theme="dark"] & {
    // The line art is dark ink on transparent — just brightening it left
    // dark strokes sitting on an equally dark page (illegible, "muddy").
    // Inverting turns the ink strokes into light/glowing lines against
    // the dark background instead, matching the reference look.
    filter: invert(1) sepia(15%) hue-rotate(180deg) saturate(70%) brightness(1.05);
  }
}

</style>
