// Scénario "Certification" : sert uniquement à donner à l'app un état
// varié et réaliste à naviguer (pages Membres/Gouvernance/Dons pas vides ni
// monotones) — pas une démo pas-à-pas d'un mécanisme précis, ça c'est le
// travail des scénarios A/B/C dédiés à la soutenance (voir
// docs/local/soutenance-prep.md) et des scénarios de test isolés. Un seul
// bouton, volontairement : la précédente version (14 Loups créés un par
// un, ~30+ transactions, plusieurs minutes) faisait double emploi avec le
// scénario B une fois celui-ci créé, sans rien apporter de plus pour
// autant d'attente.
import * as actions from "../actions.js";

export const ruleIds = ["quorum", "majorite", "conflit", "dormance", "duree-vote"];

export const steps = [
  {
    id: "mise-en-place",
    label: "Mise en place : la meute a déjà une vraie activité",
    narration:
      "Avant de naviguer le site, la meute compte déjà 2 Loups actifs + 1 dormant, 1 Louveteau, 1 candidature refusée, 1 dépense sans quorum, une dépense encore en cours, et un petit classement de dons — 5 comptes réutilisés, pas 20.",
    command: [
      { type: "title", text: "3 Loups rejoignent, un par un (le 3e reste Louveteau)" },
      { type: "code", text: "candidater() -> voter() -> evm_increaseTime(7j) -> executer()" },
      { type: "code", text: "evm_increaseTime(90j) -> ouvrirTitularisation() -> voter() -> evm_increaseTime(7j) -> executer()" },
      { type: "title", text: "181 jours plus tard, seuls 2 confirment leur présence" },
      { type: "code", text: "evm_increaseTime(181j) -> jeSuisLa() (fondateur + 1er Loup seulement)" },
      { type: "comment", text: "le 2e Loup titularisé reste dormant, sans transaction dédiée" },
      { type: "title", text: "1 candidature nettement refusée" },
      { type: "code", text: "candidater() -> voter() (2 Rejeter) -> evm_increaseTime(7j) -> executer()" },
      { type: "title", text: "1 dépense qui n'atteint jamais le quorum" },
      { type: "code", text: "proposerDepense(...) -> voter() (1 seul) -> evm_increaseTime(7j) -> executer()" },
      { type: "title", text: "1 dépense laissée ouverte + 3 dons" },
      { type: "code", text: "proposerDepense(...) puis donner({ value: ... }) x3" },
    ],
    run: actions.miseEnPlace,
  },
];
