/** JSDOM gaps used by matrix tests (ResizeObserver, CSS.escape). */
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
}
