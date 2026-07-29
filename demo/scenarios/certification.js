// "Certification" scenario: only meant to give the app a varied, realistic
// state to navigate (Members/Governance/Donations pages neither empty nor
// monotonous) — not a step-by-step demo of a specific mechanism, that's
// the job of the A/B/C scenarios dedicated to the defense (see
// docs/local/soutenance-prep.md) and the isolated test scenarios. A single
// button, deliberately: the previous version (14 Wolves created one by
// one, ~30+ transactions, several minutes) duplicated scenario B once that
// one was created, without adding anything for all that waiting.
import * as actions from "../actions.js";

export const ruleIds = ["quorum", "majority", "conflict", "dormance", "vote-duration"];

export const steps = [
  {
    id: "setup",
    label: "Mise en place : la meute a déjà une vraie activité",
    narration:
      "Avant de naviguer le site, la meute compte déjà 2 Loups actifs + 1 dormant, 1 Louveteau, 1 candidature refusée, 1 dépense sans quorum, une dépense encore en cours, et un petit classement de dons — 5 comptes réutilisés, pas 20.",
    command: [
      { type: "title", text: "3 Loups rejoignent, un par un (le 3e reste Louveteau)" },
      { type: "code", text: "applyForMembership() -> vote() -> evm_increaseTime(7j) -> execute()" },
      { type: "code", text: "evm_increaseTime(90j) -> openConfirmationVote() -> vote() -> evm_increaseTime(7j) -> execute()" },
      { type: "title", text: "181 jours plus tard, seuls 2 confirment leur présence" },
      { type: "code", text: "evm_increaseTime(181j) -> imHere() (fondateur + 1er Loup seulement)" },
      { type: "comment", text: "le 2e Loup titularisé reste dormant, sans transaction dédiée" },
      { type: "title", text: "1 candidature nettement refusée" },
      { type: "code", text: "applyForMembership() -> vote() (2 Rejeter) -> evm_increaseTime(7j) -> execute()" },
      { type: "title", text: "1 dépense qui n'atteint jamais le quorum" },
      { type: "code", text: "proposeExpense(...) -> vote() (1 seul) -> evm_increaseTime(7j) -> execute()" },
      { type: "title", text: "1 dépense laissée ouverte + 3 dons" },
      { type: "code", text: "proposeExpense(...) puis donate({ value: ... }) x3" },
    ],
    run: actions.setup,
  },
];
