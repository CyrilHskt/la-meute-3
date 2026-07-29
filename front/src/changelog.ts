// "General public" update announcements — kept by hand, not generated from
// commits. We don't want to show visitors technical commit messages, just
// what's worth announcing. Update this file for every new version we want
// to announce.
//
// These version numbers are specific to this popup ("informative"), kept
// by hand independently of package.json or the deployed contract — Site,
// Dashboard and Contract each have their own history.
//
// `date`/`title` accept either a plain string (renders as-is regardless of
// locale — fine for a quick entry) or a { fr, en } pair for full bilingual
// display. All existing entries below are bilingual for consistency; new
// entries can stay French-only if you're in a hurry.

export interface ChangelogEntry {
  date: string | { fr: string; en: string };
  title: string | { fr: string; en: string };
}

export const SITE_VERSION = "3.2.0";
export const DASHBOARD_VERSION = "1.4.0";
export const CONTRACT_DISPLAY_VERSION = "1.2.0";

export const SITE_CHANGELOG: ChangelogEntry[] = [
  {
    date: { fr: "28 juillet 2026", en: "July 28, 2026" },
    title: {
      fr: "Le site est désormais disponible en anglais, avec un sélecteur FR/EN dans le menu",
      en: "The site is now available in English, with an FR/EN switcher in the menu",
    },
  },
  {
    date: { fr: "25 juillet 2026", en: "July 25, 2026" },
    title: {
      fr: "Widget Discord intégré directement sur la page d'accueil",
      en: "Discord widget embedded directly on the homepage",
    },
  },
  {
    date: { fr: "24 juillet 2026", en: "July 24, 2026" },
    title: {
      fr: "Correction d'un bug d'accès direct aux pages via un lien partagé",
      en: "Fixed a bug preventing direct access to pages via a shared link",
    },
  },
  {
    date: { fr: "18 juillet 2026", en: "July 18, 2026" },
    title: {
      fr: "Fusion du site vitrine et du dashboard en un seul site",
      en: "Merged the showcase site and the dashboard into a single site",
    },
  },
  {
    date: { fr: "Juillet 2026", en: "July 2026" },
    title: { fr: "Passage en version 3.0", en: "Upgraded to version 3.0" },
  },
  {
    date: { fr: "2011", en: "2011" },
    title: {
      fr: "La Meute devient une association loi 1901",
      en: "La Meute becomes a registered French non-profit (loi 1901)",
    },
  },
  {
    date: { fr: "Août 2010", en: "August 2010" },
    title: { fr: "Passage en version 2.0", en: "Upgraded to version 2.0" },
  },
  {
    date: { fr: "Décembre 2007", en: "December 2007" },
    title: {
      fr: "Création de La Meute sur Call of Duty 4",
      en: "La Meute founded on Call of Duty 4",
    },
  },
];

export const DASHBOARD_CHANGELOG: ChangelogEntry[] = [
  {
    date: { fr: "26 juillet 2026", en: "July 26, 2026" },
    title: {
      fr: "Nouvel onglet « Dons », ouvert à tous — avec classement des contributeurs",
      en: "New \"Donations\" tab, open to everyone — with a contributor leaderboard",
    },
  },
  {
    date: { fr: "25 juillet 2026", en: "July 25, 2026" },
    title: {
      fr: "Le wallet reste connecté après un rafraîchissement de la page",
      en: "The wallet now stays connected after a page refresh",
    },
  },
  {
    date: { fr: "25 juillet 2026", en: "July 25, 2026" },
    title: {
      fr: "Chaque proposition affiche désormais qui l'a ouverte",
      en: "Each proposal now shows who opened it",
    },
  },
  {
    date: { fr: "25 juillet 2026", en: "July 25, 2026" },
    title: {
      fr: "Un message de confirmation s'affiche après chaque action (vote, candidature, dépense...)",
      en: "A confirmation message now appears after every action (vote, application, expense...)",
    },
  },
  {
    date: { fr: "25 juillet 2026", en: "July 25, 2026" },
    title: {
      fr: "L'onglet de gouvernance reste affiché après un rafraîchissement de la page",
      en: "The governance tab now stays selected after a page refresh",
    },
  },
  {
    date: { fr: "25 juillet 2026", en: "July 25, 2026" },
    title: {
      fr: "Les propositions et votes s'affichent désormais instantanément, sans attendre",
      en: "Proposals and votes now appear instantly, no more waiting",
    },
  },
  {
    date: { fr: "24 juillet 2026", en: "July 24, 2026" },
    title: {
      fr: "Fiabilité largement améliorée de l'affichage des données de la DAO",
      en: "Significantly improved reliability of DAO data display",
    },
  },
  {
    date: { fr: "23 juillet 2026", en: "July 23, 2026" },
    title: {
      fr: "Nouvelle présentation de l'évolution de La Meute (V1 → V2 → V3) avec repères historiques",
      en: "New timeline showing La Meute's evolution (V1 → V2 → V3) with historical milestones",
    },
  },
  {
    date: { fr: "21 juillet 2026", en: "July 21, 2026" },
    title: {
      fr: "Nouveau tableau de bord de gouvernance : carte de membre, vote en direct, historique des propositions",
      en: "New governance dashboard: member card, live voting, proposal history",
    },
  },
  {
    date: { fr: "21 juillet 2026", en: "July 21, 2026" },
    title: {
      fr: "Chaque membre peut choisir un pseudo affiché sur sa carte",
      en: "Each member can now choose a nickname shown on their card",
    },
  },
  {
    date: { fr: "20 juillet 2026", en: "July 20, 2026" },
    title: {
      fr: "Visite guidée interactive pour découvrir la gouvernance",
      en: "Interactive guided tour to discover governance",
    },
  },
];

export const CONTRACT_CHANGELOG: ChangelogEntry[] = [
  {
    date: { fr: "26 juillet 2026", en: "July 26, 2026" },
    title: {
      fr: "Ajout des dons — ouverts à tous, sans rapport avec la cotisation d'adhésion",
      en: "Added donations — open to everyone, unrelated to membership dues",
    },
  },
  {
    date: { fr: "25 juillet 2026", en: "July 25, 2026" },
    title: {
      fr: "Renforcement de la règle de vote : un quorum de participation est désormais requis en plus de la majorité",
      en: "Strengthened the voting rule: a participation quorum is now required in addition to the majority",
    },
  },
  {
    date: { fr: "25 juillet 2026", en: "July 25, 2026" },
    title: {
      fr: "Un membre visé par une exclusion ou une dépense ne peut plus voter sur son propre cas",
      en: "A member targeted by an exclusion or expense proposal can no longer vote on their own case",
    },
  },
  {
    date: { fr: "25 juillet 2026", en: "July 25, 2026" },
    title: {
      fr: "Délai avant qu'un membre inactif soit considéré comme dormant réduit de 12 à 6 mois",
      en: "Reduced the delay before an inactive member is considered dormant, from 12 to 6 months",
    },
  },
  {
    date: { fr: "21 juillet 2026", en: "July 21, 2026" },
    title: {
      fr: "Ajout du pseudo personnalisable, stocké directement sur la blockchain",
      en: "Added a customizable nickname, stored directly on the blockchain",
    },
  },
  {
    date: { fr: "18 juillet 2026", en: "July 18, 2026" },
    title: {
      fr: "Premier déploiement public sur le testnet Sepolia",
      en: "First public deployment on the Sepolia testnet",
    },
  },
];
