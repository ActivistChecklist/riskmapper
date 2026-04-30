import { getMaxCiphertextBytes, getWriteRateLimitPerMin } from "@/lib/cloud/config";
import { getCollection } from "@/lib/cloud/db";
import {
  internalError,
  isPlausibleId,
  json,
  jsonError,
  readJsonBody,
  validCiphertext,
} from "@/lib/cloud/helpers";
import { rateLimit } from "@/lib/cloud/rateLimit";
import { todayUtc } from "@/lib/cloud/types";

/**
 * GET    /api/matrix/:id — read the ciphertext + monotonic metadata.
 *                          Bumps `lastReadDate` to today.
 * PUT    /api/matrix/:id — overwrite with `{ ciphertext, lamport, expectedVersion }`.
 *                          Returns 409 + remote on optimistic-concurrency miss.
 * DELETE /api/matrix/:id — idempotent removal.
 *
 * Server stores opaque ciphertext only — see THREAT-MODEL.md.
 */

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: RouteParams) {
  const { id } = await ctx.params;
  if (!isPlausibleId(id)) return jsonError(404, "not found");
  try {
    const coll = await getCollection();
    const today = todayUtc();
    const doc = await coll.findOneAndUpdate(
      { _id: id },
      { $set: { lastReadDate: today } },
      { returnDocument: "after" },
    );
    if (!doc) return jsonError(404, "not found");
    return json(200, {
      ciphertext: doc.ciphertext,
      version: doc.version,
      lamport: doc.lamport,
      createdDate: doc.createdDate,
      lastWriteDate: doc.lastWriteDate,
      lastReadDate: doc.lastReadDate,
    });
  } catch (err) {
    return internalError(err);
  }
}

export async function PUT(req: Request, ctx: RouteParams) {
  const limited = await rateLimit(req, getWriteRateLimitPerMin());
  if (limited) return limited;

  const { id } = await ctx.params;
  if (!isPlausibleId(id)) return jsonError(404, "not found");

  const body = (await readJsonBody(req)) as
    | { ciphertext?: unknown; lamport?: unknown; expectedVersion?: unknown }
    | null;
  if (
    !validCiphertext(body?.ciphertext) ||
    !Number.isInteger(body?.lamport) ||
    (body?.lamport as number) < 0 ||
    !Number.isInteger(body?.expectedVersion) ||
    (body?.expectedVersion as number) < 0
  ) {
    return jsonError(400, "invalid body");
  }
  if ((body?.ciphertext as string).length > getMaxCiphertextBytes()) {
    return jsonError(413, "ciphertext too large");
  }

  try {
    const coll = await getCollection();
    const today = todayUtc();
    const expectedVersion = body?.expectedVersion as number;
    const updated = await coll.findOneAndUpdate(
      { _id: id, version: expectedVersion },
      {
        $set: {
          ciphertext: body?.ciphertext as string,
          lamport: body?.lamport as number,
          lastWriteDate: today,
        },
        $inc: { version: 1 },
      },
      { returnDocument: "after" },
    );
    if (updated) {
      return json(200, {
        version: updated.version,
        lastWriteDate: updated.lastWriteDate,
      });
    }
    const current = await coll.findOne({ _id: id });
    if (!current) return jsonError(404, "not found");
    // Existing record + version mismatch → 409 Conflict; client decides
    // whether to overwrite or reload.
    return json(409, {
      ciphertext: current.ciphertext,
      version: current.version,
      lamport: current.lamport,
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
    await coll.deleteOne({ _id: id });
    return new Response(null, { status: 204 });
  } catch (err) {
    return internalError(err);
  }
}
