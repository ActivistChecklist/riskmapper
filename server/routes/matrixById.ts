import { getCollection, getUpdatesCollection } from "@/lib/cloud/db";
import { getWriteRateLimitPerMin } from "@/lib/cloud/config";
import {
  internalError,
  isPlausibleId,
  json,
  jsonError,
} from "@/lib/cloud/helpers";
import { rateLimit } from "@/lib/cloud/rateLimit";
import {
  authorizeWrite,
  claimLegacyRecord,
  hashWriteToken,
  readWriteToken,
} from "@/lib/cloud/writeAuth";
import { todayUtc, todayUtcDate } from "@/lib/cloud/types";

/**
 * GET    /api/matrix/:id            — read baseline + updates for cold load.
 *                                     Optional `?since=N` to skip baseline
 *                                     and return only updates with seq > N.
 *                                     Bumps `lastReadDate` to today.
 *                                     Reading needs no token, but a token
 *                                     sent here claims a legacy record
 *                                     that has no `writeHash` yet.
 * DELETE /api/matrix/:id            — idempotent removal of the record AND
 *                                     all of its updates. Requires the
 *                                     write token (lib/cloud/writeAuth.ts).
 *
 * Append-new-updates flows through `server/routes/matrixUpdates.ts`.
 * The live update stream is `server/routes/matrixEvents.ts` (SSE).
 *
 * Server stores opaque ciphertext only — see THREAT-MODEL.md.
 */


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

    // Close the legacy trust-on-first-use window as soon as someone with
    // the link opens the matrix, rather than waiting for their first edit.
    // Best effort: a failed claim must not fail the read.
    const token = readWriteToken(req);
    if (doc.writeHash === undefined && token !== null) {
      try {
        await claimLegacyRecord(coll, id, hashWriteToken(token));
      } catch (err) {
        console.error(
          "[risk-matrix-api] legacy write-auth claim failed:",
          err instanceof Error ? err.message : "unknown",
        );
      }
    }

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
    const denied = await authorizeWrite(coll, id, req);
    // Already gone: still idempotent. Any orphaned update rows are swept by
    // scripts/cleanup-orphan-updates.ts; without the record there is no
    // hash to check a token against, so we don't touch them here.
    if (denied?.status === 404) return new Response(null, { status: 204 });
    if (denied) return denied;
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
