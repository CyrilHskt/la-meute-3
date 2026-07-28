// Translates custom Solidity errors (contracts/Meute.sol) into readable
// messages, rather than showing viem's raw technical dump — useful
// especially when gas estimation fails before the real revert reason
// surfaces (the displayed message is then an unrelated generic RPC
// message, e.g. "Transaction gas limit exceeds cap").
const MESSAGES: Record<string, string> = {
  AlreadyVoted: "Tu as déjà voté sur cette proposition.",
  NotAWolf: "Seuls les Loups peuvent effectuer cette action.",
  NotACub: "Cette action ne concerne que les Louveteaux.",
  NotAMember: "Cette adresse n'est pas membre de la Meute.",
  AlreadyMember: "Cette adresse est déjà membre.",
  VoteClosed: "Le vote est clos pour cette proposition.",
  VoteStillOpen: "Le vote est encore en cours, impossible d'exécuter pour l'instant.",
  AlreadyExecuted: "Cette proposition a déjà été exécutée.",
  ProbationNotOver: "La période de probation de ce Louveteau n'est pas encore terminée.",
  IncorrectFee: "Le montant envoyé ne correspond pas exactement à la cotisation.",
  ApplicationAlreadyOpen: "Une candidature est déjà ouverte pour cette adresse.",
  ConfirmationAlreadyOpen: "Un vote de titularisation est déjà ouvert pour ce Louveteau.",
  InvalidChoice: "Ce choix de vote n'est pas valide pour ce type de proposition.",
  InsufficientFunds: "La trésorerie ne dispose pas de fonds suffisants pour cette dépense.",
  InvalidAmount: "Le montant indiqué n'est pas valide.",
  UnknownProposal: "Cette proposition n'existe pas.",
  TransferForbidden: "Les cartes de membre ne sont pas transférables.",
  NoFounders: "Aucun fondateur fourni.",
};

/** Looks up error.cause.cause...data.errorName through the viem error chain. */
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
