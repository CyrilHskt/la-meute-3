<script setup lang="ts">
// Must be rendered under EmbeddedWalletProvider.vue's <Web3AuthProvider> —
// useWeb3AuthConnect() reads from that context, it isn't a standalone
// singleton like the rest of useWallet.ts.
import { useWeb3AuthConnect } from "@web3auth/modal/vue";
import { WALLET_CONNECTORS, AUTH_CONNECTION } from "@web3auth/modal";
import type { IProvider } from "@web3auth/modal";

const emit = defineEmits<{ connected: [provider: IProvider]; failed: [error: string] }>();

const { loading, error, connectTo } = useWeb3AuthConnect();

async function connectWithDiscord() {
  try {
    const connection = await connectTo(WALLET_CONNECTORS.AUTH, { authConnection: AUTH_CONNECTION.DISCORD });
    if (connection?.ethereumProvider) emit("connected", connection.ethereumProvider);
    else emit("failed", "no-provider");
  } catch (e) {
    emit("failed", e instanceof Error ? e.message : String(e));
  }
}

defineExpose({ connectWithDiscord, loading, error });
</script>

<template>
  <button type="button" :disabled="loading" @click="connectWithDiscord">
    {{ loading ? "…" : "Continuer avec Discord" }}
  </button>
  <p v-if="error">{{ error.message }}</p>
</template>
