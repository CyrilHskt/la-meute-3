<script setup lang="ts">
import { useToast } from "../composables/useToast";

const { toasts, dismissToast } = useToast();
</script>

<template>
  <div class="toast-container">
    <TransitionGroup name="toast">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="`toast--${t.type}`">
        <svg v-if="t.type === 'success'" class="toast-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 8.5 6.5 12 13 4.5" />
        </svg>
        <svg v-else class="toast-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
        <span class="toast-message">{{ t.message }}</span>
        <button class="toast-close" type="button" title="Fermer" @click="dismissToast(t.id)">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style lang="scss" scoped>
.toast-container {
  position: fixed;
  bottom: 1.2rem;
  right: 1.2rem;
  z-index: 500;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  max-width: 360px;
}

.toast {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: $color-black;
  color: #fff;
  border-radius: 6px;
  padding: 0.8rem 0.9rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  font-size: $fs-caption;
  border-left: 3px solid transparent;
}

.toast--success {
  border-left-color: $color-success;
  .toast-icon { color: $color-success; }
}

.toast--error {
  border-left-color: $color-danger;
  .toast-icon { color: $color-danger; }
}

.toast-icon { flex-shrink: 0; }
.toast-message { flex: 1; line-height: 1.4; }

.toast-close {
  flex-shrink: 0;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  padding: 0.15rem;

  &:hover { color: #fff; }
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active { transition: none; }
}
</style>
