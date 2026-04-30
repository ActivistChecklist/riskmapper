import { describe, expect, it } from "vitest";
import { base64urlDecode, base64urlEncode } from "./base64url";

describe("base64url", () => {
  it("round-trips arbitrary bytes", () => {
    for (const len of [0, 1, 2, 3, 4, 5, 31, 32, 33, 100, 4096]) {
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = (i * 31 + 7) & 0xff;
      const enc = base64urlEncode(bytes);
      expect(enc).not.toMatch(/[+/=]/);
      const dec = base64urlDecode(enc);
      expect(dec).toEqual(bytes);
    }
  });

  it("rejects non-base64url characters", () => {
    expect(() => base64urlDecode("abc!")).toThrow(/Invalid base64url/);
    expect(() => base64urlDecode("a b")).toThrow(/Invalid base64url/);
    expect(() => base64urlDecode("a==")).toThrow(/Invalid base64url/);
  });

  it("encodes a known vector (RFC 4648)", () => {
    const bytes = new TextEncoder().encode("hello");
    expect(base64urlEncode(bytes)).toBe("aGVsbG8");
  });

  it("handles inputs larger than the chunk size", () => {
    const bytes = new Uint8Array(20_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i & 0xff;
    expect(base64urlDecode(base64urlEncode(bytes))).toEqual(bytes);
  });
});
