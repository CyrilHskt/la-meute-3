import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    // The optimizer is needed permanently, not just for a separate
    // "production" profile: without it, the contract exceeds the EVM size
    // limit (24576 bytes, EIP-170) and can't even be deployed in local
    // tests.
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
    // `npx hardhat node` (without --network) resolves to the network named
    // "node" by default, not "hardhat" — 30 accounts rather than the
    // default 20: the "certification" demo scenario (demo/actions.js) needs
    // enough distinct addresses for all its roles (active/dormant Wolves,
    // Cubs, applicants...) without ever accidentally reusing one
    // (AlreadyMember).
    node: {
      type: "edr-simulated",
      chainType: "l1",
      accounts: { count: 30 },
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    // Standalone JSON-RPC node (`npx hardhat node`), to test the front under
    // real voting conditions (time advancement) without waiting for the
    // real 7 days/90 days that Sepolia imposes. No `accounts`: the node
    // already exposes its own prefunded test accounts.
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
    // L2 migration target (see docs/local/l2-migration-reflection.md):
    // Base's own testnet, ahead of Base mainnet. `chainType: "op"` — Base
    // runs the OP Stack, same family as `hardhatOp` above.
    baseSepolia: {
      type: "http",
      chainType: "op",
      url: configVariable("BASE_SEPOLIA_RPC_URL"),
      accounts: [configVariable("BASE_SEPOLIA_PRIVATE_KEY")],
    },
  },
  verify: {
    etherscan: {
      apiKey: configVariable("ETHERSCAN_API_KEY"),
    },
  },
});
