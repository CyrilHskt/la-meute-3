<script setup lang="ts">
import { onMounted, ref } from "vue";
import { formatEther, parseEther } from "viem";
import { useWallet } from "../../composables/useWallet";
import { useMeute } from "../../composables/useMeute";
import { friendlyContractError } from "../../composables/contractErrors";
import { useToast } from "../../composables/useToast";
import AddressChip from "./AddressChip.vue";
import WalletInstallModal from "./WalletInstallModal.vue";

const { address, wrongNetwork, connect, readOnlyContract, writableContract, publicClient } = useWallet();
const { topDonateurs, loadAll, loadMesDons } = useMeute();
const { showToast } = useToast();

const txPending = ref(false);
const txError = ref<string | null>(null);
const donInput = ref("");

onMounted(() => {
  loadAll();
  loadMesDons(address.value);
});

async function onConnect() {
  txError.value = null;
  try {
    await connect();
    await loadMesDons(address.value);
  } catch (e) {
    txError.value = friendlyContractError(e);
  }
}

async function donner() {
  const montant = parseEther(donInput.value || "0");
  txError.value = null;
  txPending.value = true;
  try {
    await readOnlyContract().simulate.donner({ account: address.value!, value: montant });
    const hash = await writableContract().write.donner({ value: montant });
    await publicClient.waitForTransactionReceipt({ hash });
    await loadMesDons(address.value);
    donInput.value = "";
    showToast("Don enregistré — merci !");
  } catch (e) {
    txError.value = friendlyContractError(e);
  } finally {
    txPending.value = false;
  }
}
</script>

<template>
  <div class="gv-dons">
    <WalletInstallModal />

    <h2 class="gv-dons-title">Dons</h2>
    <p class="gv-dons-intro">
      Un don est ouvert à n'importe qui — membre de la meute ou non. Il n'a rien à voir avec la cotisation
      d'adhésion : l'ETH rejoint directement la trésorerie du contrat, immédiatement disponible pour une future
      dépense votée par les Loups.
    </p>

    <div class="gv-dons-panel">
      <template v-if="!address">
        <p class="gv-card-note">Connecte ton wallet pour faire un don.</p>
        <button class="btn btn-primary" @click="onConnect">Connecter mon wallet</button>
      </template>
      <template v-else-if="wrongNetwork">
        <p class="gv-error">Mauvais réseau — connecte-toi à Sepolia dans MetaMask.</p>
      </template>
      <template v-else>
        <div class="gv-form-row">
          <input v-model="donInput" placeholder="Montant en ETH" :disabled="txPending" />
          <button class="btn btn-primary" :disabled="txPending || !donInput" @click="donner">Donner</button>
        </div>
        <p v-if="txError" class="gv-error">{{ txError }}</p>
      </template>
    </div>

    <div class="gv-dons-panel">
      <h3 class="gv-card-title">Merci aux donateurs</h3>
      <div v-if="topDonateurs.length" class="gv-donors-list">
        <div v-for="(d, i) in topDonateurs" :key="d.adresse" class="gv-donor-row">
          <span class="gv-donor-rank">#{{ i + 1 }}</span>
          <AddressChip class="gv-donor-address" :address="d.adresse" short />
          <span class="gv-donor-amount">{{ formatEther(d.total) }} ETH</span>
        </div>
      </div>
      <p v-else class="gv-card-note">Aucun don pour l'instant — sois le premier !</p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.gv-dons {
  max-width: 640px;
  margin: 0 auto;
  padding: 2.4rem 1.6rem 4rem;
}

// Cette page vit directement sur le fond sombre du dashboard (voir
// Dashboard.vue, background: #111) — le titre et l'intro ne sont dans
// aucune carte blanche, donc pas question d'utiliser les couleurs sombres
// ($color-black, $color-text-dim) prévues pour l'intérieur des cartes.
.gv-dons-title {
  font-size: $fs-section-title;
  color: $color-orange;
  font-family: $font-display;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 0 0 1.2rem;
}

.gv-dons-intro {
  color: rgba(255, 255, 255, 0.75);
  font-size: $fs-body;
  line-height: 1.6;
  margin-bottom: 2rem;
}

.gv-dons-panel {
  background: $color-card-bg;
  border: 1px solid $color-border;
  border-radius: 10px;
  padding: 1.6rem;
  margin-bottom: 1.6rem;
}

.gv-card-title { font-size: $fs-card-title; color: $color-black; margin: 0 0 1rem; }
.gv-card-note { color: $color-text-dim; font-size: $fs-caption; }
.gv-error { color: $color-danger; font-size: $fs-caption; }

.gv-form-row {
  display: flex;
  gap: 0.6rem;

  input {
    flex: 1;
    padding: 0.6rem 0.8rem;
    border: 1px solid $color-border;
    border-radius: 6px;
    font-size: $fs-body;
    // Sans ça, le texte tapé hérite du blanc posé globalement sur <body>
    // (public/css/theme.css) — invisible sur le fond blanc du champ, ce
    // qui donne l'impression que la saisie ne fonctionne pas du tout.
    color: $color-text;
    background: #fff;
  }
}

.gv-donors-list { display: flex; flex-direction: column; }

.gv-donor-row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.7rem 0;
  border-bottom: 1px solid $color-border;
  // Sans couleur explicite, ce texte hérite du blanc global de <body>
  // (public/css/theme.css) — invisible sur le fond blanc de la carte.
  color: $color-text;

  &:last-child { border-bottom: none; }
}

.gv-donor-rank {
  font-weight: 700;
  color: $color-text-dim;
  min-width: 1.8rem;
}

.gv-donor-address {
  flex: 1;
  color: $color-text;
}

.gv-donor-amount {
  font-weight: 700;
  color: $color-orange-dark;
  font-size: $fs-h4;
}
</style>
