<script setup lang="ts">
import { ref } from "vue";
import GouvernancePresentation from "../components/gouvernance/GouvernancePresentation.vue";
import GouvernanceAssociation from "../components/gouvernance/GouvernanceAssociation.vue";
import GouvernanceDao from "../components/gouvernance/GouvernanceDao.vue";

type PageTab = "presentation" | "association" | "dao";

const tabs: { id: PageTab; label: string }[] = [
  { id: "presentation", label: "Présentation" },
  { id: "association", label: "Association 1901" },
  { id: "dao", label: "Gouvernance DAO" },
];

const activeTab = ref<PageTab>("presentation");
</script>

<template>
  <div class="gv-dashboard">
  <nav class="gv-page-tabs">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      class="gv-page-tab"
      :class="{ 'gv-page-tab--active': activeTab === tab.id }"
      @click="activeTab = tab.id"
    >
      {{ tab.label }}
    </button>
  </nav>

  <GouvernancePresentation v-show="activeTab === 'presentation'" />
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
  display: flex;
  justify-content: center;
  gap: 2.2rem;
  background: #111;
  padding: 0 1.6rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  position: sticky;
  top: var(--navbar-height, 80px);
  z-index: 10;
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
</style>
