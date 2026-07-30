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
              <h1 class="brand-heading">
                {{ t('home.title') }}
                <img src="/img/logo.png" :alt="t('home.logoAlt')" class="brand-heading-logo" />
              </h1>
              <p class="intro-text">{{ t('home.tagline') }}</p>
              <img
                src="/img/illustrations/motif-wolf-pack-trio.png"
                alt="Trois loups sur un promontoire rocheux, montagnes en arrière-plan"
                class="intro-illustration"
              />
              <a href="#about" class="intro-cta">{{ t('nav.about') }} &darr;</a>
              <br />
              <router-link to="/gouvernance?tab=presentation" class="intro-cta intro-cta--dao">{{ t('home.daoTeaser') }} &rarr;</router-link>
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- Our clan -->
    <section id="about" class="carnet-section">
      <div class="container content-section">
        <p class="carnet-eyebrow text-center">{{ t('nav.about') }}</p>
        <h2 class="text-center">{{ t('home.aboutTitle') }}</h2>
        <div class="carnet-entries">
          <article class="carnet-entry">
            <h3>{{ t('home.historyTitle') }}</h3>
            <ol class="carnet-timeline">
              <li class="carnet-timeline-beat">
                <h4>{{ t('home.historyBeat1Title') }}</h4>
                <p>{{ t('home.historyBeat1Text') }}</p>
              </li>
              <li class="carnet-timeline-beat">
                <h4>{{ t('home.historyBeat2Title') }}</h4>
                <p>{{ t('home.historyBeat2Text') }}</p>
              </li>
              <li class="carnet-timeline-beat">
                <h4>{{ t('home.historyBeat3Title') }}</h4>
                <p>{{ t('home.historyBeat3Text') }}</p>
              </li>
              <li class="carnet-timeline-beat">
                <h4>{{ t('home.historyBeat4Title') }}</h4>
                <p>{{ t('home.historyBeat4Text') }}</p>
              </li>
            </ol>
          </article>

          <article class="carnet-entry">
            <h3>{{ t('home.valuesTitle') }}</h3>
            <img
              src="/img/illustrations/motif-notebook.png"
              alt="Un carnet en cuir tamponné d'une empreinte de patte, avec un stylo"
              class="values-illustration"
            />
            <ul class="carnet-values">
              <li class="carnet-value">
                <span class="carnet-value-index mono">01</span>
                <div>
                  <h4>{{ t('home.valueTransparentTitle') }}</h4>
                  <p>{{ t('home.valueTransparentText') }}</p>
                </div>
              </li>
              <li class="carnet-value">
                <span class="carnet-value-index mono">02</span>
                <div>
                  <h4>{{ t('home.valueSelfGovernedTitle') }}</h4>
                  <p>{{ t('home.valueSelfGovernedText') }}</p>
                </div>
              </li>
              <li class="carnet-value">
                <span class="carnet-value-index mono">03</span>
                <div>
                  <h4>{{ t('home.valueResilientTitle') }}</h4>
                  <p>{{ t('home.valueResilientText') }}</p>
                </div>
              </li>
              <li class="carnet-value">
                <span class="carnet-value-index mono">04</span>
                <div>
                  <h4>{{ t('home.valueOpenTitle') }}</h4>
                  <p>{{ t('home.valueOpenText') }}</p>
                </div>
              </li>
            </ul>
          </article>
        </div>
      </div>
    </section>

    <!-- Section break -->
    <img
      src="/img/illustrations/motif-mountains-line.png"
      alt="Une chaîne de montagnes bordée de pins, en dessin au trait"
      class="section-break-illustration"
    />

    <!-- Recruitment -->
    <section id="recruit" class="carnet-section carnet-section--surface">
      <div class="container content-section text-center">
        <p class="carnet-eyebrow">{{ t('nav.recruit') }}</p>
        <h2>{{ t('home.recruitTitle') }}</h2>
        <p class="carnet-recruit-text">{{ t('home.recruitIntro') }}</p>
        <p class="carnet-recruit-text">{{ t('home.recruitEssentials') }}</p>
        <p class="carnet-recruit-text carnet-recruit-probation">{{ t('home.recruitProbation') }}</p>
        <a href="https://discord.gg/Wy5rScG" class="carnet-recruit-cta">{{ t('home.recruitCta') }}</a>
      </div>
    </section>

    <!-- Discord -->
    <section id="contact" class="carnet-section">
      <div class="container content-section text-center">
        <p class="carnet-eyebrow">{{ t('nav.contact') }}</p>
        <div class="carnet-discord-frame">
          <p class="carnet-discord-caption">{{ t('home.discordEyebrow') }}</p>
          <iframe
            class="discord-widget"
            src="https://discord.com/widget?id=126035011441786880&theme=dark"
            width="350"
            height="500"
            allowtransparency="true"
            frameborder="0"
            sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
            :title="t('home.discordWidgetTitle')"
          ></iframe>
        </div>
      </div>
    </section>

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
  padding: ($space-5 * 3) 0 ($space-5 * 2);
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
  max-width: 220px;
  width: 100%;
  height: auto;
  margin: 0 auto $space-4;
  opacity: 0.85;
  filter: sepia(35%) saturate(70%) contrast(95%);
}

.values-illustration {
  display: block;
  max-width: 120px;
  width: 100%;
  height: auto;
  margin: 0 0 $space-3;
  opacity: 0.85;
  filter: sepia(35%) saturate(70%) contrast(95%);
}

.section-break-illustration {
  display: block;
  max-width: 360px;
  width: 100%;
  height: auto;
  margin: 0 auto;
  padding: $space-4 0;
  opacity: 0.7;
  filter: sepia(35%) saturate(70%) contrast(95%);
  background: $color-page-bg;
}

.carnet-section {
  padding: $space-5 * 2 0;
  border-top: 1px solid $color-border;
  background: $color-page-bg;
}
.carnet-section--surface {
  background: $color-card-bg;
}

.carnet-eyebrow {
  font-family: $font-mono;
  font-size: $fs-caption;
  letter-spacing: 0.06em;
  color: $color-orange-dark;
  margin-bottom: $space-1;
}

.content-section h2 {
  font-family: $font-display;
  font-size: $fs-section-title;
  font-weight: 700;
  color: $color-black;
  margin: 0 0 $space-5;
}

.carnet-entries {
  display: grid;
  gap: $space-5;
  margin-top: $space-4;
  text-align: left;
}

.carnet-entry {
  border-top: 1px solid $color-border;
  padding-top: $space-4;

  h3 {
    font-family: $font-display;
    font-size: $fs-card-title;
    font-weight: 600;
    color: $color-black;
    margin: 0 0 $space-2;
  }

  p {
    font-size: $fs-body;
    line-height: 20px;
    color: $color-text;
  }
}

.carnet-values {
  list-style: none;
  margin: $space-4 0 0;
  padding: 0;
  display: grid;
  gap: $space-3;
}

.carnet-value {
  display: flex;
  align-items: baseline;
  gap: $space-3;
  padding: $space-3 0;
  border-top: 1px solid $color-border;

  &:first-child {
    border-top: none;
    padding-top: 0;
  }

  h4 {
    font-family: $font-display;
    font-size: $fs-h4;
    font-weight: 600;
    color: $color-black;
    margin: 0 0 $space-1;
  }

  p {
    font-size: $fs-body;
    line-height: 20px;
    color: $color-text-dim;
    margin: 0;
  }
}

.carnet-value-index {
  flex: none;
  font-size: $fs-caption;
  font-weight: 500;
  color: $color-orange-dark;

  &.mono {
    font-family: $font-mono;
  }
}

.carnet-timeline {
  list-style: none;
  margin: $space-3 0 0;
  padding: 0;
  display: grid;
  gap: $space-3;
}

.carnet-timeline-beat {
  padding: $space-2 0 $space-2 $space-4;
  border-left: 2px solid $color-border;

  h4 {
    font-family: $font-mono;
    font-size: $fs-caption;
    letter-spacing: 0.04em;
    color: $color-orange-dark;
    font-weight: 600;
    margin: 0 0 $space-1;
  }

  p {
    font-size: $fs-body;
    line-height: 20px;
    color: $color-text;
    margin: 0;
  }
}

.carnet-discord-frame {
  margin: $space-4 auto 0;
  max-width: 380px;
  border: 1px solid $color-border;
  border-radius: $radius-md;
  padding: $space-4;
  background: $color-card-bg;
}

.carnet-discord-caption {
  font-family: $font-mono;
  font-size: $fs-caption;
  color: $color-text-dim;
  margin: 0 0 $space-3;
}

.carnet-recruit-text {
  max-width: 42rem;
  margin: $space-3 auto 0;
  font-size: $fs-body;
  line-height: 20px;
  color: $color-text;
}

.carnet-recruit-probation {
  color: $color-text-dim;
}

.carnet-recruit-cta {
  display: inline-block;
  margin-top: $space-4;
  font-family: $font-mono;
  font-size: $fs-caption;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: $color-orange-dark;
  border-bottom: 1px solid currentColor;
  padding-bottom: 2px;
}
.carnet-recruit-cta:hover,
.carnet-recruit-cta:focus {
  color: $color-orange;
}

.discord-widget {
  display: block;
  margin: $space-4 auto 0;
  max-width: 100%;
  border-radius: $radius-md;
}
</style>
