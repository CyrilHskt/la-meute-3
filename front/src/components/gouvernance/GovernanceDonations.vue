<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { formatEther, parseEther } from "viem";
import { useWallet } from "../../composables/useWallet";
import { useMeute } from "../../composables/useMeute";
import { friendlyContractError } from "../../composables/contractErrors";
import { useToast } from "../../composables/useToast";
import { useLocalAutoRefresh } from "../../composables/useLocalAutoRefresh";
import AddressChip from "./AddressChip.vue";
import WalletInstallModal from "./WalletInstallModal.vue";

const { address, wrongNetwork, connect, readOnlyContract, writableContract, publicClient } = useWallet();
const { topDonors, loading, error, isAuthorized, loadAll, loadMyDonations } = useMeute();
const { showToast } = useToast();

const txPending = ref(false);
const txError = ref<string | null>(null);
const donationInput = ref("");

onMounted(() => {
  loadAll();
  loadMyDonations(address.value);
});

// See GovernanceDao.vue: without resetting scroll to 0 when the
// leaderboard disappears (disconnect), the scroll position stays where it
// was on a shorter page.
watch(isAuthorized, (authorized) => {
  if (!authorized) window.scrollTo({ top: 0 });
});

// Local demo mode only — see GovernanceDao.vue for context.
useLocalAutoRefresh(() => {
  loadAll();
  loadMyDonations(address.value);
});

async function onConnect() {
  txError.value = null;
  try {
    await connect();
    await loadMyDonations(address.value);
  } catch (e) {
    txError.value = friendlyContractError(e);
  }
}

async function donate() {
  const amount = parseEther(donationInput.value || "0");
  txError.value = null;
  txPending.value = true;
  try {
    await readOnlyContract().simulate.donate({ account: address.value!, value: amount });
    const hash = await writableContract().write.donate({ value: amount });
    await publicClient.waitForTransactionReceipt({ hash });
    await loadMyDonations(address.value);
    donationInput.value = "";
    showToast("Don enregistré — merci !");
  } catch (e) {
    txError.value = friendlyContractError(e);
  } finally {
    txPending.value = false;
  }
}
</script>

<template>
  <div class="gv-donations">
    <WalletInstallModal />

    <h2 class="gv-donations-title">Dons</h2>
    <p class="gv-donations-intro">
      Un don est ouvert à n'importe qui — membre de la meute ou non. Il n'a rien à voir avec la cotisation
      d'adhésion : l'ETH rejoint directement la trésorerie du contrat, immédiatement disponible pour une future
      dépense votée par les Loups.
    </p>

    <div class="gv-donations-panel">
      <template v-if="!address">
        <p class="gv-card-note">Connecte ton wallet pour faire un don.</p>
        <button class="btn btn-primary" @click="onConnect">Connecter mon wallet</button>
      </template>
      <template v-else-if="wrongNetwork">
        <p class="gv-error">Mauvais réseau — connecte-toi à Sepolia dans MetaMask.</p>
      </template>
      <template v-else>
        <div class="gv-form-row">
          <input
            v-model="donationInput"
            type="number"
            min="0"
            step="any"
            inputmode="decimal"
            placeholder="Montant en ETH"
            :disabled="txPending"
          />
          <button class="btn btn-primary" :disabled="txPending || !donationInput" @click="donate">Donner</button>
        </div>
        <p v-if="txError" class="gv-error">{{ txError }}</p>
      </template>
    </div>

    <div class="gv-donations-panel">
      <h3 class="gv-card-title">Merci aux donateurs</h3>
      <p v-if="!isAuthorized" class="gv-card-note">
        Classement réservé aux membres de la Meute — connecte le wallet avec lequel tu votes pour le consulter.
      </p>
      <template v-else>
        <p v-if="loading" class="gv-card-note">Chargement des données on-chain…</p>
        <p v-else-if="error" class="gv-error">Erreur de lecture : {{ error }} — le classement peut être incomplet.</p>
        <div v-else-if="topDonors.length" class="gv-donors-list">
          <div v-for="(d, i) in topDonors" :key="d.address" class="gv-donor-row">
            <span class="gv-donor-rank">#{{ i + 1 }}</span>
            <AddressChip class="gv-donor-address" :address="d.address" short />
            <span class="gv-donor-amount">{{ formatEther(d.total) }} ETH</span>
          </div>
        </div>
        <p v-else class="gv-card-note">Aucun don pour l'instant — sois le premier !</p>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.gv-donations {
  max-width: 640px;
  margin: 0 auto;
  padding: 2.4rem 1.6rem 4rem;
}

// This page lives directly on the dashboard's dark background (see
// Dashboard.vue, background: #111) — the title and intro aren't inside
// any white card, so the dark colors ($color-black, $color-text-dim)
// meant for inside cards are out of the question.
.gv-donations-title {
  font-size: $fs-section-title;
  color: $color-orange;
  font-family: $font-display;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 0 0 1.2rem;
}

.gv-donations-intro {
  color: rgba(255, 255, 255, 0.75);
  font-size: $fs-body;
  line-height: 1.6;
  margin-bottom: 2rem;
}

.gv-donations-panel {
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
    box-sizing: border-box;
    padding: 0.6rem 0.8rem;
    border: 1px solid $color-border;
    border-radius: 6px;
    font-size: $fs-body;
    // Without this, the typed text inherits the white set globally on
    // <body> (public/css/theme.css) — invisible on the field's white
    // background, which makes it look like typing doesn't work at all.
    color: $color-text;
    background: #fff;

    // Hides the native spin arrows (+/-) on type="number" — see GovernanceDao.vue.
    &::-webkit-inner-spin-button,
    &::-webkit-outer-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    &[type="number"] {
      -moz-appearance: textfield;
    }
  }
}

.gv-donors-list { display: flex; flex-direction: column; }

.gv-donor-row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.7rem 0;
  border-bottom: 1px solid $color-border;
  // Without an explicit color, this text inherits <body>'s global white
  // (public/css/theme.css) — invisible on the card's white background.
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
