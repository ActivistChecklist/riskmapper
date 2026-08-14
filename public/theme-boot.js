/*
 * Theme boot script. Runs before first paint to set `.dark` on <html> so
 * dark-preferring users don't get a flash of light theme (or vice versa).
 *
 * This file is the source of truth and is loaded as an external, blocking
 * script. It is deliberately NOT inline: WEBCAT's CSP allows `script-src`
 * only 'none' / 'self' / 'wasm-unsafe-eval' and forbids both hashes and
 * nonces, so an inline <script> can never be whitelisted. See MIGRATION.md.
 *
 * Keep it tiny, dependency-free, and a classic script (no import/export)
 * so it stays cheap enough to block on. Anything more elaborate belongs in
 * the React layer in lib/theme.ts, which shares the "rm-theme" storage key
 * asserted by lib/theme.test.ts.
 */
(function () {
  try {
    var k = "rm-theme";
    var s = localStorage.getItem(k);
    var p = s === "light" || s === "dark" || s === "system" ? s : "system";
    var d =
      p === "dark" ||
      (p === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", d);
  } catch {
    /* private mode, disabled storage, or no matchMedia — keep the default */
  }
})();
