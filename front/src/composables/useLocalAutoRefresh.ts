import { onMounted, onUnmounted } from "vue";

// In local demo mode (VITE_CHAIN=local), the demo panel (a separate tab)
// advances time and votes accounts while this page stays open — nothing
// notifies it, it only reloads its data on mount. Observed: a "Dormant"
// status left displayed after a forgotten F5, while the account had
// actually become active again on-chain in the meantime. No effect outside
// local mode (never in prod): see DEV in useMeute.ts for why this double
// condition eliminates the branch at compile time.
const isLocal = import.meta.env.DEV && import.meta.env.VITE_CHAIN === "local";

/** Reloads `callback` when the tab regains focus — matches exactly the
 *  real usage (switching between the demo panel and this page), without
 *  having to poll continuously. */
export function useLocalAutoRefresh(callback: () => void) {
  if (!isLocal) return;

  function onFocus() {
    callback();
  }

  onMounted(() => window.addEventListener("focus", onFocus));
  onUnmounted(() => window.removeEventListener("focus", onFocus));
}
