import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/eb-garamond/500-italic.css";
import "@fontsource/eb-garamond/600-italic.css";
import { createApp } from "vue";
import router from "./router";
import App from "./App.vue";
import { i18n } from "./i18n";
import { useWallet } from "./composables/useWallet";
import { useMeute } from "./composables/useMeute";

createApp(App).use(router).use(i18n).mount("#app");

// Wiring between useWallet and useMeute, kept here to break the circular
// dependency between the two composables (see useWallet.ts).
const { onExplicitConnect, onAccountChanged } = useWallet();
const { verifyMembershipAndLoad, resetSession } = useMeute();
onExplicitConnect((addr) => void verifyMembershipAndLoad(addr));
onAccountChanged((addr) => {
  resetSession();
  if (addr) void verifyMembershipAndLoad(addr);
});
