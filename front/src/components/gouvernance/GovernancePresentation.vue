<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const emit = defineEmits<{ "go-to-dao": [] }>();

const timelineStart = computed(() => ({
  version: t('presentation.timelineStartVersion'),
  title: t('presentation.timelineStartTitle'),
  text: t('presentation.timelineStartText'),
}));
const timelineAssociation = computed(() => ({
  version: t('presentation.timelineAssocVersion'),
  title: t('presentation.timelineAssocTitle'),
  text: t('presentation.timelineAssocText'),
}));
const timelineDao = computed(() => ({
  version: t('presentation.timelineDaoVersion'),
  title: t('presentation.timelineDaoTitle'),
  text: t('presentation.timelineDaoText'),
}));

const daoHighlights = computed(() => [
  { title: t('presentation.highlight1Title'), text: t('presentation.highlight1Text') },
  { title: t('presentation.highlight2Title'), text: t('presentation.highlight2Text') },
  { title: t('presentation.highlight3Title'), text: t('presentation.highlight3Text') },
]);

const faq = computed(() => [
  { q: t('presentation.faq1Q'), a: t('presentation.faq1A') },
  { q: t('presentation.faq2Q'), a: t('presentation.faq2A') },
  { q: t('presentation.faq3Q'), a: t('presentation.faq3A') },
  { q: t('presentation.faq4Q'), a: t('presentation.faq4A') },
  { q: t('presentation.faq5Q'), a: t('presentation.faq5A') },
  { q: t('presentation.faq6Q'), a: t('presentation.faq6A') },
]);

const values = computed(() => [
  {
    index: "01",
    title: t('presentation.valueTransparentTitle'),
    text: t('presentation.valueTransparentText'),
    icon: "/img/illustrations/motif-ballot-box.png",
    iconAlt: "Urne de vote cadenassée",
  },
  {
    index: "02",
    title: t('presentation.valueSelfGovernedTitle'),
    text: t('presentation.valueSelfGovernedText'),
    icon: "/img/illustrations/motif-compass.png",
    iconAlt: "Boussole",
  },
  {
    index: "03",
    title: t('presentation.valueResilientTitle'),
    text: t('presentation.valueResilientText'),
    icon: "/img/illustrations/motif-lock-chain.png",
    iconAlt: "Cadenas et chaîne",
  },
  {
    index: "04",
    title: t('presentation.valueOpenTitle'),
    text: t('presentation.valueOpenText'),
    icon: "/img/illustrations/motif-map-paw.png",
    iconAlt: "Carte pliée scellée d'une empreinte de patte",
  },
]);
</script>

<template>
  <section class="gv-presentation">
    <div class="gv-intro-hero">
      <h2 class="gv-section-title">{{ t('presentation.sectionTitle') }}</h2>
      <p>{{ t('presentation.intro') }}</p>
    </div>

    <div class="gv-timeline">
      <div class="gv-timeline-col">
        <div class="gv-timeline-step gv-timeline-step--1">
          <div class="gv-timeline-version">{{ timelineStart.version }}</div>
          <h3>{{ timelineStart.title }}</h3>
          <p>{{ timelineStart.text }}</p>
        </div>

        <div class="gv-timeline-arrow gv-timeline-arrow--v" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M3 8h10M9 4l4 4-4 4" />
          </svg>
        </div>

        <div class="gv-timeline-step gv-timeline-step--2">
          <div class="gv-timeline-version">{{ timelineAssociation.version }}</div>
          <h3>{{ timelineAssociation.title }}</h3>
          <p>{{ timelineAssociation.text }}</p>

          <div class="gv-timeline-arrow gv-timeline-arrow--to-v3" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </div>
        </div>
      </div>

      <div class="gv-timeline-step gv-timeline-step--3">
        <div class="gv-timeline-version">{{ timelineDao.version }}</div>
        <h3>{{ timelineDao.title }}</h3>
        <p class="gv-timeline-lede">{{ timelineDao.text }}</p>

        <div class="gv-timeline-highlights">
          <div v-for="h in daoHighlights" :key="h.title" class="gv-timeline-highlight">
            <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8.5 6.5 12 13 4.5" /></svg>
            <div>
              <div class="gv-timeline-highlight-title">{{ h.title }}</div>
              <div class="gv-timeline-highlight-text">{{ h.text }}</div>
            </div>
          </div>
        </div>

        <button class="gv-timeline-cta" type="button" @click="emit('go-to-dao')">
          {{ t('presentation.viewGovernanceCta') }}
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
        </button>
      </div>
    </div>

    <div class="gv-values">
      <h3 class="gv-section-title gv-values-title">{{ t('presentation.valuesTitle') }}</h3>
      <div class="gv-values-layout">
        <ul class="gv-values-grid">
          <li v-for="value in values" :key="value.title" class="gv-value-item">
            <span class="gv-value-index mono">{{ value.index }}</span>
            <img :src="value.icon" :alt="value.iconAlt" class="gv-value-icon" width="105" height="105" loading="lazy" />
            <div>
              <h4>{{ value.title }}</h4>
              <p>{{ value.text }}</p>
            </div>
          </li>
        </ul>
        <img
          src="/img/illustrations/motif-branch.png"
          alt="Branche de sapin gravée"
          class="gv-values-illustration"
          loading="lazy"
        />
      </div>
    </div>

    <div class="gv-section-divider" aria-hidden="true">
      <img src="/img/illustrations/motif-pawprint.png" alt="" class="gv-divider-paw" />
    </div>

    <div class="gv-faq">
      <h3 class="gv-section-title gv-faq-title">{{ t('presentation.faqTitle') }}</h3>
      <details v-for="(item, i) in faq" :key="item.q" class="gv-faq-item" :open="i === 0">
        <summary>{{ item.q }}</summary>
        <p>{{ item.a }}</p>
      </details>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.gv-presentation {
  background: $color-page-bg;
}

.gv-intro-hero {
  max-width: 760px;
  margin: 0 auto;
  padding: $space-5 $space-3 $space-3;
  text-align: center;

  p {
    color: $color-text-dim;
    font-size: $fs-body;
    line-height: 1.7;
  }
}
.gv-eyebrow {
  font-family: $font-mono;
  color: $color-orange-dark;
  font-size: $fs-caption;
  letter-spacing: 0.06em;
}
.gv-section-title {
  color: $color-black;
  font-family: $font-display;
  font-weight: 700;
  font-size: $fs-section-title;
  margin: 0 0 $space-3;
}

// Previous version used clip-path arrow shapes, gradients and a
// dark/shadowed spotlight card for V3 — replaced with three plain ledger
// entries sharing the same hairline-border treatment as the rest of the
// site: the D.A.O. step is marked as current through a rouille left
// border and bold type, not through a different visual language.
.gv-timeline {
  max-width: 1080px;
  margin: $space-4 auto ($space-5 * 1.5);
  padding: 0 $space-3;
  display: flex;
  align-items: stretch;
  gap: $space-3;
}
@media (max-width: 820px) {
  .gv-timeline { flex-direction: column; }
}

.gv-timeline-col {
  flex: 0 0 260px;
  display: flex;
  flex-direction: column;
  gap: $space-3;
}
@media (max-width: 820px) {
  .gv-timeline-col { flex: 1 1 auto; width: 100%; }
}

.gv-timeline-step {
  min-width: 0;
  padding: $space-4;
  background: $color-card-bg;
  border: 1px solid $color-border;
  border-radius: $radius-md;

  h3 { margin: 0 0 $space-2; font-family: $font-display; font-size: $fs-card-title; color: $color-black; }
  p { margin: 0; font-size: $fs-body; color: $color-text-dim; line-height: 1.6; }
}

.gv-timeline-col .gv-timeline-step {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: $space-3;

  h3 { font-size: $fs-h4; margin-bottom: $space-1; }
  p { font-size: $fs-caption; }
  .gv-timeline-version { font-size: 11px; }
}

.gv-timeline-step--1,
.gv-timeline-step--2 {
  .gv-timeline-version, h3 { color: $color-black; }
  p { color: $color-text-dim; }
}

// No dedicated arrow icons in the ledger layout: the vertical/horizontal
// stacking order already reads as a timeline, and dropping them removes
// a purely decorative element that didn't survive the gradient rework.
.gv-timeline-arrow,
.gv-timeline-arrow--v,
.gv-timeline-arrow--to-v3 {
  display: none;
}

.gv-timeline-step--3 {
  flex: 1;
  background: $color-card-bg;
  border: 1px solid $color-border;
  border-left: 3px solid $color-orange-dark;
  padding: $space-4;

  .gv-timeline-version { color: $color-orange-dark; }
  h3 { color: $color-black; font-size: $fs-section-title * 0.68; }
}

.gv-timeline-lede {
  color: $color-text-dim !important;
  max-width: 460px;
  margin-bottom: $space-3 !important;
}

.gv-timeline-highlights {
  display: flex;
  flex-direction: column;
  gap: $space-2;
}

.gv-timeline-highlight {
  display: flex;
  align-items: flex-start;
  gap: $space-2;

  svg { flex-shrink: 0; margin-top: 2px; color: $color-success; }
}

.gv-timeline-highlight-title {
  font-weight: 600;
  font-size: $fs-caption;
  color: $color-black;
}

.gv-timeline-highlight-text {
  font-size: 12.5px;
  color: $color-text-dim;
  line-height: 1.5;
}

.gv-timeline-cta {
  margin-top: $space-4;
  display: inline-flex;
  align-items: center;
  gap: $space-1;
  background: none;
  border: none;
  border-bottom: 1px solid currentColor;
  color: $color-orange-dark;
  font-family: $font-body;
  font-size: $fs-caption;
  font-weight: 600;
  cursor: pointer;
  padding: 0 0 2px;

  &:hover { color: $color-orange; }
}

.gv-timeline-version {
  font-family: $font-mono;
  font-size: $fs-caption;
  letter-spacing: 0.06em;
  margin-bottom: $space-1;
  color: $color-orange-dark;
}

.gv-section-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 820px;
  margin: 0 auto ($space-5 * 1.5);
  padding: 0 $space-3;
  color: $color-orange-dark;
  opacity: 0.6;

  &::before,
  &::after {
    content: "";
    flex: 1;
    height: 1px;
    background: $color-border;
  }

  svg {
    flex: none;
    margin: 0 $space-3;
  }
}

.gv-divider-paw {
  flex: none;
  width: 28px;
  height: auto;
  margin: 0 $space-3;
  opacity: 0.85;
  filter: sepia(35%) saturate(70%) contrast(95%);

  [data-theme="dark"] & {
    filter: invert(1) sepia(15%) hue-rotate(180deg) saturate(70%) brightness(1.05);
  }
}

.gv-faq {
  max-width: 820px;
  margin: 0 auto ($space-5 * 1.5);
  padding: 0 $space-3;
}
.gv-faq-title { text-align: center; margin-bottom: $space-4; }
.gv-faq-item {
  border-bottom: 1px solid $color-border;

  summary {
    cursor: pointer;
    list-style: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: $space-3 $space-1;
    font-weight: 600;
    color: $color-black;
    font-size: $fs-h4;
    font-family: $font-display;

    &::-webkit-details-marker { display: none; }
    &::after {
      content: "+";
      color: $color-orange-dark;
      font-size: 1.4rem;
      font-weight: 400;
      flex-shrink: 0;
      margin-left: $space-3;
    }
  }

  &[open] summary::after { content: "\2212"; }

  p { margin: 0 0 $space-3; color: $color-text-dim; font-size: $fs-body; line-height: 1.7; }
}

.gv-values {
  max-width: 1080px;
  margin: 0 auto ($space-5 * 1.5);
  padding: 0 $space-3;
}
.gv-values-title { text-align: center; margin-bottom: $space-4; }

.gv-values-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  gap: $space-5;
  align-items: center;
}
@media (max-width: 820px) {
  .gv-values-layout {
    grid-template-columns: 1fr;
  }
}

.gv-values-illustration {
  width: 100%;
  max-width: 340px;
  justify-self: center;
  opacity: 0.92;
  filter: sepia(35%) saturate(70%) contrast(95%);

  [data-theme="dark"] & {
    filter: invert(1) sepia(15%) hue-rotate(180deg) saturate(70%) brightness(1.05);
  }
}
@media (max-width: 820px) {
  .gv-values-illustration {
    max-width: 220px;
    order: -1;
  }
}

.gv-values-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: $space-3;
}

.gv-value-item {
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
    line-height: 1.6;
    color: $color-text-dim;
    margin: 0;
  }
}

.gv-value-index {
  flex: none;
  font-size: $fs-caption;
  font-weight: 500;
  color: $color-orange-dark;

  &.mono {
    font-family: $font-mono;
  }
}

.gv-value-icon {
  flex: none;
  align-self: center;
  width: 105px;
  height: 105px;
  object-fit: contain;
  opacity: 0.92;
  filter: sepia(35%) saturate(70%) contrast(95%);

  [data-theme="dark"] & {
    filter: invert(1) sepia(15%) hue-rotate(180deg) saturate(70%) brightness(1.05);
  }
}

@media (max-width: 480px) {
  .gv-value-icon {
    width: 72px;
    height: 72px;
  }
}

</style>
