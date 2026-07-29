import { i18n } from "../i18n";

const LOCALE_KEY = "meute-locale";

export type Locale = "fr" | "en";

// vue-i18n's own `locale` (Composition mode) is already a reactive ref —
// no need to duplicate it in a second ref, unlike useWallet.ts/
// useLocalAutoRefresh.ts's module-level refs, which don't have an
// equivalent upstream. This is that same singleton-state pattern, just
// backed by the i18n instance instead of a plain `ref()`.
const stored = localStorage.getItem(LOCALE_KEY);
if (stored === "fr" || stored === "en") {
  i18n.global.locale.value = stored;
}
document.documentElement.lang = i18n.global.locale.value;

function setLocale(locale: Locale) {
  i18n.global.locale.value = locale;
  localStorage.setItem(LOCALE_KEY, locale);
  document.documentElement.lang = locale;
}

export function useLocale() {
  return { locale: i18n.global.locale, setLocale };
}
