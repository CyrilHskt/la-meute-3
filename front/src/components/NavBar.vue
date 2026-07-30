<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { useLocale } from "../composables/useLocale";

const { t } = useI18n();
const { locale, setLocale } = useLocale();

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
        <router-link class="navbar-brand" to="/">
          <span class="brand-seal" aria-hidden="true">
            <svg viewBox="0 0 40 40" width="28" height="28">
              <circle cx="20" cy="20" r="18.5" fill="none" stroke="currentColor" stroke-width="1.3" />
              <path
                d="M20 11c-1.2 2-3 3.4-3 6 0 2 1.2 3.4 3 5.5 1.8-2.1 3-3.5 3-5.5 0-2.6-1.8-4-3-6Z"
                fill="currentColor"
              />
              <path d="M13 27c1.6-2.4 4-3.6 7-3.6s5.4 1.2 7 3.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
            </svg>
          </span>
          <span class="brand-label">LA MEUTE 3.0</span>
        </router-link>
      </div>
      <div class="collapse navbar-collapse navbar-right navbar-main-collapse" :class="{ in: menuOpen }">
        <ul class="nav navbar-nav">
          <li><router-link :to="{ path: '/', hash: '#page-top' }" @click="menuOpen = false">{{ t("nav.home") }}</router-link></li>
          <li><router-link to="/gouvernance" @click="menuOpen = false">{{ t("nav.governance") }}</router-link></li>
          <li class="lang-switch">
            <button type="button" :class="{ active: locale === 'fr' }" @click="setLocale('fr')">FR</button>
            <span aria-hidden="true">/</span>
            <button type="button" :class="{ active: locale === 'en' }" @click="setLocale('en')">EN</button>
          </li>
        </ul>
      </div>
    </div>
  </nav>
</template>

<style lang="scss" scoped>
// Overrides theme.css's `.navbar-custom` (v2 Aries template: black bar,
// uppercase Montserrat, transparent-over-hero/opaque-on-scroll toggle).
// The new hero has no dark background photo to sit over, so the nav is
// styled as a stable, always-opaque masthead instead of replicating the
// transparent/opaque toggle — `scrolled`/`top-nav-collapse` still compute
// and apply as before (untouched script), they just no longer produce a
// visual difference here, which is intentional for the ledger-like look.
.navbar-custom {
  background: $color-page-bg;
  border-bottom: 1px solid $color-border;
  font-family: $font-body;
  text-transform: none;
  letter-spacing: normal;
  color: $color-text;
}

.navbar-custom .navbar-brand {
  display: inline-flex;
  align-items: center;
  gap: $space-2;
  font-size: $fs-h4;
  font-weight: 600;
  font-family: $font-display;
  letter-spacing: 0.02em;
  color: $color-text;
  text-transform: none;
}

.navbar-custom .navbar-brand .brand-seal {
  color: $color-orange;
  display: inline-flex;
}

.navbar-custom .navbar-toggle {
  color: $color-text;
}

.navbar-custom .nav li a {
  color: $color-text;
  font-size: $fs-body;
  font-weight: 500;
}

.navbar-custom .nav li a:hover,
.navbar-custom .nav li a:focus,
.navbar-custom .nav li.active a {
  color: $color-orange;
  background-color: transparent;
}

.lang-switch {
  display: flex;
  align-items: center;
  gap: $space-1;
  padding: $space-3;
}
.lang-switch button {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-family: $font-mono;
  font-size: $fs-caption;
  color: $color-text-dim;
  cursor: pointer;
  opacity: 1;
}
.lang-switch button.active {
  color: $color-orange-dark;
  font-weight: 700;
}
.lang-switch span {
  color: $color-text-dim;
}
</style>
