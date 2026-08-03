<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { formatEther, parseEther } from "viem";
import { useWallet } from "../../composables/useWallet";
import { useMeute } from "../../composables/useMeute";
import { friendlyContractError } from "../../composables/contractErrors";
import { useToast } from "../../composables/useToast";
import { useLocalAutoRefresh } from "../../composables/useLocalAutoRefresh";
import AddressChip from "./AddressChip.vue";
import WalletInstallModal from "./WalletInstallModal.vue";

const { t } = useI18n();
const { address, wrongNetwork, connect, readOnlyContract, writableContract, publicClient, activeChain } = useWallet();
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
    txError.value = friendlyContractError(e, t);
  }
}

async function donate() {
  const amount = parseEther(String(donationInput.value || "0"));
  txError.value = null;
  txPending.value = true;
  try {
    await readOnlyContract().simulate.donate({ account: address.value!, value: amount });
    const hash = await writableContract().write.donate({ value: amount });
    await publicClient.waitForTransactionReceipt({ hash });
    await loadMyDonations(address.value);
    donationInput.value = "";
    showToast(t('donations.thanksToast'));
  } catch (e) {
    txError.value = friendlyContractError(e, t);
  } finally {
    txPending.value = false;
  }
}
</script>

<template>
  <div class="gv-donations">
    <WalletInstallModal />

    <h2 class="gv-donations-title">{{ t('donations.title') }}</h2>
    <p class="gv-donations-intro">{{ t('donations.intro') }}</p>

    <div class="gv-donations-panel">
      <template v-if="!address">
        <p class="gv-card-note">{{ t('donations.connectPrompt') }}</p>
        <button class="btn btn-primary" @click="onConnect">{{ t('common.connectWallet') }}</button>
      </template>
      <template v-else-if="wrongNetwork">
        <p class="gv-error">{{ t('common.wrongNetwork', { network: activeChain.name }) }}</p>
      </template>
      <template v-else>
        <div class="gv-form-row">
          <input
            v-model="donationInput"
            type="number"
            min="0"
            step="any"
            inputmode="decimal"
            :placeholder="t('donations.amountPlaceholder')"
            :disabled="txPending"
          />
          <button class="btn btn-primary" :disabled="txPending || !donationInput" @click="donate">{{ t('donations.donate') }}</button>
        </div>
        <p v-if="txError" class="gv-error">{{ txError }}</p>
      </template>
    </div>

    <div class="gv-donations-panel">
      <h3 class="gv-card-title">{{ t('donations.leaderboardTitle') }}</h3>
      <p v-if="!isAuthorized" class="gv-card-note">{{ t('donations.leaderboardRestricted') }}</p>
      <template v-else>
        <p v-if="loading" class="gv-card-note">{{ t('common.loadingOnChain') }}</p>
        <p v-else-if="error" class="gv-error">{{ t('common.readError', { error }) }}</p>
        <div v-else-if="topDonors.length" class="gv-donors-list">
          <div v-for="(d, i) in topDonors" :key="d.address" class="gv-donor-row">
            <span class="gv-donor-rank">#{{ i + 1 }}</span>
            <AddressChip class="gv-donor-address" :address="d.address" short />
            <span class="gv-donor-amount">{{ formatEther(d.total) }} ETH</span>
          </div>
        </div>
        <p v-else class="gv-card-note">{{ t('donations.noDonationsYet') }}</p>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.gv-donations {
  max-width: 640px;
  margin: 0 auto;
  padding: $space-5 $space-3 ($space-5 * 2);
  background: $color-page-bg;
}

.gv-donations-title {
  font-size: $fs-section-title;
  color: $color-black;
  font-family: $font-display;
  font-weight: 700;
  margin: 0 0 $space-3;
}

.gv-donations-intro {
  color: $color-text-dim;
  font-size: $fs-body;
  line-height: 1.6;
  margin-bottom: $space-4;
}

.gv-donations-panel {
  background: $color-card-bg;
  border: 1px solid $color-border;
  border-radius: $radius-md;
  padding: $space-4;
  margin-bottom: $space-4;
}

.gv-card-title {
  font-family: $font-mono;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: $fs-caption;
  color: $color-orange-dark;
  margin: 0 0 $space-3;
}
.gv-card-note { color: $color-text-dim; font-size: $fs-caption; }
.gv-error { color: $color-danger; font-size: $fs-caption; }

.gv-form-row {
  display: flex;
  gap: $space-2;

  input {
    flex: 1;
    box-sizing: border-box;
    padding: $space-2 $space-3;
    border: 1px solid $color-border;
    border-radius: $radius-md;
    font-size: $fs-body;
    color: $color-text;
    background: $color-page-bg;

    &:focus {
      outline: none;
      border-color: $color-orange-dark;
    }

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
  gap: $space-3;
  padding: $space-2 0;
  border-bottom: 1px solid $color-border;
  color: $color-text;

  &:last-child { border-bottom: none; }
}

.gv-donor-rank {
  font-family: $font-mono;
  font-weight: 600;
  color: $color-text-dim;
  min-width: 1.8rem;
}

.gv-donor-address {
  flex: 1;
  color: $color-text;
}

.gv-donor-amount {
  font-family: $font-mono;
  font-weight: 600;
  color: $color-orange-dark;
  font-size: $fs-h4;
}
</style>
