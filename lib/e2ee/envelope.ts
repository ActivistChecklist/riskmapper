import { base64urlDecode, base64urlEncode } from "./base64url";
import { padPlaintext, unpadPlaintext } from "./padding";
import { getSodium } from "./sodium";

/**
 * Versioned ciphertext-on-the-wire format:
 *
 *   v1.<base64url( algId(1B) || nonce(24B) || ciphertext )>
 *
 * AAD (not stored, reconstructed at decrypt time):
 *   recordId (utf8) || schemaVersion(1B) || version(8B BE) || lamport(8B BE)
 *
 * Binding version+lamport into AAD means a server that rewrites them forces a
 * decrypt failure rather than silently substituting an old payload. See
 * THREAT-MODEL.md S3.
 */

export const ENVELOPE_PREFIX_V1 = "v1.";
export const ENVELOPE_PREFIX_V2 = "v2.";
export const ALG_ID_XCHACHA20_POLY1305 = 0x01;
export const NONCE_BYTES = 24;
export const KEY_BYTES = 32;
export const SCHEMA_VERSION = 1 as const;

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

export type SchemaVersion = typeof SCHEMA_VERSION;

export type AadParams = {
  recordId: string;
  schemaVersion: SchemaVersion;
  version: number;
  lamport: number;
};

export type EncryptedPayload = {
  envelope: string;
};

export class DecryptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecryptError";
  }
}

export class EnvelopeVersionError extends DecryptError {
  constructor(version: string) {
    super(
      `Unsupported envelope version "${version}". Update Risk Matrix to a newer version.`,
    );
    this.name = "EnvelopeVersionError";
  }
}

function writeUint64BE(target: Uint8Array, offset: number, value: number): void {
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error("writeUint64BE: value must be a non-negative integer");
  }
  if (value > Number.MAX_SAFE_INTEGER) {
    throw new Error("writeUint64BE: value exceeds MAX_SAFE_INTEGER");
  }
  // Split into high (bits 32..52) and low (bits 0..31) halves.
  const high = Math.floor(value / 0x1_0000_0000);
  const low = value >>> 0;
  target[offset + 0] = (high >>> 24) & 0xff;
  target[offset + 1] = (high >>> 16) & 0xff;
  target[offset + 2] = (high >>> 8) & 0xff;
  target[offset + 3] = high & 0xff;
  target[offset + 4] = (low >>> 24) & 0xff;
  target[offset + 5] = (low >>> 16) & 0xff;
  target[offset + 6] = (low >>> 8) & 0xff;
  target[offset + 7] = low & 0xff;
}

export function buildAad(params: AadParams): Uint8Array {
  const idBytes = TEXT_ENCODER.encode(params.recordId);
  const out = new Uint8Array(idBytes.length + 1 + 8 + 8);
  out.set(idBytes, 0);
  out[idBytes.length] = params.schemaVersion & 0xff;
  writeUint64BE(out, idBytes.length + 1, params.version);
  writeUint64BE(out, idBytes.length + 1 + 8, params.lamport);
  return out;
}

export type PlaintextPayload<S> = {
  schemaVersion: SchemaVersion;
  title: string;
  snapshot: S;
  lamport: number;
};

export async function encryptPayload<S>(args: {
  payload: PlaintextPayload<S>;
  key: Uint8Array;
  aad: AadParams;
}): Promise<EncryptedPayload> {
  if (args.key.length !== KEY_BYTES) {
    throw new Error(`encryptPayload: key must be ${KEY_BYTES} bytes`);
  }
  if (args.payload.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`encryptPayload: schemaVersion must be ${SCHEMA_VERSION}`);
  }
  const sodium = await getSodium();
  const json = JSON.stringify(args.payload);
  const utf8 = TEXT_ENCODER.encode(json);
  const padded = padPlaintext(utf8);
  const nonce = sodium.randombytes_buf(NONCE_BYTES);
  const aadBytes = buildAad(args.aad);
  const ct = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    padded,
    aadBytes,
    null,
    nonce,
    args.key,
  );
  const body = new Uint8Array(1 + NONCE_BYTES + ct.length);
  body[0] = ALG_ID_XCHACHA20_POLY1305;
  body.set(nonce, 1);
  body.set(ct, 1 + NONCE_BYTES);
  const envelope = ENVELOPE_PREFIX_V1 + base64urlEncode(body);
  return { envelope };
}

export async function decryptPayload<S>(args: {
  envelope: string;
  key: Uint8Array;
  aad: AadParams;
}): Promise<PlaintextPayload<S>> {
  const { envelope } = args;
  if (typeof envelope !== "string" || envelope.length === 0) {
    throw new DecryptError("Empty envelope");
  }
  if (envelope.startsWith(ENVELOPE_PREFIX_V2)) {
    throw new EnvelopeVersionError("v2");
  }
  if (!envelope.startsWith(ENVELOPE_PREFIX_V1)) {
    const dot = envelope.indexOf(".");
    const tag = dot > 0 ? envelope.slice(0, dot) : "unknown";
    throw new EnvelopeVersionError(tag);
  }
  if (args.key.length !== KEY_BYTES) {
    throw new DecryptError("Wrong key length");
  }

  let body: Uint8Array;
  try {
    body = base64urlDecode(envelope.slice(ENVELOPE_PREFIX_V1.length));
  } catch {
    throw new DecryptError("Envelope is not valid base64url");
  }
  if (body.length < 1 + NONCE_BYTES + 16) {
    throw new DecryptError("Envelope is too short");
  }
  if (body[0] !== ALG_ID_XCHACHA20_POLY1305) {
    throw new DecryptError(`Unsupported algId 0x${body[0].toString(16)}`);
  }
  const nonce = body.slice(1, 1 + NONCE_BYTES);
  const ct = body.slice(1 + NONCE_BYTES);
  const aadBytes = buildAad(args.aad);

  const sodium = await getSodium();
  let padded: Uint8Array;
  try {
    padded = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ct,
      aadBytes,
      nonce,
      args.key,
    );
  } catch {
    throw new DecryptError(
      "Authentication failed — wrong key, tampered ciphertext, or rewritten metadata.",
    );
  }

  let pt: Uint8Array;
  try {
    pt = unpadPlaintext(padded);
  } catch {
    throw new DecryptError("Plaintext padding is corrupt");
  }
  const json = TEXT_DECODER.decode(pt);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new DecryptError("Decrypted plaintext is not valid JSON");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { schemaVersion?: unknown }).schemaVersion !== SCHEMA_VERSION ||
    typeof (parsed as { title?: unknown }).title !== "string" ||
    typeof (parsed as { lamport?: unknown }).lamport !== "number"
  ) {
    throw new DecryptError("Decrypted payload is malformed");
  }
  return parsed as PlaintextPayload<S>;
}

export async function generateKey(): Promise<Uint8Array> {
  const sodium = await getSodium();
  return sodium.randombytes_buf(KEY_BYTES);
}

export function keyToB64(key: Uint8Array): string {
  if (key.length !== KEY_BYTES) {
    throw new Error(`keyToB64: key must be ${KEY_BYTES} bytes`);
  }
  return base64urlEncode(key);
}

export function keyFromB64(b64: string): Uint8Array {
  const k = base64urlDecode(b64);
  if (k.length !== KEY_BYTES) {
    throw new Error(`keyFromB64: decoded key is ${k.length} bytes, expected ${KEY_BYTES}`);
  }
  return k;
}
