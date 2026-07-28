import { ref } from "vue";

// Shared module-scope state (same pattern as useMeute.ts): any component
// can trigger a toast, a single <ToastContainer> (mounted once in
// App.vue) displays them all.
export interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
}

const toasts = ref<Toast[]>([]);
let nextId = 0;

const DEFAULT_DURATION_MS = 5000;

export function useToast() {
  function showToast(message: string, type: Toast["type"] = "success", durationMs = DEFAULT_DURATION_MS) {
    const id = nextId++;
    toasts.value = [...toasts.value, { id, message, type }];
    setTimeout(() => dismissToast(id), durationMs);
  }

  function dismissToast(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  return { toasts, showToast, dismissToast };
}
