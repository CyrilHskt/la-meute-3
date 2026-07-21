// Annonces "grand public" des mises à jour — à tenir à la main, pas
// généré depuis les commits. On ne veut pas montrer aux visiteurs des
// messages de commit techniques, juste ce qui vaut la peine d'être annoncé.
// Mettre à jour ce fichier à chaque nouvelle version qu'on veut annoncer.

export interface ChangelogEntry {
  date: string;
  title: string;
}

export const FRONT_VERSION = "0.2.0";

export const FRONT_CHANGELOG: ChangelogEntry[] = [
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
  {
    date: "18 juillet 2026",
    title: "Fusion du site vitrine et du dashboard en un seul site",
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
