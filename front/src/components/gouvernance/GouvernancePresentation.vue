<script setup lang="ts">
const emit = defineEmits<{ "go-to-dao": [] }>();

const timelineStart = {
  version: "V1 — Le clan",
  title: "La Meute 1.0",
  text: "Création informelle en 2016 : un groupe de joueurs, sans structure ni règles écrites.",
};
const timelineAssociation = {
  version: "V2 — L'association",
  title: "La Meute 2.0",
  text: "Dépôt des statuts en 2019 : passage en association loi 1901, bureau élu, existence légale.",
};
const timelineDao = {
  version: "V3 — La DAO",
  title: "La Meute 3.0",
  text: "Les décisions internes de l'association sont désormais votées on-chain par ses membres actifs.",
};

// Repris tels quels des arguments déjà présents dans "Pourquoi passer sur
// une DAO ?" plus bas sur la page — condensés ici pour mettre en avant la
// V3 dans la timeline, pas une nouvelle rédaction.
const daoHighlights = [
  {
    title: "Infalsifiable et résilient",
    text: "Un vote décisif n'est plus modifiable après coup, ni suspendu à la disponibilité d'un serveur Discord.",
  },
  {
    title: "Trésorerie consultable en direct",
    text: "Le solde et l'historique des dépenses sont visibles à tout moment, par tout le monde.",
  },
  {
    title: "Pensée pour les cycles de dormance",
    text: "Le contrat détecte les Loups dormants et ajuste automatiquement le quorum.",
  },
];

const advantages = [
  {
    title: "Infalsifiable et résilient",
    text: "Un vote décisif n'est plus modifiable après coup, ni suspendu à la disponibilité d'un serveur Discord ou d'un carnet de comptes-rendus. Aucun serveur, aucun compte admin, aucun papier à perdre.",
  },
  {
    title: "Trésorerie consultable en direct",
    text: "Le solde et l'historique des dépenses sont visibles à tout moment, par tout le monde — plus besoin d'attendre l'AG et le rapport du trésorier pour connaître l'état des comptes.",
  },
  {
    title: "Pensée pour les cycles de dormance",
    text: "Un bon jeu sort, tout le monde revient, puis l'activité retombe à 2-3 membres jusqu'au prochain — depuis toujours. Le contrat détecte les Loups dormants et ajuste automatiquement le quorum, au lieu de bloquer l'association pendant les creux.",
  },
];

const faq = [
  {
    q: "Qui a le dernier mot : l'association ou la DAO ?",
    a: "Juridiquement, l'association 1901 reste seule habilitée à contracter, encaisser et dépenser — c'est elle qui existe aux yeux de la loi. En pratique, le bureau applique fidèlement les votes de la DAO : le contrat ne fait qu'exécuter ce que les statuts délèguent déjà à l'assemblée de ses membres.",
  },
  {
    q: "Le bureau de l'association correspond-il aux \"Loups\" de la DAO ?",
    a: "Les deux se recoupent par les personnes, pas par le système : le président, le trésorier et le secrétaire de l'association sont aujourd'hui trois Loups, mais rien dans le contrat ne l'impose. Ce sont deux gouvernances distinctes qui coexistent — l'une légale, l'autre décisionnelle.",
  },
  {
    q: "Pourquoi ne pas tout mettre on-chain, y compris le statut légal ?",
    a: "Parce qu'aucune blockchain ne remplace l'état à ce jour : pour ouvrir un compte bancaire, signer un bail de local ou être reconnue par une fédération sportive, il faut une personne morale. La DAO gère la délibération interne, pas l'existence légale.",
  },
  {
    q: "Où trouver les documents officiels de l'association ?",
    a: "Statuts, comptes-rendus d'assemblée générale et composition du bureau sont publiés dans l'onglet Association 1901.",
  },
];
</script>

<template>
  <section class="gv-presentation">
    <div class="gv-intro-hero">
      <p class="gv-eyebrow">Qui gouverne La Meute ?</p>
      <h2 class="gv-section-title">Une association, augmentée par une DAO</h2>
      <p>
        La Meute est une association loi 1901 depuis 2019. Depuis 2026, ses décisions
        internes — admission, exclusion, dépenses — sont votées on-chain par ses
        membres actifs. L'association reste l'entité légale ; la DAO en est
        l'outil de délibération.
      </p>
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
          Voir la gouvernance en direct
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
        </button>
      </div>
    </div>

    <div class="gv-why-dao">
      <h3 class="gv-section-title gv-why-dao-title">Pourquoi passer sur une DAO ?</h3>
      <p class="gv-why-dao-intro">
        Pas pour remplacer Discord — les sondages informels y restent. Trois
        problèmes concrets, propres à l'historique de La Meute, que ni Discord
        ni le papier ne résolvent.
      </p>
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

// Version précédente : chaque carte était découpée en flèche (clip-path)
// pour suggérer la progression V1→V2→V3. Abandonné (2026-07-22) — la
// géométrie exigeait un padding toujours strictement supérieur à la
// profondeur de la pointe, et un titre qui passait sur plusieurs lignes
// finissait quand même par tomber dans la zone découpée à certaines
// largeurs. Remplacé par : V1/V2 réduites empilées à gauche, V3 mise en
// avant à droite (plus grande, contenu enrichi) — aucune géométrie fragile.
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
  // Gap fixe, identique à celui entre la colonne et la carte V3 (voir
  // .gv-timeline-arrow--to-v3), pour une cohérence visuelle entre les deux
  // flèches. Le surplus de hauteur par rapport à V3 est absorbé par les
  // cartes elles-mêmes (flex: 1 ci-dessous), pas par un espace vide.
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
  // Un gris chaud plutôt que #eee, qui se fondait presque dans le fond de
  // page (#f9f9f9) — assez de contraste pour que la carte se détache
  // clairement, tout en restant sobre à côté de l'orange et du noir.
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

// Positionnée par rapport à la carte V2 elle-même (pas à toute la ligne)
// pour rester centrée sur V2 quelle que soit la hauteur de V1 ou de V3.
.gv-timeline-arrow--to-v3 {
  position: absolute;
  top: 50%;
  // Centrée au milieu du gap (1.4rem) entre la colonne et la carte V3,
  // plutôt que collée au bord de V2 — même logique d'espacement que la
  // flèche V1→V2 (posée au milieu du gap de la colonne).
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
  // V1/V2 sont toujours empilées verticalement (.gv-timeline-col est en
  // colonne quel que soit l'écran) — cette flèche pointe donc toujours
  // vers le bas, contrairement à la flèche V2→V3 qui pivote à 820px.
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
