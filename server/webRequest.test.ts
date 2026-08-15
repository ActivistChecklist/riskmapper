import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { abortWiringFor } from "./webRequest";

/**
 * Client-disconnect propagation.
 *
 * `server/routes/matrixEvents.ts` releases its pub/sub subscription and
 * clears its heartbeat interval from `req.signal`'s abort event. If the
 * signal never fires, every dropped SSE connection leaks both for the
 * lifetime of the process, which is a slow-motion denial of service rather
 * than a visible bug. These tests pin the wiring that prevents it.
 */

function fakePair() {
  const req = new EventEmitter() as unknown as Pick<IncomingMessage, "on">;
  const res = new EventEmitter() as unknown as Pick<ServerResponse, "on">;
  return {
    req,
    res,
    emitReq: (event: string) => (req as unknown as EventEmitter).emit(event),
    emitRes: (event: string) => (res as unknown as EventEmitter).emit(event),
  };
}

describe("abortWiringFor", () => {
  it("does not abort while the exchange is open", () => {
    const { req, res } = fakePair();
    const { signal } = abortWiringFor(req, res);
    expect(signal.aborted).toBe(false);
  });

  it("aborts when the response closes, which is how SSE disconnects surface", () => {
    const { req, res, emitRes } = fakePair();
    const { signal } = abortWiringFor(req, res);
    emitRes("close");
    expect(signal.aborted).toBe(true);
  });

  it("aborts when the client aborts the request", () => {
    const { req, res, emitReq } = fakePair();
    const { signal } = abortWiringFor(req, res);
    emitReq("aborted");
    expect(signal.aborted).toBe(true);
  });

  it("aborts on a request stream error", () => {
    const { req, res, emitReq } = fakePair();
    const { signal } = abortWiringFor(req, res);
    emitReq("error");
    expect(signal.aborted).toBe(true);
  });

  it("fires its abort listener exactly once across repeated events", () => {
    const { req, res, emitReq, emitRes } = fakePair();
    const { signal } = abortWiringFor(req, res);

    let fired = 0;
    signal.addEventListener("abort", () => {
      fired += 1;
    });

    emitRes("close");
    emitRes("close");
    emitReq("aborted");
    emitReq("error");

    // Cleanup must not run repeatedly: unsubscribe and clearInterval are
    // guarded in the handler, but double-aborting would still be a smell.
    expect(fired).toBe(1);
    expect(signal.aborted).toBe(true);
  });

  it("delivers the abort to a listener registered before the disconnect", () => {
    // This is the exact shape matrixEvents.ts uses.
    const { req, res, emitRes } = fakePair();
    const { signal } = abortWiringFor(req, res);

    let cleanedUp = false;
    signal.addEventListener("abort", () => {
      cleanedUp = true;
    });

    expect(cleanedUp).toBe(false);
    emitRes("close");
    expect(cleanedUp).toBe(true);
  });
});
