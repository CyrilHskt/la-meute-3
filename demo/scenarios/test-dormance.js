// Scénario de test isolé : la dormance et son effet sur le quorum — le
// mécanisme le plus différenciant du projet. Part d'un contrat vide.
import * as actions from "../actions.js";

export const ruleIds = ["quorum", "dormance", "reveil", "conflit", "duree-vote"];

export const steps = [
  {
    id: "setup-dormance",
    label: "Mise en place : 3 Loups actifs",
    narration: "Fondateur + 2 Loups admis et titularisés. L'un d'eux (loup3) ne fera plus jamais rien après cette étape.",
    command: [
      { type: "code", text: "candidater() -> voter() -> evm_increaseTime(7j) -> executer()" },
      { type: "code", text: "evm_increaseTime(90j) -> ouvrirTitularisation() -> voter() -> evm_increaseTime(7j) -> executer()" },
    ],
    run: actions.setupDormance,
  },
  {
    id: "avancer-un-an",
    label: "1. On avance le temps de 6 mois",
    narration: "181 jours sans aucune activité de personne.",
    command: [
      { type: "code", text: "evm_increaseTime(15638400)" },
      { type: "comment", text: "181 jours — au-delà du seuil de dormance (180 jours)" },
    ],
    run: actions.avancerUnAn,
  },
  {
    id: "reveil-partiel",
    label: "2. Deux Loups confirment leur présence",
    narration: "Le fondateur et loup2 redeviennent actifs — loup3 ne fait rien, reste dormant.",
    command: [
      { type: "code", text: "founder.jeSuisLa()" },
      { type: "code", text: "loup2.jeSuisLa()" },
      { type: "comment", text: "loup3 : aucun appel — restera détecté dormant par estDormant()" },
    ],
    run: actions.reveilPartiel,
  },
  {
    id: "ouvrir-depense-dormance",
    label: "3. Un Loup actif ouvre une proposition",
    narration: "Le snapshot se fige à l'ouverture — il ne doit compter que les Loups actifs.",
    command: [
      { type: "code", text: "founder.proposerDepense(loup2, 0.001 ETH, \"Test dormance\")" },
      { type: "comment", text: "snapshotActifs attendu : 2 (loupsActifs() exclut loup3, dormant)" },
    ],
    run: actions.ouvrirDepenseDormance,
  },
  {
    id: "vote-depense-dormance",
    label: "4. Le fondateur vote",
    narration: "loup2, bénéficiaire de la dépense, ne peut pas voter sur son propre cas (conflit d'intérêt, §7.4) — retiré du dénominateur, le seul vote du fondateur suffit.",
    command: [{ type: "code", text: "founder.voter(id, Approuver)" }],
    run: actions.voteDepenseDormance,
  },
  {
    id: "temps-vote-depense-dormance",
    label: "5. On avance le temps (fin du vote)",
    narration: "On saute les 7 jours.",
    command: [{ type: "code", text: "evm_increaseTime(604801)" }],
    run: actions.tempsVoteDepenseDormance,
  },
  {
    id: "execution-depense-dormance",
    label: "6. La dépense est exécutée",
    narration: "Sans loup3 : la preuve que la dormance l'a bien exclu du quorum.",
    command: [{ type: "code", text: "founder.executer(id)" }],
    run: actions.executionDepenseDormance,
  },
  {
    id: "reveil-tardif",
    label: "7. loup3 se réveille enfin, trop tard",
    narration: "Front-running du réveil neutralisé : revenir après la clôture ne change rien rétroactivement au vote déjà exécuté.",
    command: [
      { type: "code", text: "loup3.jeSuisLa()" },
      { type: "comment", text: "aucun effet sur la proposition déjà exécutée" },
    ],
    run: actions.reveilTardif,
  },
];
