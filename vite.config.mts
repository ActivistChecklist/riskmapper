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

export default defineConfig({
  plugins: [react(), webcatConfigPlugin()],

  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
    // One physical copy of yjs — duplicate instances break Y.* constructor
    // checks (see https://github.com/yjs/yjs/issues/438). This replaces the
    // webpack/turbopack aliases the old next.config.ts carried.
    dedupe: ["yjs"],
  },

  // Client-visible env vars. Was NEXT_PUBLIC_* under Next; see the deploy
  // checklist in MIGRATION.md for the Railway rename.
  envPrefix: "VITE_",

  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Three documents: the SPA, plus the standalone privacy and security
    // pages. Each of the latter resolves by directory index, which is also
    // how WEBCAT's `default_index` resolves it.
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, "index.html"),
        privacy: path.resolve(import.meta.dirname, "privacy/index.html"),
        security: path.resolve(import.meta.dirname, "security/index.html"),
      },
    },
  },

  server: {
    port: 3000,
    // The API runs as its own process in development (`yarn dev:api`).
    // In production one process serves both — see server/index.ts.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: false,
      },
    },
  },
});
