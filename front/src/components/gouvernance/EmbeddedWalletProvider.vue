<script setup lang="ts">
// Thin wrapper around Web3AuthProvider so EmbeddedWalletConnectButton.vue
// (the actual useWeb3AuthConnect() consumer) can live under its context —
// the composable only works inside a component tree wrapped by this
// provider, it can't be called from a plain module-level singleton the
// way the rest of useWallet.ts is structured.
//
// Both this file and EmbeddedWalletConnectButton.vue are only ever reached
// via a dynamic import() (see useWallet.ts, connectEmbedded stub) — never
// imported statically anywhere — so @web3auth/modal's dependency tree
// (measured: ~500 packages, mostly unused chains like Solana) only loads
// for a visitor who actually clicks the Discord connect option, never for
// the MetaMask-extension path everyone else takes.
import { Web3AuthProvider } from "@web3auth/modal/vue";
import { WEB3AUTH_NETWORK } from "@web3auth/auth";
import type { Chain } from "viem";
import { toEmbeddedWalletChainConfig, EMBEDDED_WALLET_CLIENT_ID } from "../../composables/embeddedWalletConfig";

const props = defineProps<{ chain: Chain }>();

const config = {
  web3AuthOptions: {
    clientId: EMBEDDED_WALLET_CLIENT_ID ?? "",
    web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
    chains: [toEmbeddedWalletChainConfig(props.chain)],
    defaultChainId: `0x${props.chain.id.toString(16)}`,
  },
};
</script>

<template>
  <Web3AuthProvider :config="config">
    <slot />
  </Web3AuthProvider>
</template>
