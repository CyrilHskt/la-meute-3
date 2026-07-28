// Catalogue of contract rules shown in the panel's "for info" box — each
// scenario only shows the ones relevant to it (see `ruleIds` in each
// demo/scenarios/ file), to stay a genuine contextual cheat sheet rather
// than a long, static list.
export const RULES = {
  quorum: {
    title: "Quorum de participation",
    body: "Au moins 75% des Loups actifs au moment du snapshot doivent voter (oui ou non), sinon le vote est invalide.",
  },
  majority: {
    title: "Majorité",
    body: "Une fois le quorum atteint : oui doit strictement dépasser non parmi les votes exprimés. Une égalité échoue.",
  },
  conflict: {
    title: "Conflit d'intérêt",
    body: "La cible d'une Exclusion ou d'une Dépense ne peut pas voter sur son propre cas — elle est aussi retirée du dénominateur du quorum de ce vote-là.",
  },
  dormance: {
    title: "Dormance",
    body: "Un Loup silencieux depuis 180 jours devient dormant : exclu du calcul du quorum jusqu'à son retour (vote ou imHere()).",
  },
  wakeUp: {
    title: "Réveil pendant un vote",
    body: "Un réveil pendant la fenêtre de 7 jours compte au numérateur (le nombre de votes exprimés), mais n'agrandit jamais le dénominateur du quorum — déjà figé à l'ouverture du vote.",
  },
  postponement: {
    title: "Ajournement",
    body: "Une titularisation peut être reportée (Ajourner) au maximum 2 fois. Au-delà, ce choix est refusé par le contrat.",
  },
  "vote-duration": {
    title: "Durée d'un vote",
    body: "7 jours pleins, quel que soit le moment où le seuil est atteint — executer() attend toujours l'échéance.",
  },
  donations: {
    title: "Dons",
    body: "Ouverts à n'importe quelle adresse, membre ou non — sans rapport avec la cotisation. Cumulés par adresse (totalDonations), le classement des contributeurs se construit hors-chaîne, jamais par une boucle on-chain.",
  },
};

export function rulesFor(ruleIds) {
  return (ruleIds ?? []).map((id) => RULES[id]).filter(Boolean);
}
