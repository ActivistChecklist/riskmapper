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
import { todayUtc, todayUtcDate } from "@/lib/cloud/types";

/**
 * PUT /api/matrix/:id/baseline — replace the stored baseline with a fresh
 * compaction snapshot, then prune the updates log up through the new
 * baselineSeq.
 *
 * Body: `{ baseline: "v1.…", baselineSeq, clientId }`. The client minted
 * `baseline` by encoding `Y.encodeStateAsUpdate(doc)` at some seq it has
 * already observed (typically `lastHeadSeq`), encrypting it, and POSTing.
 *
 * Atomicity: the swap uses `findOneAndUpdate` with a conditional filter so
 * two concurrent compactors can't both win, and a stale compactor (one
 * whose `baselineSeq` is no greater than the stored one, or whose claimed
 * seq exceeds the server's `headSeq`) gets rejected with no write:
 *
 *   - `baselineSeq < N`  → forward progress only.
 *   - `headSeq >= N`     → reject "future" baselines that claim a seq the
 *                          server hasn't issued yet.
 *
 * On filter miss we surface 409 with the current `baselineSeq` and
 * `headSeq` so the client can update its bookkeeping and stand down. After
 * a successful swap, prune updates with `seq <= baselineSeq` — the read
 * path filters them anyway, this just reclaims storage. A prune failure is
 * logged but doesn't fail the request: the baseline is what callers care
 * about for correctness; pruning is opportunistic.
 *
 * Rate-limited per source IP. Server stores opaque ciphertext only — see
 * THREAT-MODEL.md.
 */


type RouteParams = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: RouteParams) {
  const limited = await rateLimit(req, getWriteRateLimitPerMin());
  if (limited) return limited;

  const { id } = await ctx.params;
  if (!isPlausibleId(id)) return jsonError(404, "not found");

  const body = (await readJsonBody(req)) as
    | { baseline?: unknown; baselineSeq?: unknown; clientId?: unknown }
    | null;
  const baseline = body?.baseline;
  const baselineSeq = body?.baselineSeq;
  const clientId = body?.clientId;

  if (!validCiphertext(baseline)) return jsonError(400, "invalid baseline");
  if (baseline.length > getMaxCiphertextBytes()) {
    return jsonError(413, "baseline too large");
  }
  if (
    typeof baselineSeq !== "number" ||
    !Number.isInteger(baselineSeq) ||
    baselineSeq < 0
  ) {
    return jsonError(400, "invalid baselineSeq");
  }
  if (
    typeof clientId !== "string" ||
    clientId.length === 0 ||
    clientId.length > 64
  ) {
    return jsonError(400, "invalid clientId");
  }

  try {
    const coll = await getCollection();
    const today = todayUtc();
    const updated = await coll.findOneAndUpdate(
      {
        _id: id,
        baselineSeq: { $lt: baselineSeq },
        headSeq: { $gte: baselineSeq },
      },
      {
        $set: {
          baseline,
          baselineSeq,
          lastWriteDate: today,
          lastActivityDate: todayUtcDate(),
        },
      },
      { returnDocument: "after" },
    );

    if (!updated) {
      // Either the record doesn't exist, or our baselineSeq lost the race
      // (someone already compacted to >= N), or it's "in the future"
      // (greater than headSeq — caller is buggy or racing an append we
      // haven't observed yet). Echo the current state so the client can
      // update its bookkeeping without re-reading.
      const current = await coll.findOne({ _id: id });
      if (!current) return jsonError(404, "not found");
      return json(409, {
        error: "baseline not advanced",
        baselineSeq: current.baselineSeq,
        headSeq: current.headSeq,
      });
    }

    // Prune updates already folded into the new baseline. Best-effort:
    // failures here leak storage but never break correctness, since the
    // read path filters by `seq > baselineSeq`.
    try {
      const updatesColl = await getUpdatesCollection();
      await updatesColl.deleteUpToSeq({
        recordId: id,
        maxSeqInclusive: baselineSeq,
      });
    } catch (err) {
      console.error(
        "[risk-matrix-api] baseline prune failed (will retry on next compaction):",
        err instanceof Error ? err.message : "unknown",
      );
    }

    return json(200, {
      baselineSeq: updated.baselineSeq,
      headSeq: updated.headSeq,
    });
  } catch (err) {
    return internalError(err);
  }
}
