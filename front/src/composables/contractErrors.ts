// Translates custom Solidity errors (contracts/Meute.sol) into readable
// messages, rather than showing viem's raw technical dump — useful
// especially when gas estimation fails before the real revert reason
// surfaces (the displayed message is then an unrelated generic RPC
// message, e.g. "Transaction gas limit exceeds cap").
//
// Maps to i18n keys rather than final strings: the actual text lives in
// locales/{fr,en}.ts under `errors.*`, translated via the `t` passed in by
// the caller (every caller is a component that already has `useI18n()`).
const MESSAGE_KEYS: Record<string, string> = {
  AlreadyVoted: "errors.alreadyVoted",
  NotAWolf: "errors.notAWolf",
  NotACub: "errors.notACub",
  NotAMember: "errors.notAMember",
  AlreadyMember: "errors.alreadyMember",
  VoteClosed: "errors.voteClosed",
  VoteStillOpen: "errors.voteStillOpen",
  AlreadyExecuted: "errors.alreadyExecuted",
  ProbationNotOver: "errors.probationNotOver",
  IncorrectFee: "errors.incorrectFee",
  ApplicationAlreadyOpen: "errors.applicationAlreadyOpen",
  ConfirmationAlreadyOpen: "errors.confirmationAlreadyOpen",
  InvalidChoice: "errors.invalidChoice",
  InsufficientFunds: "errors.insufficientFunds",
  InvalidAmount: "errors.invalidAmount",
  UnknownProposal: "errors.unknownProposal",
  TransferForbidden: "errors.transferForbidden",
  NoFounders: "errors.noFounders",
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

type Translate = (key: string, params?: Record<string, unknown>) => string;

export function friendlyContractError(e: unknown, t: Translate): string {
  const errorName = findErrorName(e);
  if (errorName && MESSAGE_KEYS[errorName]) return t(MESSAGE_KEYS[errorName]);
  if (errorName) return t("errors.unknownError", { errorName });

  // Raw viem/JS error text — not ours to translate, comes from the
  // library/RPC as-is regardless of the active site language.
  const err = e as { shortMessage?: string } | undefined;
  if (err?.shortMessage) return err.shortMessage;
  return e instanceof Error ? e.message : String(e);
}
