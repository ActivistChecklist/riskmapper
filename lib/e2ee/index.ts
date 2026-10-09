export {
  DecryptError,
  ENVELOPE_PREFIX_V1,
  ENVELOPE_PREFIX_V2,
  EnvelopeVersionError,
  KEY_BYTES,
  SCHEMA_VERSION,
  buildAad,
  decryptBytes,
  encryptBytes,
  generateKey,
  keyFromB64,
  keyToB64,
} from "./envelope";
export type { AadParams, EncryptedPayload, SchemaVersion } from "./envelope";
export {
  WRITE_AUTH_CONTEXT,
  WRITE_TOKEN_BYTES,
  deriveWriteToken,
} from "./writeAuth";
export { base64urlDecode, base64urlEncode } from "./base64url";
export { __resetSodiumForTests, getSodium } from "./sodium";
