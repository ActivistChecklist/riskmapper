/**
 * Pad a UTF-8 plaintext byte sequence up to the next 4 KiB boundary so that
 * an observer of ciphertext sizes cannot infer fine-grained edits. Uses an
 * ISO/IEC 7816-4 style scheme: append 0x80 then 0x00 bytes to the boundary.
 *
 * Why: ciphertext length ≈ plaintext length + 16; without padding, a passive
 * observer of writes can infer "user added a long line" vs "reordered". See
 * THREAT-MODEL.md (O8).
 */
export const PAD_BLOCK = 4096;

export function padPlaintext(bytes: Uint8Array, block: number = PAD_BLOCK): Uint8Array {
  if (block <= 0) throw new Error("padPlaintext: block must be > 0");
  const target = (Math.floor(bytes.length / block) + 1) * block;
  const out = new Uint8Array(target);
  out.set(bytes, 0);
  out[bytes.length] = 0x80;
  return out;
}

export function unpadPlaintext(padded: Uint8Array): Uint8Array {
  for (let i = padded.length - 1; i >= 0; i--) {
    const b = padded[i];
    if (b === 0x00) continue;
    if (b === 0x80) return padded.slice(0, i);
    throw new Error("unpadPlaintext: corrupted padding");
  }
  throw new Error("unpadPlaintext: missing 0x80 marker");
}
