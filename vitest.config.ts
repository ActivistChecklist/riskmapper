import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    // Most of the suite is React + DOM. The cloud/route-handler tests in
    // lib/cloud/ run fine in jsdom too — they don't touch the DOM but jsdom
    // is a superset of node for the WHATWG Request/Response globals we
    // need.
    environment: "jsdom",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    passWithNoTests: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
