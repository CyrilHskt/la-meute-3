<script setup lang="ts">
const timeline = [
  {
    version: "V1 — Le clan",
    title: "La Meute 1.0",
    text: "Création informelle en 2016 : un groupe de joueurs, sans structure ni règles écrites.",
  },
  {
    version: "V2 — L'association",
    title: "La Meute 2.0",
    text: "Dépôt des statuts en 2019 : passage en association loi 1901, bureau élu, existence légale.",
  },
  {
    version: "V3 — La DAO",
    title: "La Meute 3.0",
    text: "Les décisions internes de l'association sont désormais votées on-chain par ses membres actifs.",
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
      <div v-for="(step, i) in timeline" :key="step.title" class="gv-timeline-step" :class="`gv-timeline-step--${i + 1}`">
        <div class="gv-timeline-version">{{ step.version }}</div>
        <h3>{{ step.title }}</h3>
        <p>{{ step.text }}</p>
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

.gv-timeline {
  max-width: 1080px;
  margin: 2.8rem auto;
  padding: 0 1.6rem;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
}
@media (max-width: 700px) {
  .gv-timeline { grid-template-columns: 1fr; gap: 1.6rem; }
  .gv-timeline-step { clip-path: none !important; margin-left: 0 !important; }
}
.gv-timeline-step {
  padding: 2rem 2.4rem 2rem 2.6rem;
  position: relative;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
  clip-path: polygon(0 0, calc(100% - 34px) 0, 100% 50%, calc(100% - 34px) 100%, 0 100%, 34px 50%);

  h3 { margin: 0 0 0.7rem; font-family: $font-display; font-size: $fs-card-title; color: $color-black; }
  p { margin: 0; font-size: $fs-body; color: $color-text-dim; line-height: 1.6; }
}
.gv-timeline-step--1 {
  background: #eee;
  clip-path: polygon(0 0, calc(100% - 34px) 0, 100% 50%, calc(100% - 34px) 100%, 0 100%);

  .gv-timeline-version, h3 { color: #555; }
  p { color: $color-text-dim; }
}

.gv-timeline-step--2 {
  background: linear-gradient(135deg, #ffd9a0, $color-orange);
  margin-left: -34px;
  z-index: 1;

  .gv-timeline-version, h3 { color: #fff; }
  p { color: rgba(255, 255, 255, 0.9); }
}

.gv-timeline-step--3 {
  background: linear-gradient(135deg, #2a2a2a, #000);
  margin-left: -34px;
  z-index: 2;

  .gv-timeline-version { color: $color-orange; }
  h3 { color: #fff; }
  p { color: rgba(255, 255, 255, 0.7); }
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
