import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Still built on eslint-config-next for its TypeScript and react-hooks rule
 * sets, even though the app no longer uses Next. The Next-only rules that
 * assume a framework we don't have are switched off below.
 *
 * Replacing this with typescript-eslint + eslint-plugin-react-hooks directly
 * would drop the last Next-shaped thing in the repo, at the cost of three new
 * devDependencies and a config rewrite. Tracked in MIGRATION.md.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // Build output. Without these, ESLint lints the bundled app and reports
    // thousands of problems in minified vendor code.
    "dist/**",
    "dist-server/**",
    "out/**",
    ".next/**",
  ]),
  {
    rules: {
      // We serve static SVG/PNG we ship ourselves and have no image
      // optimizer, so a plain <img> is correct here.
      "@next/next/no-img-element": "off",
      // There are no Next pages to resolve links against; /privacy is its
      // own document reached by a plain anchor.
      "@next/next/no-html-link-for-pages": "off",
      // The theme boot script is loaded deliberately as a blocking external
      // <script> in the HTML entry documents, not via next/script.
      "@next/next/no-sync-scripts": "off",
    },
  },
]);

export default eslintConfig;
