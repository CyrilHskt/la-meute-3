import { ref } from "vue";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import "./driver-overrides.css";

// État partagé entre le bouton (dans la barre d'onglets, Dashboard.vue) et
// la logique du tour elle-même (driver.js + sélecteurs DOM, GouvernanceDao.vue)
// puisque les deux ne sont pas dans une relation parent-direct/props simple.
// Même pattern singleton que les refs module-scope de useMeute.ts.
const TOUR_HIGHLIGHTED_KEY = "meute-tour-highlighted";
const TOUR_TAKEN_KEY = "meute-tour-taken";

const tourHighlighted = ref(localStorage.getItem(TOUR_HIGHLIGHTED_KEY) === "1");
const showTourPulse = ref(localStorage.getItem(TOUR_TAKEN_KEY) !== "1");
// Incrémenté à chaque demande de lancement — GouvernanceDao.vue observe ce
// compteur pour déclencher driver.js au bon moment.
const tourRequestId = ref(0);
// Instance active du popover de mise en avant, pour pouvoir la fermer si
// le vrai tour démarre pendant qu'elle est encore ouverte (sinon les deux
// popovers driver.js se superposent).
let highlightInstance: Driver | null = null;

export function useGuidedTour() {
  function requestTour() {
    highlightInstance?.destroy();
    highlightInstance = null;
    showTourPulse.value = false;
    localStorage.setItem(TOUR_TAKEN_KEY, "1");
    tourRequestId.value++;
  }

  // Le tour ne se lance jamais tout seul, mais on peut mettre en avant le
  // bouton qui le déclenche — une seule fois, avec l'outil du tour
  // lui-même (un unique step driver.js) plutôt qu'un bandeau custom.
  function highlightTourButton(selector: string) {
    // TEMPORAIRE (test) : le garde-fou "une seule fois" est désactivé pour
    // pouvoir revoir le popover à chaque ouverture d'onglet. À remettre
    // avant de merger.
    // if (tourHighlighted.value) return;
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
