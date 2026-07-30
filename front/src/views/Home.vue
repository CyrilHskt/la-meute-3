<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<template>
  <div id="page-top" class="carnet">
    <!-- Intro -->
    <header class="intro">
      <div class="intro-body">
        <div class="container">
          <div class="row">
            <div class="col-md-8 col-md-offset-2">
              <img
                src="/img/illustrations/motif-wolf-pack-trio.png"
                alt="Trois loups sur un promontoire rocheux, montagnes en arrière-plan"
                class="intro-illustration"
              />
              <h1 class="brand-heading">
                {{ t('home.title') }}
                <img src="/img/logo.png" :alt="t('home.logoAlt')" class="brand-heading-logo" />
              </h1>
              <p class="intro-text">{{ t('home.tagline') }}</p>
              <router-link to="/gouvernance?tab=presentation" class="intro-cta intro-cta--dao">{{ t('home.daoTeaser') }} &rarr;</router-link>
            </div>
          </div>
        </div>
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
  background: $color-page-bg;
  color: $color-text;
}

.intro {
  display: block;
  padding: ($space-5 * 2) 0 ($space-5 * 2);
  text-align: center;
  color: $color-text;
  background: $color-page-bg;
  background-image: none;
}

.intro .brand-heading {
  font-size: $fs-section-title + 12px;
  font-family: $font-display;
  font-weight: 700;
  color: $color-black;
  margin: 0 0 $space-3;
  display: inline-flex;
  align-items: center;
  gap: $space-3;
}

.brand-heading-logo {
  height: 1.1em;
  width: auto;
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
  max-width: 800px;
  width: 90%;
  height: auto;
  margin: 0 auto $space-4;
  opacity: 0.9;
  filter: sepia(35%) saturate(70%) contrast(95%);
}

</style>
