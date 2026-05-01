import { getMaxCiphertextBytes, getWriteRateLimitPerMin } from "@/lib/cloud/config";
import { getCollection, getUpdatesCollection } from "@/lib/cloud/db";
import {
  internalError,
  isPlausibleId,
  json,
  jsonError,
  readJsonBody,
  validCiphertext,
} from "@/lib/cloud/helpers";
import { rateLimit } from "@/lib/cloud/rateLimit";
import { publish } from "@/lib/cloud/pubsub";
import { todayUtc } from "@/lib/cloud/types";

/**
 * POST /api/matrix/:id/updates — append one encrypted Y.Doc update.
 *
 * Body: `{ ciphertext: "v1.…", clientId }`. Server atomically increments
 * the matrix record's `headSeq` to assign a monotonic `seq`, persists the
 * update, then fans it out to every SSE subscriber for this record.
 *
 * No `expectedVersion` and no 409 — concurrent appends from two devices
 * both succeed and end up at adjacent seqs. Convergence happens client-
 * side via Yjs merge.
 *
 * Rate-limited per source IP. Server stores opaque ciphertext only.
 */

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: RouteParams) {
  const limited = await rateLimit(req, getWriteRateLimitPerMin());
  if (limited) return limited;

  const { id } = await ctx.params;
  if (!isPlausibleId(id)) return jsonError(404, "not found");

  const body = (await readJsonBody(req)) as
    | { ciphertext?: unknown; clientId?: unknown }
    | null;
  const ct = body?.ciphertext;
  const clientId = body?.clientId;
  if (!validCiphertext(ct)) return jsonError(400, "invalid ciphertext");
  if (typeof clientId !== "string" || clientId.length === 0 || clientId.length > 64) {
    return jsonError(400, "invalid clientId");
  }
  if (ct.length > getMaxCiphertextBytes()) {
    return jsonError(413, "ciphertext too large");
  }

  try {
    const coll = await getCollection();
    const today = todayUtc();
    // Atomic seq assignment: bump headSeq on the matrix doc and read back
    // the new value. If the record doesn't exist, we get null — surface as
    // 404. (Race-safe because Mongo's findOneAndUpdate is atomic per-doc.)
    const updated = await coll.findOneAndUpdate(
      { _id: id },
      { $inc: { headSeq: 1 }, $set: { lastWriteDate: today } },
      { returnDocument: "after" },
    );
    if (!updated) return jsonError(404, "not found");
    const seq = updated.headSeq;

    const updatesColl = await getUpdatesCollection();
    await updatesColl.insertOne({
      recordId: id,
      seq,
      ciphertext: ct,
      clientId,
      createdAt: new Date().toISOString(),
    });
    publish(id, { seq, ciphertext: ct, clientId });
    return json(201, { seq });
  } catch (err) {
    return internalError(err);
  }
}
