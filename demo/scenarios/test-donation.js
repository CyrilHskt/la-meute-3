// Scénario de test isolé : les dons — ouverts à n'importe quelle adresse,
// membre ou non, sans aucune mise en place nécessaire (contrairement aux
// autres scénarios de test). Part d'un contrat vide.
import * as actions from "../actions.js";

export const ruleIds = ["dons"];

export const steps = [
  {
    id: "premier-don",
    label: "1. Une adresse jamais vue fait un don",
    narration: "Aucune candidature, aucun vote — un don n'a rien à voir avec l'adhésion.",
    command: [{ type: "code", text: "contrat.donner({ value: 0.01 ETH })" }],
    run: actions.premierDon,
  },
  {
    id: "deuxieme-don",
    label: "2. Un Loup fait un don plus généreux",
    narration: "Même un membre peut donner en plus de sa cotisation — les deux sont indépendants.",
    command: [{ type: "code", text: "contrat.donner({ value: 0.05 ETH })" }],
    run: actions.deuxiemeDon,
  },
  {
    id: "redon",
    label: "3. Le premier donateur redonne",
    narration: "Les dons se cumulent par adresse (donsCumules) — le classement se construit hors-chaîne à partir de ça.",
    command: [
      { type: "code", text: "contrat.donner({ value: 0.02 ETH })" },
      { type: "comment", text: "donsCumules(adresse) : 0.01 + 0.02 = 0.03 ETH" },
    ],
    run: actions.redonDuPremier,
  },
];
