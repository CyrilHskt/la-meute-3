<script setup lang="ts">
import NavBar from "./components/NavBar.vue";
import VersionBadge from "./components/VersionBadge.vue";
import ToastContainer from "./components/ToastContainer.vue";
</script>

<template>
  <NavBar />
  <router-view />
  <footer>
    <div class="container text-center">
      <p class="credits">
        Copyright &copy; <b>La Meute 3.0</b> 2007-{{ new Date().getFullYear() }}
      </p>
      <VersionBadge />
    </div>
  </footer>
  <ToastContainer />
</template>

<style lang="scss">
// Unscoped on purpose: this is the global button hierarchy shared by every
// governance component (`.btn`/`.btn-primary`/`.btn-outline`/`.btn-outline-danger`),
// not App.vue's own markup. See src/styles/_buttons.scss for rationale.
@use "./styles/buttons";

// Overrides the legacy Aries template's `body { background: #000; color: #fff }`
// (public/css/theme.css) for the footer specifically: everything else on the
// page now uses the carnet-clair palette, but nothing had given the footer
// its own explicit background, so it kept showing the old dark body behind
// it — the last visible "old site" artifact once inherited by every page.
footer {
  background: $color-page-bg;
  color: $color-text-dim;
  border-top: 1px solid $color-border;
}
footer .credits {
  color: $color-text-dim;
}
footer a {
  color: $color-orange-dark;
}
</style>
