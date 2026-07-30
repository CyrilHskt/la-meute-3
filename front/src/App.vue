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
        Copyright &copy; <b>La Meute 2.0</b> 2007-{{ new Date().getFullYear() }}
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
</style>
