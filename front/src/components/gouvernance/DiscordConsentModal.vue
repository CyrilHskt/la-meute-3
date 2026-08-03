<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useDiscordLink } from "../../composables/useDiscordLink";

const { t } = useI18n();
const { pendingLinkAddress, cancelDiscordLink, confirmDiscordLink } = useDiscordLink();
</script>

<template>
  <div v-if="pendingLinkAddress" class="dcm-overlay" @click.self="cancelDiscordLink">
    <div class="dcm-card">
      <p class="dcm-title">{{ t('discordConsent.title') }}</p>
      <p class="dcm-text" v-html="t('discordConsent.text')"></p>
      <div class="dcm-actions">
        <button class="btn btn-outline" type="button" @click="cancelDiscordLink">{{ t('discordConsent.skip') }}</button>
        <button class="btn btn-primary" type="button" @click="confirmDiscordLink">{{ t('discordConsent.confirm') }}</button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.dcm-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(27, 26, 24, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: $space-4;
}

.dcm-card {
  background: $color-card-bg;
  border: 1px solid $color-border;
  border-radius: $radius-md;
  padding: $space-4;
  width: 100%;
  max-width: 420px;
}

.dcm-title {
  font-family: $font-display;
  font-weight: 700;
  font-size: $fs-h4;
  color: $color-black;
  margin: 0 0 $space-3;
}

.dcm-text {
  font-size: $fs-caption;
  color: $color-text-dim;
  line-height: 1.6;
  margin: 0 0 $space-4;

  strong {
    color: $color-black;
  }
}

.dcm-actions {
  display: flex;
  flex-direction: column;
  gap: $space-2;

  .btn {
    width: 100%;
  }
}
</style>
