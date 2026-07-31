<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<template>
  <div id="page-top" class="carnet">
    <!-- Intro -->
    <header class="intro">
      <div
        class="intro-bg"
        role="img"
        aria-label="Une meute de loups veillant sur un panorama de montagnes enneigées et de forêts"
      ></div>
      <div class="intro-veil" aria-hidden="true"></div>
      <div class="intro-text-block">
        <h1 class="brand-heading">{{ t('home.heroTitle') }}</h1>
        <p class="brand-subtitle">{{ t('home.subtitle') }}</p>
        <p class="intro-motto">{{ t('home.motto') }}</p>
        <p class="intro-motto-source">{{ t('home.mottoSource') }}</p>
        <nav class="intro-nav" aria-label="Navigation principale">
          <router-link to="/gouvernance?tab=presentation" class="intro-nav__link">
            {{ t('home.navDiscoverClan') }}<span class="intro-nav__arrow" aria-hidden="true">→</span>
          </router-link>
          <router-link to="/gouvernance?tab=dao" class="intro-nav__link">
            {{ t('home.navExploreGovernance') }}<span class="intro-nav__arrow" aria-hidden="true">→</span>
          </router-link>
        </nav>
      </div>
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
  // artwork changed unpredictably with screen height.
  //
  // A third version put the text back in plain document flow with
  // `margin-top: auto` pushing a full-width `<img>` down — robust, but the
  // image alone (natural width/height) was often taller than the leftover
  // space, so total hero height exceeded the viewport and its foreground
  // props ended up flush against the footer with no breathing room.
  //
  // A fourth version sized the `<img>` itself with `min(100%, 100dvh *
  // ratio)` (the `object-fit: contain` math, but as real values so a
  // sibling could be positioned against its box) and absolutely positioned
  // the text at a percentage of *that* box — this reliably capped the hero
  // at one viewport, but the text block (title + subtitle + motto + source
  // + nav) is taller than the image's own "sky" band on most screens, so
  // most of it ended up clipped outside the visible box.
  //
  // This version: the illustration is a `background-image` on a dedicated
  // `.intro-bg` layer instead of an `<img>` in flow. A background never
  // takes up flow space or needs to be queried by a sibling — the text
  // simply stays in normal flow, on top, wherever it naturally lands.
  //
  // `background-size: contain` (this version's first attempt) fits the
  // whole illustration within the viewport at all times — but that means
  // as the *window* narrows (not just on small devices — resizing a desktop
  // browser, opening devtools), the image visibly shrinks to keep fitting,
  // which reads as the landscape zooming out rather than staying put.
  // Cyril's ask: resizing the window sideways should feel like a window
  // getting narrower on a fixed-scale scene — the mountains keep their
  // size, the sides of the scene get cropped instead of the whole picture
  // shrinking (`background-size: auto 100%`, `overflow: hidden` below).
  // This intentionally reintroduces *lateral* cropping — the "never crop"
  // rule from the earlier attempts was about not zooming into the scene to
  // force-fill a taller box; here the illustration itself never scales
  // beyond its height-driven size, only the visible slice of it changes.
  //
  // On narrow/tall viewports (portrait phones) the same height-driven
  // sizing would crop away most of the scene if centered — instead of
  // shrinking to fit everything (`contain`), portrait keeps the same
  // stable-scale sizing as desktop but anchors the crop to the right edge
  // (see `.intro-bg`), where the wolves are, per Cyril's ask: on a phone
  // the wolves should read clearly rather than the whole panorama shrunk
  // down to illegible.
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  padding-top: $space-5 * 2;
  text-align: center;
  color: $color-text;
  background: $color-page-bg;
}

.intro-bg {
  position: absolute;
  inset: 0;
  background-image: url("/img/illustrations/hero-wolf-pack-panorama-v6.webp");
  background-repeat: no-repeat;
  background-position: bottom center;
  background-size: auto 100%;
  opacity: 0.92;
  filter: sepia(35%) saturate(70%) contrast(95%);

  @media (orientation: portrait) {
    // 85% horizontal — not a full "right" anchor — centers the crop on the
    // wolves themselves (source asset, 1983×793px: wolves at roughly
    // x=1380–1650), which sit a bit inset from the illustration's own
    // right edge (cliff + pine trees).
    background-position: 85% bottom;
  }

  [data-theme="dark"] & {
    // The line art is dark ink on transparent — just brightening it left
    // dark strokes sitting on an equally dark page (illegible, "muddy").
    // Inverting turns the ink strokes into light/glowing lines against
    // the dark background instead, matching the reference look.
    //
    // An earlier version added `hue-rotate(180deg)` after the `sepia()`,
    // meaning to warm the inverted (near-white) linework — but rotating a
    // sepia hue by 180° flips it to its cool complementary instead of
    // reinforcing it, and `brightness(1.05)` pushed the already near-white
    // result close to clipping. Net effect: a stark, neutral, near-clipped
    // white that read as harsh/clinical rather than glowing. Dropping the
    // hue-rotate and dialing brightness down (instead of up) keeps the
    // warmth from `sepia()` intact and lands the glow at a warm, dimmed
    // amber-white instead of blown-out white.
    filter: invert(1) grayscale(30%) sepia(10%) hue-rotate(140deg) saturate(50%) brightness(0.55) contrast(85%);
  }
}

.intro-veil {
  // On desktop the text mostly floats over sparse sky; on portrait it sits
  // directly on the (cropped-in, denser) wolves illustration, which hurts
  // legibility. A translucent veil in the page's own color — the page
  // background "guessed at" through the artwork rather than a hard scrim
  // box — brings back contrast without hiding the scene. Kept as its own
  // layer (not a pseudo-element on `.intro-bg`) so it isn't caught by that
  // element's dark-mode `invert()` filter, which would flip a dark veil
  // into a light one.
  display: none;

  @media (orientation: portrait) {
    display: block;
    position: absolute;
    inset: 0;
    background: color-mix(in srgb, $color-page-bg 62%, transparent);
  }
}

.intro-text-block {
  position: relative;
  padding: 0 $space-4;
  margin: 0 auto $space-5;
  max-width: 900px;
  // The illustration is sparse line art on a light page — most of the
  // time text sits over near-empty sky, but the overlap is content-
  // dependent (two languages, arbitrary viewport widths) so a soft halo
  // keeps glyphs legible even where a mountain ridge or bird happens to
  // fall behind them, without needing a hard box around the text.
  text-shadow:
    0 0 6px $color-page-bg,
    0 0 16px $color-page-bg,
    0 0 32px $color-page-bg;
}

.intro .brand-heading {
  font-size: $fs-hero;
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
  font-style: italic;
  font-weight: 500;
  font-size: $fs-section-title;
  color: $color-orange-dark;
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
  flex-wrap: wrap;
  gap: $space-4;
  margin: $space-5 0 0;
}

.intro-nav__link {
  display: inline-flex;
  align-items: center;
  gap: $space-1;
  font-family: $font-mono;
  font-size: $fs-body;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: $color-text-dim;
  padding: $space-1 0;
  border-bottom: 1px solid $color-text-dim;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.intro-nav__link:hover,
.intro-nav__link:focus {
  color: $color-orange;
  border-color: $color-orange;
}

.intro-nav__arrow {
  transition: transform 0.15s ease;
}
.intro-nav__link:hover .intro-nav__arrow,
.intro-nav__link:focus .intro-nav__arrow {
  transform: translateX(3px);
}


</style>
