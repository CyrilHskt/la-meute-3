// Traduit les erreurs Solidity personnalisées (contracts/Meute.sol) en
// messages lisibles, plutôt que d'afficher le dump technique brut de viem —
// utile en particulier quand l'estimation de gas échoue avant que la vraie
// raison du revert ne remonte (le message affiché est alors un message RPC
// générique sans rapport, ex: "Transaction gas limit exceeds cap").
const MESSAGES: Record<string, string> = {
  DejaVote: "Tu as déjà voté sur cette proposition.",
  PasLoup: "Seuls les Loups peuvent effectuer cette action.",
  PasLouveteau: "Cette action ne concerne que les Louveteaux.",
  PasMembre: "Cette adresse n'est pas membre de la Meute.",
  PasCandidat: "Cette adresse n'a pas de candidature en cours.",
  DejaMembre: "Cette adresse est déjà membre.",
  VoteFerme: "Le vote est clos pour cette proposition.",
  VoteEncoreOuvert: "Le vote est encore en cours, impossible d'exécuter pour l'instant.",
  DejaExecutee: "Cette proposition a déjà été exécutée.",
  ProbationNonTerminee: "La période de probation de ce Louveteau n'est pas encore terminée.",
  CotisationIncorrecte: "Le montant envoyé ne correspond pas exactement à la cotisation.",
  CandidatureDejaOuverte: "Une candidature est déjà ouverte pour cette adresse.",
  TitularisationDejaOuverte: "Un vote de titularisation est déjà ouvert pour ce Louveteau.",
  ChoixInvalide: "Ce choix de vote n'est pas valide pour ce type de proposition.",
  FondsInsuffisants: "La trésorerie ne dispose pas de fonds suffisants pour cette dépense.",
  MontantInvalide: "Le montant indiqué n'est pas valide.",
  ProposalInconnue: "Cette proposition n'existe pas.",
  TransfertInterdit: "Les cartes de membre ne sont pas transférables.",
  AucunFondateur: "Aucun fondateur fourni.",
};

/** Cherche error.cause.cause...data.errorName dans la chaîne d'erreurs viem. */
function findErrorName(e: unknown): string | undefined {
  let current = e as { data?: { errorName?: string }; cause?: unknown } | undefined;
  let depth = 0;
  while (current && depth < 10) {
    if (current.data?.errorName) return current.data.errorName;
    current = current.cause as typeof current;
    depth++;
  }
  return undefined;
}

export function friendlyContractError(e: unknown): string {
  const errorName = findErrorName(e);
  if (errorName && MESSAGES[errorName]) return MESSAGES[errorName];
  if (errorName) return `Le contrat a refusé l'opération (${errorName}).`;

  const err = e as { shortMessage?: string } | undefined;
  if (err?.shortMessage) return err.shortMessage;
  return e instanceof Error ? e.message : String(e);
}
