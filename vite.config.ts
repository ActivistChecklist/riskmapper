import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Client build. Produces a fully static multi-page bundle: no server
 * rendering, and no inline scripts in the emitted HTML, both of which are
 * hard requirements for WEBCAT enrollment. See MIGRATION.md.
 *
 * The server build has its own config (vite.config.server.ts).
 */
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
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
    // Two documents: the SPA and the standalone privacy page. `/privacy`
    // resolves by directory index, which is also how WEBCAT's
    // `default_index` resolves it.
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        privacy: path.resolve(__dirname, "privacy/index.html"),
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
