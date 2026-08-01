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
  <aside class="gv-sidebar">
    <nav class="gv-sidebar-links">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="gv-sidebar-tab"
        :class="{ 'gv-sidebar-tab--active': activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </nav>
    <button v-if="activeTab === 'dao'" class="gv-tour-trigger" type="button" @click="requestTour">
      {{ t('dashboard.guidedTour') }}
      <span v-if="showTourPulse" class="gv-tour-pulse" aria-hidden="true"></span>
    </button>
  </aside>

  <div class="gv-dashboard-content">
    <GovernancePresentation v-show="activeTab === 'presentation'" @go-to-dao="activeTab = 'dao'" />
    <GovernanceAssociation v-show="activeTab === 'association'" />
    <GovernanceMembers v-show="activeTab === 'members'" />
    <GovernanceDao v-show="activeTab === 'dao'" />
    <GovernanceDonations v-show="activeTab === 'donations'" />
  </div>
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
  background: $color-page-bg;
  min-height: 100vh;
  display: grid;
  grid-template-columns: 220px 1fr;
  align-items: start;
}

.gv-dashboard-content {
  min-width: 0;
  container-type: inline-size;
}

.gv-sidebar {
  position: sticky;
  top: var(--navbar-height, 80px);
  height: calc(100vh - var(--navbar-height, 80px));
  display: flex;
  flex-direction: column;
  // Top-aligned rather than `space-between`: an earlier version filled the
  // leftover height with a decorative illustration (dropped after review —
  // a persistent nav sidebar isn't the right place for mood art, and it
  // never actually scaled to fill the space well regardless, see git
  // history). The leftover space below the tour button is now deliberately
  // quiet whitespace, not something to fill.
  justify-content: flex-start;
  gap: $space-5;
  padding: $space-4 $space-3;
  border-right: 1px solid $color-border;
  background: $color-page-bg;
}

.gv-sidebar-links {
  display: flex;
  flex-direction: column;
  gap: $space-1;
}

.gv-sidebar-tab {
  background: transparent;
  border: none;
  border-left: 2px solid transparent;
  color: $color-text-dim;
  font-family: $font-display;
  font-weight: 600;
  text-transform: none;
  letter-spacing: normal;
  font-size: $fs-body;
  text-align: left;
  padding: $space-2 $space-3;
  cursor: pointer;

  &:hover { color: $color-text; }
}

.gv-sidebar-tab--active {
  color: $color-black;
  border-left-color: $color-orange-dark;
  background: $color-card-bg;
}

@media (max-width: 820px) {
  .gv-dashboard {
    // `minmax(0, 1fr)` rather than a bare `1fr`: the sidebar is a wrapping
    // flex row whose card slot uses a percentage `flex-basis` — against a
    // grid track's implicit (content-based) width, that percentage falls
    // back to the item's unconstrained max-content size, which blew the
    // whole row (and the page) out to ~600px wide on top of a 400px
    // viewport (observed). A `0` track minimum breaks that feedback loop.
    grid-template-columns: minmax(0, 1fr);
  }

  .gv-sidebar {
    position: sticky;
    top: var(--navbar-height, 80px);
    height: auto;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: $space-3;
    padding: 0 $space-4 $space-3;
    border-right: none;
    border-bottom: 1px solid $color-border;
    z-index: 10;
  }

  .gv-sidebar-links {
    flex-direction: row;
    gap: 1.2rem;
    overflow-x: auto;
  }

  .gv-sidebar-tab {
    border-left: none;
    border-bottom: 2px solid transparent;
    padding: $space-4 0.2rem $space-3;
    white-space: nowrap;
  }

  .gv-sidebar-tab--active {
    border-left-color: transparent;
    border-bottom-color: $color-orange-dark;
    background: transparent;
  }
}

.gv-tour-trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  background: transparent;
  border: 1px solid $color-border;
  color: $color-text;
  border-radius: $radius-md;
  padding: $space-2 $space-3;
  font-family: $font-body;
  font-weight: 600;
  text-transform: none;
  letter-spacing: normal;
  font-size: $fs-caption;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
  white-space: nowrap;

  &:hover { border-color: $color-orange-dark; color: $color-orange-dark; }
}

.gv-tour-pulse {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: $color-orange-dark;
  border: 1.5px solid $color-page-bg;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: rgba(195, 91, 43, 0.55);
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
