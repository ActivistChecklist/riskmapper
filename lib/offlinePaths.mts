/**
 * Where the single-file offline build lands, and the path it is downloaded
 * from. One place for the build config, the server and the Security page.
 *
 * `.mts` with no imports because the Vite config loads it directly with
 * Node, and the browser bundle and the server read it too.
 */
export const OFFLINE_DOWNLOAD_DIR = "download";
export const OFFLINE_FILENAME = "riskmapper-offline.html";
export const OFFLINE_DOWNLOAD_PATH = `/${OFFLINE_DOWNLOAD_DIR}/${OFFLINE_FILENAME}`;

/**
 * SHA-256 of the offline file, in the format `shasum -a 256 -c` reads. Served
 * from our origin, so a copy someone hands over can be checked against it.
 */
export const OFFLINE_CHECKSUM_FILENAME = `${OFFLINE_FILENAME}.sha256`;
export const OFFLINE_CHECKSUM_PATH = `/${OFFLINE_DOWNLOAD_DIR}/${OFFLINE_CHECKSUM_FILENAME}`;

/**
 * The page that offers the download, where the offline file sends people to
 * check for a newer copy and the site footer links. Trailing slash because
 * it is a directory-index document (see server/staticFiles.ts).
 */
export const OFFLINE_PAGE_PATH = "/offline/";

/**
 * Where copies built before the offline page existed send people to check
 * for a newer copy: the Security page section that used to hold the
 * download. Those copies cannot be updated, so the section keeps this
 * heading and points on to OFFLINE_PAGE_PATH. The fragment is the heading's
 * id (see `headingId` in client/Prose.tsx).
 */
export const LEGACY_OFFLINE_SECTION_PATH = "/security/#use-risk-mapper-with-no-internet";

/** The <meta name> in the offline file that carries its build id. */
export const OFFLINE_BUILD_META = "riskmapper-offline-build";
