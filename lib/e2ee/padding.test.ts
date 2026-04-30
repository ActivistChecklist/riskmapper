import { describe, expect, it } from "vitest";
import { PAD_BLOCK, padPlaintext, unpadPlaintext } from "./padding";

describe("padPlaintext / unpadPlaintext", () => {
  it("pads to next 4 KiB boundary and round-trips", () => {
    for (const len of [0, 1, 100, 4095, 4096, 4097, 9000]) {
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = (i + 1) & 0xff;
      const padded = padPlaintext(bytes);
      expect(padded.length % PAD_BLOCK).toBe(0);
      expect(padded.length).toBeGreaterThan(len);
      const unpadded = unpadPlaintext(padded);
      expect(unpadded).toEqual(bytes);
    }
  });

  it("hides plaintext-length differences below the block boundary", () => {
    const a = padPlaintext(new TextEncoder().encode("a"));
    const b = padPlaintext(new TextEncoder().encode("a".repeat(100)));
    expect(a.length).toBe(b.length);
    expect(a.length).toBe(PAD_BLOCK);
  });

  it("rejects corrupt padding", () => {
    const bad = new Uint8Array(PAD_BLOCK).fill(0);
    expect(() => unpadPlaintext(bad)).toThrow(/missing 0x80 marker/);
    const wrongMarker = new Uint8Array(PAD_BLOCK);
    wrongMarker[0] = 0xff;
    expect(() => unpadPlaintext(wrongMarker)).toThrow(/corrupted padding/);
  });

  it("custom block size", () => {
    const padded = padPlaintext(new Uint8Array([1, 2, 3]), 16);
    expect(padded.length).toBe(16);
    expect(unpadPlaintext(padded)).toEqual(new Uint8Array([1, 2, 3]));
  });
});
