// Isolated test scenario: postponing (Postpone) a confirmation, and the
// MAX_POSTPONEMENTS cap (the contract must refuse a 3rd postponement).
// Starts from an empty contract.
import * as actions from "../actions.js";

export const ruleIds = ["quorum", "majority", "postponement", "vote-duration"];

export const steps = [
  {
    id: "setup-postponement",
    label: "Mise en place : un Louveteau prêt pour son vote",
    narration: "Un candidat admis, probation déjà écoulée, 2 Loups actifs prêts à voter.",
    command: [
      { type: "code", text: "applyForMembership() -> vote() -> evm_increaseTime(7j) -> execute()" },
      { type: "comment", text: "un 2e Loup pour un vote à deux" },
      { type: "code", text: "evm_increaseTime(90j)" },
    ],
    run: actions.setupPostponement,
  },
  {
    id: "open-confirmation-1",
    label: "1. Premier vote de titularisation",
    narration: "Un Loup ouvre le vote.",
    command: [{ type: "code", text: "founder.openConfirmationVote(applicant)" }],
    run: actions.openConfirmation1,
  },
  {
    id: "vote-postpone-1",
    label: "2. Les Loups votent Ajourner",
    narration: "Report plutôt qu'une décision définitive.",
    command: [{ type: "code", text: "contract.vote(id, Postpone)" }],
    run: actions.votePostpone1,
  },
  {
    id: "vote-time-1",
    label: "3. On avance le temps (fin du vote)",
    narration: "On saute les 7 jours.",
    command: [{ type: "code", text: "evm_increaseTime(604801)" }],
    run: actions.confirmationVoteTime1,
  },
  {
    id: "execute-postponement-1",
    label: "4. Exécution : ajournement n°1",
    narration: "Le Louveteau reste Louveteau, sa probation redémarre.",
    command: [
      { type: "code", text: "applicant.execute(id)" },
      { type: "comment", text: "postponements = 1, lastActivity remise à l'heure actuelle" },
    ],
    run: actions.executePostponement1,
  },
  {
    id: "probation-time-2",
    label: "5. On avance le temps (nouvelle probation)",
    narration: "90 jours de plus.",
    command: [{ type: "code", text: "evm_increaseTime(7776001)" }],
    run: actions.newProbationTime1,
  },
  {
    id: "open-confirmation-2",
    label: "6. Deuxième vote de titularisation",
    narration: "On retente.",
    command: [{ type: "code", text: "founder.openConfirmationVote(applicant)" }],
    run: actions.openConfirmation2,
  },
  {
    id: "vote-postpone-2",
    label: "7. Les Loups votent Ajourner à nouveau",
    narration: "Deuxième report.",
    command: [{ type: "code", text: "contract.vote(id, Postpone)" }],
    run: actions.votePostpone2,
  },
  {
    id: "vote-time-2",
    label: "8. On avance le temps (fin du vote)",
    narration: "On saute les 7 jours.",
    command: [{ type: "code", text: "evm_increaseTime(604801)" }],
    run: actions.confirmationVoteTime2,
  },
  {
    id: "execute-postponement-2",
    label: "9. Exécution : ajournement n°2 (plafond atteint)",
    narration: "AJOURNEMENTS_MAX (2) est désormais consommé en totalité.",
    command: [
      { type: "code", text: "applicant.execute(id)" },
      { type: "comment", text: "postponements = 2 = MAX_POSTPONEMENTS" },
    ],
    run: actions.executePostponement2,
  },
  {
    id: "probation-time-3",
    label: "10. On avance le temps (nouvelle probation)",
    narration: "90 jours de plus.",
    command: [{ type: "code", text: "evm_increaseTime(7776001)" }],
    run: actions.newProbationTime2,
  },
  {
    id: "open-confirmation-3",
    label: "11. Troisième vote de titularisation",
    narration: "On ouvre un 3e vote — le plafond va se voir ici.",
    command: [{ type: "code", text: "founder.openConfirmationVote(applicant)" }],
    run: actions.openConfirmation3,
  },
  {
    id: "postpone-attempt-refused",
    label: "12. Un Loup essaie de voter Ajourner : ça doit échouer",
    narration: "Le contrat doit refuser — le plafond est déjà atteint. Un revert ici est le résultat attendu, pas un bug du panneau.",
    command: [
      { type: "code", text: "contract.vote(id, Postpone)" },
      { type: "comment", text: "attendu : revert InvalidChoice()" },
    ],
    run: actions.postponeAttemptRefused,
  },
];
