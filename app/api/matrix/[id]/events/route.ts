import { getUpdatesCollection } from "@/lib/cloud/db";
import { isPlausibleId, jsonError } from "@/lib/cloud/helpers";
import { subscribe, type UpdateEvent } from "@/lib/cloud/pubsub";

/**
 * GET /api/matrix/:id/events — Server-Sent Events stream of update events
 * for one matrix.
 *
 * Each frame is `event: update\nid: <seq>\ndata: <json>\n\n`. The client
 * applies each frame's ciphertext to its local Y.Doc.
 *
 * Reconnect / backfill: the EventSource API auto-reconnects with the last
 * received event id in `Last-Event-ID`. Server reads that header on
 * connect, replays everything with `seq > Last-Event-ID` from the updates
 * collection, then forwards live events via the pubsub bus. Live events
 * received during the backfill read are buffered and de-duped against the
 * backfilled seqs before flushing.
 *
 * One open SSE request per active tab. Single-process pubsub for now —
 * see lib/cloud/pubsub.ts.
 */

export const runtime = "nodejs";
// SSE responses must not be buffered or pre-rendered.
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: RouteParams) {
  const { id } = await ctx.params;
  if (!isPlausibleId(id)) return jsonError(404, "not found");

  const lastEventIdHeader = req.headers.get("last-event-id");
  const lastEventId = (() => {
    if (lastEventIdHeader === null) return null;
    const n = Number(lastEventIdHeader);
    return Number.isInteger(n) && n >= 0 ? n : null;
  })();

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Buffer events that arrive while we're reading the backfill, so we
      // can dedupe them against the backfilled seqs.
      const buffer: UpdateEvent[] = [];
      let backfillReady = false;
      let lastForwardedSeq = lastEventId ?? -1;

      const enqueue = (event: UpdateEvent): void => {
        if (event.seq <= lastForwardedSeq) return;
        lastForwardedSeq = event.seq;
        const frame =
          `id: ${event.seq}\n` +
          `event: update\n` +
          `data: ${JSON.stringify(event)}\n\n`;
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          // Stream is closed; nothing to do.
        }
      };

      // Subscribe FIRST so no live event is missed during the backfill DB
      // round-trip. Buffer until we've flushed backfill.
      unsubscribe = subscribe(id, (event) => {
        if (backfillReady) {
          enqueue(event);
        } else {
          buffer.push(event);
        }
      });

      try {
        const updatesColl = await getUpdatesCollection();
        const backfill = await updatesColl.findSorted({
          recordId: id,
          minSeqExclusive: lastEventId ?? -1,
        });
        for (const u of backfill) {
          enqueue({ seq: u.seq, ciphertext: u.ciphertext, clientId: u.clientId });
        }
        // Flush buffered live events. `enqueue`'s seq guard handles overlap.
        for (const e of buffer) enqueue(e);
        backfillReady = true;
        buffer.length = 0;
      } catch {
        // If backfill fails, keep the stream open with whatever live events
        // come through — better than dropping the connection.
        backfillReady = true;
      }

      // Periodic comment frame keeps long-idle connections alive through
      // proxies / load balancers that close idle TCP after ~30s.
      heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: hb\n\n`));
        } catch {
          // Stream closed; cancel will clean up.
        }
      }, 25_000);

      // The Web Streams API surfaces client disconnects via the request's
      // AbortSignal in Next.js Route Handlers.
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      cleanup();
    },
  });

  function cleanup(): void {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Hint to Nginx-style proxies not to buffer.
      "X-Accel-Buffering": "no",
    },
  });
}
