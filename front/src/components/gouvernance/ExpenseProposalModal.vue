<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { PickerOption } from "./MemberPicker.vue";
import ProposeExpenseForm from "./ProposeExpenseForm.vue";

const { t } = useI18n();

const props = defineProps<{
  open: boolean;
  knownBeneficiaries: PickerOption[];
  txPending: boolean;
  txError: string | null;
}>();

const emit = defineEmits<{
  close: [];
  submit: [address: string, amount: string | number, reason: string];
}>();

const address = ref("");
const amount = ref<string | number>("");
const reason = ref("");

// Reset on every closed→open transition rather than on each individual
// close path (cancel, backdrop click, successful submit) — one place
// covers all of them, so no stale field can ever survive a reopen.
watch(
  () => props.open,
  (isOpen, wasOpen) => {
    if (isOpen && !wasOpen) {
      address.value = "";
      amount.value = "";
      reason.value = "";
    }
  },
);

function submit() {
  emit("submit", address.value, amount.value, reason.value);
}
</script>

<template>
  <div v-if="open" class="epm-overlay" @click.self="emit('close')">
    <div class="epm-card">
      <div class="epm-head">
        <p class="epm-title">{{ t('governance.dao.proposeExpense') }}</p>
        <button class="icon-btn epm-close" type="button" :aria-label="t('common.close')" @click="emit('close')">✕</button>
      </div>

      <ProposeExpenseForm
        v-model:address="address"
        v-model:amount="amount"
        v-model:reason="reason"
        :known-beneficiaries="knownBeneficiaries"
        :tx-pending="txPending"
        @submit="submit"
      />

      <p v-if="txError" class="epm-error">{{ txError }}</p>

      <button class="btn btn-outline epm-cancel" type="button" @click="emit('close')">
        {{ t('common.cancel') }}
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.epm-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(27, 26, 24, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: $space-4;
}

.epm-card {
  background: $color-card-bg;
  border: 1px solid $color-border;
  border-radius: $radius-md;
  padding: $space-4;
  width: 100%;
  max-width: 480px;
}

.epm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: $space-3;
}

.epm-title {
  font-family: $font-display;
  font-weight: 700;
  font-size: $fs-h4;
  color: $color-black;
  margin: 0;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: $radius-sm;
  border: none;
  background: transparent;
  color: $color-text-dim;
  cursor: pointer;
  padding: 0;

  &:hover { color: $color-orange-dark; background: $color-page-bg; }
}

.epm-error {
  color: $color-danger;
  font-size: $fs-caption;
  margin: 0 0 $space-3;
}

.epm-cancel {
  width: 100%;
}
</style>
