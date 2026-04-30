import { keyFromB64, keyToB64 } from "@/lib/e2ee";

/**
 * Share URL format:
 *
 *   <origin>/<basePath>?matrix=<RECORD_ID>#k=<KEY_B64URL>&v=1
 *
 * The fragment is never sent in the HTTP request line, so the key never
 * reaches the server in the share-link load. `?matrix=` is the visible
 * locator; `#k=` is the capability key.
 */

export const SHARE_FRAGMENT_VERSION = 1;
export const SHARE_QUERY_KEY = "matrix";
const SHARE_FRAGMENT_KEY = "k";
const SHARE_FRAGMENT_VERSION_KEY = "v";

export type ParsedShareLink = {
  recordId: string;
  key: Uint8Array;
  fragmentVersion: number;
};

export function buildShareUrl(args: {
  baseUrl: string;
  recordId: string;
  key: Uint8Array;
}): string {
  if (!args.recordId) throw new Error("buildShareUrl: missing recordId");
  const keyB64 = keyToB64(args.key);
  const url = new URL(args.baseUrl);
  url.searchParams.set(SHARE_QUERY_KEY, args.recordId);
  url.hash = `${SHARE_FRAGMENT_KEY}=${keyB64}&${SHARE_FRAGMENT_VERSION_KEY}=${SHARE_FRAGMENT_VERSION}`;
  return url.toString();
}

export function parseShareLocation(loc: {
  search: string;
  hash: string;
}): ParsedShareLink | null {
  const params = new URLSearchParams(loc.search);
  const recordId = params.get(SHARE_QUERY_KEY);
  if (!recordId) return null;
  const fragment = loc.hash.startsWith("#") ? loc.hash.slice(1) : loc.hash;
  if (!fragment) return null;
  const fp = new URLSearchParams(fragment);
  const k = fp.get(SHARE_FRAGMENT_KEY);
  const v = fp.get(SHARE_FRAGMENT_VERSION_KEY);
  if (!k || !v) return null;
  const fragmentVersion = Number(v);
  if (!Number.isInteger(fragmentVersion)) return null;
  if (fragmentVersion !== SHARE_FRAGMENT_VERSION) return null;
  let key: Uint8Array;
  try {
    key = keyFromB64(k);
  } catch {
    return null;
  }
  return { recordId, key, fragmentVersion };
}

export function clearShareFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete(SHARE_QUERY_KEY);
  url.hash = "";
  window.history.replaceState(null, "", url.toString());
}

/**
 * The last 6 chars of the base64url key, suitable for showing as a fingerprint
 * to confirm a copy/paste went through cleanly.
 */
export function shareKeyFingerprint(key: Uint8Array): string {
  return keyToB64(key).slice(-6);
}
