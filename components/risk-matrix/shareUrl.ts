import { keyFromB64, keyToB64 } from "@/lib/e2ee";

/**
 * Share URL format:
 *
 *   <origin>/grid/<recordId>#<key-base64url>
 *
 * The capability key is the entire URL fragment — browsers don't include
 * the fragment in HTTP request lines, so the key never reaches the server.
 * The recordId is in the path so the server's request log shows which
 * record was looked up but not the key. We don't include a URL-format
 * version: if the format changes later, we'll detect the new shape by its
 * own syntax rather than baking a version literal into every link.
 */

export const SHARE_PATH_PREFIX = "/grid/";

export type ParsedShareLink = {
  recordId: string;
  key: Uint8Array;
};

export async function buildShareUrl(args: {
  origin: string;
  recordId: string;
  key: Uint8Array;
}): Promise<string> {
  if (!args.recordId) throw new Error("buildShareUrl: missing recordId");
  const keyB64 = await keyToB64(args.key);
  const url = new URL(args.origin);
  // Replace any path on the origin with the canonical share path.
  url.pathname = `${SHARE_PATH_PREFIX}${encodeURIComponent(args.recordId)}`;
  url.search = "";
  url.hash = keyB64;
  return url.toString();
}

export async function parseShareLocation(loc: {
  pathname: string;
  hash: string;
}): Promise<ParsedShareLink | null> {
  if (!loc.pathname.startsWith(SHARE_PATH_PREFIX)) return null;
  const recordId = decodeURIComponent(
    loc.pathname.slice(SHARE_PATH_PREFIX.length).replace(/\/$/, ""),
  );
  if (!recordId) return null;
  const fragment = loc.hash.startsWith("#") ? loc.hash.slice(1) : loc.hash;
  if (!fragment) return null;
  let key: Uint8Array;
  try {
    key = await keyFromB64(fragment);
  } catch {
    return null;
  }
  return { recordId, key };
}

/**
 * Replace the current URL with the app root, dropping the share-link path
 * + fragment. Used after auto-importing a shared matrix so reloading the
 * page doesn't re-trigger the import flow.
 */
export function clearShareFromUrl(): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", "/");
}

/**
 * Replace the current URL with the canonical share link for `recordId`
 * + `key` so the address bar matches what the user can paste to share.
 * Idempotent — already-correct URLs aren't rewritten.
 */
export async function setShareUrlInAddressBar(args: {
  recordId: string;
  key: Uint8Array;
}): Promise<void> {
  if (typeof window === "undefined") return;
  const next = await buildShareUrl({
    origin: window.location.origin,
    recordId: args.recordId,
    key: args.key,
  });
  if (window.location.href === next) return;
  window.history.replaceState(null, "", next);
}

/**
 * The last 6 chars of the base64url key, suitable for showing as a
 * fingerprint to confirm a copy/paste went through cleanly.
 */
export async function shareKeyFingerprint(key: Uint8Array): Promise<string> {
  return (await keyToB64(key)).slice(-6);
}
