// Catalogue des règles du contrat affichées dans l'encart "pour info" du
// panneau — chaque scénario ne montre que celles qui lui sont pertinentes
// (voir `ruleIds` dans chaque fichier de demo/scenarios/), pour rester un
// vrai aide-mémoire contextuel plutôt qu'une liste figée et longue.
export const RULES = {
  quorum: {
    title: "Quorum de participation",
    body: "Au moins 75% des Loups actifs au moment du snapshot doivent voter (oui ou non), sinon le vote est invalide.",
  },
  majorite: {
    title: "Majorité",
    body: "Une fois le quorum atteint : oui doit strictement dépasser non parmi les votes exprimés. Une égalité échoue.",
  },
  conflit: {
    title: "Conflit d'intérêt",
    body: "La cible d'une Exclusion ou d'une Dépense ne peut pas voter sur son propre cas — elle est aussi retirée du dénominateur du quorum de ce vote-là.",
  },
  dormance: {
    title: "Dormance",
    body: "Un Loup silencieux depuis 180 jours devient dormant : exclu du calcul du quorum jusqu'à son retour (vote ou jeSuisLa()).",
  },
  reveil: {
    title: "Réveil pendant un vote",
    body: "Un réveil pendant la fenêtre de 7 jours compte au numérateur (le nombre de votes exprimés), mais n'agrandit jamais le dénominateur du quorum — déjà figé à l'ouverture du vote.",
  },
  ajournement: {
    title: "Ajournement",
    body: "Une titularisation peut être reportée (Ajourner) au maximum 2 fois. Au-delà, ce choix est refusé par le contrat.",
  },
  "duree-vote": {
    title: "Durée d'un vote",
    body: "7 jours pleins, quel que soit le moment où le seuil est atteint — executer() attend toujours l'échéance.",
  },
};

export function rulesFor(ruleIds) {
  return (ruleIds ?? []).map((id) => RULES[id]).filter(Boolean);
}
