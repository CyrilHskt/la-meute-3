// Scénario de présentation (soutenance, C7) : le cycle de vie complet d'un
// membre, sur un contrat propre (un seul fondateur) — candidature →
// admission → probation → titularisation → une dépense proposée en sa
// faveur (conflit d'intérêt : il ne peut pas voter sur son propre cas).
// Aucune "mise en place" lourde au préalable : le but n'est pas de montrer
// un volume de données réaliste (voir demo/actions.js miseEnPlace pour ça,
// utilisée par le scénario de certification), mais de dérouler ce parcours
// précis sans bruit autour. reset() seul fournit déjà ctx.founder/
// ctx.candidat/ctx.loups=[founder], pas besoin de logique dédiée.
import * as actions from "../actions.js";

export const ruleIds = ["quorum", "majorite", "conflit", "duree-vote"];

export const steps = [
  {
    id: "candidat-postule",
    label: "1. Un candidat postule",
    narration: "Un candidat verse sa cotisation et ouvre une candidature.",
    command: [{ type: "code", text: "candidat.candidater({ value: cotisation })" }],
    run: actions.candidatPostule,
  },
  {
    id: "vote-admission",
    label: "2. Le Loup fondateur vote son admission",
    narration: "Seul Loup actif à ce stade — son vote suffit à atteindre le quorum.",
    command: [{ type: "code", text: "founder.voter(id, Approuver)" }],
    run: actions.voteAdmission,
  },
  {
    id: "temps-vote-admission",
    label: "3. On avance le temps (fin de la fenêtre de vote, 7 jours)",
    narration: "Le vote reste ouvert 7 jours — on avance l'horloge pour ne pas attendre en vrai.",
    command: [
      { type: "comment", text: "cheatcode Hardhat, inexistant sur un vrai réseau" },
      { type: "code", text: "evm_increaseTime(604801)" },
      { type: "code", text: "evm_mine()" },
    ],
    run: actions.tempsVoteAdmission,
  },
  {
    id: "execution-admission",
    label: "4. La candidature est exécutée",
    narration: "Le candidat devient officiellement Louveteau, sa carte de membre est mintée.",
    command: [
      { type: "code", text: "candidat.executer(id)" },
      { type: "comment", text: "mint ERC721 en interne, rang Louveteau" },
    ],
    run: actions.executionAdmission,
  },
  {
    id: "temps-probation",
    label: "5. On avance le temps (fin de la probation, 90 jours)",
    narration: "Un Louveteau passe 90 jours de probation avant de pouvoir être titularisé.",
    command: [
      { type: "code", text: "evm_increaseTime(7776001)" },
      { type: "code", text: "evm_mine()" },
    ],
    run: actions.tempsProbation,
  },
  {
    id: "ouverture-titularisation",
    label: "6. Le Loup fondateur ouvre le vote de titularisation",
    narration: "N'importe quel Loup peut ouvrir ce vote.",
    command: [{ type: "code", text: "founder.ouvrirTitularisation(candidat)" }],
    run: actions.ouvertureTitularisation,
  },
  {
    id: "vote-titularisation",
    label: "7. Le Loup fondateur vote la titularisation",
    narration: "Même mécanique de quorum/majorité que l'admission.",
    command: [{ type: "code", text: "founder.voter(id, Approuver)" }],
    run: actions.voteTitularisation,
  },
  {
    id: "temps-vote-titularisation",
    label: "8. On avance le temps (fin de la fenêtre de vote)",
    narration: "On avance à nouveau l'horloge de 7 jours.",
    command: [
      { type: "code", text: "evm_increaseTime(604801)" },
      { type: "code", text: "evm_mine()" },
    ],
    run: actions.tempsVoteTitularisation,
  },
  {
    id: "execution-titularisation",
    label: "9. La titularisation est exécutée",
    narration: "Le Louveteau devient Loup à part entière — droit de vote plein.",
    command: [
      { type: "code", text: "candidat.executer(id)" },
      { type: "comment", text: "rang mis à jour à Loup en interne" },
    ],
    run: actions.executionTitularisation,
  },
  {
    id: "proposition-depense",
    label: "10. Un Loup propose une dépense vers le tout nouveau Loup",
    narration: "Un Loup propose de payer l'hébergement du serveur de jeu avec la trésorerie.",
    command: [{ type: "code", text: 'founder.proposerDepense(candidat, 0.005 ETH, "Hébergement serveur de jeu")' }],
    run: actions.propositionDepense,
  },
  {
    id: "vote-depense",
    label: "11. Les Loups votent la dépense",
    narration: "Le bénéficiaire (tout juste titularisé) ne peut pas voter sur sa propre dépense (conflit d'intérêt, §7.4).",
    command: [{ type: "code", text: "founder.voter(id, Approuver)" }],
    run: actions.voteDepense,
  },
  {
    id: "temps-vote-depense",
    label: "12. On avance le temps (fin de la fenêtre de vote)",
    narration: "On avance l'horloge une dernière fois.",
    command: [
      { type: "code", text: "evm_increaseTime(604801)" },
      { type: "code", text: "evm_mine()" },
    ],
    run: actions.tempsVoteDepense,
  },
  {
    id: "execution-depense",
    label: "13. La dépense est exécutée",
    narration: "Les fonds quittent la trésorerie du contrat — visible en direct dans le front.",
    command: [
      { type: "code", text: "founder.executer(id)" },
      { type: "comment", text: "transfert ETH réel vers la cible" },
    ],
    run: actions.executionDepense,
  },
];
