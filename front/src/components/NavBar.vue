<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from "vue";
import { useRoute } from "vue-router";

// Replicates the v2 behavior: the nav is transparent at the top of the
// homepage (above the hero), and becomes opaque (white background) after
// a slight scroll. The dashboard has no hero under the nav, so it always
// stays opaque there, otherwise the transparent background would overlap
// the content.
const route = useRoute();
const scrolledByUser = ref(false);
const menuOpen = ref(false);
const navbarEl = ref<HTMLElement | null>(null);

const scrolled = computed(() => scrolledByUser.value || route.path === "/gouvernance");

function onScroll() {
  scrolledByUser.value = window.scrollY > 50;
}

// The nav's actual height depends on Bootstrap content (brand font-size,
// mobile menu wrap, etc.) — not a reliable constant. We measure it and
// expose it as a CSS variable so any component that needs to position
// itself below it (e.g. the dashboard's sticky sub-menu) stays in sync
// instead of guessing a hardcoded pixel number.
function updateNavbarHeight() {
  if (navbarEl.value) {
    document.documentElement.style.setProperty("--navbar-height", `${navbarEl.value.offsetHeight}px`);
  }
}

onMounted(() => {
  window.addEventListener("scroll", onScroll);
  window.addEventListener("resize", updateNavbarHeight);
  updateNavbarHeight();
});

// The expanded mobile menu changes the nav's total height.
watch(menuOpen, () => nextTick(updateNavbarHeight));
onUnmounted(() => {
  window.removeEventListener("scroll", onScroll);
  window.removeEventListener("resize", updateNavbarHeight);
});
</script>

<template>
  <nav ref="navbarEl" class="navbar navbar-custom navbar-fixed-top" :class="{ 'top-nav-collapse': scrolled }">
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
