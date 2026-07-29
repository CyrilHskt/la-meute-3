import { createRouter, createWebHistory } from "vue-router";
import Home from "../views/Home.vue";
import Dashboard from "../views/Dashboard.vue";

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to) {
    if (to.hash) {
      return { el: to.hash, behavior: "smooth" };
    }
    return { top: 0 };
  },
  routes: [
    { path: "/", name: "home", component: Home },
    { path: "/gouvernance", name: "governance", component: Dashboard },
  ],
});

export default router;
