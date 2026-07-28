// Registre de tous les scénarios disponibles dans le panneau — trois menus :
// "Certification" (le grand scénario riche, volume réaliste), "Soutenance"
// (les scénarios courts choisis pour la démo devant jury — voir
// docs/local/soutenance-prep.md pour le découpage en 3 démos face au
// référentiel RS6515) et "Tests" (le reste des scénarios courts, pour le
// développement au quotidien). Un même scénario peut très bien servir à la
// fois pour un test manuel et pour la soutenance — ex: Dormance et
// Exclusion sont déjà dans "Soutenance" ET restent listés une seule fois là
// (pas de doublon "Tests"). Ajouter un scénario = ajouter une entrée ici +
// un fichier scenarios/xxx.js, rien d'autre à toucher. `ruleIds` (voir
// demo/rules.js) filtre l'encart "pour info" du panneau pour ne montrer que
// les règles pertinentes à ce scénario précis.
import { steps as certification, ruleIds as ruleIdsCertification } from "./certification.js";
import { steps as demoVieMembre, ruleIds as ruleIdsVieMembre } from "./demo-vie-membre.js";
import { steps as testExclusion, ruleIds as ruleIdsExclusion } from "./test-exclusion.js";
import { steps as testAjournement, ruleIds as ruleIdsAjournement } from "./test-ajournement.js";
import { steps as testDormance, ruleIds as ruleIdsDormance } from "./test-dormance.js";
import { steps as testDepense, ruleIds as ruleIdsDepense } from "./test-depense.js";
import { steps as testDonation, ruleIds as ruleIdsDonation } from "./test-donation.js";

export const scenarios = [
  { id: "certification", label: "Scénario de certification", group: "certification", steps: certification, ruleIds: ruleIdsCertification },
  // Soutenance — C7 (démo B : vie d'un membre) et C7 (démo C : dormance +
  // conflit d'intérêt, la dépense qui clôture test-dormance.js vise
  // délibérément loup2, qui ne peut donc pas voter sur son propre cas).
  { id: "demo-vie-membre", label: "B. Vie d'un membre", group: "soutenance", steps: demoVieMembre, ruleIds: ruleIdsVieMembre },
  { id: "test-dormance", label: "C. Gouvernance sous tension (dormance)", group: "soutenance", steps: testDormance, ruleIds: ruleIdsDormance },
  { id: "test-exclusion", label: "Exclusion", group: "test", steps: testExclusion, ruleIds: ruleIdsExclusion },
  { id: "test-ajournement", label: "Ajournement (plafond)", group: "test", steps: testAjournement, ruleIds: ruleIdsAjournement },
  { id: "test-depense", label: "Dépense", group: "test", steps: testDepense, ruleIds: ruleIdsDepense },
  { id: "test-donation", label: "Dons", group: "test", steps: testDonation, ruleIds: ruleIdsDonation },
];

export function findScenario(id) {
  return scenarios.find((s) => s.id === id) ?? scenarios[0];
}
