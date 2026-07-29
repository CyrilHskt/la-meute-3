// Isolated test scenario: exclusion, the only proposal type never
// exercised by the certification scenario. Starts from an empty contract.
import * as actions from "../actions.js";

export const ruleIds = ["quorum", "majority", "conflict", "vote-duration"];

export const steps = [
  {
    id: "setup-exclusion",
    label: "Mise en place : 3 Loups actifs",
    narration: "Fondateur + 2 Loups admis et titularisés — un vote d'exclusion à 3 a du sens.",
    command: [
      { type: "title", text: "2 nouveaux Loups rejoignent" },
      { type: "code", text: "applyForMembership() -> vote() -> evm_increaseTime(7j) -> execute()" },
      { type: "code", text: "evm_increaseTime(90j) -> openConfirmationVote() -> vote() -> evm_increaseTime(7j) -> execute()" },
    ],
    run: actions.setupExclusion,
  },
  {
    id: "open-exclusion",
    label: "1. Un Loup propose d'exclure un autre",
    narration: "Un Loup ouvre une proposition d'exclusion contre un autre Loup.",
    command: [{ type: "code", text: "founder.proposeExclusion(target)" }],
    run: actions.openExclusion,
  },
  {
    id: "vote-exclusion",
    label: "2. Les autres Loups votent",
    narration: "La cible ne peut pas voter sur sa propre exclusion (conflit d'intérêt) — les autres Loups actifs votent Approuver.",
    command: [
      { type: "code", text: "contract.vote(id, Approve)" },
      { type: "comment", text: "la cible serait rejetée avec ConflictOfInterest() si elle essayait" },
    ],
    run: actions.voteExclusion,
  },
  {
    id: "exclusion-vote-time",
    label: "3. On avance le temps (fin de la fenêtre de vote)",
    narration: "On saute les 7 jours d'attente.",
    command: [
      { type: "code", text: "evm_increaseTime(604801)" },
      { type: "code", text: "evm_mine()" },
    ],
    run: actions.exclusionVoteTime,
  },
  {
    id: "execute-exclusion",
    label: "4. L'exclusion est exécutée",
    narration: "La carte de l'ancien Loup est brûlée — il n'est plus membre du tout.",
    command: [
      { type: "code", text: "founder.execute(id)" },
      { type: "comment", text: "_burnCard(target) -> _burn(tokenId), carte supprimée" },
    ],
    run: actions.executeExclusion,
  },
];
