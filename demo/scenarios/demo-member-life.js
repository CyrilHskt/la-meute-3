// Presentation scenario (defense, C7): a member's full lifecycle, on a
// clean contract (a single founder) — application → admission →
// probation → confirmation → an expense proposed in their favor (conflict
// of interest: they can't vote on their own case). No heavy "setup"
// beforehand: the goal isn't to show a realistic data volume (see
// demo/actions.js's setup for that, used by the certification scenario),
// but to walk through this exact path without noise around it. reset()
// alone already provides ctx.founder/ctx.applicant/ctx.wolves=[founder],
// no dedicated logic needed.
import * as actions from "../actions.js";

export const ruleIds = ["quorum", "majority", "conflict", "vote-duration"];

export const steps = [
  {
    id: "applicant-applies",
    label: "1. Un candidat postule",
    narration: "Un candidat verse sa cotisation et ouvre une candidature.",
    command: [{ type: "code", text: "applicant.applyForMembership({ value: fee })" }],
    run: actions.applicantApplies,
  },
  {
    id: "vote-admission",
    label: "2. Le Loup fondateur vote son admission",
    narration: "Seul Loup actif à ce stade — son vote suffit à atteindre le quorum.",
    command: [{ type: "code", text: "founder.vote(id, Approve)" }],
    run: actions.voteOnAdmission,
  },
  {
    id: "admission-vote-time",
    label: "3. On avance le temps (fin de la fenêtre de vote, 7 jours)",
    narration: "Le vote reste ouvert 7 jours — on avance l'horloge pour ne pas attendre en vrai.",
    command: [
      { type: "comment", text: "cheatcode Hardhat, inexistant sur un vrai réseau" },
      { type: "code", text: "evm_increaseTime(604801)" },
      { type: "code", text: "evm_mine()" },
    ],
    run: actions.admissionVoteTime,
  },
  {
    id: "execute-admission",
    label: "4. La candidature est exécutée",
    narration: "Le candidat devient officiellement Louveteau, sa carte de membre est mintée.",
    command: [
      { type: "code", text: "applicant.execute(id)" },
      { type: "comment", text: "mint ERC721 en interne, rang Louveteau" },
    ],
    run: actions.executeAdmission,
  },
  {
    id: "probation-time",
    label: "5. On avance le temps (fin de la probation, 90 jours)",
    narration: "Un Louveteau passe 90 jours de probation avant de pouvoir être titularisé.",
    command: [
      { type: "code", text: "evm_increaseTime(7776001)" },
      { type: "code", text: "evm_mine()" },
    ],
    run: actions.probationTime,
  },
  {
    id: "open-confirmation",
    label: "6. Le Loup fondateur ouvre le vote de titularisation",
    narration: "N'importe quel Loup peut ouvrir ce vote.",
    command: [{ type: "code", text: "founder.openConfirmationVote(applicant)" }],
    run: actions.openConfirmation,
  },
  {
    id: "vote-confirmation",
    label: "7. Le Loup fondateur vote la titularisation",
    narration: "Même mécanique de quorum/majorité que l'admission.",
    command: [{ type: "code", text: "founder.vote(id, Approve)" }],
    run: actions.voteOnConfirmation,
  },
  {
    id: "confirmation-vote-time",
    label: "8. On avance le temps (fin de la fenêtre de vote)",
    narration: "On avance à nouveau l'horloge de 7 jours.",
    command: [
      { type: "code", text: "evm_increaseTime(604801)" },
      { type: "code", text: "evm_mine()" },
    ],
    run: actions.confirmationVoteTime,
  },
  {
    id: "execute-confirmation",
    label: "9. La titularisation est exécutée",
    narration: "Le Louveteau devient Loup à part entière — droit de vote plein.",
    command: [
      { type: "code", text: "applicant.execute(id)" },
      { type: "comment", text: "rang mis à jour à Loup en interne" },
    ],
    run: actions.executeConfirmation,
  },
  {
    id: "expense-proposal",
    label: "10. Un Loup propose une dépense vers le tout nouveau Loup",
    narration: "Un Loup propose de payer l'hébergement du serveur de jeu avec la trésorerie.",
    command: [{ type: "code", text: 'founder.proposeExpense(applicant, 0.005 ETH, "Hébergement serveur de jeu")' }],
    run: actions.expenseProposal,
  },
  {
    id: "vote-expense",
    label: "11. Les Loups votent la dépense",
    narration: "Le bénéficiaire (tout juste titularisé) ne peut pas voter sur sa propre dépense (conflit d'intérêt, §7.4).",
    command: [{ type: "code", text: "founder.vote(id, Approve)" }],
    run: actions.voteOnExpense,
  },
  {
    id: "expense-vote-time",
    label: "12. On avance le temps (fin de la fenêtre de vote)",
    narration: "On avance l'horloge une dernière fois.",
    command: [
      { type: "code", text: "evm_increaseTime(604801)" },
      { type: "code", text: "evm_mine()" },
    ],
    run: actions.expenseVoteTime,
  },
  {
    id: "execute-expense",
    label: "13. La dépense est exécutée",
    narration: "Les fonds quittent la trésorerie du contrat — visible en direct dans le front.",
    command: [
      { type: "code", text: "founder.execute(id)" },
      { type: "comment", text: "transfert ETH réel vers la cible" },
    ],
    run: actions.executeExpense,
  },
];
