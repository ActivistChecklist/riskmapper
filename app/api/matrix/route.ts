import { getMaxCiphertextBytes, getWriteRateLimitPerMin } from "@/lib/cloud/config";
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
 * Body: `{ id, baseline: "v1.…" }`. The id is client-minted (a 96-bit
 * random base64url string matching `^[A-Za-z0-9_-]{16,64}$`) so the
 * baseline can be encrypted with AAD bound to the canonical id on the
 * first try. Server validates and echoes the id back; the client refuses
 * if the echo differs.
 *
 * `baseline` is the encrypted Y.Doc state-as-update at the moment of
 * creation. The matrix's update log starts empty (`headSeq = baselineSeq
 * = 0`). All subsequent edits flow through POST /api/matrix/:id/updates.
 *
 * Rate-limited per source IP. Server stores opaque ciphertext only — see
 * THREAT-MODEL.md.
 */

export const runtime = "nodejs";

export async function POST(req: Request) {
  const limited = await rateLimit(req, getWriteRateLimitPerMin());
  if (limited) return limited;

  const body = (await readJsonBody(req)) as
    | { id?: unknown; baseline?: unknown }
    | null;
  const baseline = body?.baseline;
  if (!validCiphertext(baseline)) return jsonError(400, "invalid baseline");
  if (baseline.length > getMaxCiphertextBytes()) {
    return jsonError(413, "baseline too large");
  }
  if (typeof body?.id !== "string" || !isPlausibleId(body.id)) {
    return jsonError(400, "invalid id");
  }

  const id = body.id;
  const today = todayUtc();
  const doc: MatrixDoc = {
    _id: id,
    baseline,
    baselineSeq: 0,
    headSeq: 0,
    createdDate: today,
    lastWriteDate: today,
    lastReadDate: null,
  };
  try {
    const coll = await getCollection();
    await coll.insertOne(doc);
  } catch (err) {
    if (isDuplicateKey(err)) return jsonError(409, "id already exists");
    return internalError(err);
  }
  return json(201, {
    id,
    baselineSeq: 0,
    headSeq: 0,
    createdDate: today,
    lastWriteDate: today,
    lastReadDate: null,
  });
}
