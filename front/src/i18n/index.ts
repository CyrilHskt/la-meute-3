import { createI18n } from "vue-i18n";
import fr from "../locales/fr";
import en from "../locales/en";

export type MessageSchema = typeof fr;

// Locale-aware dates/currency use the plain `Intl`/`toLocaleString(locale.value)`
// APIs directly at the call site (see useLocale.ts) rather than vue-i18n's
// own datetimeFormats/numberFormats config — one less place to keep in
// sync, and just as locale-aware.
export const i18n = createI18n<MessageSchema, "fr" | "en", false>({
  legacy: false,
  locale: "fr",
  fallbackLocale: "fr",
  messages: { fr, en },
});
