<script setup lang="ts">
import { useI18n } from "vue-i18n";
import MemberPicker, { type PickerOption } from "./MemberPicker.vue";

const { t } = useI18n();

defineProps<{
  knownBeneficiaries: PickerOption[];
  txPending: boolean;
}>();

const emit = defineEmits<{
  submit: [];
}>();

const address = defineModel<string>("address", { required: true });
// Vue's v-model on <input type="number"> casts the bound value to a JS
// number regardless of the declared type — accept both here rather than
// fighting it (parseEther coerces back to a string before use, see
// proposeExpense in GovernanceDao.vue).
const amount = defineModel<string | number>("amount", { required: true });
const reason = defineModel<string>("reason", { required: true });
</script>

<template>
  <div class="gv-prop-form">
    <p class="gv-form-label">{{ t('governance.dao.proposeExpense') }}</p>
    <div class="gv-form-row gv-form-row--wrap">
      <MemberPicker
        v-model="address"
        :options="knownBeneficiaries"
        :placeholder="t('governance.dao.beneficiaryPlaceholder')"
        :aria-label="t('governance.dao.beneficiaryPlaceholder')"
      />
      <input v-model="amount" type="number" min="0" step="any" inputmode="decimal" :placeholder="t('governance.dao.amountPlaceholder')" />
      <input v-model="reason" :placeholder="t('governance.dao.reasonPlaceholder')" />
      <button class="btn btn-primary" :disabled="txPending || !address || !amount" @click="emit('submit')">
        {{ t('governance.dao.open') }}
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.gv-form-label {
  font-size: $fs-caption;
  font-weight: 700;
  color: $color-black;
  margin: 0 0 0.5rem;
}
.gv-prop-form { margin-bottom: 1.4rem; }
.gv-form-row {
  display: flex;
  gap: 0.6rem;

  &--wrap { flex-wrap: wrap; }

  input {
    flex: 1;
    min-width: 120px;
    box-sizing: border-box;
    border: 1px solid $color-border;
    border-radius: 3px;
    padding: 0.5rem 0.7rem;
    font: inherit;

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

  :deep(.mp-root) {
    flex: 1;
    min-width: 160px;
  }
}
</style>
