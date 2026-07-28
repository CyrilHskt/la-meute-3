<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<template>
  <div id="page-top">
    <!-- Intro -->
    <header class="intro">
      <div class="intro-body">
        <div class="container">
          <div class="row">
            <div class="col-md-8 col-md-offset-2">
              <h1 class="brand-heading">
                {{ t('home.title') }}
                <img src="/img/logo.png" :alt="t('home.logoAlt')" />
              </h1>
              <p class="intro-text">{{ t('home.tagline') }}</p>
              <a href="#about" class="btn btn-circle">
                <i class="fa fa-angle-double-down animated"></i>
              </a>
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- Our clan -->
    <section id="about">
      <div class="container content-section text-center">
        <div class="row">
          <h2>{{ t('home.aboutTitle') }}</h2>
          <div>
            <h3>{{ t('home.historyTitle') }}</h3>
            <p class="text-justify" v-html="t('home.historyText')"></p>

            <h3>{{ t('home.valuesTitle') }}</h3>
            <p class="text-justify" v-html="t('home.valuesText')"></p>

            <h3>{{ t('home.gamesTitle') }}</h3>
            <p v-html="t('home.gamesText')"></p>
            <img src="/img/games/squad.png" :alt="t('home.squadLogoAlt')" />
            <img src="/img/games/starcitizen.png" :alt="t('home.starcitizenLogoAlt')" />
          </div>
        </div>
      </div>
    </section>

    <!-- Recruitment -->
    <section id="recruit">
      <div class="container content-section text-center">
        <h2>{{ t('home.recruitTitle') }}</h2>
        <p class="text-justify" v-html="t('home.recruitIntro')"></p>
        <ul class="col-lg-6 text-left" v-html="t('home.recruitListLeft')"></ul>
        <ul class="col-lg-6 text-left" v-html="t('home.recruitListRight')"></ul>
        <p class="col-lg-12 text-justify" v-html="t('home.recruitOutro')"></p>
      </div>
    </section>

    <!-- Discord -->
    <section id="contact">
      <div class="container content-section text-center">
        <div class="row">
          <div class="col-lg-12">
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

<style scoped>
.discord-widget {
  display: block;
  margin: 0 auto;
  max-width: 100%;
  border-radius: 8px;
}
</style>
