import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { collectWasmModules } from "./scripts/wasmDigests.mts";

/**
 * Client build. Produces a fully static multi-page bundle: no server
 * rendering, and no inline scripts in the emitted HTML, both of which are
 * hard requirements for WEBCAT enrollment. See MIGRATION.md.
 *
 * The server build has its own config (vite.config.server.mts).
 */

const ROOT = import.meta.dirname;
const GENERATED_CONFIG = "webcat.config.generated.json";

/**
 * Writes the WEBCAT manifest config, deriving the `wasm` array from the
 * bundle that was just emitted.
 *
 * This runs on every build rather than being a step someone remembers after
 * upgrading a dependency. libsodium and react-pdf both compile wasm from a
 * base64 literal inside their chunk, so the digests change silently whenever
 * either is upgraded, and a stale digest blocks the site for enrolled users.
 * Deriving it from the actual output makes that impossible to get wrong.
 *
 * Everything a human decides — the CSP, the fallback document, the version —
 * stays in the committed `webcat.config.json`, which is the file worth
 * reviewing in a diff. This only fills in what the build alone can know.
 */
function webcatConfigPlugin(): Plugin {
  return {
    name: "webcat-config",
    apply: "build",
    closeBundle() {
      const assetsDir = path.join(ROOT, "dist", "assets");
      const sources = readdirSync(assetsDir)
        .filter((f) => f.endsWith(".js"))
        .map((f) => readFileSync(path.join(assetsDir, f), "utf8"));

      const modules = collectWasmModules(sources);
      const base = JSON.parse(
        readFileSync(path.join(ROOT, "webcat.config.json"), "utf8"),
      );

      writeFileSync(
        path.join(ROOT, GENERATED_CONFIG),
        JSON.stringify({ ...base, wasm: modules.map((m) => m.digest) }, null, 2) +
          "\n",
      );

      const summary = modules
        .map((m) => `${m.digest} (${m.byteLength} bytes)`)
        .join(", ");
      this.info(
        modules.length === 0
          ? `${GENERATED_CONFIG}: no embedded wasm found — verify that is right`
          : `${GENERATED_CONFIG}: ${modules.length} wasm module(s): ${summary}`,
      );
    },
  };
}

/** Shared with the single-file offline build in vite.config.offline.mts. */
export const sharedResolve = {
  alias: {
    "@": path.resolve(import.meta.dirname, "."),
  },
  // One physical copy of yjs: duplicate instances break Y.* constructor
  // checks (see https://github.com/yjs/yjs/issues/438). This replaces the
  // webpack/turbopack aliases the old next.config.ts carried.
  dedupe: ["yjs"],
};

/**
 * A prefix no variable uses, so `vite build` reads none from the shell.
 * See `buildEnv` below.
 */
export const BUILD_ENV_PREFIX = "RISKMAPPER_BUILD_IGNORES_ENV_";

/**
 * The client-visible values every production build gets, whoever runs it.
 *
 * Signing hashes a build made on the signing laptop, and each deploy makes
 * its own build and refuses to go live unless the two match byte for byte.
 * Anything the environment can change here would make them differ: a
 * `VITE_DEBUG=false` in the laptop's untracked `.env.local` once decided
 * whether every chunk logged to the console, and a build without that file
 * matched no signature. So `vite build` reads no `.env` file and no `VITE_*`
 * variable, and these are the only values it sees.
 *
 * Flags missing here stay unset in a build, which is their default:
 * `VITE_CLOUD_SYNC_ENABLED` on, `VITE_CLOUD_API_URL` same-origin. The dev
 * server still reads `.env.local`, so those knobs keep working in `yarn dev`.
 */
export const BUILD_DEFINES: Record<string, string> = {
  // Quiet, like the offline build. lib/log.ts logs unless this is "false".
  "import.meta.env.VITE_DEBUG": JSON.stringify("false"),
};

/** The env settings for `vite build`. */
const buildEnv = {
  envDir: false as const,
  envPrefix: BUILD_ENV_PREFIX,
  define: BUILD_DEFINES,
};

export default defineConfig(({ command }) => ({
  plugins: [react(), webcatConfigPlugin()],

  resolve: sharedResolve,

  // Client-visible env vars. Was NEXT_PUBLIC_* under Next. The dev server
  // reads them from the shell and .env files; a build reads none of them.
  ...(command === "build" ? buildEnv : { envPrefix: "VITE_" }),

  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Four documents: the SPA, plus the standalone privacy, security and
    // offline pages. Each of the latter resolves by directory index, which
    // is also how WEBCAT's `default_index` resolves it.
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, "index.html"),
        privacy: path.resolve(import.meta.dirname, "privacy/index.html"),
        security: path.resolve(import.meta.dirname, "security/index.html"),
        offline: path.resolve(import.meta.dirname, "offline/index.html"),
      },
    },
  },

  server: {
    // PORT lets a launcher (e.g. Claude Code's preview) pick a free port when
    // something else holds 3000. `yarn dev` leaves it unset and gets 3000.
    port: Number(process.env.PORT) || 3000,
    // The API runs as its own process in development (`yarn dev:api`).
    // In production one process serves both — see server/index.ts.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: false,
      },
    },
  },
}));
