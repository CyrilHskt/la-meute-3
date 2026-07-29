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
  background: rgba(10, 10, 10, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.dcm-card {
  background: $color-card-bg;
  border-radius: 6px;
  padding: 1.8rem;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.25);
}

.dcm-title {
  font-family: $font-display;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-size: $fs-h4;
  color: $color-black;
  margin: 0 0 0.9rem;
}

.dcm-text {
  font-size: $fs-caption;
  color: $color-text-dim;
  line-height: 1.6;
  margin: 0 0 1.4rem;

  strong {
    color: $color-black;
  }
}

.dcm-actions {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;

  .btn {
    width: 100%;
  }
}
</style>
