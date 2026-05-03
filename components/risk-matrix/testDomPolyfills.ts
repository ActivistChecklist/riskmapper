/** JSDOM gaps used by matrix tests (ResizeObserver, CSS.escape, matchMedia). */
export function installMatrixTestDomPolyfills(): void {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
  }
  const g = globalThis as unknown as {
    CSS?: { escape?: (s: string) => string };
  };
  if (!g.CSS) {
    g.CSS = { escape: (s: string) => s };
  } else if (!g.CSS.escape) {
    g.CSS.escape = (s: string) => s;
  }
  if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
    // jsdom doesn't ship matchMedia. ThemeToggle reads
    // `prefers-color-scheme: dark` to follow the OS theme; in tests we
    // pin it to a non-matching, no-op listener (light theme).
    window.matchMedia = (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList);
  }
}
