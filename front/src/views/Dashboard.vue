<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import GouvernancePresentation from "../components/gouvernance/GouvernancePresentation.vue";
import GouvernanceAssociation from "../components/gouvernance/GouvernanceAssociation.vue";
import GouvernanceDao from "../components/gouvernance/GouvernanceDao.vue";
import { useGuidedTour } from "../composables/useGuidedTour";

type PageTab = "presentation" | "association" | "dao";

const tabs: { id: PageTab; label: string }[] = [
  { id: "presentation", label: "Présentation" },
  { id: "association", label: "Association 1901" },
  { id: "dao", label: "Gouvernance DAO" },
];

const activeTab = ref<PageTab>("presentation");

const { showTourPulse, requestTour, highlightTourButton } = useGuidedTour();

// À la première ouverture de l'onglet DAO, on met en avant le bouton
// "Visite guidée" — le tour ne se lance jamais tout seul, mais sa
// visibilité l'est, une seule fois (cf. useGuidedTour.ts).
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
      Visite guidée
      <span v-if="showTourPulse" class="gv-tour-pulse" aria-hidden="true"></span>
    </button>
  </nav>

  <GouvernancePresentation v-show="activeTab === 'presentation'" @go-to-dao="activeTab = 'dao'" />
  <GouvernanceAssociation v-show="activeTab === 'association'" />
  <GouvernanceDao v-show="activeTab === 'dao'" />
  </div>
</template>

<style lang="scss" scoped>
/* La nav v2 est fixed-top et reste opaque sur cette page (cf NavBar.vue) :
   il faut pousser tout le contenu sous elle, sinon elle capte les clics
   et masque le début de la page. Sa hauteur réelle varie (police du brand,
   menu mobile déplié...), donc on suit --navbar-height (mesurée en JS dans
   NavBar.vue) plutôt qu'un nombre en dur qui se désynchronise. */
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
