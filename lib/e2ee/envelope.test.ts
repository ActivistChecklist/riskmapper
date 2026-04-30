import { describe, expect, it } from "vitest";
import {
  DecryptError,
  ENVELOPE_PREFIX_V1,
  EnvelopeVersionError,
  KEY_BYTES,
  NONCE_BYTES,
  SCHEMA_VERSION,
  buildAad,
  decryptPayload,
  encryptPayload,
  generateKey,
  keyFromB64,
  keyToB64,
} from "./envelope";
import { base64urlDecode, base64urlEncode } from "./base64url";

type Snap = { pool: string[]; n: number };

const sample: Snap = { pool: ["alpha", "beta", "gamma"], n: 7 };

async function makeKey(): Promise<Uint8Array> {
  return generateKey();
}

describe("envelope encrypt/decrypt", () => {
  it("round-trips a payload", async () => {
    const key = await makeKey();
    const aad = { recordId: "rec-1", schemaVersion: SCHEMA_VERSION, version: 1, lamport: 0 };
    const { envelope } = await encryptPayload({
      payload: { schemaVersion: SCHEMA_VERSION, title: "Top secret", snapshot: sample, lamport: 0 },
      key,
      aad,
    });
    expect(envelope.startsWith(ENVELOPE_PREFIX_V1)).toBe(true);
    const out = await decryptPayload<Snap>({ envelope, key, aad });
    expect(out.title).toBe("Top secret");
    expect(out.snapshot).toEqual(sample);
    expect(out.lamport).toBe(0);
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("rejects v2 envelopes loudly", async () => {
    const key = await makeKey();
    const aad = { recordId: "rec-1", schemaVersion: SCHEMA_VERSION, version: 1, lamport: 0 };
    await expect(decryptPayload({ envelope: "v2.AAAA", key, aad })).rejects.toBeInstanceOf(EnvelopeVersionError);
  });

  it("rejects unknown envelope versions", async () => {
    const key = await makeKey();
    const aad = { recordId: "rec-1", schemaVersion: SCHEMA_VERSION, version: 1, lamport: 0 };
    await expect(decryptPayload({ envelope: "v9.AAAA", key, aad })).rejects.toBeInstanceOf(EnvelopeVersionError);
    await expect(decryptPayload({ envelope: "garbage", key, aad })).rejects.toBeInstanceOf(EnvelopeVersionError);
  });

  it("fails decrypt when AAD recordId differs (cross-row replay)", async () => {
    const key = await makeKey();
    const aadEnc = { recordId: "rec-1", schemaVersion: SCHEMA_VERSION, version: 1, lamport: 0 };
    const { envelope } = await encryptPayload({
      payload: { schemaVersion: SCHEMA_VERSION, title: "x", snapshot: sample, lamport: 0 },
      key,
      aad: aadEnc,
    });
    const aadDec = { ...aadEnc, recordId: "rec-2" };
    await expect(decryptPayload({ envelope, key, aad: aadDec })).rejects.toBeInstanceOf(DecryptError);
  });

  it("fails decrypt when AAD version or lamport differs (rollback / metadata tampering)", async () => {
    const key = await makeKey();
    const aadEnc = { recordId: "rec-1", schemaVersion: SCHEMA_VERSION, version: 5, lamport: 3 };
    const { envelope } = await encryptPayload({
      payload: { schemaVersion: SCHEMA_VERSION, title: "x", snapshot: sample, lamport: 3 },
      key,
      aad: aadEnc,
    });
    await expect(
      decryptPayload({ envelope, key, aad: { ...aadEnc, version: 4 } }),
    ).rejects.toBeInstanceOf(DecryptError);
    await expect(
      decryptPayload({ envelope, key, aad: { ...aadEnc, lamport: 4 } }),
    ).rejects.toBeInstanceOf(DecryptError);
  });

  it("fails decrypt when ciphertext is tampered", async () => {
    const key = await makeKey();
    const aad = { recordId: "rec-1", schemaVersion: SCHEMA_VERSION, version: 1, lamport: 0 };
    const { envelope } = await encryptPayload({
      payload: { schemaVersion: SCHEMA_VERSION, title: "x", snapshot: sample, lamport: 0 },
      key,
      aad,
    });
    const body = base64urlDecode(envelope.slice(ENVELOPE_PREFIX_V1.length));
    body[body.length - 1] ^= 0x01;
    const tampered = ENVELOPE_PREFIX_V1 + base64urlEncode(body);
    await expect(decryptPayload({ envelope: tampered, key, aad })).rejects.toBeInstanceOf(DecryptError);
  });

  it("fails decrypt with wrong key", async () => {
    const key1 = await makeKey();
    const key2 = await makeKey();
    const aad = { recordId: "rec-1", schemaVersion: SCHEMA_VERSION, version: 1, lamport: 0 };
    const { envelope } = await encryptPayload({
      payload: { schemaVersion: SCHEMA_VERSION, title: "x", snapshot: sample, lamport: 0 },
      key: key1,
      aad,
    });
    await expect(decryptPayload({ envelope, key: key2, aad })).rejects.toBeInstanceOf(DecryptError);
  });

  it("uses a fresh nonce per encrypt", async () => {
    const key = await makeKey();
    const aad = { recordId: "rec-1", schemaVersion: SCHEMA_VERSION, version: 1, lamport: 0 };
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const { envelope } = await encryptPayload({
        payload: { schemaVersion: SCHEMA_VERSION, title: "x", snapshot: sample, lamport: 0 },
        key,
        aad,
      });
      const body = base64urlDecode(envelope.slice(ENVELOPE_PREFIX_V1.length));
      const nonce = body.slice(1, 1 + NONCE_BYTES);
      seen.add(base64urlEncode(nonce));
    }
    expect(seen.size).toBe(20);
  });

  it("ciphertext size hides plaintext-length differences within a 4 KiB block", async () => {
    const key = await makeKey();
    const aad = { recordId: "rec-1", schemaVersion: SCHEMA_VERSION, version: 1, lamport: 0 };
    const tiny = await encryptPayload({
      payload: { schemaVersion: SCHEMA_VERSION, title: "a", snapshot: { pool: [], n: 0 }, lamport: 0 },
      key,
      aad,
    });
    const fat = await encryptPayload({
      payload: {
        schemaVersion: SCHEMA_VERSION,
        title: "a much, much longer title — but still under one block",
        snapshot: { pool: ["x".repeat(50), "y".repeat(50)], n: 1 },
        lamport: 0,
      },
      key,
      aad,
    });
    expect(tiny.envelope.length).toBe(fat.envelope.length);
  });
});

describe("buildAad", () => {
  it("includes recordId, schemaVersion, version, lamport", () => {
    const a = buildAad({ recordId: "rec-1", schemaVersion: SCHEMA_VERSION, version: 1, lamport: 0 });
    const b = buildAad({ recordId: "rec-1", schemaVersion: SCHEMA_VERSION, version: 1, lamport: 0 });
    expect(a).toEqual(b);
    const c = buildAad({ recordId: "rec-1", schemaVersion: SCHEMA_VERSION, version: 2, lamport: 0 });
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
