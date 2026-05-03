import { Font } from "@react-pdf/renderer";

let registered = false;

/**
 * Roboto covers the Latin range plus the BLACK STAR (U+2605) glyph we
 * use for starred actions — Helvetica (the @react-pdf default) does not.
 * Registered lazily so the network fetch only happens when a PDF is
 * actually generated, not on initial app load.
 */
export function ensurePdfFontsRegistered() {
  if (registered) return;
  registered = true;
  Font.register({
    family: "Roboto",
    fonts: [
      {
        src: "https://cdn.jsdelivr.net/npm/@fontsource/roboto@5.0.13/files/roboto-latin-400-normal.woff",
        fontWeight: 400,
      },
      {
        src: "https://cdn.jsdelivr.net/npm/@fontsource/roboto@5.0.13/files/roboto-latin-500-normal.woff",
        fontWeight: 500,
      },
      {
        src: "https://cdn.jsdelivr.net/npm/@fontsource/roboto@5.0.13/files/roboto-latin-700-normal.woff",
        fontWeight: 700,
      },
      {
        src: "https://cdn.jsdelivr.net/npm/@fontsource/roboto@5.0.13/files/roboto-latin-400-italic.woff",
        fontWeight: 400,
        fontStyle: "italic",
      },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
}
