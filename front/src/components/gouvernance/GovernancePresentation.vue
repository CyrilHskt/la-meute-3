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

// Reused as-is from the arguments already present in "Why move to a DAO?"
// further down the page — condensed here to highlight V3 in the timeline,
// not a new write-up.
const daoHighlights = computed(() => [
  { title: t('presentation.highlight1Title'), text: t('presentation.highlight1Text') },
  { title: t('presentation.highlight2Title'), text: t('presentation.highlight2Text') },
  { title: t('presentation.highlight3Title'), text: t('presentation.highlight3Text') },
]);

const advantages = computed(() => [
  { title: t('presentation.advantage1Title'), text: t('presentation.advantage1Text') },
  { title: t('presentation.advantage2Title'), text: t('presentation.advantage2Text') },
  { title: t('presentation.advantage3Title'), text: t('presentation.advantage3Text') },
]);

const faq = computed(() => [
  { q: t('presentation.faq1Q'), a: t('presentation.faq1A') },
  { q: t('presentation.faq2Q'), a: t('presentation.faq2A') },
  { q: t('presentation.faq3Q'), a: t('presentation.faq3A') },
  { q: t('presentation.faq4Q'), a: t('presentation.faq4A') },
]);
</script>

<template>
  <section class="gv-presentation">
    <div class="gv-intro-hero">
      <p class="gv-eyebrow">{{ t('presentation.eyebrow') }}</p>
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

    <div class="gv-why-dao">
      <h3 class="gv-section-title gv-why-dao-title">{{ t('presentation.whyDaoTitle') }}</h3>
      <p class="gv-why-dao-intro">{{ t('presentation.whyDaoIntro') }}</p>
      <div class="gv-advantage-grid">
        <div v-for="adv in advantages" :key="adv.title" class="gv-advantage-card">
          <h4>{{ adv.title }}</h4>
          <p>{{ adv.text }}</p>
        </div>
      </div>
    </div>

    <div class="gv-faq">
      <details v-for="(item, i) in faq" :key="item.q" class="gv-faq-item" :open="i === 0">
        <summary>{{ item.q }}</summary>
        <p>{{ item.a }}</p>
      </details>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.gv-intro-hero {
  max-width: 760px;
  margin: 0 auto;
  padding: 3rem 1.6rem 1rem;
  text-align: center;

  p {
    color: $color-text-dim;
    font-size: $fs-body;
    line-height: 1.7;
  }
}
.gv-eyebrow {
  color: $color-orange-dark;
  font-weight: 700;
  font-size: $fs-caption;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.gv-section-title {
  color: $color-orange;
  font-family: $font-display;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-size: $fs-section-title;
  margin: 0 0 1.2rem;
}

// Previous version: each card was cut into an arrow shape (clip-path) to
// suggest the V1→V2→V3 progression. Abandoned (2026-07-22) — the geometry
// required padding always strictly greater than the tip's depth, and a
// title wrapping onto multiple lines still ended up falling into the cut
// zone at certain widths. Replaced with: V1/V2 shrunk and stacked on the
// left, V3 highlighted on the right (bigger, richer content) — no fragile
// geometry.
.gv-timeline {
  max-width: 1080px;
  margin: 2.8rem auto;
  padding: 0 1.6rem;
  display: flex;
  align-items: stretch;
  gap: 1.4rem;
}
@media (max-width: 820px) {
  .gv-timeline { flex-direction: column; }
  .gv-timeline-arrow { transform: rotate(90deg); align-self: center; }
}

.gv-timeline-col {
  flex: 0 0 260px;
  display: flex;
  flex-direction: column;
  // Fixed gap, identical to the one between the column and the V3 card
  // (see .gv-timeline-arrow--to-v3), for visual consistency between the
  // two arrows. The extra height compared to V3 is absorbed by the cards
  // themselves (flex: 1 below), not by empty space.
  gap: 1.4rem;
}
@media (max-width: 820px) {
  .gv-timeline-col { flex: 1 1 auto; width: 100%; }
}

.gv-timeline-step {
  min-width: 0;
  padding: 2rem 2rem;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);

  h3 { margin: 0 0 0.7rem; font-family: $font-display; font-size: $fs-card-title; color: $color-black; }
  p { margin: 0; font-size: $fs-body; color: $color-text-dim; line-height: 1.6; }
}

.gv-timeline-col .gv-timeline-step {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 1.3rem 1.4rem;

  h3 { font-size: $fs-h4; margin-bottom: 0.3rem; }
  p { font-size: $fs-caption; }
  .gv-timeline-version { font-size: 11px; }
}

.gv-timeline-step--1 {
  // A warm gray rather than #eee, which nearly blended into the page
  // background (#f9f9f9) — enough contrast for the card to stand out
  // clearly, while staying sober next to the orange and black.
  background: linear-gradient(135deg, #ede7dd, #ddd5c6);

  .gv-timeline-version, h3 { color: #4a453d; }
  p { color: #756e62; }
}

.gv-timeline-step--2 {
  position: relative;
  background: linear-gradient(135deg, #ffd9a0, $color-orange);

  .gv-timeline-version, h3 { color: $color-black; }
  p { color: rgba(0, 0, 0, 0.7); }
}

// Positioned relative to the V2 card itself (not the whole row) to stay
// centered on V2 regardless of V1 or V3's height.
.gv-timeline-arrow--to-v3 {
  position: absolute;
  top: 50%;
  // Centered in the middle of the gap (1.4rem) between the column and the
  // V3 card, rather than stuck to V2's edge — same spacing logic as the
  // V1→V2 arrow (placed in the middle of the column's gap).
  left: calc(100% + 0.7rem);
  transform: translate(-50%, -50%);
}
@media (max-width: 820px) {
  .gv-timeline-arrow--to-v3 {
    top: 100%;
    left: 50%;
    transform: translate(-50%, 0) rotate(90deg);
  }
}

.gv-timeline-step--3 {
  flex: 1;
  background: linear-gradient(150deg, #262626, #000);
  padding: 2.2rem 2.4rem;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.25);

  .gv-timeline-version { color: $color-orange; }
  h3 { color: #fff; font-size: $fs-section-title * 0.68; }
}

.gv-timeline-lede {
  color: rgba(255, 255, 255, 0.75) !important;
  max-width: 460px;
  margin-bottom: 1.4rem !important;
}

.gv-timeline-highlights {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.gv-timeline-highlight {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;

  svg { flex-shrink: 0; margin-top: 2px; color: $color-orange; }
}

.gv-timeline-highlight-title {
  font-weight: 700;
  font-size: $fs-caption;
  color: #fff;
}

.gv-timeline-highlight-text {
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.55);
  line-height: 1.5;
}

.gv-timeline-cta {
  margin-top: 1.5rem;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: none;
  border: none;
  color: $color-orange;
  font-family: $font-display;
  font-size: $fs-caption;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  cursor: pointer;
  padding: 0;

  &:hover { color: #ffc46b; }
}

.gv-timeline-arrow {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $color-orange;
}

.gv-timeline-arrow--v {
  // V1/V2 are always stacked vertically (.gv-timeline-col is a column
  // regardless of screen size) — this arrow therefore always points
  // down, unlike the V2→V3 arrow which rotates at 820px.
  align-self: center;
  transform: rotate(90deg) !important;
}

.gv-timeline-version {
  font-weight: 700;
  font-size: $fs-caption;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 0.5rem;
  color: $color-orange-dark;
}

.gv-why-dao {
  max-width: 1000px;
  margin: 0.5rem auto 3rem;
  padding: 0 1.6rem;
}
.gv-why-dao-title { text-align: center; margin-bottom: 0.6rem; }
.gv-why-dao-intro {
  text-align: center;
  color: $color-text-dim;
  font-size: $fs-body;
  max-width: 640px;
  margin: 0 auto 1.8rem;
}
.gv-advantage-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.2rem;
}
@media (max-width: 700px) { .gv-advantage-grid { grid-template-columns: 1fr; } }
.gv-advantage-card {
  text-align: center;
  padding: 0.4rem 0.8rem;

  h4 { margin: 0 0 0.4rem; font-family: $font-display; font-size: $fs-h4; color: $color-black; }
  p { margin: 0; font-size: $fs-body; color: $color-text-dim; line-height: 1.55; }
}

.gv-faq {
  max-width: 820px;
  margin: 0 auto 3rem;
  padding: 0 1.6rem;
}
.gv-faq-item {
  border-bottom: 1px solid $color-border;

  summary {
    cursor: pointer;
    list-style: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.2rem 0.2rem;
    font-weight: 700;
    color: $color-black;
    font-size: $fs-h4;

    &::-webkit-details-marker { display: none; }
    &::after {
      content: "+";
      color: $color-orange-dark;
      font-size: 1.4rem;
      font-weight: 400;
      flex-shrink: 0;
      margin-left: 1rem;
    }
  }

  &[open] summary::after { content: "\2212"; }

  p { margin: 0 0 1.2rem; color: $color-text-dim; font-size: $fs-body; line-height: 1.7; }
}
</style>
