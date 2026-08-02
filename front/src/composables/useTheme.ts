import { ref } from "vue";

const THEME_KEY = "meute-theme";

export type Theme = "light" | "dark";

// Deliberately never read `matchMedia`/`prefers-color-scheme` here. An
// earlier attempt at OS-auto-detected dark mode in this redesign caused a
// real, confusing bug: Cyril's OS was in dark mode, so he silently saw an
// untested dark variant instead of the reviewed light one, which also hid
// a real CSS bug. Default is always light unless the user explicitly
// toggled it, persisted below.
const theme = ref<Theme>(localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light");
document.documentElement.setAttribute("data-theme", theme.value);

function setTheme(next: Theme) {
  theme.value = next;
  localStorage.setItem(THEME_KEY, next);
  document.documentElement.setAttribute("data-theme", next);
}

function toggleTheme() {
  setTheme(theme.value === "dark" ? "light" : "dark");
}

export function useTheme() {
  return { theme, setTheme, toggleTheme };
}
