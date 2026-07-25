// Scénario de test isolé : le report (Ajourner) d'une titularisation, et
// le plafond AJOURNEMENTS_MAX (le contrat doit refuser un 3e ajournement).
// Part d'un contrat vide.
import * as actions from "../actions.js";

export const ruleIds = ["quorum", "majorite", "ajournement", "duree-vote"];

export const steps = [
  {
    id: "setup-ajournement",
    label: "Mise en place : un Louveteau prêt pour son vote",
    narration: "Un candidat admis, probation déjà écoulée, 2 Loups actifs prêts à voter.",
    command: [
      { type: "code", text: "candidater() -> voter() -> evm_increaseTime(7j) -> executer()" },
      { type: "comment", text: "un 2e Loup pour un vote à deux" },
      { type: "code", text: "evm_increaseTime(90j)" },
    ],
    run: actions.setupAjournement,
  },
  {
    id: "ouvrir-titularisation-1",
    label: "1. Premier vote de titularisation",
    narration: "Un Loup ouvre le vote.",
    command: [{ type: "code", text: "founder.ouvrirTitularisation(candidat)" }],
    run: actions.ouvrirTitularisation1,
  },
  {
    id: "vote-ajourner-1",
    label: "2. Les Loups votent Ajourner",
    narration: "Report plutôt qu'une décision définitive.",
    command: [{ type: "code", text: "contrat.voter(id, Ajourner)" }],
    run: actions.voteAjourner1,
  },
  {
    id: "temps-vote-1",
    label: "3. On avance le temps (fin du vote)",
    narration: "On saute les 7 jours.",
    command: [{ type: "code", text: "evm_increaseTime(604801)" }],
    run: actions.tempsVoteTitularisation1,
  },
  {
    id: "execution-ajournement-1",
    label: "4. Exécution : ajournement n°1",
    narration: "Le Louveteau reste Louveteau, sa probation redémarre.",
    command: [
      { type: "code", text: "candidat.executer(id)" },
      { type: "comment", text: "ajournements = 1, derniereActivite remise à l'heure actuelle" },
    ],
    run: actions.executionAjournement1,
  },
  {
    id: "temps-probation-2",
    label: "5. On avance le temps (nouvelle probation)",
    narration: "90 jours de plus.",
    command: [{ type: "code", text: "evm_increaseTime(7776001)" }],
    run: actions.tempsNouvelleProbation1,
  },
  {
    id: "ouvrir-titularisation-2",
    label: "6. Deuxième vote de titularisation",
    narration: "On retente.",
    command: [{ type: "code", text: "founder.ouvrirTitularisation(candidat)" }],
    run: actions.ouvrirTitularisation2,
  },
  {
    id: "vote-ajourner-2",
    label: "7. Les Loups votent Ajourner à nouveau",
    narration: "Deuxième report.",
    command: [{ type: "code", text: "contrat.voter(id, Ajourner)" }],
    run: actions.voteAjourner2,
  },
  {
    id: "temps-vote-2",
    label: "8. On avance le temps (fin du vote)",
    narration: "On saute les 7 jours.",
    command: [{ type: "code", text: "evm_increaseTime(604801)" }],
    run: actions.tempsVoteTitularisation2,
  },
  {
    id: "execution-ajournement-2",
    label: "9. Exécution : ajournement n°2 (plafond atteint)",
    narration: "AJOURNEMENTS_MAX (2) est désormais consommé en totalité.",
    command: [
      { type: "code", text: "candidat.executer(id)" },
      { type: "comment", text: "ajournements = 2 = AJOURNEMENTS_MAX" },
    ],
    run: actions.executionAjournement2,
  },
  {
    id: "temps-probation-3",
    label: "10. On avance le temps (nouvelle probation)",
    narration: "90 jours de plus.",
    command: [{ type: "code", text: "evm_increaseTime(7776001)" }],
    run: actions.tempsNouvelleProbation2,
  },
  {
    id: "ouvrir-titularisation-3",
    label: "11. Troisième vote de titularisation",
    narration: "On ouvre un 3e vote — le plafond va se voir ici.",
    command: [{ type: "code", text: "founder.ouvrirTitularisation(candidat)" }],
    run: actions.ouvrirTitularisation3,
  },
  {
    id: "tentative-ajourner-refuse",
    label: "12. Un Loup essaie de voter Ajourner : ça doit échouer",
    narration: "Le contrat doit refuser — le plafond est déjà atteint. Un revert ici est le résultat attendu, pas un bug du panneau.",
    command: [
      { type: "code", text: "contrat.voter(id, Ajourner)" },
      { type: "comment", text: "attendu : revert ChoixInvalide()" },
    ],
    run: actions.tentativeAjournementRefuse,
  },
];
