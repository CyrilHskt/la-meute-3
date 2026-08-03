import { onMounted, onUnmounted } from "vue";
import { isLocal } from "./chainMode";

// In local demo mode (VITE_CHAIN=local), the demo panel (a separate tab)
// advances time and votes accounts while this page stays open — nothing
// notifies it, it only reloads its data on mount. Observed: a "Dormant"
// status left displayed after a forgotten F5, while the account had
// actually become active again on-chain in the meantime. No effect outside
// local mode (never in prod): see chainMode.ts for why this double
// condition eliminates the branch at compile time.

// The browser's `focus` event fires on any focus transition, not just
// "came back from the demo panel tab" — switching to devtools and back
// (exactly what happens while debugging this very page) retriggers it
// too. Below this interval, a focus event is treated as noise rather than
// a real tab switch: `callback` (loadAll + refreshMembership + ...) ends
// up calling buildIndex() server-side, a full sequential on-chain rescan
// (demo/server.mjs), so firing it several times in a row for the same
// devtools click was genuinely expensive, not just redundant.
const MIN_REFRESH_INTERVAL_MS = 3000;

/** Reloads `callback` when the tab regains focus — matches exactly the
 *  real usage (switching between the demo panel and this page), without
 *  having to poll continuously. */
export function useLocalAutoRefresh(callback: () => void) {
  if (!isLocal) return;

  let lastRun = 0;

  function onFocus() {
    const now = Date.now();
    if (now - lastRun < MIN_REFRESH_INTERVAL_MS) return;
    lastRun = now;
    callback();
  }

  onMounted(() => {
    // The component's own onMounted already loads fresh data — an initial
    // focus event firing right after (common when the tab was just
    // opened/clicked into) would otherwise duplicate that first load.
    lastRun = Date.now();
    window.addEventListener("focus", onFocus);
  });
  onUnmounted(() => window.removeEventListener("focus", onFocus));
}
