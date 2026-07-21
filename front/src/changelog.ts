// Annonces "grand public" des mises à jour — à tenir à la main, pas
// généré depuis les commits. On ne veut pas montrer aux visiteurs des
// messages de commit techniques, juste ce qui vaut la peine d'être annoncé.
// Mettre à jour ce fichier à chaque nouvelle version qu'on veut annoncer.
//
// Ces numéros de version sont propres à cette popup ("informative"),
// tenus à la main indépendamment de package.json ou du contrat déployé —
// Site, Dashboard et Contrat ont chacun leur propre historique.

export interface ChangelogEntry {
  date: string;
  title: string;
}

export const SITE_VERSION = "3.0.0";
export const DASHBOARD_VERSION = "1.0.0";
export const CONTRACT_DISPLAY_VERSION = "1.0.0";

export const SITE_CHANGELOG: ChangelogEntry[] = [
  {
    date: "18 juillet 2026",
    title: "Fusion du site vitrine et du dashboard en un seul site",
  },
  {
    date: "Juillet 2026",
    title: "Passage en version 3.0",
  },
  {
    date: "2011",
    title: "La Meute devient une association loi 1901",
  },
  {
    date: "Août 2010",
    title: "Passage en version 2.0",
  },
  {
    date: "Décembre 2007",
    title: "Création de La Meute sur Call of Duty 4",
  },
];

export const DASHBOARD_CHANGELOG: ChangelogEntry[] = [
  {
    date: "21 juillet 2026",
    title: "Nouveau tableau de bord de gouvernance : carte de membre, vote en direct, historique des propositions",
  },
  {
    date: "21 juillet 2026",
    title: "Chaque membre peut choisir un pseudo affiché sur sa carte",
  },
  {
    date: "20 juillet 2026",
    title: "Visite guidée interactive pour découvrir la gouvernance",
  },
];

export const CONTRACT_CHANGELOG: ChangelogEntry[] = [
  {
    date: "21 juillet 2026",
    title: "Ajout du pseudo personnalisable, stocké directement sur la blockchain",
  },
  {
    date: "18 juillet 2026",
    title: "Premier déploiement public sur le testnet Sepolia",
  },
];
