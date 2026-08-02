<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const emit = defineEmits<{
  "select-expense": [];
}>();
</script>

<template>
  <div class="gv-submit-prop">
    <div class="gv-submit-prop-tiles">
      <button type="button" class="gv-prop-tile gv-prop-tile--enabled" @click="emit('select-expense')">
        <svg viewBox="0 0 16 16" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M2 5.5h12M2 5.5v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7M2 5.5 4 2h8l2 3.5" />
          <circle cx="8" cy="9.5" r="1.6" />
        </svg>
        <span class="gv-prop-tile-label">{{ t('governance.dao.typeExpense') }}</span>
      </button>

      <button type="button" class="gv-prop-tile gv-prop-tile--disabled" disabled aria-disabled="true">
        <svg viewBox="0 0 16 16" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M8 1.5v13M8 1.5 5 4.5M8 1.5l3 3M8 14.5l-3-3M8 14.5l3-3" />
        </svg>
        <span class="gv-prop-tile-label">{{ t('governance.dao.typeBinaryPoll') }}</span>
        <span class="gv-prop-tile-badge">{{ t('governance.dao.comingSoon') }}<span class="gv-tm">™</span></span>
      </button>

      <button type="button" class="gv-prop-tile gv-prop-tile--disabled" disabled aria-disabled="true">
        <svg viewBox="0 0 16 16" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M2 4h5M2 8h5M2 12h5" />
          <circle cx="12" cy="4" r="1.4" />
          <circle cx="12" cy="8" r="1.4" />
          <circle cx="12" cy="12" r="1.4" />
        </svg>
        <span class="gv-prop-tile-label">{{ t('governance.dao.typeMultiChoicePoll') }}</span>
        <span class="gv-prop-tile-badge">{{ t('governance.dao.comingSoon') }}<span class="gv-tm">™</span></span>
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.gv-submit-prop-tiles {
  display: flex;
  flex-direction: column;
}

.gv-prop-tile {
  display: flex;
  flex-direction: row;
  // `nowrap`, not `wrap`: with wrap, a long label ("SONDAGE CHOIX
  // MULTIPLES") could push the whole row past its width and drop the
  // trailing badge onto its own line instead of staying aligned next to
  // the label — the label itself is the one allowed to wrap now (see
  // .gv-prop-tile-label), so the icon and badge stay put either way.
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-start;
  gap: $space-2;
  text-align: left;
  width: 100%;
  border: none;
  border-bottom: 1px solid $color-border;
  padding: $space-2 $space-1;
  background: none;
  font: inherit;
  color: $color-text;
  cursor: pointer;

  &:last-child {
    border-bottom: none;
  }

  &--enabled:hover {
    color: $color-orange-dark;
    background: $color-page-bg;
  }

  // Opacity on the icon/label only, not the whole button: applying it to
  // `.gv-prop-tile--disabled` itself would have also faded the "Soon™"
  // badge sitting inside the same button, working against making that
  // badge stand out (see .gv-prop-tile-badge below).
  &--disabled {
    cursor: not-allowed;
    color: $color-text-dim;

    svg,
    .gv-prop-tile-label {
      opacity: 0.6;
    }
  }
}

.gv-prop-tile svg {
  flex-shrink: 0;
}

.gv-prop-tile-label {
  font-family: $font-mono;
  font-size: $fs-caption;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  // Was `nowrap`: now the one thing allowed to wrap onto a second line
  // when it doesn't fit, instead of forcing the whole tile row to wrap
  // and dropping the badge below it.
  white-space: normal;
  flex: 1 1 auto;
  min-width: 0;
}

// Full-strength accent instead of the same dim gray as the rest of a
// disabled row: "Soon™" is a callout worth noticing (it's telling you
// something's actually planned), not just another muted disabled detail.
.gv-prop-tile-badge {
  flex-shrink: 0;
  margin-left: auto;
  font-family: $font-mono;
  font-size: 1.05rem;
  font-weight: 700;
  border: 1px solid $color-orange-dark;
  border-radius: $radius-sm;
  padding: 0.15rem 0.6rem;
  color: $color-orange-dark;
}

// The ™ glyph renders tiny (most fonts draw it as a sunken, scaled-down
// superscript) — bumped up and lifted back to a normal baseline so it's
// actually legible instead of nearly disappearing next to "Soon".
.gv-tm {
  font-size: 1.3em;
  vertical-align: baseline;
}
</style>
