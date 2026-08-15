import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { collectWasmModules, findWasmBase64Literals } from "./wasmDigests.mts";

/**
 * The wasm digests feed a signed manifest, so a miss here is not a cosmetic
 * bug: a module the manifest fails to declare is a module the extension
 * refuses to let compile, and both libsodium (encryption) and react-pdf
 * (export) abort when their wasm is blocked.
 *
 * Tested against synthetic bundles so the assertions do not depend on how a
 * particular dependency version happens to embed its module.
 */

/**
 * A minimal but structurally valid module: "\0asm", version 1, then a type
 * section id, then filler. The section id matters — see the byte-8 test
 * below.
 */
function fakeWasm(filler: string, sectionId = 0x01): Buffer {
  return Buffer.concat([
    Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, sectionId]),
    Buffer.from(filler, "utf8"),
  ]);
}

const wasmA = fakeWasm("module-a-body");
const wasmB = fakeWasm("module-b-body-which-differs");

const digestOf = (b: Buffer) =>
  createHash("sha256").update(b).digest("base64url");

describe("findWasmBase64Literals", () => {
  it("finds a bare base64 literal, the shape libsodium uses", () => {
    const source = "var decode=(e)=>{...};const bin=decode(`" +
      wasmA.toString("base64") + "`);";
    expect(findWasmBase64Literals(source)).toEqual([wasmA.toString("base64")]);
  });

  it("finds a data: URI literal, the shape react-pdf uses", () => {
    const source =
      'var te=`data:application/octet-stream;base64,' +
      wasmA.toString("base64") + "`;";
    // The run starts at the preamble, so the data: prefix is not included.
    expect(findWasmBase64Literals(source)).toEqual([wasmA.toString("base64")]);
  });

  it("finds several modules in one source", () => {
    const source = `a="${wasmA.toString("base64")}";b="${wasmB.toString("base64")}"`;
    expect(findWasmBase64Literals(source)).toHaveLength(2);
  });

  it("stops at the closing delimiter rather than swallowing the rest", () => {
    const source = "`" + wasmA.toString("base64") + "`;const after=1;";
    const [literal] = findWasmBase64Literals(source);
    expect(literal).toBe(wasmA.toString("base64"));
    expect(literal).not.toContain("const");
  });

  it("returns nothing for a bundle with no wasm", () => {
    expect(findWasmBase64Literals("const x = 1; // AGFzb is not the prefix")).toEqual([]);
  });

  it("does not depend on the byte after the header", () => {
    // The base64 prefix is trimmed to the 8 header bytes precisely so that
    // byte 8 is unconstrained. A longer prefix would silently skip any module
    // whose first section id is >= 64.
    const odd = fakeWasm("body", 0xf0);
    expect(findWasmBase64Literals("`" + odd.toString("base64") + "`")).toEqual([
      odd.toString("base64"),
    ]);
  });
});

describe("collectWasmModules", () => {
  it("digests each embedded module", () => {
    const modules = collectWasmModules([
      "x=`" + wasmA.toString("base64") + "`",
      "y=`" + wasmB.toString("base64") + "`",
    ]);
    expect(modules.map((m) => m.digest).sort()).toEqual(
      [digestOf(wasmA), digestOf(wasmB)].sort(),
    );
  });

  it("reports the decoded byte length, not the base64 length", () => {
    const [only] = collectWasmModules(["`" + wasmA.toString("base64") + "`"]);
    expect(only.byteLength).toBe(wasmA.length);
  });

  it("emits base64url with no padding, as the manifest requires", () => {
    for (const m of collectWasmModules(["`" + wasmA.toString("base64") + "`"])) {
      expect(m.digest).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(m.digest).not.toContain("=");
    }
  });

  it("sorts by digest so the output is stable across builds", () => {
    // Chunk naming and directory order must not change the manifest input.
    const forward = collectWasmModules([
      "`" + wasmA.toString("base64") + "`",
      "`" + wasmB.toString("base64") + "`",
    ]);
    const reversed = collectWasmModules([
      "`" + wasmB.toString("base64") + "`",
      "`" + wasmA.toString("base64") + "`",
    ]);
    expect(forward).toEqual(reversed);
  });

  it("ignores a base64 run that decodes to something other than wasm", () => {
    // The prefix can occur by chance; only a real \0asm header counts.
    const notWasm = Buffer.from("AGFzbQEAAAAnotarealmodule", "utf8").toString("base64");
    expect(collectWasmModules([`"${notWasm}"`])).toEqual([]);
  });

  it("returns an empty list when a bundle genuinely has none", () => {
    expect(collectWasmModules(["const a = 1;", "const b = 2;"])).toEqual([]);
  });
});
