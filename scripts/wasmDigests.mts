import { createHash } from "node:crypto";

/**
 * Finds WebAssembly modules embedded as base64 literals inside JS bundles and
 * returns their SHA-256 digests, base64url encoded, for the `wasm` array of
 * a WEBCAT manifest.
 *
 * WEBCAT hashes the files a site serves. A wasm module compiled from a base64
 * string inside a JS chunk is never fetched as a file, so the extension has no
 * way to see it and the manifest declares it separately. We ship two, neither
 * chosen directly: `libsodium-wrappers` decodes a bare base64 literal for
 * encryption, and `@react-pdf/renderer` embeds a
 * `data:application/octet-stream;base64,` URI for PDF layout.
 *
 * Kept pure and separate from the build plumbing so it can be tested against
 * synthetic input rather than requiring a real build.
 */

/**
 * base64 of the 8-byte WebAssembly preamble: "\0asm" followed by version 1.
 *
 * Exactly ten characters, because that is how much of the encoding depends
 * only on those eight bytes. An eleventh character would also encode part of
 * byte 8, the first section id, and so would quietly require it to be under
 * 64 — true of every real module, but a needless assumption to bake in.
 */
const WASM_BASE64_PREFIX = "AGFzbQEAAA";
const BASE64_CHAR = /[A-Za-z0-9+/=]/;

export type WasmModule = {
  /** SHA-256 of the decoded module, base64url, unpadded. */
  digest: string;
  byteLength: number;
};

/** Pull every base64 run that begins with the wasm preamble out of a string. */
export function findWasmBase64Literals(source: string): string[] {
  const found: string[] = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf(WASM_BASE64_PREFIX, from);
    if (start === -1) break;
    let end = start;
    while (end < source.length && BASE64_CHAR.test(source[end])) end += 1;
    found.push(source.slice(start, end));
    from = end;
  }
  return found;
}

/**
 * Digest every embedded module across the given sources. Results are sorted so
 * the output is stable regardless of chunk naming or filesystem order, which
 * matters because this feeds a signed manifest.
 */
export function collectWasmModules(sources: string[]): WasmModule[] {
  const modules: WasmModule[] = [];
  for (const source of sources) {
    for (const b64 of findWasmBase64Literals(source)) {
      const bytes = Buffer.from(b64, "base64");
      // Guard against a false positive: a real module starts with \0asm.
      if (bytes.subarray(0, 4).toString("hex") !== "0061736d") continue;
      modules.push({
        digest: createHash("sha256").update(bytes).digest("base64url"),
        byteLength: bytes.length,
      });
    }
  }
  return modules.sort((a, b) => (a.digest < b.digest ? -1 : 1));
}
