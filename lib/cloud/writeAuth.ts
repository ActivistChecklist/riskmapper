import { createHash, timingSafeEqual } from "node:crypto";
import { jsonError } from "./helpers";
import type { AppCollection } from "./types";

/**
 * Server half of write authorization. The client half, and why the token
 * looks the way it does, is in `lib/e2ee/writeAuth.ts`.
 *
 * Every write (create, append, compaction, delete) carries
 * `Authorization: Bearer <token>`, where the token is derived from the
 * matrix key in the browser. The server keeps only `SHA-256(token)` as
 * `writeHash` on the matrix record and compares against that. It never
 * sees the key and cannot derive it from the token.
 *
 * Records created before this existed have no `writeHash`. The first write
 * (or read, see GET /api/matrix/:id) that presents a well-formed token sets
 * it, and from then on only that token is accepted. Because the token is
 * deterministic from the key, every holder of the link sets the same hash.
 * The cost is trust on first use: someone with only the id who gets there
 * before anyone with the link can claim a legacy record for themselves. That
 * is no worse than before this change, when they could already delete it,
 * and the window closes the first time anyone with the link opens it. Idle
 * records expire after 90 days (see `lib/cloud/db.ts`), so once the change
 * has been live that long, every remaining record has a `writeHash`.
 */

const TOKEN_RE = /^Bearer ([A-Za-z0-9_-]{43})$/;

/** The bearer token on the request, or null if absent or malformed. */
export function readWriteToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (header === null) return null;
  const m = TOKEN_RE.exec(header);
  return m ? m[1] : null;
}

export function hashWriteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

function sameHash(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Set `writeHash` on a legacy record that has none. Atomic: only one
 * claimant can win, and a record that already has a hash is never changed.
 * Returns the hash the record ends up with, or null if it doesn't exist.
 */
export async function claimLegacyRecord(
  coll: AppCollection,
  id: string,
  writeHash: string,
): Promise<string | null> {
  const claimed = await coll.findOneAndUpdate(
    { _id: id, writeHash: { $exists: false } },
    { $set: { writeHash } },
    { returnDocument: "after" },
  );
  if (claimed) return writeHash;
  const current = await coll.findOne({ _id: id });
  return current?.writeHash ?? null;
}

/**
 * Check the request's write token against the record. Returns null when the
 * write may proceed, otherwise the error response to send:
 *
 *   401  no token, or not a well-formed one
 *   403  a token that doesn't match the record
 *   404  no such record
 *
 * Callers must check this before touching the record. `writeHash` never
 * changes once set, so checking first and writing second is not racy.
 */
export async function authorizeWrite(
  coll: AppCollection,
  id: string,
  req: Request,
): Promise<Response | null> {
  const token = readWriteToken(req);
  if (token === null) return jsonError(401, "write token required");
  const presented = hashWriteToken(token);

  const doc = await coll.findOne({ _id: id });
  if (!doc) return jsonError(404, "not found");

  const stored =
    doc.writeHash ?? (await claimLegacyRecord(coll, id, presented));
  if (stored === null) return jsonError(404, "not found");
  return sameHash(stored, presented) ? null : jsonError(403, "forbidden");
}
