import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Application fee: 0.01 test ETH (§8 of the cahier des charges).
const FEE = 10n ** 16n; // 0.01 ETH in wei

export default buildModule("MeuteModule", (m) => {
  const founders = m.getParameter("founders", ["0x95B5d450178C9f13dc977655a9A70a17Aac6c8d3"]);
  const fee = m.getParameter("fee", FEE);

  const meute = m.contract("Meute", [founders, fee]);

  return { meute };
});
