/**
 * Persists the highest server-version we've ever observed for each cloud
 * record id. If a future server response arrives with a strictly lower
 * version, the client treats it as a rollback attempt and refuses to apply.
 *
 * Stored client-side only — the server cannot rewrite this.
 *
 * AAD-binding the version (see envelope.ts) is the strong protection: a
 * server-rewritten version forces a decrypt failure. This store catches the
 * specific case where a malicious server *re-serves* a previously-valid older
 * ciphertext that decrypts cleanly under its (older) AAD.
 */

const STORAGE_KEY = "riskmatrix.cloud.highestVersion.v1";

type RollbackMap = Record<string, number>;

let cache: RollbackMap | null = null;

function readMap(): RollbackMap {
  if (cache !== null) return cache;
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cache = {};
      return cache;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      cache = {};
      return cache;
    }
    const out: RollbackMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
        out[k] = v;
      }
    }
    cache = out;
    return cache;
  } catch {
    return {};
  }
}

function writeMap(map: RollbackMap): void {
  cache = map;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota / private mode — best effort.
  }
}

export function getHighestSeenVersion(recordId: string): number {
  return readMap()[recordId] ?? 0;
}

/**
 * Note that the server returned a given version. Returns:
 *   - "ok"       — version >= last seen; the store is updated only when strictly greater.
 *   - "rollback" — version < last seen; caller must refuse and surface it.
 */
export function recordObservedVersion(
  recordId: string,
  version: number,
): "ok" | "rollback" {
  if (!Number.isFinite(version) || version < 0) return "rollback";
  const map = readMap();
  const prev = map[recordId] ?? 0;
  if (version < prev) return "rollback";
  if (version > prev) {
    map[recordId] = version;
    writeMap(map);
  }
  return "ok";
}

export function forgetRecord(recordId: string): void {
  const map = readMap();
  if (map[recordId] === undefined) return;
  delete map[recordId];
  writeMap(map);
}

export function __resetRollbackStoreForTests(): void {
  cache = null;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
