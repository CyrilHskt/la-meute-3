// Isolated test scenario: dormancy and its effect on quorum — the
// project's most distinctive mechanism. Starts from an empty contract.
import * as actions from "../actions.js";

export const ruleIds = ["quorum", "dormance", "wakeUp", "conflict", "vote-duration"];

export const steps = [
  {
    id: "setup-dormance",
    label: "Mise en place : 3 Loups actifs",
    narration: "Fondateur + 2 Loups admis et titularisés. L'un d'eux (wolf3) ne fera plus jamais rien après cette étape.",
    command: [
      { type: "code", text: "applyForMembership() -> vote() -> evm_increaseTime(7j) -> execute()" },
      { type: "code", text: "evm_increaseTime(90j) -> openConfirmationVote() -> vote() -> evm_increaseTime(7j) -> execute()" },
    ],
    run: actions.setupDormance,
  },
  {
    id: "advance-one-year",
    label: "1. On avance le temps de 6 mois",
    narration: "181 jours sans aucune activité de personne.",
    command: [
      { type: "code", text: "evm_increaseTime(15638400)" },
      { type: "comment", text: "181 jours — au-delà du seuil de dormance (180 jours)" },
    ],
    run: actions.advanceOneYear,
  },
  {
    id: "partial-wake-up",
    label: "2. Deux Loups confirment leur présence",
    narration: "Le fondateur et wolf2 redeviennent actifs — wolf3 ne fait rien, reste dormant.",
    command: [
      { type: "code", text: "founder.imHere()" },
      { type: "code", text: "wolf2.imHere()" },
      { type: "comment", text: "wolf3 : aucun appel — restera détecté dormant par isDormant()" },
    ],
    run: actions.partialWakeUp,
  },
  {
    id: "open-dormancy-expense",
    label: "3. Un Loup actif ouvre une proposition",
    narration: "Le snapshot se fige à l'ouverture — il ne doit compter que les Loups actifs.",
    command: [
      { type: "code", text: "founder.proposeExpense(wolf2, 0.001 ETH, \"Test dormance\")" },
      { type: "comment", text: "activeSnapshot attendu : 2 (activeWolves() exclut wolf3, dormant)" },
    ],
    run: actions.openDormancyExpense,
  },
  {
    id: "vote-dormancy-expense",
    label: "4. Le fondateur vote",
    narration: "wolf2, bénéficiaire de la dépense, ne peut pas voter sur son propre cas (conflit d'intérêt, §7.4) — retiré du dénominateur, le seul vote du fondateur suffit.",
    command: [{ type: "code", text: "founder.vote(id, Approve)" }],
    run: actions.voteOnDormancyExpense,
  },
  {
    id: "dormancy-expense-vote-time",
    label: "5. On avance le temps (fin du vote)",
    narration: "On saute les 7 jours.",
    command: [{ type: "code", text: "evm_increaseTime(604801)" }],
    run: actions.dormancyExpenseVoteTime,
  },
  {
    id: "execute-dormancy-expense",
    label: "6. La dépense est exécutée",
    narration: "Sans wolf3 : la preuve que la dormance l'a bien exclu du quorum.",
    command: [{ type: "code", text: "founder.execute(id)" }],
    run: actions.executeDormancyExpense,
  },
  {
    id: "late-wake-up",
    label: "7. wolf3 se réveille enfin, trop tard",
    narration: "Front-running du réveil neutralisé : revenir après la clôture ne change rien rétroactivement au vote déjà exécuté.",
    command: [
      { type: "code", text: "wolf3.imHere()" },
      { type: "comment", text: "aucun effet sur la proposition déjà exécutée" },
    ],
    run: actions.lateWakeUp,
  },
];
