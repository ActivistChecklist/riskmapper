// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OFFLINE_DOWNLOAD_PATH } from "../lib/offlinePaths.mts";
import {
  escapeInlineScript,
  escapeInlineStyle,
  finishOfflineHtml,
  offlineCsp,
  prepareOfflineHtml,
  scriptHash,
  buildId,
  selfContainedProblems,
  svgDataUri,
} from "./offlineHtml.mts";

/**
 * The offline download is trusted because its own CSP stops it from making
 * any network request, and because nothing in it points anywhere but itself.
 * These tests pin both: the transforms against synthetic input, and the real
 * built file against the same rules.
 */

const ROOT = path.resolve(import.meta.dirname, "..");

/** Inline scripts in a document, in order. */
function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

/** The CSP from the document's <meta> tag, as directive name to sources. */
function metaCsp(html: string): Map<string, string[]> {
  const content = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  if (!content) throw new Error("no CSP meta tag");
  return new Map(
    content.split(";").map((d) => {
      const [name, ...sources] = d.trim().split(/\s+/);
      return [name, sources] as const;
    }),
  );
}

describe("escapeInlineScript", () => {
  it("keeps a string literal's value while removing what would end the element", () => {
    const original = 'const a = "</script><!-- </SCRIPT>";';
    const escaped = escapeInlineScript(original);
    expect(escaped).not.toMatch(/<\/script|<!--/i);
    // Same value once the JavaScript runs.
    const run = (src: string) => new Function(`${src} return a;`)();
    expect(run(escaped)).toBe(run(original));
  });

  it("keeps a regex literal matching the same text", () => {
    const original = "const a = /<\\/script>|<!--/.test('<!--');";
    const escaped = escapeInlineScript(original);
    expect(escaped).not.toMatch(/<\/script|<!--/i);
    const run = (src: string) => new Function(`${src} return a;`)();
    expect(run(escaped)).toBe(true);
  });

  it("refuses a '<' that already follows a backslash, where rewriting would change meaning", () => {
    expect(() => escapeInlineScript('const a = "\\<!--";')).toThrow(/escaped/);
  });

  it("leaves ordinary code alone", () => {
    const code = "if (a < b && c <= d) { x = '<div>'; }";
    expect(escapeInlineScript(code)).toBe(code);
  });
});

describe("escapeInlineStyle", () => {
  it("refuses CSS that would close the <style> element early", () => {
    expect(() => escapeInlineStyle("a::after { content: '</style>'; }")).toThrow();
    expect(escapeInlineStyle("a { color: red; }")).toBe("a { color: red; }");
  });
});

describe("offlineCsp", () => {
  const csp = new Map(
    offlineCsp(["sha256-abc="]).split(";").map((d) => {
      const [name, ...sources] = d.trim().split(/\s+/);
      return [name, sources] as const;
    }),
  );

  it("names no host at all, so the file cannot reach any server", () => {
    // The same rule server/csp.test.ts enforces for the site: a host in any
    // directive fails here.
    for (const [name, sources] of csp) {
      for (const source of sources) expect(source, name).not.toContain("//");
    }
  });

  it("denies by default and allows only data: for fetches, fonts and images", () => {
    expect(csp.get("default-src")).toEqual(["'none'"]);
    expect(csp.get("connect-src")).toEqual(["data:"]);
    expect(csp.get("font-src")).toEqual(["data:"]);
    expect(csp.get("img-src")).toEqual(["data:"]);
  });

  it("allows scripts only by hash, never 'unsafe-inline' or 'self'", () => {
    expect(csp.get("script-src")).toEqual(["'sha256-abc='", "'wasm-unsafe-eval'"]);
  });

  it("sets the directives default-src does not cover", () => {
    expect(csp.get("base-uri")).toEqual(["'none'"]);
    expect(csp.get("form-action")).toEqual(["'none'"]);
  });
});

describe("prepareOfflineHtml", () => {
  const indexHtml = readFileSync(path.join(ROOT, "index.html"), "utf8");
  const prepared = prepareOfflineHtml(indexHtml, {
    themeBoot: "document.documentElement.dataset.boot = '1';",
    iconSvg: "<svg xmlns='http://www.w3.org/2000/svg'></svg>",
  });

  it("inlines the theme boot script in place, still before the app", () => {
    expect(prepared).not.toContain('src="/theme-boot.js"');
    expect(inlineScripts(prepared)[0]).toBe("document.documentElement.dataset.boot = '1';");
  });

  it("collapses the icon links to a single data: URI", () => {
    const icons = [...prepared.matchAll(/<link rel="[^"]*icon[^"]*"[^>]*>/g)].map((m) => m[0]);
    expect(icons).toHaveLength(1);
    expect(icons[0]).toContain('href="data:image/svg+xml;base64,');
  });

  it("fails loudly if index.html stops loading the theme script the expected way", () => {
    expect(() =>
      prepareOfflineHtml("<head></head>", { themeBoot: "", iconSvg: "" }),
    ).toThrow(/theme-boot/);
  });
});

describe("finishOfflineHtml", () => {
  const built = [
    "<!doctype html><html><head>",
    '<meta charset="utf-8" />',
    "<script>boot()</script>",
    '<script type="module" crossorigin src="/assets/main-abc.js"></script>',
    '<link rel="modulepreload" crossorigin href="/assets/dep-xyz.js">',
    '<link rel="stylesheet" crossorigin href="/assets/main-abc.css">',
    "</head><body></body></html>",
  ].join("\n");
  const files = {
    "/assets/main-abc.js": "app('</script>')",
    "/assets/main-abc.css": "body { margin: 0 }",
  };

  it("inlines the script and stylesheet the build emitted", () => {
    const html = finishOfflineHtml(built, files);
    expect(html).toContain('<script type="module">app(\'\\x3C/script>\')</script>');
    expect(html).toContain("<style>body { margin: 0 }</style>");
    expect(html).not.toContain("modulepreload");
  });

  it("puts the CSP straight after the charset, hashing every inline script", () => {
    const html = finishOfflineHtml(built, files);
    expect(html).toMatch(/<meta charset="utf-8" \/>\n\s*<meta http-equiv="Content-Security-Policy"/);
    const hashes = inlineScripts(html).map((s) => `'${scriptHash(s)}'`);
    expect(hashes).toHaveLength(2);
    expect(metaCsp(html).get("script-src")).toEqual([...hashes, "'wasm-unsafe-eval'"]);
  });

  it("turns off DNS prefetching, which the CSP does not cover", () => {
    const html = finishOfflineHtml(built, files);
    expect(html).toContain('<meta http-equiv="x-dns-prefetch-control" content="off" />');
  });

  it("refuses a script containing a carriage return, which would break its hash", () => {
    expect(() =>
      finishOfflineHtml(built, { ...files, "/assets/main-abc.js": "a();\r\nb();" }),
    ).toThrow(/carriage return/);
  });

  it("refuses a reference to a file the build did not emit", () => {
    expect(() => finishOfflineHtml(built, { "/assets/main-abc.js": "" })).toThrow(/main-abc\.css/);
  });

  it("refuses output where Vite's preload placeholder survived", () => {
    // It is filled in by a late Vite hook; reading the chunk too early left
    // it in place and broke the PDF export with a ReferenceError.
    expect(() =>
      finishOfflineHtml(built, { ...files, "/assets/main-abc.js": "__vitePreload(f, __VITE_PRELOAD__)" }),
    ).toThrow(/__VITE_PRELOAD__/);
  });

  it("refuses an emitted file nothing references, rather than dropping it", () => {
    expect(() =>
      finishOfflineHtml(built, { ...files, "/assets/lazy-chunk.js": "" }),
    ).toThrow(/lazy-chunk/);
  });
});

describe("selfContainedProblems", () => {
  /** A document whose CSP allows exactly the given scripts. */
  function doc(body: string, scripts: string[] = []): string {
    const csp = offlineCsp(scripts.map(scriptHash));
    return [
      `<html><head><meta http-equiv="Content-Security-Policy" content="${csp}">`,
      ...scripts.map((s) => `<script>${s}</script>`),
      `</head><body>${body}</body></html>`,
    ].join("");
  }

  it("accepts a document that loads nothing and runs only hashed scripts", () => {
    expect(selfContainedProblems(doc('<link rel="icon" href="data:image/svg+xml;base64,AAAA">', ["boot()"]))).toEqual([]);
  });

  it("flags every attribute that would fetch or navigate, however it is quoted", () => {
    const problems = selfContainedProblems(
      doc(
        [
          "<link rel=icon href=/icon.svg>",
          "<img src='https://example.org/x.png'>",
          '<img srcset="https://example.org/2x.png 2x">',
          '<form action="https://example.org/"></form>',
          '<a ping="https://example.org/ping" href="data:,">x</a>',
          '<div style="background:url(https://example.org/bg.png)"></div>',
        ].join(""),
      ),
    );
    expect(problems).toHaveLength(6);
  });

  it("flags a meta refresh, which the CSP does not stop", () => {
    const problems = selfContainedProblems(
      doc('<meta http-equiv="refresh" content="0;url=https://example.org/">'),
    );
    expect(problems).toEqual(['<meta http-equiv="refresh">']);
  });

  it("flags inline event handlers and external scripts", () => {
    expect(selfContainedProblems(doc('<img src="data:," onerror="x()">'))).toEqual([
      "<img onerror>",
    ]);
    expect(selfContainedProblems(doc('<script src="data:,x()"></script>'))).toContain(
      "a <script> with a src attribute",
    );
  });

  it("ignores URLs inside script and style bodies, which the CSP governs", () => {
    const script = "const a = ' src=\"https://riskmapper.app\"';";
    const html = doc("<style>a::after { content: ' href=\"/x\"'; }</style>", [script]);
    expect(selfContainedProblems(html)).toEqual([]);
  });

  it("flags a CSP whose hashes are not the scripts a browser would run", () => {
    const html = doc("", ["boot()"]).replace("<script>boot()</script>", "<script>other()</script>");
    expect(selfContainedProblems(html)).toEqual([
      "the CSP's script hashes do not match the scripts a browser would parse",
    ]);
  });

  it("requires the CSP tag", () => {
    expect(selfContainedProblems("<html></html>")).toEqual([
      "no Content-Security-Policy <meta> tag",
    ]);
  });
});

/**
 * The real download, from `yarn build`. CI builds before testing, as
 * server/securityHeaders.test.ts also requires.
 */
describe("the built offline file", () => {
  const file = path.join(ROOT, "dist", OFFLINE_DOWNLOAD_PATH);

  function read(): string {
    if (!existsSync(file)) throw new Error(`${file} is missing; run \`yarn build\` first`);
    return readFileSync(file, "utf8");
  }

  it("points at nothing outside itself", () => {
    expect(selfContainedProblems(read())).toEqual([]);
  });

  it("allows exactly its own inline scripts", () => {
    const html = read();
    const hashes = inlineScripts(html).map((s) => `'${scriptHash(s)}'`);
    expect(hashes.length).toBeGreaterThanOrEqual(2);
    expect(metaCsp(html).get("script-src")).toEqual([...hashes, "'wasm-unsafe-eval'"]);
  });

  it("is built with the offline flag on", () => {
    // Copy that only the offline build renders.
    expect(read()).toContain("Offline copy");
  });

  it("turns off DNS prefetching", () => {
    expect(read()).toContain('<meta http-equiv="x-dns-prefetch-control" content="off" />');
  });

  it("carries a build id derived from its own scripts", () => {
    const html = read();
    const id = html.match(/<meta name="riskmapper-offline-build" content="([0-9a-f]{16})" \/>/)?.[1];
    expect(id).toBe(buildId(inlineScripts(html)));
  });

  it("has no build placeholders left in it", () => {
    expect(read()).not.toContain("__VITE_PRELOAD__");
  });
});

describe("vite.config.offline.mts", () => {
  it("turns sharing off and the offline flag on, whatever the environment says", async () => {
    const { default: config } = await import("../vite.config.offline.mts");
    expect(config.define).toMatchObject({
      "import.meta.env.VITE_OFFLINE_BUILD": JSON.stringify("true"),
      "import.meta.env.VITE_CLOUD_SYNC_ENABLED": JSON.stringify("false"),
    });
  });

  it("gives the logo the shipped icon as a data: URI", async () => {
    const { default: config } = await import("../vite.config.offline.mts");
    const icon = readFileSync(path.join(ROOT, "public/icon.svg"), "utf8");
    expect(config.define?.["import.meta.env.VITE_OFFLINE_ICON_SRC"]).toBe(
      JSON.stringify(svgDataUri(icon)),
    );
  });
});
