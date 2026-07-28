import { onMounted, onUnmounted } from "vue";

// En mode démo locale (VITE_CHAIN=local), le panneau de démo (un onglet à
// part) fait avancer le temps et voter des comptes pendant que cette page
// reste ouverte — rien ne la prévient, elle ne relit ses données qu'au
// montage. Constaté : un statut "Dormant" resté affiché après un F5 oublié,
// alors que le compte était redevenu actif entre-temps sur la chaîne. Sans
// effet en dehors du mode local (jamais en prod) : voir DEV dans useMeute.ts
// pour pourquoi cette double condition élimine la branche à la compilation.
const isLocal = import.meta.env.DEV && import.meta.env.VITE_CHAIN === "local";

/** Recharge `callback` quand l'onglet regagne le focus — correspond
 *  exactement à l'usage réel (alterner entre le panneau de démo et cette
 *  page), sans avoir à poller en continu. */
export function useLocalAutoRefresh(callback: () => void) {
  if (!isLocal) return;

  function onFocus() {
    callback();
  }

  onMounted(() => window.addEventListener("focus", onFocus));
  onUnmounted(() => window.removeEventListener("focus", onFocus));
}
