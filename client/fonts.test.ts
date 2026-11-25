// @vitest-environment node
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Font contract, for iOS Lockdown Mode in particular.
 *
 * Lockdown Mode loads a web font only if WebKit's Safe Font Parser accepts
 * it, and that parser rejects CFF (PostScript) outlines. We once shipped
 * Geist Sans as CFF, so every iPhone in Lockdown Mode, Safari and Brave
 * alike, skipped it. And because `font-sans` named Geist with no fallback,
 * they got Times instead of a system sans.
 *
 * So: every font file we serve must be TrueType, the names in fonts.css
 * must match the @font-face rules it imports, and both font stacks must
 * end in a generic family.
 */

const require = createRequire(import.meta.url);

const fontsCss = readFileSync(path.join(__dirname, "fonts.css"), "utf8");
const globalsCss = readFileSync(path.join(__dirname, "globals.css"), "utf8");

/** The stylesheets fonts.css pulls in, resolved to files on disk. */
const importedSheets = [...fontsCss.matchAll(/@import\s+"([^"]+)";/g)].map(
  ([, specifier]) => {
    const file = require.resolve(specifier);
    return { file, css: readFileSync(file, "utf8") };
  },
);

/** The `url()` targets in a stylesheet, unquoted. */
function urls(css: string): string[] {
  return [...css.matchAll(/url\(([^)]+)\)/g)].map(([, url]) => url.replace(/["']/g, ""));
}

/**
 * Every font file we serve: the ones the imported stylesheets point at
 * relatively, and the ones fonts.css declares itself by package path.
 */
const fontFiles = [
  ...importedSheets.flatMap(({ file, css }) =>
    urls(css).map((url) => path.resolve(path.dirname(file), url)),
  ),
  ...urls(fontsCss).map((url) => require.resolve(url)),
];

/** The @font-face rules written in fonts.css itself. */
const ownFaces = [...fontsCss.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => body);

/** The family names every @font-face rule we serve declares. */
const declaredFamilies = new Set(
  [...importedSheets.map(({ css }) => css), ...ownFaces].flatMap((css) =>
    [...css.matchAll(/font-family:\s*['"]([^'"]+)['"]/g)].map(([, f]) => f),
  ),
);

/**
 * The outline format inside a WOFF or WOFF2 file. Both headers store the
 * wrapped font's sfnt version at byte 4: 0x00010000 for TrueType, "OTTO"
 * for CFF.
 */
function outlineFormat(bytes: Buffer): string {
  const signature = bytes.toString("latin1", 0, 4);
  if (signature !== "wOFF" && signature !== "wOF2") return `not WOFF (${signature})`;
  if (bytes.readUInt32BE(4) === 0x00010000) return "TrueType";
  if (bytes.toString("latin1", 4, 8) === "OTTO") return "CFF";
  return `unknown (0x${bytes.readUInt32BE(4).toString(16)})`;
}

/** The comma-separated families in a custom property declared in globals.css. */
function stack(property: string): string[] {
  const match = globalsCss.match(new RegExp(`${property}:\\s*([^;]+);`));
  expect(match, `${property} is declared in globals.css`).not.toBeNull();
  return match![1].split(",").map((family) => family.trim());
}

describe("self-hosted fonts", () => {
  it("serves at least one sans and one mono file", () => {
    const names = fontFiles.map((f) => path.basename(f));
    expect(names.some((n) => n.startsWith("geist-latin-"))).toBe(true);
    expect(names.some((n) => n.startsWith("geist-mono-"))).toBe(true);
  });

  it("gives each face fonts.css declares itself a unicode-range", () => {
    // Without one, every page downloads the file, accented letters or not.
    expect(ownFaces.length).toBeGreaterThan(0);
    for (const face of ownFaces) expect(face).toMatch(/unicode-range:\s*U\+/);
  });

  it("tells TrueType from CFF, so the check below can fail", () => {
    const header = (sfntVersion: Buffer) =>
      Buffer.concat([Buffer.from("wOF2", "latin1"), sfntVersion]);
    expect(outlineFormat(header(Buffer.from([0, 1, 0, 0])))).toBe("TrueType");
    expect(outlineFormat(header(Buffer.from("OTTO", "latin1")))).toBe("CFF");
  });

  it.each(fontFiles.map((f) => [path.basename(f), f]))(
    "%s has TrueType outlines, which Lockdown Mode accepts",
    (_name, file) => {
      expect(outlineFormat(readFileSync(file))).toBe("TrueType");
    },
  );

  it("names only families an @font-face rule declares", () => {
    const names = [...fontsCss.matchAll(/--font-geist-(?:sans|mono):\s*"([^"]+)"/g)].map(
      ([, name]) => name,
    );
    expect(names).toHaveLength(2);
    for (const name of names) expect(declaredFamilies).toContain(name);
  });
});

describe("font stacks", () => {
  it("puts Geist first and a system sans after it", () => {
    const families = stack("--font-sans");
    expect(families[0]).toBe("var(--font-geist-sans)");
    expect(families).toContain("system-ui");
    expect(families).toContain("sans-serif");
  });

  it("puts Geist Mono first and a system monospace after it", () => {
    const families = stack("--font-mono");
    expect(families[0]).toBe("var(--font-geist-mono)");
    expect(families.at(-1)).toBe("monospace");
  });

  it("gives body the same stack as font-sans", () => {
    expect(globalsCss).toMatch(/body\s*\{[^}]*font-family:\s*var\(--font-sans\);/);
  });
});
