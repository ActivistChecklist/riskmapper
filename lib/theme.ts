/**
 * Theme preference handling.
 *
 * The user picks one of "light" | "dark" | "system". We persist their
 * pick in localStorage so it survives reloads, and translate it into a
 * boolean (`dark`) at runtime, factoring in `prefers-color-scheme`
 * when the choice is "system".
 *
 * Initial paint is handled by `public/theme-boot.js`, a blocking
 * external script that reads localStorage before React hydrates and
 * toggles `.dark` on <html> so the theme is correct on first frame. It
 * hardcodes {@link THEME_STORAGE_KEY}; `lib/theme.test.ts` executes the
 * real file and asserts the two stay in agreement.
 */

export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "rm-theme";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

export function writeStoredPreference(pref: ThemePreference): void {
  if (typeof window === "undefined") return;
  try {
    if (pref === "system") {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, pref);
    }
  } catch {
    /* private mode / quota exceeded — fall back to in-session only */
  }
}

export function resolvePreference(pref: ThemePreference): "light" | "dark" {
  if (pref !== "system") return pref;
  if (typeof window === "undefined") return "light";
  if (typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(resolved: "light" | "dark"): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
}
