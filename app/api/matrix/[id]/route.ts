import { getCollection, getUpdatesCollection } from "@/lib/cloud/db";
import { getWriteRateLimitPerMin } from "@/lib/cloud/config";
import {
  internalError,
  isPlausibleId,
  json,
  jsonError,
} from "@/lib/cloud/helpers";
import { rateLimit } from "@/lib/cloud/rateLimit";
import { todayUtc, todayUtcDate } from "@/lib/cloud/types";

/**
 * GET    /api/matrix/:id            — read baseline + updates for cold load.
 *                                     Optional `?since=N` to skip baseline
 *                                     and return only updates with seq > N.
 *                                     Bumps `lastReadDate` to today.
 * DELETE /api/matrix/:id            — idempotent removal of the record AND
 *                                     all of its updates.
 *
 * Append-new-updates flows through `app/api/matrix/[id]/updates/route.ts`.
 * The live update stream is `app/api/matrix/[id]/events/route.ts` (SSE).
 *
 * Server stores opaque ciphertext only — see THREAT-MODEL.md.
 */

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: RouteParams) {
  const { id } = await ctx.params;
  if (!isPlausibleId(id)) return jsonError(404, "not found");
  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  let since: number | null = null;
  if (sinceParam !== null) {
    const n = Number(sinceParam);
    if (!Number.isInteger(n) || n < 0) {
      return jsonError(400, "invalid since");
    }
    since = n;
  }
  try {
    const coll = await getCollection();
    const today = todayUtc();
    const doc = await coll.findOneAndUpdate(
      { _id: id },
      { $set: { lastReadDate: today, lastActivityDate: todayUtcDate() } },
      { returnDocument: "after" },
    );
    if (!doc) return jsonError(404, "not found");

    const updatesColl = await getUpdatesCollection();
    // If the caller has already seen up through `since` AND `since` covers
    // the baseline, skip the baseline payload. Otherwise return baseline +
    // every update past it.
    const skipBaseline = since !== null && since >= doc.baselineSeq;
    const minSeq = skipBaseline ? since! : doc.baselineSeq;
    const updates = await updatesColl.findSorted({
      recordId: id,
      minSeqExclusive: minSeq,
    });
    return json(200, {
      baseline: skipBaseline ? null : doc.baseline,
      baselineSeq: doc.baselineSeq,
      headSeq: doc.headSeq,
      updates: updates.map((u) => ({
        seq: u.seq,
        ciphertext: u.ciphertext,
        clientId: u.clientId,
      })),
      createdDate: doc.createdDate,
      lastWriteDate: doc.lastWriteDate,
      lastReadDate: doc.lastReadDate,
    });
  } catch (err) {
    return internalError(err);
  }
}

export async function DELETE(req: Request, ctx: RouteParams) {
  const limited = await rateLimit(req, getWriteRateLimitPerMin());
  if (limited) return limited;

  const { id } = await ctx.params;
  if (!isPlausibleId(id)) return new Response(null, { status: 204 });
  try {
    const coll = await getCollection();
    const updatesColl = await getUpdatesCollection();
    await Promise.all([
      coll.deleteOne({ _id: id }),
      updatesColl.deleteMany({ recordId: id }),
    ]);
    return new Response(null, { status: 204 });
  } catch (err) {
    return internalError(err);
  }
}
