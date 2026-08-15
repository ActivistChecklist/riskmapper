/**
 * The app's Content-Security-Policy, and a validator for WEBCAT's rules.
 *
 * This is the single source of truth: the server sends it as a response
 * header, and `webcat.config.json` carries the same string as its
 * `default_csp`. Once the domain is enrolled, the extension enforces the
 * policy from the signed manifest, so the two drifting apart means the site
 * behaves differently for extension users than for everyone else.
 *
 * Every source below was established by measuring the running app, not by
 * guessing — see MIGRATION.md:
 *
 *   script-src 'wasm-unsafe-eval'  libsodium calls WebAssembly.instantiate
 *                                  during encryption. Its failure path calls
 *                                  abort(), so without this every cloud share
 *                                  breaks outright rather than degrading.
 *   style-src  'unsafe-inline'     sonner, tiptap and Radix each inject
 *                                  <style> elements and style attributes at
 *                                  runtime. Not removable without dropping
 *                                  those dependencies. WEBCAT permits it.
 *   connect-src 'self' data:       the API is same-origin, and analytics
 *                                  relays through /api/counter rather than
 *                                  talking to Umami directly. `data:` is for
 *                                  react-pdf's inline wasm module.
 *   font-src   'self'              Geist is self-hosted via @fontsource, and
 *                                  so is the Roboto that react-pdf embeds.
 *
 * Everything else is denied. `default-src 'none'` means anything not listed
 * is blocked rather than quietly inheriting a permissive default.
 */

export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self'",
  "font-src 'self'",
  // `data:` is for react-pdf, which fetches its own WebAssembly module as an
  // inline data: URI rather than from a file. A data: URI is same-document
  // and cannot reach the network, so this does not widen exfiltration.
  "connect-src 'self' data:",
  "worker-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * WEBCAT's CSP constraints, from
 * https://github.com/freedomofpress/webcat-spec/blob/main/csp.md
 *
 * Encoded here so that loosening the policy fails a test rather than
 * silently producing a manifest the extension refuses. The rules are
 * deliberately stricter than a browser's: WEBCAT rejects things browsers
 * accept, notably script hashes and nonces, because it instruments
 * WebAssembly and needs to reason about what can execute.
 */

const SCRIPT_SRC_ALLOWED = new Set(["'none'", "'self'", "'wasm-unsafe-eval'"]);
const STYLE_SRC_ALLOWED = new Set([
  "'none'",
  "'self'",
  "'unsafe-inline'",
  "'unsafe-hashes'",
]);
const WORKER_SRC_ALLOWED = new Set(["'none'", "'self'"]);
const DEFAULT_SRC_ALLOWED = new Set(["'none'", "'self'"]);
const FRAME_SRC_ALLOWED = new Set(["'none'", "'self'", "blob:", "data:"]);

export function parsePolicy(policy: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const raw of policy.split(";")) {
    const parts = raw.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    const name = parts[0].toLowerCase();
    // "If policy's directive set contains a directive whose name is
    // directive name, continue" — first wins, duplicates ignored.
    if (out.has(name)) continue;
    out.set(name, parts.slice(1));
  }
  return out;
}

/** Returns a list of human-readable violations; empty means WEBCAT-valid. */
export function validateWebcatCsp(policy: string): string[] {
  const problems: string[] = [];

  if (policy.includes(",")) {
    problems.push("policy must not contain a comma (no multiple policies)");
  }

  const directives = parsePolicy(policy);
  const seen = new Set<string>();
  for (const raw of policy.split(";")) {
    const name = raw.trim().split(/\s+/)[0]?.toLowerCase();
    if (!name) continue;
    if (seen.has(name)) problems.push(`duplicate directive: ${name}`);
    seen.add(name);
  }

  const defaultSrc = directives.get("default-src");
  if (!defaultSrc) {
    problems.push("default-src is required");
  } else {
    for (const v of defaultSrc) {
      if (!DEFAULT_SRC_ALLOWED.has(v)) {
        problems.push(`default-src may only be 'none' or 'self', got ${v}`);
      }
    }
  }

  const isNone = defaultSrc?.length === 1 && defaultSrc[0] === "'none'";
  if (!isNone) {
    // Only mandatory when default-src is not 'none'.
    if (directives.get("object-src")?.join(" ") !== "'none'") {
      problems.push("object-src must be 'none' when default-src is not 'none'");
    }
    if (!directives.has("worker-src")) {
      problems.push("worker-src is required when default-src is not 'none'");
    }
    if (!directives.has("frame-src") && !directives.has("child-src")) {
      problems.push(
        "frame-src or child-src is required when default-src is not 'none'",
      );
    }
  }

  for (const name of ["script-src", "script-src-elem"]) {
    for (const v of directives.get(name) ?? []) {
      if (!SCRIPT_SRC_ALLOWED.has(v)) {
        problems.push(
          `${name} may only be 'none', 'self' or 'wasm-unsafe-eval', got ${v}` +
            (v.startsWith("'sha") || v.startsWith("'nonce-")
              ? " (WEBCAT forbids script hashes and nonces)"
              : ""),
        );
      }
    }
  }

  for (const name of ["style-src", "style-src-elem"]) {
    for (const v of directives.get(name) ?? []) {
      if (!STYLE_SRC_ALLOWED.has(v) && !v.startsWith("'sha")) {
        problems.push(`${name} disallows ${v}`);
      }
    }
  }

  for (const v of directives.get("worker-src") ?? []) {
    if (!WORKER_SRC_ALLOWED.has(v)) {
      problems.push(`worker-src may only be 'none' or 'self', got ${v}`);
    }
  }

  for (const name of ["frame-src", "child-src"]) {
    for (const v of directives.get(name) ?? []) {
      // External hosts are permitted only if that domain is itself enrolled
      // in WEBCAT; we use none, so anything non-keyword is a mistake here.
      if (!FRAME_SRC_ALLOWED.has(v)) {
        problems.push(
          `${name}: ${v} is only allowed if that host is itself WEBCAT-enrolled`,
        );
      }
    }
  }

  const objectSrc = directives.get("object-src");
  if (objectSrc && objectSrc.join(" ") !== "'none'") {
    problems.push("object-src may only be 'none'");
  }

  return problems;
}
