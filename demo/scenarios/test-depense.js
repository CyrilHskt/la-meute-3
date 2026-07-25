// Scénario de test isolé : la dépense, avec un bénéficiaire qui est
// lui-même un Loup actif — pour exercer aussi le conflit d'intérêt
// (il ne peut pas voter sur sa propre dépense) en plus du mécanisme de
// dépense lui-même. Part d'un contrat vide.
import * as actions from "../actions.js";

export const ruleIds = ["quorum", "majorite", "conflit", "duree-vote"];

export const steps = [
  {
    id: "setup-depense",
    label: "Mise en place : 3 Loups actifs",
    narration: "Fondateur + 2 Loups admis et titularisés — leurs cotisations ont déjà financé la trésorerie.",
    command: [
      { type: "code", text: "candidater() -> voter() -> evm_increaseTime(7j) -> executer()" },
      { type: "code", text: "evm_increaseTime(90j) -> ouvrirTitularisation() -> voter() -> evm_increaseTime(7j) -> executer()" },
    ],
    run: actions.setupDepense,
  },
  {
    id: "ouvrir-depense",
    label: "1. Un Loup propose une dépense vers un autre Loup",
    narration: "Le bénéficiaire est lui-même un Loup actif — de quoi montrer le conflit d'intérêt juste après.",
    command: [{ type: "code", text: 'founder.proposerDepense(loup2, 0.005 ETH, "Test dépense")' }],
    run: actions.ouvrirDepenseTest,
  },
  {
    id: "vote-depense",
    label: "2. Les autres Loups votent",
    narration: "Le bénéficiaire ne peut pas voter sur sa propre dépense (conflit d'intérêt) — les autres Loups actifs votent Approuver.",
    command: [
      { type: "code", text: "contrat.voter(id, Approuver)" },
      { type: "comment", text: "le bénéficiaire serait rejeté avec ConflitInteret() si il essayait" },
    ],
    run: actions.voteDepenseTest,
  },
  {
    id: "temps-vote-depense",
    label: "3. On avance le temps (fin de la fenêtre de vote)",
    narration: "On saute les 7 jours d'attente.",
    command: [
      { type: "code", text: "evm_increaseTime(604801)" },
      { type: "code", text: "evm_mine()" },
    ],
    run: actions.tempsVoteDepenseTest,
  },
  {
    id: "execution-depense",
    label: "4. La dépense est exécutée",
    narration: "Les fonds quittent la trésorerie vers le bénéficiaire — visible en direct dans le front.",
    command: [
      { type: "code", text: "founder.executer(id)" },
      { type: "comment", text: "transfert ETH réel vers la cible" },
    ],
    run: actions.executionDepenseTest,
  },
];
