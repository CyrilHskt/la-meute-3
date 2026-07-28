// Isolated test scenario: expenses, with a beneficiary who is themselves
// an active Wolf — to also exercise the conflict of interest (they can't
// vote on their own expense) on top of the expense mechanism itself.
// Starts from an empty contract.
import * as actions from "../actions.js";

export const ruleIds = ["quorum", "majority", "conflict", "vote-duration"];

export const steps = [
  {
    id: "setup-expense",
    label: "Mise en place : 3 Loups actifs",
    narration: "Fondateur + 2 Loups admis et titularisés — leurs cotisations ont déjà financé la trésorerie.",
    command: [
      { type: "code", text: "applyForMembership() -> vote() -> evm_increaseTime(7j) -> execute()" },
      { type: "code", text: "evm_increaseTime(90j) -> openConfirmationVote() -> vote() -> evm_increaseTime(7j) -> execute()" },
    ],
    run: actions.setupExpense,
  },
  {
    id: "open-expense",
    label: "1. Un Loup propose une dépense vers un autre Loup",
    narration: "Le bénéficiaire est lui-même un Loup actif — de quoi montrer le conflit d'intérêt juste après.",
    command: [{ type: "code", text: 'founder.proposeExpense(wolf2, 0.005 ETH, "Test dépense")' }],
    run: actions.openTestExpense,
  },
  {
    id: "vote-expense",
    label: "2. Les autres Loups votent",
    narration: "Le bénéficiaire ne peut pas voter sur sa propre dépense (conflit d'intérêt) — les autres Loups actifs votent Approuver.",
    command: [
      { type: "code", text: "contract.vote(id, Approve)" },
      { type: "comment", text: "le bénéficiaire serait rejeté avec ConflictOfInterest() si il essayait" },
    ],
    run: actions.voteOnTestExpense,
  },
  {
    id: "expense-vote-time",
    label: "3. On avance le temps (fin de la fenêtre de vote)",
    narration: "On saute les 7 jours d'attente.",
    command: [
      { type: "code", text: "evm_increaseTime(604801)" },
      { type: "code", text: "evm_mine()" },
    ],
    run: actions.testExpenseVoteTime,
  },
  {
    id: "execute-expense",
    label: "4. La dépense est exécutée",
    narration: "Les fonds quittent la trésorerie vers le bénéficiaire — visible en direct dans le front.",
    command: [
      { type: "code", text: "founder.execute(id)" },
      { type: "comment", text: "transfert ETH réel vers la cible" },
    ],
    run: actions.executeTestExpense,
  },
];
