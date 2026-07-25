// Scénario de test isolé : l'exclusion, seul type de proposition jamais
// exercé par le scénario de certification. Part d'un contrat vide.
import * as actions from "../actions.js";

export const ruleIds = ["quorum", "majorite", "conflit", "duree-vote"];

export const steps = [
  {
    id: "setup-exclusion",
    label: "Mise en place : 3 Loups actifs",
    narration: "Fondateur + 2 Loups admis et titularisés — un vote d'exclusion à 3 a du sens.",
    command: [
      { type: "title", text: "2 nouveaux Loups rejoignent" },
      { type: "code", text: "candidater() -> voter() -> evm_increaseTime(7j) -> executer()" },
      { type: "code", text: "evm_increaseTime(90j) -> ouvrirTitularisation() -> voter() -> evm_increaseTime(7j) -> executer()" },
    ],
    run: actions.setupExclusion,
  },
  {
    id: "ouvrir-exclusion",
    label: "1. Un Loup propose d'exclure un autre",
    narration: "Un Loup ouvre une proposition d'exclusion contre un autre Loup.",
    command: [{ type: "code", text: "founder.proposerExclusion(cible)" }],
    run: actions.ouvrirExclusion,
  },
  {
    id: "vote-exclusion",
    label: "2. Les autres Loups votent",
    narration: "La cible ne peut pas voter sur sa propre exclusion (conflit d'intérêt) — les autres Loups actifs votent Approuver.",
    command: [
      { type: "code", text: "contrat.voter(id, Approuver)" },
      { type: "comment", text: "la cible serait rejetée avec ConflitInteret() si elle essayait" },
    ],
    run: actions.voteExclusion,
  },
  {
    id: "temps-vote-exclusion",
    label: "3. On avance le temps (fin de la fenêtre de vote)",
    narration: "On saute les 7 jours d'attente.",
    command: [
      { type: "code", text: "evm_increaseTime(604801)" },
      { type: "code", text: "evm_mine()" },
    ],
    run: actions.tempsVoteExclusion,
  },
  {
    id: "execution-exclusion",
    label: "4. L'exclusion est exécutée",
    narration: "La carte de l'ancien Loup est brûlée — il n'est plus membre du tout.",
    command: [
      { type: "code", text: "founder.executer(id)" },
      { type: "comment", text: "_bruler(cible) -> _burn(tokenId), carte supprimée" },
    ],
    run: actions.executionExclusion,
  },
];
