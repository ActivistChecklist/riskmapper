/**
 * Theme preference handling.
 *
 * The user picks one of "light" | "dark" | "system". We persist their
 * pick in localStorage so it survives reloads, and translate it into a
 * boolean (`dark`) at runtime, factoring in `prefers-color-scheme`
 * when the choice is "system".
 *
 * Initial paint is handled by an inline blocking script in
 * `app/layout.tsx` (see {@link buildThemeBootScript}). That script
 * reads localStorage before React hydrates and toggles `.dark` on
 * <html> so the theme is correct on first frame.
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

/**
 * Inline script string injected into <head>. Runs before paint to set
 * `.dark` on <html>, avoiding a flash of light theme on dark-preferring
 * users (or vice versa). Kept tiny on purpose — anything more elaborate
 * lives in the React layer.
 */
export function buildThemeBootScript(): string {
  return `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var s=localStorage.getItem(k);var p=(s==='light'||s==='dark'||s==='system')?s:'system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;
}
