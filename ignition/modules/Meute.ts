import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { DEFAULT_FOUNDER } from "../../scripts/lib/constants.js";

// Application fee: 0.01 test ETH (§8 of the cahier des charges).
const FEE = 10n ** 16n; // 0.01 ETH in wei

export default buildModule("MeuteModule", (m) => {
  const founders = m.getParameter("founders", [DEFAULT_FOUNDER]);
  const fee = m.getParameter("fee", FEE);

  const meute = m.contract("Meute", [founders, fee]);

  return { meute };
});
