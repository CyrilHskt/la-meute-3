<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import GovernancePresentation from "../components/gouvernance/GovernancePresentation.vue";
import GovernanceAssociation from "../components/gouvernance/GovernanceAssociation.vue";
import GovernanceMembers from "../components/gouvernance/GovernanceMembers.vue";
import GovernanceDao from "../components/gouvernance/GovernanceDao.vue";
import GovernanceDonations from "../components/gouvernance/GovernanceDonations.vue";
import { useGuidedTour } from "../composables/useGuidedTour";

type PageTab = "presentation" | "association" | "members" | "dao" | "donations";

const { t } = useI18n();
const tabs = computed<{ id: PageTab; label: string }[]>(() => [
  { id: "presentation", label: t('dashboard.tabPresentation') },
  { id: "association", label: t('dashboard.tabAssociation') },
  { id: "members", label: t('dashboard.tabMembers') },
  { id: "dao", label: t('dashboard.tabDao') },
  { id: "donations", label: t('dashboard.tabDonations') },
]);

// The active tab lives in the URL (?tab=dao), not just in memory —
// otherwise a refresh (or a shared link) always lands back on the
// presentation tab, even when you were on the DAO.
const route = useRoute();
const router = useRouter();
const tabIds: PageTab[] = ["presentation", "association", "members", "dao", "donations"];

function tabFromQuery(): PageTab {
  const q = route.query.tab;
  return typeof q === "string" && (tabIds as string[]).includes(q) ? (q as PageTab) : "presentation";
}

const activeTab = ref<PageTab>(tabFromQuery());

// `replace` rather than `push`: switching tabs must not stack entries in
// the navigation history (the "back" button shouldn't have to scroll
// through every visited tab one by one).
watch(activeTab, (tab) => {
  router.replace({ query: { ...route.query, tab } });
});

const { showTourPulse, requestTour, highlightTourButton } = useGuidedTour();

// The first time the DAO tab opens, we highlight the "Guided tour"
// button — the tour never launches on its own, but its visibility does,
// once (see useGuidedTour.ts).
watch(
  activeTab,
  async (tab) => {
    if (tab !== "dao") return;
    await nextTick();
    highlightTourButton(".gv-tour-trigger");
  },
  { immediate: true },
);
</script>

<template>
  <div class="gv-dashboard">
  <nav class="gv-page-tabs">
    <div class="gv-page-tabs-links">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="gv-page-tab"
        :class="{ 'gv-page-tab--active': activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>
    <button v-if="activeTab === 'dao'" class="gv-tour-trigger" type="button" @click="requestTour">
      {{ t('dashboard.guidedTour') }}
      <span v-if="showTourPulse" class="gv-tour-pulse" aria-hidden="true"></span>
    </button>
  </nav>

  <GovernancePresentation v-show="activeTab === 'presentation'" @go-to-dao="activeTab = 'dao'" />
  <GovernanceAssociation v-show="activeTab === 'association'" />
  <GovernanceMembers v-show="activeTab === 'members'" />
  <GovernanceDao v-show="activeTab === 'dao'" />
  <GovernanceDonations v-show="activeTab === 'donations'" />
  </div>
</template>

<style lang="scss" scoped>
/* The v2 nav is fixed-top and stays opaque on this page (see NavBar.vue):
   all content must be pushed below it, otherwise it captures clicks and
   hides the top of the page. Its actual height varies (brand font,
   expanded mobile menu...), so we follow --navbar-height (measured in JS
   in NavBar.vue) rather than a hardcoded number that could drift out of
   sync. */
.gv-dashboard {
  padding-top: var(--navbar-height, 80px);
}

.gv-page-tabs {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 1.6rem;
  background: #111;
  padding: 0 1.6rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  position: sticky;
  top: var(--navbar-height, 80px);
  z-index: 10;
}

.gv-page-tabs-links {
  grid-column: 2;
  display: flex;
  gap: 2.2rem;
}

@media (max-width: 640px) {
  .gv-page-tabs {
    grid-template-columns: 1fr auto;
  }
  .gv-page-tabs-links {
    grid-column: 1;
    gap: 1.2rem;
  }
}

.gv-page-tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: rgba(255, 255, 255, 0.55);
  font-family: $font-display;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  font-size: $fs-body;
  padding: 1.1rem 0.2rem;
  cursor: pointer;

  &:hover { color: #fff; }
}

.gv-page-tab--active {
  color: #fff;
  border-bottom-color: $color-orange;
}

.gv-tour-trigger {
  position: relative;
  grid-column: 3;
  justify-self: end;
  display: inline-flex;
  align-items: center;
  background: $color-orange;
  border: none;
  color: $color-black;
  border-radius: 999px;
  padding: 0.5rem 1.1rem;
  font-family: $font-display;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  font-size: $fs-caption;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover { background: #ffc46b; }
}

@media (max-width: 640px) {
  .gv-tour-trigger {
    grid-column: 2;
  }
}

.gv-tour-pulse {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #fff;
  border: 1.5px solid $color-black;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.9);
    animation: gv-tour-pulse-ring 1.8s ease-out infinite;
  }
}

@keyframes gv-tour-pulse-ring {
  0% { transform: scale(1); opacity: 0.7; }
  100% { transform: scale(2.4); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .gv-tour-pulse::before { animation: none; }
}
</style>
