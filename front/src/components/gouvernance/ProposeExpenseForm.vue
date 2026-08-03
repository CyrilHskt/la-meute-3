<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import { isAddress } from "viem";
import MemberPicker, { type PickerOption } from "./MemberPicker.vue";

const { t } = useI18n();

defineProps<{
  knownBeneficiaries: PickerOption[];
  txPending: boolean;
}>();

const address = defineModel<string>("address", { required: true });
// Vue's v-model on <input type="number"> casts the bound value to a JS
// number regardless of the declared type — accept both here rather than
// fighting it (parseEther coerces back to a string before use, see
// proposeExpense in GovernanceDao.vue).
const amount = defineModel<string | number>("amount", { required: true });
const reason = defineModel<string>("reason", { required: true });

const addressFieldId = useId();
const amountFieldId = useId();
const reasonFieldId = useId();

// Each field only starts showing its error once the user has actually
// left it — surfacing "required" errors before anyone has typed anything
// would just read as the form scolding you on open.
const addressTouched = ref(false);
const amountTouched = ref(false);
const reasonTouched = ref(false);

const addressError = computed(() => (addressTouched.value && address.value && !isAddress(address.value) ? t('governance.dao.beneficiaryErrorInvalid') : ""));
const amountError = computed(() => (amountTouched.value && Number(amount.value) <= 0 ? t('governance.dao.amountErrorEmpty') : ""));
const reasonError = computed(() => (reasonTouched.value && !reason.value.trim() ? t('governance.dao.reasonErrorEmpty') : ""));
</script>

<template>
  <div class="gv-prop-form">
    <div class="gv-field">
      <label :for="addressFieldId" class="gv-field-label">{{ t('governance.dao.beneficiaryLabel') }}</label>
      <MemberPicker
        v-model="address"
        :input-id="addressFieldId"
        :options="knownBeneficiaries"
        placeholder="0x…"
        @blur="addressTouched = true"
      />
      <p v-if="addressError" class="gv-field-error">{{ addressError }}</p>
    </div>

    <div class="gv-field">
      <label :for="amountFieldId" class="gv-field-label">{{ t('governance.dao.amountLabel') }}</label>
      <div class="gv-amount-wrap">
        <input
          :id="amountFieldId"
          v-model="amount"
          type="number"
          min="0"
          step="any"
          inputmode="decimal"
          placeholder="0.00"
          @blur="amountTouched = true"
        />
        <span class="gv-amount-unit">ETH</span>
      </div>
      <p v-if="amountError" class="gv-field-error">{{ amountError }}</p>
    </div>

    <div class="gv-field">
      <label :for="reasonFieldId" class="gv-field-label">{{ t('governance.dao.reasonLabel') }}</label>
      <input :id="reasonFieldId" v-model="reason" @blur="reasonTouched = true" />
      <p v-if="reasonError" class="gv-field-error">{{ reasonError }}</p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.gv-prop-form {
  display: flex;
  flex-direction: column;
  gap: $space-3;
  margin-bottom: $space-4;
}

.gv-field {
  display: flex;
  flex-direction: column;
}

.gv-field-label {
  font-size: $fs-caption;
  font-weight: 600;
  color: $color-text-dim;
  letter-spacing: 0.03em;
  margin-bottom: $space-1;
}

.gv-field-error {
  color: $color-danger;
  font-size: $fs-caption;
  margin: $space-1 0 0;
}

input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid $color-border;
  border-radius: $radius-sm;
  padding: $space-2;
  font: inherit;
  color: $color-text;
  background: $color-page-bg;

  &:focus {
    outline: none;
    border-color: $color-orange-dark;
  }

  // Hides the native spin arrows (+/-) on `type="number"` fields: they
  // inflated the field's height relative to its neighbors and clashed
  // with the rest of the form's style (user feedback: "a bit broken").
  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  &[type="number"] {
    -moz-appearance: textfield;
  }
}

.gv-amount-wrap {
  position: relative;

  input {
    padding-right: 3.2rem;
    font-family: $font-mono;
  }
}

.gv-amount-unit {
  position: absolute;
  top: 50%;
  right: $space-2;
  transform: translateY(-50%);
  font-family: $font-mono;
  font-size: $fs-caption;
  color: $color-text-dim;
  pointer-events: none;
}

:deep(.mp-root) {
  width: 100%;
}
</style>
