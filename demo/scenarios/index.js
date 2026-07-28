// Registry of every scenario available in the panel — three menus:
// "Certification" (the big, rich scenario, realistic volume), "Soutenance"
// (the short scenarios chosen for the demo in front of the jury — see
// docs/local/soutenance-prep.md for the breakdown into 3 demos against the
// RS6515 framework) and "Tests" (the rest of the short scenarios, for
// day-to-day development). A single scenario can very well serve both a
// manual test and the defense — e.g. Dormance and Exclusion are already in
// "Soutenance" AND stay listed only once there (no "Tests" duplicate).
// Adding a scenario = adding an entry here + a scenarios/xxx.js file,
// nothing else to touch. `ruleIds` (see demo/rules.js) filters the panel's
// "for info" box to only show the rules relevant to that specific
// scenario.
import { steps as certification, ruleIds as ruleIdsCertification } from "./certification.js";
import { steps as demoMemberLife, ruleIds as ruleIdsMemberLife } from "./demo-vie-membre.js";
import { steps as testExclusion, ruleIds as ruleIdsExclusion } from "./test-exclusion.js";
import { steps as testPostponement, ruleIds as ruleIdsPostponement } from "./test-ajournement.js";
import { steps as testDormance, ruleIds as ruleIdsDormance } from "./test-dormance.js";
import { steps as testExpense, ruleIds as ruleIdsExpense } from "./test-depense.js";
import { steps as testDonation, ruleIds as ruleIdsDonation } from "./test-donation.js";

export const scenarios = [
  { id: "certification", label: "Scénario de certification", group: "certification", steps: certification, ruleIds: ruleIdsCertification },
  // Soutenance — C7 (demo B: a member's life) and C7 (demo C: dormancy +
  // conflict of interest, the expense that closes test-dormance.js
  // deliberately targets wolf2, who therefore can't vote on their own
  // case).
  { id: "demo-member-life", label: "B. Vie d'un membre", group: "soutenance", steps: demoMemberLife, ruleIds: ruleIdsMemberLife },
  { id: "test-dormance", label: "C. Gouvernance sous tension (dormance)", group: "soutenance", steps: testDormance, ruleIds: ruleIdsDormance },
  { id: "test-exclusion", label: "Exclusion", group: "test", steps: testExclusion, ruleIds: ruleIdsExclusion },
  { id: "test-postponement", label: "Ajournement (plafond)", group: "test", steps: testPostponement, ruleIds: ruleIdsPostponement },
  { id: "test-expense", label: "Dépense", group: "test", steps: testExpense, ruleIds: ruleIdsExpense },
  { id: "test-donation", label: "Dons", group: "test", steps: testDonation, ruleIds: ruleIdsDonation },
];

export function findScenario(id) {
  return scenarios.find((s) => s.id === id) ?? scenarios[0];
}
