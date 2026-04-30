import { MAX_CIPHERTEXT_BYTES, WRITE_RATE_LIMIT_PER_MIN } from "@/lib/cloud/config";
import { getCollection } from "@/lib/cloud/db";
import {
  internalError,
  isDuplicateKey,
  isPlausibleId,
  json,
  jsonError,
  readJsonBody,
  validCiphertext,
} from "@/lib/cloud/helpers";
import { rateLimit } from "@/lib/cloud/rateLimit";
import type { MatrixDoc } from "@/lib/cloud/types";
import { todayUtc } from "@/lib/cloud/types";

/**
 * POST /api/matrix — create a new encrypted record.
 *
 * Body: `{ id, ciphertext: "v1.…" }`. The id is client-minted (a randomUUID
 * matching `^[A-Za-z0-9_-]{16,64}$`) so the ciphertext can be encrypted with
 * AAD bound to the canonical id on the first try. Server validates and
 * echoes the id back; the client refuses if the echo differs.
 *
 * Rate-limited per source IP (see rateLimit). Server stores opaque
 * ciphertext only — see THREAT-MODEL.md.
 */

export const runtime = "nodejs";

export async function POST(req: Request) {
  const limited = await rateLimit(req, WRITE_RATE_LIMIT_PER_MIN);
  if (limited) return limited;

  const body = (await readJsonBody(req)) as { id?: unknown; ciphertext?: unknown } | null;
  const ct = body?.ciphertext;
  if (!validCiphertext(ct)) return jsonError(400, "invalid ciphertext");
  if (ct.length > MAX_CIPHERTEXT_BYTES) return jsonError(413, "ciphertext too large");
  if (typeof body?.id !== "string" || !isPlausibleId(body.id)) {
    return jsonError(400, "invalid id");
  }

  const id = body.id;
  const today = todayUtc();
  const doc: MatrixDoc = {
    _id: id,
    ciphertext: ct,
    lamport: 1,
    version: 1,
    createdDate: today,
    lastWriteDate: today,
    lastReadDate: null,
  };
  try {
    const coll = await getCollection();
    await coll.insertOne(doc);
  } catch (err) {
    // Duplicate-key → astronomically unlikely with 128-bit randomUUID, but
    // reject cleanly. Anything else is a 500.
    if (isDuplicateKey(err)) return jsonError(409, "id already exists");
    return internalError(err);
  }
  return json(201, {
    id,
    version: 1,
    createdDate: today,
    lastWriteDate: today,
    lastReadDate: null,
  });
}
