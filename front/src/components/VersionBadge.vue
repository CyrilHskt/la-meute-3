<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useLocale } from "../composables/useLocale";
import {
  SITE_VERSION,
  DASHBOARD_VERSION,
  CONTRACT_DISPLAY_VERSION,
  SITE_CHANGELOG,
  DASHBOARD_CHANGELOG,
  CONTRACT_CHANGELOG,
  type ChangelogEntry,
} from "../changelog";

const { t } = useI18n();
const { locale } = useLocale();
const open = ref(false);

function localized(field: ChangelogEntry["date"] | ChangelogEntry["title"]) {
  return typeof field === "string" ? field : field[locale.value];
}
</script>

<template>
  <button class="version-badge" type="button" @click="open = true">
    <span class="dot"></span> v{{ SITE_VERSION }}
  </button>

  <div v-if="open" class="vm-overlay" @click.self="open = false">
    <div class="vm-card">
      <div class="vm-head">
        <button class="vm-close" type="button" :title="t('common.close')" @click="open = false">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
        <h2>{{ t('versionBadge.title') }}</h2>
      </div>

      <div class="vm-columns">
        <div class="vm-col">
          <div class="vm-col-head">
            <p class="vm-col-title">{{ t('versionBadge.site') }}</p>
            <span class="vm-col-version">v{{ SITE_VERSION }}</span>
          </div>
          <div class="vm-col-scroll">
            <div v-for="(entry, i) in SITE_CHANGELOG" :key="i" class="vm-entry">
              <div class="vm-entry-date">{{ localized(entry.date) }}</div>
              <div class="vm-entry-title">{{ localized(entry.title) }}</div>
            </div>
          </div>
        </div>

        <div class="vm-col">
          <div class="vm-col-head">
            <p class="vm-col-title">{{ t('versionBadge.dashboard') }}</p>
            <span class="vm-col-version">v{{ DASHBOARD_VERSION }}</span>
          </div>
          <div class="vm-col-scroll">
            <div v-for="(entry, i) in DASHBOARD_CHANGELOG" :key="i" class="vm-entry">
              <div class="vm-entry-date">{{ localized(entry.date) }}</div>
              <div class="vm-entry-title">{{ localized(entry.title) }}</div>
            </div>
          </div>
        </div>

        <div class="vm-col">
          <div class="vm-col-head">
            <p class="vm-col-title">{{ t('versionBadge.contract') }}</p>
            <span class="vm-col-version">v{{ CONTRACT_DISPLAY_VERSION }}</span>
          </div>
          <div class="vm-col-scroll">
            <div v-for="(entry, i) in CONTRACT_CHANGELOG" :key="i" class="vm-entry">
              <div class="vm-entry-date">{{ localized(entry.date) }}</div>
              <div class="vm-entry-title">{{ localized(entry.title) }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="vm-credit">
        {{ t('versionBadge.builtBy') }}
        <a href="https://github.com/CyrilHskt" target="_blank" rel="noopener">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
            />
          </svg>
          CyrilHskt
        </a>
      </div>
      <div class="vm-credit vm-credit-secondary">
        <span>{{ t('versionBadge.openSource') }}</span>
        <div class="vm-pills">
          <a
            class="vm-pill"
            href="https://github.com/CyrilHskt/la-meute-3/issues/new?labels=bug"
            target="_blank"
            rel="noopener"
          >{{ t('versionBadge.reportBug') }}</a>
          <a
            class="vm-pill"
            href="https://github.com/CyrilHskt/la-meute-3/issues/new"
            target="_blank"
            rel="noopener"
          >{{ t('versionBadge.proposeContribution') }}</a>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.version-badge {
  display: inline-flex;
  align-items: center;
  gap: 4.5px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  padding: 5px 11px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.65);
  cursor: pointer;
  font-family: $font-mono;

  &:hover { border-color: $color-orange; color: $color-orange; }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: $color-orange;
  }
}

.vm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 10, 10, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 15px;
  z-index: 200;
}

.vm-card {
  background: $color-card-bg;
  border-radius: 6px;
  width: 100%;
  max-width: 880px;
  max-height: 85vh;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
  text-align: left;
  display: flex;
  flex-direction: column;
}

.vm-head {
  position: relative;
  padding: 14px 14px 12px;
  border-bottom: 1px solid $color-border;
  text-align: center;

  h2 {
    margin: 0;
    font-family: $font-display;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    font-size: 22px;
    color: $color-black;
  }
}

.vm-close {
  position: absolute;
  top: 12px;
  right: 12px;
  background: none;
  border: none;
  color: $color-text-dim;
  cursor: pointer;
  padding: 2px;

  &:hover { color: $color-orange-dark; }
}

.vm-columns {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  min-height: 0;
}
@media (max-width: 700px) {
  .vm-columns { grid-template-columns: 1fr; }
  .vm-col:not(:last-child) { border-right: none; border-bottom: 1px solid $color-border; }
}

.vm-col {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px 13px;

  &:not(:last-child) {
    border-right: 1px solid $color-border;
  }
}

.vm-col-head {
  margin-bottom: 9px;
  flex-shrink: 0;
  text-align: center;
}

.vm-col-title {
  font-family: $font-display;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-size: $fs-caption;
  color: $color-orange-dark;
  margin: 0 0 1.5px;
}

.vm-col-version {
  font-family: $font-mono;
  font-size: 12px;
  color: $color-text-dim;
}

.vm-col-scroll {
  overflow-y: auto;
  max-height: 46vh;
  padding-right: 3px;
}

.vm-entry {
  padding: 7px 0;
  border-bottom: 1px solid $color-border;

  &:last-child { border-bottom: none; }
}

.vm-entry-date {
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: $color-text-dim;
  margin-bottom: 2.5px;
}

.vm-entry-title {
  font-size: 14px;
  color: $color-black;
  font-weight: 600;
  line-height: 1.4;
}

.vm-credit {
  flex-shrink: 0;
  text-align: center;
  padding: 9px 14px;
  border-top: 1px solid $color-border;
  font-size: 12px;
  color: $color-text-dim;

  a {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: $color-text;
    font-weight: 700;
    text-decoration: none;

    &:hover { color: $color-orange-dark; }
  }
}

.vm-credit-secondary {
  padding-top: 0;
  border-top: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 7px;
}

.vm-pills {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}

.vm-pill {
  display: inline-flex;
  align-items: center;
  border: 1px solid $color-border;
  border-radius: 999px;
  padding: 3px 10px;
  font-family: $font-mono;
  font-size: 11px;
  color: $color-text-dim;
  text-decoration: none;

  &:hover {
    border-color: $color-orange;
    color: $color-orange-dark;
  }
}
</style>
