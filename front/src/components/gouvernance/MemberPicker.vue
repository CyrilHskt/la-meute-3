<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

export interface PickerOption {
  address: string;
  username?: string;
  avatarUrl?: string;
}

// Free-text combobox with suggestions — used for an Expense's
// beneficiary, which can be any address (not necessarily a member): the
// list is just a convenience, never a constraint. Confirm and Exclude
// always target an existing member and have lived on their own page
// (GovernanceMembers.vue) since, not through this component.
const props = withDefaults(defineProps<{ modelValue: string; options: PickerOption[]; placeholder?: string }>(), {
  placeholder: "",
});
const emit = defineEmits<{ "update:modelValue": [string] }>();

const query = ref("");
const open = ref(false);
const highlighted = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);

function labelFor(o: PickerOption): string {
  return o.username ?? o.address;
}
function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return props.options;
  return props.options.filter((o) => labelFor(o).toLowerCase().includes(q) || o.address.toLowerCase().includes(q));
});

// Reflects modelValue in the text field as long as the panel is closed —
// while typing (panel open), we leave the user's input alone rather than
// overwriting it on every re-render.
watch(
  () => props.modelValue,
  (v) => {
    if (open.value) return;
    const match = props.options.find((o) => o.address.toLowerCase() === v.toLowerCase());
    query.value = match ? labelFor(match) : v;
  },
  { immediate: true },
);

function select(o: PickerOption) {
  emit("update:modelValue", o.address);
  query.value = labelFor(o);
  open.value = false;
}

function onInput() {
  open.value = true;
  highlighted.value = 0;
  emit("update:modelValue", query.value.trim());
}

function onFocus() {
  open.value = true;
  highlighted.value = 0;
}

function onBlur() {
  // setTimeout: lets the mousedown on an option run before blur closes
  // the panel (otherwise the click never reaches `select`).
  setTimeout(() => {
    open.value = false;
  }, 150);
}

function clear() {
  emit("update:modelValue", "");
  query.value = "";
  open.value = true;
  highlighted.value = 0;
  inputEl.value?.focus();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    open.value = true;
    highlighted.value = Math.min(highlighted.value + 1, filtered.value.length - 1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    highlighted.value = Math.max(highlighted.value - 1, 0);
  } else if (e.key === "Enter") {
    const o = filtered.value[highlighted.value];
    if (open.value && o) {
      e.preventDefault();
      select(o);
    }
  } else if (e.key === "Escape") {
    open.value = false;
    inputEl.value?.blur();
  }
}
</script>

<template>
  <div class="mp-root">
    <input
      ref="inputEl"
      v-model="query"
      class="mp-input"
      type="text"
      :placeholder="placeholder"
      autocomplete="off"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKeydown"
    />
    <button v-if="modelValue" type="button" class="mp-clear" :title="t('common.clear')" @mousedown.prevent="clear">
      <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" />
      </svg>
    </button>
    <svg v-else class="mp-icon" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M13.5 13.5 10.6 10.6" stroke-linecap="round" />
    </svg>
    <ul v-if="open" class="mp-panel">
      <li v-if="!filtered.length" class="mp-empty">{{ t('memberPicker.noMatch') }}</li>
      <li
        v-for="(o, i) in filtered"
        :key="o.address"
        class="mp-option"
        :class="{ 'mp-option--active': i === highlighted }"
        @mousedown.prevent="select(o)"
        @mouseenter="highlighted = i"
      >
        <img v-if="o.avatarUrl" class="mp-avatar" :src="o.avatarUrl" alt="" />
        <span v-else class="mp-avatar mp-avatar--placeholder" aria-hidden="true"></span>
        <span class="mp-option-text">
          <span class="mp-username">{{ o.username ?? short(o.address) }}</span>
          <span v-if="o.username" class="mp-address mono">{{ short(o.address) }}</span>
        </span>
      </li>
    </ul>
  </div>
</template>

<style lang="scss" scoped>
.mp-root {
  position: relative;
  flex: 1;
  min-width: 0;
}

.mp-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid $color-border;
  border-radius: 4px;
  padding: 0.5rem 1.9rem 0.5rem 0.7rem;
  font: inherit;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;

  &:focus {
    outline: none;
    border-color: $color-orange;
    box-shadow: 0 0 0 3px rgba(249, 174, 60, 0.18);
  }
}

.mp-icon {
  position: absolute;
  top: 50%;
  right: 0.65rem;
  transform: translateY(-50%);
  color: $color-text-dim;
  pointer-events: none;
}

.mp-clear {
  position: absolute;
  top: 50%;
  right: 0.5rem;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: $color-text-dim;
  cursor: pointer;
  padding: 0;

  &:hover {
    color: $color-orange-dark;
    background: rgba(249, 174, 60, 0.14);
  }
}

.mp-panel {
  position: absolute;
  z-index: 20;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  margin: 0;
  padding: 0.5rem;
  list-style: none;
  background: #fff;
  border: 1px solid $color-border;
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);
  max-height: 320px;
  overflow-y: auto;
}

.mp-empty {
  padding: 0.9rem 0.8rem;
  font-size: $fs-caption;
  color: $color-text-dim;
  text-align: center;
}

.mp-option {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.6rem 0.7rem;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.1s ease;

  & + & {
    margin-top: 0.15rem;
  }

  &--active {
    background: rgba(249, 174, 60, 0.16);
  }
}

.mp-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 1px solid $color-border;

  &--placeholder {
    background: $color-page-bg;
  }
}

.mp-option-text {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
  line-height: 1.3;
}

.mp-username {
  font-weight: 600;
  font-size: 0.9rem;
  color: $color-black;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mp-address {
  font-size: 0.72rem;
  color: $color-text-dim;
}
</style>
