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
