import { Font } from "@react-pdf/renderer";
import robotoItalic from "@fontsource/roboto/files/roboto-latin-400-italic.woff";
import robotoRegular from "@fontsource/roboto/files/roboto-latin-400-normal.woff";
import robotoMedium from "@fontsource/roboto/files/roboto-latin-500-normal.woff";
import robotoBold from "@fontsource/roboto/files/roboto-latin-700-normal.woff";

let registered = false;

/**
 * Roboto covers the Latin range plus the BLACK STAR (U+2605) glyph we
 * use for starred actions — Helvetica (the @react-pdf default) does not.
 *
 * These are imported as assets so Vite emits them into `dist/assets/` and
 * react-pdf fetches them from our own origin. They previously pointed at
 * cdn.jsdelivr.net, which meant generating a PDF told a third-party CDN the
 * user's IP address and that they had exported a matrix — contradicting the
 * privacy page's "nothing in your browser talks to anyone other than this
 * site", and breaking outright under `connect-src 'self'`.
 *
 * Registration stays lazy so the fonts are only fetched when a PDF is
 * actually generated, not on initial app load.
 */
export function ensurePdfFontsRegistered() {
  if (registered) return;
  registered = true;
  Font.register({
    family: "Roboto",
    fonts: [
      { src: robotoRegular, fontWeight: 400 },
      { src: robotoMedium, fontWeight: 500 },
      { src: robotoBold, fontWeight: 700 },
      { src: robotoItalic, fontWeight: 400, fontStyle: "italic" },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
}
