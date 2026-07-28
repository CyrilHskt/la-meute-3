import { ref } from "vue";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import "./driver-overrides.css";

// State shared between the button (in the tab bar, Dashboard.vue) and the
// tour logic itself (driver.js + DOM selectors, GovernanceDao.vue) since
// the two aren't in a simple direct parent/props relationship. Same
// singleton pattern as the module-scope refs in useMeute.ts.
const TOUR_HIGHLIGHTED_KEY = "meute-tour-highlighted";
const TOUR_TAKEN_KEY = "meute-tour-taken";

const tourHighlighted = ref(localStorage.getItem(TOUR_HIGHLIGHTED_KEY) === "1");
const showTourPulse = ref(localStorage.getItem(TOUR_TAKEN_KEY) !== "1");
// Incremented on every launch request — GovernanceDao.vue watches this
// counter to trigger driver.js at the right time.
const tourRequestId = ref(0);
// Active instance of the highlight popover, so it can be closed if the
// real tour starts while it's still open (otherwise the two driver.js
// popovers stack on top of each other).
let highlightInstance: Driver | null = null;

export function useGuidedTour() {
  function requestTour() {
    highlightInstance?.destroy();
    highlightInstance = null;
    showTourPulse.value = false;
    localStorage.setItem(TOUR_TAKEN_KEY, "1");
    tourRequestId.value++;
  }

  // The tour never starts on its own, but we can highlight the button
  // that triggers it — once only, using the tour's own tool (a single
  // driver.js step) rather than a custom banner.
  function highlightTourButton(selector: string) {
    if (tourHighlighted.value) return;
    tourHighlighted.value = true;
    localStorage.setItem(TOUR_HIGHLIGHTED_KEY, "1");

    const d = driver({
      showProgress: false,
      showButtons: ["close"],
      onCloseClick: () => {
        d.destroy();
        highlightInstance = null;
      },
      steps: [
        {
          element: selector,
          popover: {
            title: "Nouveau ici ?",
            description: "Une visite guidée de 2 minutes te montre comment lire ta carte, voter et suivre les propositions.",
          },
        },
      ],
    });
    highlightInstance = d;
    d.drive();
  }

  return { showTourPulse, tourRequestId, requestTour, highlightTourButton };
}
