import { ref } from "vue";

// État module-scope partagé (même pattern que useMeute.ts) : n'importe quel
// composant peut déclencher un toast, un seul <ToastContainer> (monté une
// fois dans App.vue) les affiche tous.
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
