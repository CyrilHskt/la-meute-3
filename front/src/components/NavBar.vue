<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { useLocale } from "../composables/useLocale";
import { useTheme } from "../composables/useTheme";
import ThemeToggleIcon from "./ThemeToggleIcon.vue";

const { t } = useI18n();
const { locale, setLocale } = useLocale();
const { theme, toggleTheme } = useTheme();

// Replicates the v2 behavior: the nav is transparent at the top of the
// homepage (above the hero), and becomes opaque (white background) after
// a slight scroll. The dashboard has no hero under the nav, so it always
// stays opaque there, otherwise the transparent background would overlap
// the content.
const route = useRoute();
const scrolledByUser = ref(false);
const navbarEl = ref<HTMLElement | null>(null);

const scrolled = computed(() => scrolledByUser.value || route.path === "/gouvernance");

function onScroll() {
  scrolledByUser.value = window.scrollY > 50;
}

// The nav's actual height depends on Bootstrap content (brand font-size,
// etc.) — not a reliable constant. We measure it and
// expose it as a CSS variable so any component that needs to position
// itself below it (e.g. the dashboard's sticky sub-menu) stays in sync
// instead of guessing a hardcoded pixel number.
function updateNavbarHeight() {
  if (navbarEl.value) {
    document.documentElement.style.setProperty("--navbar-height", `${navbarEl.value.offsetHeight}px`);
  }
}

// A ResizeObserver on the nav itself rather than a list of the events we
// think can change its height: a plain "mount + window resize" list
// missed the `top-nav-collapse` class toggle, whose ~40px padding change
// is animated by a 0.5s CSS transition (public/css/theme.css) —
// --navbar-height then stayed at its pre-scroll value until an unrelated
// resize, leaving a visible gap under the nav. The observer covers every
// cause, including each frame of that transition and window resizes.
let navbarResizeObserver: ResizeObserver | null = null;

onMounted(() => {
  window.addEventListener("scroll", onScroll);
  updateNavbarHeight();
  if (!navbarEl.value) return;
  navbarResizeObserver = new ResizeObserver(updateNavbarHeight);
  // border-box, not the default content-box: the transition that made this
  // go stale animates the nav's *padding* (20px → 0), which leaves the
  // content box untouched and would never fire the observer.
  navbarResizeObserver.observe(navbarEl.value, { box: "border-box" });
});

onUnmounted(() => {
  window.removeEventListener("scroll", onScroll);
  navbarResizeObserver?.disconnect();
});
</script>

<template>
  <nav ref="navbarEl" class="navbar navbar-custom navbar-fixed-top" :class="{ 'top-nav-collapse': scrolled }">
    <div class="container">
      <div class="navbar-header">
        <!-- The only way back to "/" now that the "Accueil" link is gone
             (see below) — a two-route site doesn't need a nav menu, just
             a clear way back, and the logo already served that purpose.
             The aria-label makes that explicit for keyboard/screen-reader
             users, who'd otherwise just hear "La Meute, link". -->
        <router-link class="navbar-brand" to="/" :aria-label="t('nav.homeAriaLabel')">
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
          <span class="brand-label">LA MEUTE</span>
        </router-link>
      </div>
      <div class="navbar-collapse navbar-right navbar-main-collapse">
        <ul class="nav navbar-nav">
          <li>
            <button
              type="button"
              class="lang-toggle"
              :aria-label="locale === 'fr' ? 'Switch to English' : 'Passer en français'"
              @click="setLocale(locale === 'fr' ? 'en' : 'fr')"
            >
              {{ locale === 'fr' ? 'EN' : 'FR' }}
            </button>
          </li>
          <li>
            <button
              type="button"
              class="theme-toggle"
              :aria-label="theme === 'light' ? t('theme.switchToDark') : t('theme.switchToLight')"
              :title="theme === 'light' ? t('theme.switchToDark') : t('theme.switchToLight')"
              @click="toggleTheme"
            >
              <ThemeToggleIcon :theme="theme" />
            </button>
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

// Same treatment as .theme-toggle right next to it: one control, same
// hit area/padding, same hover color — reads as a matched pair of small
// utility buttons instead of two visually unrelated widgets. Replaces
// the previous two-button "FR / EN" switch, which showed both languages
// at once for a single possible action (there's only ever one language
// to switch *to*).
.lang-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: $space-3;
  font-family: $font-mono;
  font-size: $fs-caption;
  color: $color-text-dim;
  cursor: pointer;
  transition: color 0.15s ease;

  &:hover {
    color: $color-orange-dark;
  }
}

.theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: $space-3;
  color: $color-text-dim;
  cursor: pointer;
  transition: color 0.15s ease;

  &:hover {
    color: $color-orange-dark;
  }
}
</style>
