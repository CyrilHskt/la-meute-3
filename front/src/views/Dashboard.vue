<script setup lang="ts">
import { ref } from "vue";
import { useWallet } from "../composables/useWallet";

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
  <section id="gouvernance">
    <div class="container content-section text-center">
      <h2>Gouvernance</h2>

      <button v-if="!address" class="btn btn-default" @click="onConnect">Connecter mon wallet</button>

      <div v-else>
        <p>Connecté : {{ address }}</p>
        <p v-if="wrongNetwork" class="text-danger">
          Mauvais réseau — connecte-toi à Sepolia dans MetaMask.
        </p>
        <p v-else-if="loupsActifs !== null">Loups actifs actuellement : {{ loupsActifs }}</p>
      </div>

      <p v-if="error" class="text-danger">Erreur : {{ error }}</p>
    </div>
  </section>
</template>
