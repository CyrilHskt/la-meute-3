// Isolated test scenario: donations — open to any address, member or not,
// with no setup required (unlike the other test scenarios). Starts from
// an empty contract.
import * as actions from "../actions.js";

export const ruleIds = ["donations"];

export const steps = [
  {
    id: "first-donation",
    label: "1. Une adresse jamais vue fait un don",
    narration: "Aucune candidature, aucun vote — un don n'a rien à voir avec l'adhésion.",
    command: [{ type: "code", text: "contract.donate({ value: 0.01 ETH })" }],
    run: actions.firstDonation,
  },
  {
    id: "second-donation",
    label: "2. Un Loup fait un don plus généreux",
    narration: "Même un membre peut donner en plus de sa cotisation — les deux sont indépendants.",
    command: [{ type: "code", text: "contract.donate({ value: 0.05 ETH })" }],
    run: actions.secondDonation,
  },
  {
    id: "donate-again",
    label: "3. Le premier donateur redonne",
    narration: "Les dons se cumulent par adresse (totalDonations) — le classement se construit hors-chaîne à partir de ça.",
    command: [
      { type: "code", text: "contract.donate({ value: 0.02 ETH })" },
      { type: "comment", text: "totalDonations(address) : 0.01 + 0.02 = 0.03 ETH" },
    ],
    run: actions.firstDonorGivesAgain,
  },
];
