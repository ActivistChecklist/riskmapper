import { base64urlEncode } from "./base64url";
import { KEY_BYTES } from "./envelope";
import { getSodium } from "./sodium";

/**
 * Write authorization for a shared matrix.
 *
 * The record id travels to the server (it is in the URL path), so it cannot
 * be what authorizes a write: anyone who sees an access log line would be
 * able to delete the matrix or append junk to it. The key never leaves the
 * browser, so it cannot be shown to the server either. The write token sits
 * between the two: a one-way derivation of the key that the server can
 * check but cannot turn back into the key.
 *
 *   token = BLAKE2b-256(key = matrix key, message = context || 0x00 || recordId)
 *
 * Keyed BLAKE2b is a PRF, so the token reveals nothing about the key, and a
 * different primitive and a fixed context string keep it separate from the
 * XChaCha20-Poly1305 encryption that uses the same key. Binding the record
 * id means a token is only good for the matrix it was minted for.
 *
 * Every holder of the link derives the same token, which is what lets the
 * server accept edits from all of them. The server stores only a SHA-256 of
 * the token (see `lib/cloud/writeAuth.ts`), so a database dump does not
 * hand out write access either.
 */

export const WRITE_AUTH_CONTEXT = "riskmapper/write-auth/v1";
export const WRITE_TOKEN_BYTES = 32;

export async function deriveWriteToken(args: {
  key: Uint8Array;
  recordId: string;
}): Promise<string> {
  if (args.key.length !== KEY_BYTES) {
    throw new Error(`deriveWriteToken: key must be ${KEY_BYTES} bytes`);
  }
  const sodium = await getSodium();
  // A string, not TextEncoder output: libsodium UTF-8 encodes it itself, and
  // under jsdom TextEncoder returns a Uint8Array from another realm, which
  // libsodium's type check rejects.
  const message = `${WRITE_AUTH_CONTEXT}\0${args.recordId}`;
  const token = sodium.crypto_generichash(WRITE_TOKEN_BYTES, message, args.key);
  return base64urlEncode(token);
}
