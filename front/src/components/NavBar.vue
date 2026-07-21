<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import { useRoute } from "vue-router";

// Réplique le comportement du v2 : la nav est transparente en haut de la
// page d'accueil (au-dessus du hero), et devient opaque (fond blanc) après
// un léger scroll. Le dashboard n'a pas de hero sous la nav, donc elle y
// reste toujours opaque, sinon le fond transparent se superpose au contenu.
const route = useRoute();
const scrolledByUser = ref(false);
const menuOpen = ref(false);

const scrolled = computed(() => scrolledByUser.value || route.path === "/gouvernance");

function onScroll() {
  scrolledByUser.value = window.scrollY > 50;
}

onMounted(() => window.addEventListener("scroll", onScroll));
onUnmounted(() => window.removeEventListener("scroll", onScroll));
</script>

<template>
  <nav class="navbar navbar-custom navbar-fixed-top" :class="{ 'top-nav-collapse': scrolled }">
    <div class="container">
      <div class="navbar-header">
        <button type="button" class="navbar-toggle" @click="menuOpen = !menuOpen">
          <i class="fa fa-bars"></i>
        </button>
        <router-link class="navbar-brand" to="/">LA MEUTE 2.0</router-link>
      </div>
      <div class="collapse navbar-collapse navbar-right navbar-main-collapse" :class="{ in: menuOpen }">
        <ul class="nav navbar-nav">
          <li><router-link :to="{ path: '/', hash: '#page-top' }" @click="menuOpen = false">Accueil</router-link></li>
          <li><router-link :to="{ path: '/', hash: '#about' }" @click="menuOpen = false">Notre clan</router-link></li>
          <li><router-link :to="{ path: '/', hash: '#recruit' }" @click="menuOpen = false">Recrutement</router-link></li>
          <li><router-link :to="{ path: '/', hash: '#contact' }" @click="menuOpen = false">Nous contacter</router-link></li>
          <li><router-link to="/gouvernance" @click="menuOpen = false">Gouvernance</router-link></li>
        </ul>
      </div>
    </div>
  </nav>
</template>
