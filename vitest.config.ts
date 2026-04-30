import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["**/*.test.{ts,tsx}"],
    // server/ has its own vitest.config.ts targeting Node — don't run those
    // here under jsdom by accident. Run them via `yarn --cwd server test`.
    exclude: ["**/node_modules/**", "**/dist/**", "server/**"],
    passWithNoTests: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
