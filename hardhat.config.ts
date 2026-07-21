import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    // L'optimiseur est nécessaire en permanence, pas juste pour un profil
    // "production" séparé : sans lui, le contrat dépasse la limite de
    // taille EVM (24576 octets, EIP-170) et ne peut même plus être déployé
    // dans les tests locaux.
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    // Nœud JSON-RPC autonome (`npx hardhat node`), pour tester le front en
    // conditions de vote réelles (avance de temps) sans attendre les 7
    // jours/90 jours réels que Sepolia impose. Pas d'`accounts` : le nœud
    // expose déjà ses propres comptes de test préfinancés.
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
  },
  verify: {
    etherscan: {
      apiKey: configVariable("ETHERSCAN_API_KEY"),
    },
  },
});
