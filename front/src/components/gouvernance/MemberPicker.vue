<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const listboxId = useId();

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
const props = withDefaults(
  defineProps<{ modelValue: string; options: PickerOption[]; placeholder?: string; ariaLabel?: string; inputId?: string }>(),
  {
    placeholder: "",
    ariaLabel: "",
    inputId: undefined,
  },
);
const emit = defineEmits<{ "update:modelValue": [string]; blur: [] }>();

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

// A Discord username is friendlier, but this field ultimately picks a
// wallet that receives real treasury funds — collapsing the value down to
// just "Nanook" would ask non-technical members to trust a display name
// they cannot verify (and two members could share a similar-looking one).
// Once a known member is resolved, keep their actual address visible
// alongside the name instead of hiding it, the same anti-impersonation
// principle ENS resolvers use.
const resolvedOption = computed(() => props.options.find((o) => o.address.toLowerCase() === props.modelValue.toLowerCase()));

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
  emit("blur");
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
    <div class="mp-input-row">
      <img v-if="resolvedOption?.avatarUrl" class="mp-input-avatar" :src="resolvedOption.avatarUrl" alt="" />
      <input
        :id="inputId"
        ref="inputEl"
        v-model="query"
        class="mp-input"
        :class="{ 'mp-input--resolved': resolvedOption?.avatarUrl }"
        type="text"
        :placeholder="placeholder"
        :aria-label="ariaLabel || undefined"
        autocomplete="off"
        role="combobox"
        :aria-expanded="open"
        :aria-controls="listboxId"
        aria-autocomplete="list"
        :aria-activedescendant="open && filtered.length ? `${listboxId}-option-${highlighted}` : undefined"
        @input="onInput"
        @focus="onFocus"
        @blur="onBlur"
        @keydown="onKeydown"
      />
      <button
        v-if="modelValue"
        type="button"
        class="mp-clear"
        :title="t('common.clear')"
        :aria-label="t('common.clear')"
        @mousedown.prevent="clear"
      >
        <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" />
        </svg>
      </button>
      <svg v-else class="mp-icon" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" />
        <path d="M13.5 13.5 10.6 10.6" stroke-linecap="round" />
      </svg>
      <ul v-if="open" class="mp-panel" role="listbox" :id="listboxId">
        <li v-if="!filtered.length" class="mp-empty" role="status" aria-live="polite">{{ t('memberPicker.noMatch') }}</li>
        <li
          v-for="(o, i) in filtered"
          :key="o.address"
          class="mp-option"
          :class="{ 'mp-option--active': i === highlighted }"
          role="option"
          :id="`${listboxId}-option-${i}`"
          :aria-selected="i === highlighted"
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
    <p v-if="resolvedOption?.username && !open" class="mp-resolved-address mono">{{ short(resolvedOption.address) }}</p>
  </div>
</template>

<style lang="scss" scoped>
.mp-root {
  flex: 1;
  min-width: 0;
}

// The positioning context for the input itself and everything anchored to
// it (avatar, clear/search icon, dropdown panel). Kept separate from
// `.mp-root` so the resolved-address line below the input — real layout
// height, not an overlay — can't shift what "50%"/"100%" mean for those
// anchored elements.
.mp-input-row {
  position: relative;
}

.mp-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid $color-border;
  border-radius: $radius-sm;
  padding: $space-2 1.9rem $space-2 $space-2;
  font: inherit;
  color: $color-text;
  background: $color-page-bg;
  transition: border-color 0.15s ease;

  &:focus {
    outline: none;
    border-color: $color-orange-dark;
  }

  &--resolved {
    padding-left: 2.6rem;
  }
}

.mp-input-avatar {
  position: absolute;
  top: 50%;
  left: 0.5rem;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid $color-border;
  pointer-events: none;
}

// Kept visible under the field once a member is resolved (not just in the
// dropdown) — the whole point of the display name is to be friendlier
// than a hash, not to make the hash unverifiable before sending funds.
.mp-resolved-address {
  margin: $space-1 0 0;
  font-size: $fs-caption;
  color: $color-text-dim;
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
    background: $color-page-bg;
  }
}

.mp-panel {
  position: absolute;
  z-index: 20;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  margin: 0;
  padding: $space-2;
  list-style: none;
  background: $color-card-bg;
  border: 1px solid $color-border;
  border-radius: $radius-md;
  max-height: 320px;
  overflow-y: auto;
}

.mp-empty {
  padding: $space-3 $space-2;
  font-size: $fs-caption;
  color: $color-text-dim;
  text-align: center;
}

.mp-option {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-3 $space-2;
  border-radius: $radius-sm;
  cursor: pointer;
  transition: background 0.1s ease;

  & + & {
    margin-top: 2px;
  }

  &--active {
    background: $color-page-bg;
  }
}

.mp-avatar {
  width: 40px;
  height: 40px;
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
  gap: 0.15rem;
  min-width: 0;
  line-height: 1.3;
}

.mp-username {
  font-weight: 600;
  font-size: $fs-body;
  color: $color-black;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mp-address {
  font-size: $fs-caption;
  color: $color-text-dim;
}
</style>
