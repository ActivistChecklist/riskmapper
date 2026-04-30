import type sodium from "libsodium-wrappers";

export type Sodium = typeof sodium;

let cached: Promise<Sodium> | null = null;

/**
 * Singleton loader for libsodium-wrappers. Dynamic import so the ~230 KB
 * chunk only ships when cloud features are exercised. Always awaits
 * `sodium.ready` before returning.
 */
export function getSodium(): Promise<Sodium> {
  if (cached) return cached;
  cached = (async () => {
    const mod = await import("libsodium-wrappers");
    const s = (mod.default ?? mod) as Sodium;
    await s.ready;
    return s;
  })();
  return cached;
}

export function __resetSodiumForTests(): void {
  cached = null;
}
