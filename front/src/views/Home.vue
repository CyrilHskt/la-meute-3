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
              <a href="#about" class="intro-cta">{{ t('nav.about') }} &darr;</a>
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
            <p class="text-justify" v-html="t('home.historyText')"></p>
          </article>

          <article class="carnet-entry">
            <h3>{{ t('home.valuesTitle') }}</h3>
            <p class="text-justify" v-html="t('home.valuesText')"></p>
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

          <article class="carnet-entry">
            <h3>{{ t('home.gamesTitle') }}</h3>
            <p v-html="t('home.gamesText')"></p>
            <div class="carnet-game-logos">
              <img src="/img/games/squad.png" :alt="t('home.squadLogoAlt')" />
              <img src="/img/games/starcitizen.png" :alt="t('home.starcitizenLogoAlt')" />
            </div>
          </article>
        </div>
      </div>
    </section>

    <!-- Recruitment -->
    <section id="recruit" class="carnet-section carnet-section--surface">
      <div class="container content-section">
        <p class="carnet-eyebrow text-center">{{ t('nav.recruit') }}</p>
        <h2 class="text-center">{{ t('home.recruitTitle') }}</h2>
        <p class="text-justify" v-html="t('home.recruitIntro')"></p>
        <div class="row carnet-recruit-lists">
          <ul class="col-lg-6 text-left" v-html="t('home.recruitListLeft')"></ul>
          <ul class="col-lg-6 text-left" v-html="t('home.recruitListRight')"></ul>
        </div>
        <p class="col-lg-12 text-justify" v-html="t('home.recruitOutro')"></p>
      </div>
    </section>

    <!-- Discord -->
    <section id="contact" class="carnet-section">
      <div class="container content-section text-center">
        <div class="row">
          <div class="col-lg-12">
            <p class="carnet-eyebrow">{{ t('nav.contact') }}</p>
            <h2>{{ t('home.discordTitle') }}</h2>
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

.carnet-game-logos {
  display: flex;
  gap: $space-4;
  align-items: center;
  margin-top: $space-3;

  img {
    max-height: 48px;
    width: auto;
  }
}

.carnet-recruit-lists {
  margin-top: $space-3;

  ul {
    font-size: $fs-body;
    line-height: 20px;
    color: $color-text;
  }
}

.discord-widget {
  display: block;
  margin: $space-4 auto 0;
  max-width: 100%;
  border-radius: $radius-md;
}
</style>
