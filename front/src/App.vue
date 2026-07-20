<script setup lang="ts">
import { ref } from "vue";
import { useWallet } from "./composables/useWallet";

const { address, wrongNetwork, connect, readOnlyContract } = useWallet();
const loupsActifs = ref<bigint | null>(null);
const error = ref<string | null>(null);

async function onConnect() {
  error.value = null;
  try {
    await connect();
    loupsActifs.value = await readOnlyContract().read.loupsActifs();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}
</script>

<template>
  <main>
    <h1>La Meute</h1>

    <button v-if="!address" @click="onConnect">Connecter mon wallet</button>

    <div v-else>
      <p>Connecté : {{ address }}</p>
      <p v-if="wrongNetwork" class="warning">
        Mauvais réseau — connecte-toi à Sepolia dans MetaMask.
      </p>
      <p v-else-if="loupsActifs !== null">Loups actifs actuellement : {{ loupsActifs }}</p>
    </div>

    <p v-if="error" class="warning">Erreur : {{ error }}</p>
  </main>
</template>

<style scoped>
.warning {
  color: #c0392b;
}
</style>
