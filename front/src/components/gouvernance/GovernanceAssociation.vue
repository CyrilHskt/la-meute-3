<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { usePackSize } from "../../composables/usePackSize";

const { t } = useI18n();
const { totalWolves, totalCubs } = usePackSize();

const discordInviteUrl = "https://discord.gg/Wy5rScG";

// Public association documents — PDFs dropped in public/docs/, no
// on-chain logic, just a list of links to keep up to date.
const documents = computed(() => [
  { label: t('association.documentBylaws'), href: "/docs/statuts.pdf" },
  { label: t('association.documentMinutes2026'), href: "/docs/cr-ag-2026.pdf" },
  { label: t('association.documentMinutes2025'), href: "/docs/cr-ag-2025.pdf" },
]);

// The legal 1901 board and the Wolf rank overlap through people, not
// through the system: nothing in the contract enforces this link.
const board = computed(() => [
  { role: t('association.boardPresident'), name: t('association.boardNamePlaceholder'), rank: t('association.boardRankWolf') },
  { role: t('association.boardTreasurer'), name: t('association.boardNamePlaceholder'), rank: t('association.boardRankWolf') },
  { role: t('association.boardSecretary'), name: t('association.boardNamePlaceholder'), rank: t('association.boardRankWolf') },
]);

const legal = computed(() => [
  { label: t('association.legalForm'), value: t('association.legalFormValue') },
  { label: t('association.legalPurpose'), value: t('association.legalPurposeValue') },
  { label: t('association.legalAddress'), value: t('association.toComplete') },
  { label: t('association.legalRegisteredOn'), value: t('association.toComplete') },
  { label: t('association.legalRnaNumber'), value: t('association.toComplete') },
]);
</script>

<template>
  <section class="gv-association">
    <div class="gv-assoc-layout">
      <div class="gv-info-card">
        <h3 class="gv-card-title">{{ t('association.legalInfoTitle') }}</h3>
        <div v-for="row in legal" :key="row.label" class="gv-legal-row">
          <span class="gv-label">{{ row.label }}</span>
          <span class="gv-value">{{ row.value }}</span>
        </div>
      </div>

      <div class="gv-info-card">
        <h3 class="gv-card-title">{{ t('association.documentsTitle') }}</h3>
        <div class="gv-doc-list">
          <a v-for="doc in documents" :key="doc.href" class="gv-doc-link" :href="doc.href" target="_blank" rel="noopener">
            <i class="fa fa-file-pdf-o"></i>
            {{ doc.label }}
            <span class="gv-doc-meta">PDF</span>
          </a>
        </div>
      </div>

      <div class="gv-info-card gv-info-card--wide">
        <h3 class="gv-card-title">{{ t('association.boardTitle') }}</h3>
        <div class="gv-board-grid">
          <div v-for="member in board" :key="member.role" class="gv-board-card">
            <div class="gv-board-role">{{ member.role }}</div>
            <div class="gv-board-name">{{ member.name }}</div>
            <div class="gv-board-rank">{{ member.rank }}</div>
          </div>
        </div>
        <p class="gv-board-hierarchy-note">{{ t('association.boardHierarchyNote') }}</p>
      </div>

      <div class="gv-info-card gv-info-card--wide">
        <h3 class="gv-card-title">{{ t('association.identityTitle') }}</h3>
        <p class="gv-identity-text" v-html="t('association.identityText')"></p>
      </div>

      <div class="gv-info-card">
        <h3 class="gv-card-title">{{ t('association.joinTitle') }}</h3>
        <p class="gv-join-text">{{ t('association.joinText') }}</p>
        <a :href="discordInviteUrl" class="gv-join-cta" target="_blank" rel="noopener">{{ t('association.joinCta') }}</a>
      </div>

      <div class="gv-info-card">
        <h3 class="gv-card-title">{{ t('association.packSizeTitle') }}</h3>
        <!--
          Placeholder pending issue #99 (public totalWolves()/totalCubs()
          getters, requires a contract change + redeploy — out of scope
          here). Intentionally unwired: renders "—" rather than a guessed
          number until usePackSize.ts has real data to return.
        -->
        <div class="gv-pack-size-tiles">
          <div class="gv-pack-size-tile">
            <div class="gv-pack-size-value">{{ totalWolves ?? '—' }}</div>
            <div class="gv-pack-size-label">{{ t('association.packSizeWolves') }}</div>
          </div>
          <div class="gv-pack-size-tile">
            <div class="gv-pack-size-value">{{ totalCubs ?? '—' }}</div>
            <div class="gv-pack-size-label">{{ t('association.packSizeCubs') }}</div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.gv-association {
  background: $color-page-bg;
}

.gv-assoc-layout {
  max-width: 1080px;
  margin: 0 auto;
  padding: $space-5 $space-3 ($space-5 * 2);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: $space-4;
}
@media (max-width: 820px) { .gv-assoc-layout { grid-template-columns: 1fr; } }

.gv-info-card {
  background: $color-card-bg;
  border: 1px solid $color-border;
  border-radius: $radius-md;
  padding: $space-4;
}
.gv-info-card--wide { grid-column: 1 / -1; }

.gv-card-title {
  color: $color-orange-dark;
  font-family: $font-mono;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: $fs-caption;
  margin: 0 0 $space-3;
}

.gv-legal-row {
  display: flex;
  justify-content: space-between;
  gap: $space-3;
  padding: $space-2 0;
  border-bottom: 1px solid $color-border;
  font-size: $fs-body;

  &:last-child { border-bottom: none; }
}
.gv-label { color: $color-text-dim; }
.gv-value { text-align: right; color: $color-text; }

.gv-doc-list { display: flex; flex-direction: column; gap: $space-2; }
.gv-doc-link {
  display: flex;
  align-items: center;
  gap: $space-2;
  padding: $space-2 $space-3;
  border: 1px solid $color-border;
  border-radius: $radius-sm;
  color: $color-text;
  text-decoration: none;
  font-size: $fs-body;

  &:hover { border-color: $color-orange-dark; }
  i { color: $color-orange-dark; }
}
.gv-doc-meta { margin-left: auto; color: $color-text-dim; font-size: $fs-caption; font-family: $font-mono; }

.gv-board-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: $space-3;
  margin-top: $space-1;
}
@media (max-width: 600px) { .gv-board-grid { grid-template-columns: 1fr; } }
.gv-board-card { text-align: center; }
.gv-board-role {
  font-family: $font-mono;
  font-size: $fs-caption;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: $color-orange-dark;
  font-weight: 500;
  margin-bottom: $space-1;
}
.gv-board-name { font-weight: 600; color: $color-black; font-size: $fs-h4; font-family: $font-display; }
.gv-board-rank { font-size: $fs-caption; color: $color-text-dim; }
.gv-board-hierarchy-note {
  margin: $space-3 0 0;
  padding-top: $space-3;
  border-top: 1px solid $color-border;
  font-size: $fs-caption;
  color: $color-text-dim;
  text-align: center;
}
.gv-identity-text {
  font-size: $fs-body;
  line-height: 20px;
  color: $color-text;
  margin: 0;
}

.gv-join-text {
  margin: 0 0 $space-3;
  font-size: $fs-body;
  line-height: 1.6;
  color: $color-text-dim;
}
.gv-join-cta {
  display: inline-block;
  font-family: $font-mono;
  font-size: $fs-caption;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: $color-orange-dark;
  border-bottom: 1px solid currentColor;
  padding-bottom: 2px;
}
.gv-join-cta:hover,
.gv-join-cta:focus {
  color: $color-orange;
}

.gv-pack-size-tiles {
  display: flex;
  gap: 1px;
  background: $color-border;
  margin-top: $space-1;
}
.gv-pack-size-tile {
  flex: 1;
  background: $color-page-bg;
  padding: $space-3;
  text-align: center;
}
.gv-pack-size-value {
  font-family: $font-mono;
  font-size: 1.3rem;
  font-weight: 700;
  color: $color-black;
}
.gv-pack-size-label {
  font-size: $fs-caption;
  color: $color-text-dim;
  letter-spacing: 0.04em;
}
</style>
