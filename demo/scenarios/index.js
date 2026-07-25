// Registre de tous les scénarios disponibles dans le panneau — un menu
// "Certification" (le grand scénario riche pour la soutenance) et un menu
// "Tests" (scénarios courts, contrat vide, un mécanisme isolé chacun,
// pour le développement au quotidien). Ajouter un scénario = ajouter une
// entrée ici + un fichier scenarios/xxx.js, rien d'autre à toucher.
// `ruleIds` (voir demo/rules.js) filtre l'encart "pour info" du panneau
// pour ne montrer que les règles pertinentes à ce scénario précis.
import { steps as certification } from "./certification.js";
import { steps as testExclusion, ruleIds as ruleIdsExclusion } from "./test-exclusion.js";
import { steps as testAjournement, ruleIds as ruleIdsAjournement } from "./test-ajournement.js";
import { steps as testDormance, ruleIds as ruleIdsDormance } from "./test-dormance.js";
import { steps as testDepense, ruleIds as ruleIdsDepense } from "./test-depense.js";
import { steps as testDonation, ruleIds as ruleIdsDonation } from "./test-donation.js";

const RULE_IDS_CERTIFICATION = ["quorum", "majorite", "conflit", "dormance", "reveil", "ajournement", "duree-vote"];

export const scenarios = [
  { id: "certification", label: "Scénario de certification", group: "certification", steps: certification, ruleIds: RULE_IDS_CERTIFICATION },
  { id: "test-exclusion", label: "Exclusion", group: "test", steps: testExclusion, ruleIds: ruleIdsExclusion },
  { id: "test-ajournement", label: "Ajournement (plafond)", group: "test", steps: testAjournement, ruleIds: ruleIdsAjournement },
  { id: "test-dormance", label: "Dormance et réveil", group: "test", steps: testDormance, ruleIds: ruleIdsDormance },
  { id: "test-depense", label: "Dépense", group: "test", steps: testDepense, ruleIds: ruleIdsDepense },
  { id: "test-donation", label: "Dons", group: "test", steps: testDonation, ruleIds: ruleIdsDonation },
];

export function findScenario(id) {
  return scenarios.find((s) => s.id === id) ?? scenarios[0];
}
