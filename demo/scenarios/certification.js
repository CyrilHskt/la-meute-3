// Le scénario en données : chaque entrée décrit un bouton du panneau.
// `command` est affiché derrière l'icône "i" — une liste de lignes typées
// ("title" | "comment" | "code") plutôt qu'un bloc de texte brut, pour que
// la page puisse distinguer visuellement un titre, une explication et un
// vrai appel de fonction. Pas forcément des commandes shell copiables :
// l'objectif est de garder le lien intellectuel avec ce qui se passe sur
// le contrat, pas de fournir un terminal.
// Ajouter une étape (ex. plus tard : dons, tour de réveil) = ajouter une
// ligne ici + la fonction correspondante dans actions.js, sans toucher au
// serveur ni à la page.
import * as actions from "../actions.js";

export const steps = [
  {
    id: "mise-en-place",
    label: "Mise en place : la meute a déjà une vraie activité",
    narration: "Avant de commencer l'histoire, la meute compte déjà 10 Loups actifs, 5 Loups dormants, 2 Louveteaux, de la trésorerie et plusieurs propositions passées + une en cours.",
    command: [
      { type: "title", text: "14 nouveaux Loups rejoignent, un par un (9 resteront actifs, 5 seront endormis)" },
      { type: "code", text: "candidater()" },
      { type: "comment", text: "chaque Loup déjà actif vote — tout le monde reste donc bien actif pendant cette phase" },
      { type: "code", text: "voter(id, Approuver)" },
      { type: "comment", text: "cheatcode Hardhat : on saute les 7 jours d'attente" },
      { type: "code", text: "evm_increaseTime(7 jours)" },
      { type: "code", text: "executer(id)" },
      { type: "comment", text: "devient Louveteau — puis, pour chacun, la titularisation" },
      { type: "code", text: "evm_increaseTime(90 jours)" },
      { type: "code", text: "ouvrirTitularisation(addr)" },
      { type: "code", text: "voter(id, Approuver)" },
      { type: "code", text: "evm_increaseTime(7 jours)" },
      { type: "code", text: "executer(id)" },
      { type: "comment", text: "devient Loup à part entière — 15 Loups au total (fondateur inclus)" },
      { type: "title", text: "5 d'entre eux sont volontairement laissés dormants" },
      { type: "code", text: "evm_increaseTime(180 jours)" },
      { type: "comment", text: "dépasse DELAI_DORMANCE — tout le monde devient dormant" },
      { type: "code", text: "jeSuisLa()" },
      { type: "comment", text: "seuls 10 Loups (fondateur + 9) confirment leur présence — les 5 restants ne font rien et restent dormants" },
      { type: "title", text: "2 Louveteaux rejoignent, sans titularisation" },
      { type: "code", text: "candidater() -> voter() -> evm_increaseTime(7j) -> executer()" },
      { type: "title", text: "2 candidats gonflent la trésorerie puis partent" },
      { type: "code", text: "candidater() -> voter() -> evm_increaseTime(7j) -> executer() -> demissionner()" },
      { type: "comment", text: "cotisation jamais remboursée — gonfle le trésor sans laisser de membre" },
      { type: "title", text: "Une proposition laissée en attente" },
      { type: "code", text: "proposerDepense(...)" },
      { type: "comment", text: "jamais votée — pour démarrer avec 1 proposition en cours" },
    ],
    run: actions.miseEnPlace,
  },
  {
    id: "candidat-postule",
    label: "1. Un candidat postule",
    narration: "Un candidat verse sa cotisation et ouvre une candidature.",
    command: [{ type: "code", text: "candidat.candidater({ value: cotisation })" }],
    run: actions.candidatPostule,
  },
  {
    id: "vote-admission",
    label: "2. Les Loups votent son admission",
    narration: "Tous les Loups actifs votent Approuver.",
    command: [
      { type: "comment", text: "pour chaque Loup actif" },
      { type: "code", text: "contrat.voter(id, Approuver)" },
    ],
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
    label: "6. Un Loup ouvre le vote de titularisation",
    narration: "Un Loup propose de titulariser le Louveteau.",
    command: [{ type: "code", text: "founder.ouvrirTitularisation(candidat)" }],
    run: actions.ouvertureTitularisation,
  },
  {
    id: "vote-titularisation",
    label: "7. Les Loups votent la titularisation",
    narration: "Tous les Loups actifs votent Approuver.",
    command: [
      { type: "comment", text: "pour chaque Loup actif" },
      { type: "code", text: "contrat.voter(id, Approuver)" },
    ],
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
    label: "10. Un Loup propose une dépense",
    narration: "Un Loup propose de payer l'hébergement du serveur de jeu avec la trésorerie.",
    command: [{ type: "code", text: 'founder.proposerDepense(candidat, 0.005 ETH, "Hébergement serveur de jeu")' }],
    run: actions.propositionDepense,
  },
  {
    id: "vote-depense",
    label: "11. Les Loups votent la dépense",
    narration: "Tous les Loups actifs (dont le tout nouveau) votent Approuver.",
    command: [
      { type: "comment", text: "pour chaque Loup actif" },
      { type: "code", text: "contrat.voter(id, Approuver)" },
    ],
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
