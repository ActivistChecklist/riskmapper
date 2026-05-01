import { base64urlDecode, base64urlEncode } from "./base64url";
import { padPlaintext, unpadPlaintext } from "./padding";
import { getSodium } from "./sodium";

/**
 * Versioned ciphertext-on-the-wire format:
 *
 *   v1.<base64url( algId(1B) || nonce(24B) || ciphertext )>
 *
 * AAD (not stored, reconstructed at decrypt time):
 *   recordId (utf8) || schemaVersion(1B)
 *
 * Plaintext is an arbitrary `Uint8Array` (typically a Yjs binary update or
 * a Yjs state-as-update baseline). Bytes are padded to fixed-size blocks
 * before encryption so observed ciphertext length doesn't reveal a tight
 * bound on payload size.
 *
 * Binding `recordId` into AAD prevents the server from swapping ciphertext
 * across records: a cross-record swap would force AAD mismatch and a
 * decrypt failure rather than silently substituting another matrix's data.
 */

export const ENVELOPE_PREFIX_V1 = "v1.";
export const ENVELOPE_PREFIX_V2 = "v2.";
export const ALG_ID_XCHACHA20_POLY1305 = 0x01;
export const NONCE_BYTES = 24;
export const KEY_BYTES = 32;
export const SCHEMA_VERSION = 2 as const;

const TEXT_ENCODER = new TextEncoder();

export type SchemaVersion = typeof SCHEMA_VERSION;

export type AadParams = {
  recordId: string;
  schemaVersion: SchemaVersion;
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

export function buildAad(params: AadParams): Uint8Array {
  const idBytes = TEXT_ENCODER.encode(params.recordId);
  const out = new Uint8Array(idBytes.length + 1);
  out.set(idBytes, 0);
  out[idBytes.length] = params.schemaVersion & 0xff;
  return out;
}

export async function encryptBytes(args: {
  bytes: Uint8Array;
  key: Uint8Array;
  aad: AadParams;
}): Promise<EncryptedPayload> {
  if (args.key.length !== KEY_BYTES) {
    throw new Error(`encryptBytes: key must be ${KEY_BYTES} bytes`);
  }
  if (args.aad.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`encryptBytes: schemaVersion must be ${SCHEMA_VERSION}`);
  }
  const sodium = await getSodium();
  const padded = padPlaintext(args.bytes);
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

export async function decryptBytes(args: {
  envelope: string;
  key: Uint8Array;
  aad: AadParams;
}): Promise<Uint8Array> {
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

  try {
    return unpadPlaintext(padded);
  } catch {
    throw new DecryptError("Plaintext padding is corrupt");
  }
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
