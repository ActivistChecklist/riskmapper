import { describe, expect, it } from "vitest";
import {
  DecryptError,
  ENVELOPE_PREFIX_V1,
  EnvelopeVersionError,
  KEY_BYTES,
  NONCE_BYTES,
  SCHEMA_VERSION,
  buildAad,
  decryptBytes,
  encryptBytes,
  generateKey,
  keyFromB64,
  keyToB64,
} from "./envelope";
import { base64urlDecode, base64urlEncode } from "./base64url";

const sample = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

async function makeKey(): Promise<Uint8Array> {
  return generateKey();
}

describe("envelope encrypt/decrypt", () => {
  it("round-trips a binary payload", async () => {
    const key = await makeKey();
    const aad = { recordId: "rec-1", schemaVersion: SCHEMA_VERSION };
    const { envelope } = await encryptBytes({ bytes: sample, key, aad });
    expect(envelope.startsWith(ENVELOPE_PREFIX_V1)).toBe(true);
    const out = await decryptBytes({ envelope, key, aad });
    expect(Array.from(out)).toEqual(Array.from(sample));
  });

  it("rejects v2 envelopes loudly", async () => {
    const key = await makeKey();
    const aad = { recordId: "rec-1", schemaVersion: SCHEMA_VERSION };
    await expect(decryptBytes({ envelope: "v2.AAAA", key, aad })).rejects.toBeInstanceOf(EnvelopeVersionError);
  });

  it("rejects unknown envelope versions", async () => {
    const key = await makeKey();
    const aad = { recordId: "rec-1", schemaVersion: SCHEMA_VERSION };
    await expect(decryptBytes({ envelope: "v9.AAAA", key, aad })).rejects.toBeInstanceOf(EnvelopeVersionError);
    await expect(decryptBytes({ envelope: "garbage", key, aad })).rejects.toBeInstanceOf(EnvelopeVersionError);
  });

  it("fails decrypt when AAD recordId differs (cross-row replay)", async () => {
    const key = await makeKey();
    const { envelope } = await encryptBytes({
      bytes: sample,
      key,
      aad: { recordId: "rec-1", schemaVersion: SCHEMA_VERSION },
    });
    await expect(
      decryptBytes({
        envelope,
        key,
        aad: { recordId: "rec-2", schemaVersion: SCHEMA_VERSION },
      }),
    ).rejects.toBeInstanceOf(DecryptError);
  });

  it("fails decrypt when ciphertext is tampered", async () => {
    const key = await makeKey();
    const aad = { recordId: "rec-1", schemaVersion: SCHEMA_VERSION };
    const { envelope } = await encryptBytes({ bytes: sample, key, aad });
    const body = base64urlDecode(envelope.slice(ENVELOPE_PREFIX_V1.length));
    body[body.length - 1] ^= 0x01;
    const tampered = ENVELOPE_PREFIX_V1 + base64urlEncode(body);
    await expect(decryptBytes({ envelope: tampered, key, aad })).rejects.toBeInstanceOf(DecryptError);
  });

  it("fails decrypt with wrong key", async () => {
    const key1 = await makeKey();
    const key2 = await makeKey();
    const aad = { recordId: "rec-1", schemaVersion: SCHEMA_VERSION };
    const { envelope } = await encryptBytes({ bytes: sample, key: key1, aad });
    await expect(decryptBytes({ envelope, key: key2, aad })).rejects.toBeInstanceOf(DecryptError);
  });

  it("uses a fresh nonce per encrypt", async () => {
    const key = await makeKey();
    const aad = { recordId: "rec-1", schemaVersion: SCHEMA_VERSION };
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const { envelope } = await encryptBytes({ bytes: sample, key, aad });
      const body = base64urlDecode(envelope.slice(ENVELOPE_PREFIX_V1.length));
      const nonce = body.slice(1, 1 + NONCE_BYTES);
      seen.add(base64urlEncode(nonce));
    }
    expect(seen.size).toBe(20);
  });

  it("ciphertext size hides plaintext-length differences within a 4 KiB block", async () => {
    const key = await makeKey();
    const aad = { recordId: "rec-1", schemaVersion: SCHEMA_VERSION };
    const tiny = await encryptBytes({ bytes: new Uint8Array([1]), key, aad });
    const fat = await encryptBytes({
      bytes: new Uint8Array(500).fill(7),
      key,
      aad,
    });
    expect(tiny.envelope.length).toBe(fat.envelope.length);
  });
});

describe("buildAad", () => {
  it("includes recordId and schemaVersion", () => {
    const a = buildAad({ recordId: "rec-1", schemaVersion: SCHEMA_VERSION });
    const b = buildAad({ recordId: "rec-1", schemaVersion: SCHEMA_VERSION });
    expect(a).toEqual(b);
    const c = buildAad({ recordId: "rec-2", schemaVersion: SCHEMA_VERSION });
    expect(a).not.toEqual(c);
  });
});

describe("key helpers", () => {
  it("round-trips key b64", async () => {
    const k = await makeKey();
    const enc = keyToB64(k);
    expect(enc.length).toBeGreaterThanOrEqual(43);
    expect(keyFromB64(enc)).toEqual(k);
  });

  it("rejects wrong-length keys", () => {
    expect(() => keyToB64(new Uint8Array(31))).toThrow();
    expect(() => keyFromB64(base64urlEncode(new Uint8Array(31)))).toThrow();
    expect(KEY_BYTES).toBe(32);
  });
});
