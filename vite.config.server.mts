import path from "node:path";
import { defineConfig } from "vite";

/**
 * Server build. Bundles `server/index.ts` to a single Node ESM file.
 *
 * Vite's SSR mode rather than a second bundler or a `tsx` runtime dependency:
 * it already resolves the `@/` alias and leaves `node_modules` external, so
 * mongodb and rate-limiter-flexible load from the installed tree at runtime.
 * See MIGRATION.md decision D6.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  build: {
    ssr: "server/index.ts",
    outDir: "dist-server",
    emptyOutDir: true,
    target: "node22",
    rollupOptions: {
      // `.mjs`, not `.js`: the bundle is ESM and package.json has no
      // "type": "module". Without the extension Node reparses the file and
      // warns (MODULE_TYPELESS_PACKAGE_JSON). Naming it explicitly is
      // narrower than flipping the whole package to ESM.
      output: { entryFileNames: "index.mjs" },
    },
  },
});
