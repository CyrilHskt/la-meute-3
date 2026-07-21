<script setup lang="ts">
// Documents publics de l'association — PDF déposés dans public/docs/,
// pas de logique on-chain, simple liste de liens à tenir à jour.
const documents = [
  { label: "Statuts de l'association", href: "/docs/statuts.pdf" },
  { label: "Compte-rendu AG — 2026", href: "/docs/cr-ag-2026.pdf" },
  { label: "Compte-rendu AG — 2025", href: "/docs/cr-ag-2025.pdf" },
];

// Le bureau légal 1901 et le rang Loup se recoupent par les personnes,
// pas par le système : rien dans le contrat n'impose ce lien.
const bureau = [
  { role: "Présidence", name: "— nom —", rank: "Loup" },
  { role: "Trésorerie", name: "— nom —", rank: "Loup" },
  { role: "Secrétariat", name: "— nom —", rank: "Loup" },
];

const legal = [
  { label: "Forme juridique", value: "Association loi 1901" },
  { label: "Objet", value: "Promotion du jeu vidéo compétitif" },
  { label: "Siège social", value: "— à compléter —" },
  { label: "Déclarée le", value: "— à compléter —" },
  { label: "N° RNA", value: "— à compléter —" },
];
</script>

<template>
  <section class="gv-association">
    <div class="gv-assoc-layout">
      <div class="gv-info-card">
        <h3 class="gv-card-title">Informations légales</h3>
        <div v-for="row in legal" :key="row.label" class="gv-legal-row">
          <span class="gv-label">{{ row.label }}</span>
          <span class="gv-value">{{ row.value }}</span>
        </div>
      </div>

      <div class="gv-info-card">
        <h3 class="gv-card-title">Documents</h3>
        <div class="gv-doc-list">
          <a v-for="doc in documents" :key="doc.href" class="gv-doc-link" :href="doc.href" target="_blank" rel="noopener">
            <i class="fa fa-file-pdf-o"></i>
            {{ doc.label }}
            <span class="gv-doc-meta">PDF</span>
          </a>
        </div>
      </div>

      <div class="gv-info-card gv-info-card--wide">
        <h3 class="gv-card-title">Bureau</h3>
        <div class="gv-bureau-grid">
          <div v-for="member in bureau" :key="member.role" class="gv-bureau-card">
            <div class="gv-bureau-role">{{ member.role }}</div>
            <div class="gv-bureau-name">{{ member.name }}</div>
            <div class="gv-bureau-rank">{{ member.rank }}</div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.gv-assoc-layout {
  max-width: 1080px;
  margin: 0 auto;
  padding: 2.4rem 1.6rem 4rem;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.8rem;
}
@media (max-width: 820px) { .gv-assoc-layout { grid-template-columns: 1fr; } }

.gv-info-card {
  background: $color-card-bg;
  border: 1px solid $color-border;
  border-radius: 4px;
  padding: 1.6rem 1.6rem;
}
.gv-info-card--wide { grid-column: 1 / -1; }

.gv-card-title {
  color: $color-orange;
  font-family: $font-display;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-size: $fs-card-title;
  margin: 0 0 1.1rem;
}

.gv-legal-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.65rem 0;
  border-bottom: 1px solid $color-border;
  font-size: $fs-body;

  &:last-child { border-bottom: none; }
}
.gv-label { color: $color-text-dim; }
.gv-value { text-align: right; }

.gv-doc-list { display: flex; flex-direction: column; gap: 0.6rem; }
.gv-doc-link {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.8rem 0.9rem;
  border: 1px solid $color-border;
  border-radius: 3px;
  color: $color-text;
  text-decoration: none;
  font-size: $fs-body;

  &:hover { border-color: $color-orange; }
  i { color: $color-orange-dark; }
}
.gv-doc-meta { margin-left: auto; color: $color-text-dim; font-size: $fs-caption; }

.gv-bureau-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-top: 0.4rem;
}
@media (max-width: 600px) { .gv-bureau-grid { grid-template-columns: 1fr; } }
.gv-bureau-card { text-align: center; }
.gv-bureau-role {
  font-size: $fs-caption;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: $color-orange-dark;
  font-weight: 700;
  margin-bottom: 0.3rem;
}
.gv-bureau-name { font-weight: 700; color: $color-black; font-size: $fs-h4; }
.gv-bureau-rank { font-size: $fs-caption; color: $color-text-dim; }
</style>
