import { SHARE_PATH_PREFIX } from "@/components/risk-matrix/shareUrl";

/**
 * Which view `index.html` should render for a given pathname.
 *
 * There is no router library: `/privacy` is its own document, so the only
 * paths that reach here are the app root, share links, and anything the
 * server could not match to a file. See MIGRATION.md decision D2.
 *
 * The server serves `index.html` for unmatched paths rather than a separate
 * 404 document, because WEBCAT resolves every unmanifested main_frame path
 * through a single `default_fallback` file and share-link ids can never be
 * in the manifest (decision D3). So "not found" is a client-side view.
 */
export type Route = "app" | "not-found";

export function resolveRoute(pathname: string): Route {
  if (pathname === "/" || pathname === "/index.html") return "app";

  // A share link: /grid/<recordId>, optionally with a trailing slash. The
  // key lives in the fragment and is not our concern here — useShareImport
  // reads and validates it.
  if (pathname.startsWith(SHARE_PATH_PREFIX)) {
    const recordId = pathname.slice(SHARE_PATH_PREFIX.length).replace(/\/$/, "");
    return recordId.length > 0 ? "app" : "not-found";
  }

  return "not-found";
}
