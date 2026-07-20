import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Cotisation de candidature : 0,01 ETH de test (§8 du cahier des charges).
const COTISATION = 10n ** 16n; // 0.01 ETH en wei

export default buildModule("MeuteModule", (m) => {
  const fondateurs = m.getParameter("fondateurs", ["0x95B5d450178C9f13dc977655a9A70a17Aac6c8d3"]);
  const cotisation = m.getParameter("cotisation", COTISATION);

  const meute = m.contract("Meute", [fondateurs, cotisation]);

  return { meute };
});
