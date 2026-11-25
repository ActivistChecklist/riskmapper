import { readFileSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { OFFLINE_DOWNLOAD_DIR } from "./lib/offlinePaths.mts";
import { offlineSingleFilePlugin, svgDataUri } from "./scripts/offlineHtml.mts";
import { sharedResolve } from "./vite.config.mts";

/**
 * The single-file offline build: the same app as vite.config.mts, packed
 * into one HTML file at dist/download/riskmapper-offline.html. See
 * scripts/offlineHtml.mts for why it exists and how it is locked down.
 *
 * Runs after the client build, as part of `yarn build`, so every deploy
 * ships a download that matches the live site.
 *
 * Deliberately leaves out the WEBCAT config plugin from vite.config.mts: it
 * reads dist/assets by a fixed path and would rewrite the generated WEBCAT
 * config from whatever is there.
 */

const ROOT = import.meta.dirname;

/** Matches no variable anyone sets, so the shell cannot reach this build. */
export const OFFLINE_ENV_PREFIX = "RISKMAPPER_OFFLINE_IGNORES_ENV_";

// The two files from public/ the offline page needs, inlined because
// public/ is not copied into this build (see publicDir below).
const themeBoot = readFileSync(path.join(ROOT, "public/theme-boot.js"), "utf8");
const iconSvg = readFileSync(path.join(ROOT, "public/icon.svg"), "utf8");

export default defineConfig({
  plugins: [react(), offlineSingleFilePlugin({ themeBoot, iconSvg })],

  resolve: sharedResolve,

  // Signing hashes a local build and the deploy builds its own, so anything
  // the environment could change here would make the two differ, and the
  // server refuses a release whose files do not match the signed manifest.
  // envDir: false ignores .env files, but Vite still reads VITE_* variables
  // from the shell, and a deploy's environment can set some that the
  // signing laptop's does not. A prefix nothing uses shuts those out too.
  // Everything this build needs is set in `define` below.
  envPrefix: OFFLINE_ENV_PREFIX,
  envDir: false,

  // Set here rather than in the environment so nothing outside this file
  // can switch them. Cloud sync needs our server, and analytics would post
  // to a path that does not exist on disk.
  define: {
    "import.meta.env.VITE_OFFLINE_BUILD": JSON.stringify("true"),
    "import.meta.env.VITE_CLOUD_SYNC_ENABLED": JSON.stringify("false"),
    // Quiet, like the production website.
    "import.meta.env.VITE_DEBUG": JSON.stringify("false"),
    // The logo in the top bar; /icon.svg would resolve against the disk.
    "import.meta.env.VITE_OFFLINE_ICON_SRC": JSON.stringify(svgDataUri(iconSvg)),
  },

  // public/ holds the site's icons, theme script and WEBCAT files. The two
  // the offline page needs are read above and inlined; the rest do not
  // belong in a download.
  publicDir: false,

  build: {
    outDir: path.join("dist", OFFLINE_DOWNLOAD_DIR),
    emptyOutDir: true,
    // Inline every font and image as a data: URI, and fold the lazily
    // loaded chunks (react-pdf, libsodium) into the one script.
    assetsInlineLimit: () => true,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: {
      input: path.resolve(ROOT, "index.html"),
      output: { codeSplitting: false },
    },
  },
});
