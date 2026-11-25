/**
 * Whether this bundle is the single-file offline download
 * (vite.config.offline.mts), opened from disk rather than served by us.
 *
 * Read at call time, like `isCloudEnabled`, so tests can flip it with
 * `vi.stubEnv`. In a real build Vite inlines the value, so the web build
 * carries none of the offline-only branches' effects.
 */
export function isOfflineBuild(): boolean {
  return import.meta.env.VITE_OFFLINE_BUILD === "true";
}

/** The live site, for the few links the offline file makes back to it. */
export const LIVE_SITE_ORIGIN = "https://riskmapper.app";

/**
 * Anchor props for a link to one of the site's own documents (`/security/`,
 * `/privacy/`, `/offline/`). On the web it is a relative path in the same tab. In the
 * offline file a relative path would resolve against the user's disk, so it
 * goes to the live site, in a new tab so the app stays open. Following it is
 * the user's choice; the file itself never contacts the site.
 */
export function sitePageLinkProps(path: `/${string}`): {
  href: string;
  target?: "_blank";
  rel?: string;
} {
  if (!isOfflineBuild()) return { href: path };
  return {
    href: `${LIVE_SITE_ORIGIN}${path}`,
    target: "_blank",
    rel: "noopener noreferrer",
  };
}

/**
 * The logo the top bar shows. The offline build supplies the icon as a
 * data: URI, because /icon.svg would resolve against the user's disk and
 * the file's CSP allows images only from data: URIs.
 */
export function siteIconSrc(): string {
  return (isOfflineBuild() && import.meta.env.VITE_OFFLINE_ICON_SRC) || "/icon.svg";
}
