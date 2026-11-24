import { createHash } from "node:crypto";
import type { Plugin } from "vite";
import { OFFLINE_FILENAME } from "../lib/offlinePaths.mts";

/**
 * The single-file offline build: one HTML file holding the whole app, for
 * people who need to run Risk Mapper with no internet, or who would rather
 * their browser never contacted our server at all. It is downloaded by hand
 * from /download/, opened from disk, and never served as a page.
 *
 * Browsers refuse to load a separate script file from a page opened from
 * disk, so every script, stylesheet, font and icon is inlined. That is the
 * opposite of what WEBCAT needs for the site itself (no inline <script>,
 * ever), which is why this is its own build with its own policy: the file
 * carries a Content-Security-Policy <meta> tag that allows only its own
 * inline scripts, by hash, and denies every network request. The browser,
 * not our code, is what stops the file from talking to anyone.
 *
 * The transforms are pure functions over strings so they can be tested
 * without running a build. The plugin at the bottom is the only part that
 * touches Vite; vite.config.offline.mts reads the files it needs.
 */

/**
 * Policy for the offline file. Everything it needs is inside it:
 *
 *   script-src   hashes of its own inline scripts, plus 'wasm-unsafe-eval'
 *                because libsodium and react-pdf compile WebAssembly.
 *   style-src    'unsafe-inline': the inlined stylesheet, plus the <style>
 *                elements and style attributes sonner, tiptap and Radix
 *                inject at runtime (see the CSP note in AGENTS.md).
 *   img-src, font-src  data: only, for the inlined icon and fonts.
 *   connect-src  data: only. react-pdf fetches its fonts and its wasm module
 *                from data: URIs, which never reach the network.
 *
 * default-src 'none' covers everything not listed (frames, workers, media,
 * objects), and base-uri / form-action are set because default-src does not
 * cover them. frame-ancestors is left out because browsers ignore it in a
 * <meta> tag.
 */
export function offlineCsp(scriptHashes: readonly string[]): string {
  const scriptSources = [...scriptHashes.map((h) => `'${h}'`), "'wasm-unsafe-eval'"];
  return [
    "default-src 'none'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'unsafe-inline'",
    "img-src data:",
    "font-src data:",
    "connect-src data:",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

/** The CSP source expression for one inline script's exact text. */
export function scriptHash(content: string): string {
  return "sha256-" + createHash("sha256").update(content, "utf8").digest("base64");
}

/**
 * Makes code safe to sit between <script> and </script>.
 *
 * Two sequences end or derail an inline script early: "</script" closes the
 * element, and "<!--" puts the HTML parser into a state where a later
 * "<script" stops "</script>" from closing it. Both can appear inside string
 * literals in bundled libraries. Writing the "<" as \x3C means the same thing
 * in a string, template or regex literal, and module code cannot contain
 * either sequence anywhere else. One case would change meaning, a "<" that
 * already follows a backslash, so that fails the build instead of being
 * rewritten.
 */
export function escapeInlineScript(code: string): string {
  return code.replace(/(\\?)<(?=\/script|!--)/gi, (match, backslash: string, offset: number) => {
    if (backslash) {
      throw new Error(
        `Cannot inline a script with an escaped "<" before "</script" or "<!--" at offset ${offset}.`,
      );
    }
    return "\\x3C";
  });
}

/** Makes CSS safe to sit between <style> and </style>. */
export function escapeInlineStyle(css: string): string {
  if (/<\/style/i.test(css)) {
    throw new Error('Cannot inline a stylesheet that contains "</style".');
  }
  return css;
}

/** An SVG as a data: URI, for the favicon and the logo in the top bar. */
export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

/**
 * Before Vite processes the HTML: swap the tags that point at files in
 * public/ (which this build does not copy) for inline equivalents. The theme
 * boot script becomes an inline classic script, still blocking and still
 * before first paint, and the icon links collapse to one SVG data: URI.
 */
export function prepareOfflineHtml(
  html: string,
  assets: { themeBoot: string; iconSvg: string },
): string {
  const themeTag = /<script src="\/theme-boot\.js"><\/script>/;
  if (!themeTag.test(html)) {
    throw new Error("index.html no longer loads /theme-boot.js the way the offline build expects.");
  }
  const iconHref = svgDataUri(assets.iconSvg);
  let iconWritten = false;
  return html
    .replace(themeTag, () => `<script>${escapeInlineScript(assets.themeBoot)}</script>`)
    .replace(/[ \t]*<link rel="(?:icon|shortcut icon|apple-touch-icon)"[^>]*>\n?/g, (tag) => {
      if (iconWritten) return "";
      iconWritten = true;
      const indent = tag.match(/^[ \t]*/)?.[0] ?? "";
      return `${indent}<link rel="icon" href="${iconHref}" type="image/svg+xml" />\n`;
    });
}

/**
 * After Vite has built: replace the script and stylesheet tags that point at
 * emitted files with the files' contents, then add the CSP <meta> tag with
 * the hash of every inline script. `files` maps each emitted path as the HTML
 * references it ("/assets/main-abc.js") to its contents.
 */
export function finishOfflineHtml(html: string, files: Record<string, string>): string {
  const used = new Set<string>();
  const take = (src: string): string => {
    const content = files[src];
    if (content === undefined) throw new Error(`index.html references ${src}, which the build did not emit.`);
    used.add(src);
    return content;
  };

  let out = html
    .replace(/<link rel="modulepreload"[^>]*>\n?/g, "")
    .replace(/<script\b([^>]*?)\s+src="([^"]+)"([^>]*)><\/script>/g, (_tag, before: string, src: string, after: string) => {
      const isModule = /\btype="module"/.test(before + after);
      return `<script${isModule ? ' type="module"' : ""}>${escapeInlineScript(take(src))}</script>`;
    })
    .replace(/<link rel="stylesheet"[^>]*?href="([^"]+)"[^>]*>/g, (_tag, href: string) => {
      return `<style>${escapeInlineStyle(take(href))}</style>`;
    });

  const unused = Object.keys(files).filter((f) => !used.has(f));
  if (unused.length > 0) {
    throw new Error(`The build emitted files the offline HTML never references: ${unused.join(", ")}`);
  }

  const hashes = [...out.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => scriptHash(m[1]));
  const meta = `<meta http-equiv="Content-Security-Policy" content="${offlineCsp(hashes)}" />`;
  // Straight after the charset, so the policy is in force before any other
  // element in the document is parsed.
  const charset = /<meta charset="utf-8" \/>/;
  if (!charset.test(out)) throw new Error('index.html no longer starts with <meta charset="utf-8" />.');
  out = out.replace(charset, (tag) => `${tag}\n    ${meta}`);

  // Vite fills this in late in the build. If it survives, every lazily
  // loaded feature (the PDF export) throws when used.
  if (out.includes("__VITE_PRELOAD__")) {
    throw new Error("The offline HTML still contains Vite's __VITE_PRELOAD__ placeholder.");
  }

  const problems = selfContainedProblems(out);
  if (problems.length > 0) {
    throw new Error(`The offline HTML is not self-contained:\n  ${problems.join("\n  ")}`);
  }
  return out;
}

/**
 * Everything in the markup that would make the browser fetch something.
 * Script and style bodies are skipped: what they may do at runtime is the
 * CSP's job, and they legitimately contain URLs as strings (the links to
 * riskmapper.app the PDF prints, for one).
 */
export function selfContainedProblems(html: string): string[] {
  const markup = html
    .replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/g, "$1</script>")
    .replace(/(<style\b[^>]*>)[\s\S]*?<\/style>/g, "$1</style>");
  const problems: string[] = [];
  for (const m of markup.matchAll(/\s(src|href)="([^"]*)"/g)) {
    if (!m[2].startsWith("data:")) problems.push(`${m[1]}="${m[2]}"`);
  }
  if (!/<meta http-equiv="Content-Security-Policy"/.test(markup)) {
    problems.push("no Content-Security-Policy <meta> tag");
  }
  return problems;
}

/**
 * Wires the transforms into a Vite build. Expects the build to emit exactly
 * one HTML file plus the JS and CSS it references, which is what
 * `inlineDynamicImports` and an unlimited `assetsInlineLimit` produce; any
 * other file fails the build rather than going missing from the download.
 */
export function offlineSingleFilePlugin(assets: { themeBoot: string; iconSvg: string }): Plugin {
  return {
    name: "offline-single-file",
    apply: "build",
    enforce: "post",
    transformIndexHtml: {
      order: "pre",
      handler: (html) => prepareOfflineHtml(html, assets),
    },
    // order: "post" so this runs after Vite's own generateBundle hooks. One
    // of them fills in the `__VITE_PRELOAD__` placeholder that wraps every
    // dynamic import; read the chunk before that and the lazily loaded PDF
    // export throws a ReferenceError the moment someone uses it.
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const page = bundle["index.html"];
        if (!page || page.type !== "asset") {
          this.error("offline build: expected Vite to emit index.html");
        }
        const files: Record<string, string> = {};
        for (const [fileName, item] of Object.entries(bundle)) {
          if (fileName === "index.html") continue;
          if (item.type === "chunk") {
            files[`/${fileName}`] = item.code;
          } else if (fileName.endsWith(".css")) {
            files[`/${fileName}`] = String(item.source);
          } else {
            this.error(`offline build: ${fileName} was emitted as a separate file instead of being inlined`);
          }
        }
        const html = finishOfflineHtml(String(page.source), files);
        for (const fileName of Object.keys(bundle)) delete bundle[fileName];
        this.emitFile({ type: "asset", fileName: OFFLINE_FILENAME, source: html });
      },
    },
  };
}
