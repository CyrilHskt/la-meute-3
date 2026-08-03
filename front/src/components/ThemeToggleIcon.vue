<script setup lang="ts">
import type { Theme } from "../composables/useTheme";

defineProps<{
  theme: Theme;
}>();
</script>

<template>
  <svg v-if="theme === 'light'" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path
      d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
      fill="none"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linejoin="round"
    />
  </svg>
  <svg v-else viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.4" />
    <g stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
      <path d="M12 3v2.2" />
      <path d="M12 18.8V21" />
      <path d="M4.2 4.2l1.6 1.6" />
      <path d="M18.2 18.2l1.6 1.6" />
      <path d="M3 12h2.2" />
      <path d="M18.8 12H21" />
      <path d="M4.2 19.8l1.6-1.6" />
      <path d="M18.2 5.8l1.6-1.6" />
    </g>
  </svg>
</template>
