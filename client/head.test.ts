import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Document-head contract.
 *
 * This replaces `app/layout.metadata.test.ts`, which asserted on Next's
 * `metadata` export. Now that the head is hand-written, the test reads the
 * real HTML entry documents, which is strictly better: it checks what is
 * actually served rather than an object a framework used to translate.
 *
 * Every value asserted here was carried over from the old `metadata`
 * exports. If one changes in the HTML it has to change here too, on purpose.
 */

const ROOT = path.resolve(__dirname, "..");

function doc(relativePath: string): Document {
  const html = readFileSync(path.join(ROOT, relativePath), "utf8");
  return new DOMParser().parseFromString(html, "text/html");
}

function meta(d: Document, name: string): string | null {
  return d.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? null;
}

function iconHrefs(d: Document): string[] {
  return [...d.querySelectorAll('link[rel="icon"]')].map(
    (l) => l.getAttribute("href") ?? "",
  );
}

const ENTRIES = [
  { label: "index.html", file: "index.html" },
  { label: "privacy/index.html", file: "privacy/index.html" },
] as const;

describe("index.html", () => {
  it("declares the site title", () => {
    expect(doc("index.html").title).toBe("Risk Mapper");
  });

  it("declares the app description", () => {
    expect(meta(doc("index.html"), "description")).toMatch(/risk mapping tool/i);
  });
});

describe("privacy/index.html", () => {
  it("declares a page-specific title", () => {
    expect(doc("privacy/index.html").title).toBe("Privacy — Risk Mapper");
  });

  it("declares a description covering the collection stance", () => {
    expect(meta(doc("privacy/index.html"), "description")).toMatch(
      /anonymize ips/i,
    );
  });
});

describe.each(ENTRIES)("$label", ({ file }) => {
  it("sets a no-referrer policy so share fragments cannot leak", () => {
    expect(meta(doc(file), "referrer")).toBe("no-referrer");
  });

  it("declares every favicon variant the app ships", () => {
    expect(iconHrefs(doc(file))).toEqual([
      "/icon.svg",
      "/icon-16.png",
      "/icon-32.png",
      "/icon-48.png",
      "/icon-192.png",
      "/icon-512.png",
    ]);
  });

  it("pairs each png icon with its declared size", () => {
    const d = doc(file);
    const sizeFor = (href: string) =>
      d.querySelector(`link[rel="icon"][href="${href}"]`)?.getAttribute("sizes");

    expect(sizeFor("/icon-16.png")).toBe("16x16");
    expect(sizeFor("/icon-32.png")).toBe("32x32");
    expect(sizeFor("/icon-48.png")).toBe("48x48");
    expect(sizeFor("/icon-192.png")).toBe("192x192");
    expect(sizeFor("/icon-512.png")).toBe("512x512");
  });

  it("declares the shortcut and apple-touch icons", () => {
    const d = doc(file);
    expect(
      d.querySelector('link[rel="shortcut icon"]')?.getAttribute("href"),
    ).toBe("/favicon.ico");
    const apple = d.querySelector('link[rel="apple-touch-icon"]');
    expect(apple?.getAttribute("href")).toBe("/apple-icon.png");
    expect(apple?.getAttribute("sizes")).toBe("180x180");
  });

  it("loads the theme boot script external, blocking, before paint", () => {
    const boot = doc(file).querySelector('head script[src="/theme-boot.js"]');
    expect(boot).not.toBeNull();
    // Neither async nor defer, or the theme lands after first paint and
    // dark-mode users get a flash of light.
    expect(boot?.hasAttribute("async")).toBe(false);
    expect(boot?.hasAttribute("defer")).toBe(false);
  });

  it("contains no inline script", () => {
    // The reason this app left Next.js: WEBCAT's CSP allows script-src only
    // 'none' / 'self' / 'wasm-unsafe-eval', with hashes and nonces both
    // disallowed, so an inline <script> can never be whitelisted.
    const inline = [...doc(file).querySelectorAll("script")].filter(
      (s) => !s.hasAttribute("src") && (s.textContent ?? "").trim().length > 0,
    );
    expect(inline).toEqual([]);
  });

  it("has a mount point for the React root", () => {
    expect(doc(file).querySelector("#root")).not.toBeNull();
  });
});
