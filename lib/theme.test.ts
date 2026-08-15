import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  THEME_STORAGE_KEY,
  applyTheme,
  isThemePreference,
  readStoredPreference,
  resolvePreference,
  writeStoredPreference,
} from "./theme";

/**
 * Theme preference + boot-script behaviour.
 *
 * The boot script ships as `public/theme-boot.js`, loaded as an external
 * blocking script because WEBCAT's CSP forbids inline JavaScript outright
 * (`script-src` accepts neither hashes nor nonces). These tests read that
 * real file off disk and execute it, so they cover what the browser will
 * actually run rather than a stand-in.
 */

const BOOT_SCRIPT_PATH = path.resolve(__dirname, "../public/theme-boot.js");

function bootScriptSource(): string {
  return readFileSync(BOOT_SCRIPT_PATH, "utf8");
}

function stubMatchMedia(prefersDark: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: prefersDark && query.includes("prefers-color-scheme: dark"),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/**
 * Execute the boot script the way the browser does: the file's own source,
 * as a classic script in its own scope, with no module wrapper.
 */
function runBootScript(): void {
  new Function(bootScriptSource())();
}

function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = "";
  stubMatchMedia(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isThemePreference", () => {
  it("accepts only the three known preferences", () => {
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("Dark")).toBe(false);
    expect(isThemePreference("")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
  });
});

describe("readStoredPreference", () => {
  it("defaults to system when nothing is stored", () => {
    expect(readStoredPreference()).toBe("system");
  });

  it("returns each stored preference verbatim", () => {
    for (const pref of ["light", "dark", "system"] as const) {
      window.localStorage.setItem(THEME_STORAGE_KEY, pref);
      expect(readStoredPreference()).toBe(pref);
    }
  });

  it("falls back to system on a junk stored value", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "chartreuse");
    expect(readStoredPreference()).toBe("system");
  });

  it("falls back to system when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(readStoredPreference()).toBe("system");
  });
});

describe("writeStoredPreference", () => {
  it("persists an explicit light/dark choice", () => {
    writeStoredPreference("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    writeStoredPreference("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("removes the key for system so the OS stays authoritative", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    writeStoredPreference("system");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("swallows storage failures (private mode / quota)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => writeStoredPreference("dark")).not.toThrow();
  });
});

describe("resolvePreference", () => {
  it("passes explicit choices through untouched", () => {
    expect(resolvePreference("light")).toBe("light");
    expect(resolvePreference("dark")).toBe("dark");
  });

  it("follows prefers-color-scheme for system", () => {
    stubMatchMedia(true);
    expect(resolvePreference("system")).toBe("dark");
    stubMatchMedia(false);
    expect(resolvePreference("system")).toBe("light");
  });

  it("defaults to light when matchMedia is unavailable", () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    expect(resolvePreference("system")).toBe("light");
  });
});

describe("applyTheme", () => {
  it("toggles the dark class on the document element", () => {
    applyTheme("dark");
    expect(isDark()).toBe(true);
    applyTheme("light");
    expect(isDark()).toBe(false);
  });

  it("is idempotent", () => {
    applyTheme("dark");
    applyTheme("dark");
    expect(document.documentElement.className.match(/dark/g)).toHaveLength(1);
  });
});

describe("public/theme-boot.js", () => {
  it("is a classic script with no module syntax", () => {
    const src = bootScriptSource();
    // Loaded with a plain <script src>, so it must not need a module
    // context: no import/export, nothing to resolve at load time.
    expect(src).not.toMatch(/^\s*(import|export)\s/m);
    expect(src).toMatch(/\(function\s*\(\)\s*\{/);
  });

  it("hardcodes the same storage key the React layer writes", () => {
    // The file can't import from lib/theme.ts, so this is what keeps the
    // two in agreement.
    expect(bootScriptSource()).toContain(`"${THEME_STORAGE_KEY}"`);
  });

  it("reads the same storage key the React layer writes", () => {
    writeStoredPreference("dark");
    runBootScript();
    expect(isDark()).toBe(true);
  });

  it("applies a stored dark preference", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    runBootScript();
    expect(isDark()).toBe(true);
  });

  it("applies a stored light preference even when the OS prefers dark", () => {
    stubMatchMedia(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    runBootScript();
    expect(isDark()).toBe(false);
  });

  it("follows the OS when the stored preference is system", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "system");
    stubMatchMedia(true);
    runBootScript();
    expect(isDark()).toBe(true);
  });

  it("follows the OS when nothing is stored", () => {
    stubMatchMedia(true);
    runBootScript();
    expect(isDark()).toBe(true);

    document.documentElement.className = "";
    stubMatchMedia(false);
    runBootScript();
    expect(isDark()).toBe(false);
  });

  it("treats a junk stored value as system", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "chartreuse");
    stubMatchMedia(true);
    runBootScript();
    expect(isDark()).toBe(true);
  });

  it("clears a stale dark class when the resolved theme is light", () => {
    document.documentElement.classList.add("dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    runBootScript();
    expect(isDark()).toBe(false);
  });

  it("never throws when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(() => runBootScript()).not.toThrow();
    expect(isDark()).toBe(false);
  });
});
