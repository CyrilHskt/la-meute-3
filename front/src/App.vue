<script setup lang="ts">
import NavBar from "./components/NavBar.vue";
import VersionBadge from "./components/VersionBadge.vue";
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
</template>
