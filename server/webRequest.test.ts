import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { abortWiringFor, isProxyPeer, toWebRequest, trustedClientIp } from "./webRequest";

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

/**
 * Which address the rate limiter and the analytics relay see.
 *
 * Proxies append to X-Forwarded-For, so a client can put anything at the
 * left end. The chains below are what May First delivered to the app,
 * captured with a header echo on 2026-11-10 (addresses replaced): nginx
 * and Apache each append the visitor's address.
 */
describe("trustedClientIp", () => {
  it("takes the rightmost entry from May First's chain", () => {
    expect(trustedClientIp("203.0.113.7, 203.0.113.7", "127.0.0.1", 1)).toBe("203.0.113.7");
  });

  it("ignores an address the client wrote itself", () => {
    expect(
      trustedClientIp("1.2.3.4, 203.0.113.7, 203.0.113.7", "127.0.0.1", 1),
    ).toBe("203.0.113.7");
  });

  it("counts back further for hosts with more trusted proxies", () => {
    expect(
      trustedClientIp("1.2.3.4, 203.0.113.7, 10.0.0.2", "127.0.0.1", 2),
    ).toBe("203.0.113.7");
  });

  it("falls back to the peer when the chain is shorter than the hops", () => {
    // Fewer entries than our proxies write means the request skipped at
    // least one of them, so even the rightmost entry may be the client's.
    expect(trustedClientIp("203.0.113.7", "127.0.0.1", 3)).toBe("127.0.0.1");
  });

  it("ignores the header from a peer that is not a proxy", () => {
    // A server reachable straight from the internet (HOST=0.0.0.0, no proxy)
    // must not let the client pick its own address.
    expect(trustedClientIp("1.2.3.4", "198.51.100.9", 1)).toBe("198.51.100.9");
  });

  it("falls back to the socket's peer with no header, as in local dev", () => {
    expect(trustedClientIp(undefined, "::1", 1)).toBe("::1");
    expect(trustedClientIp(" , ", "::1", 1)).toBe("::1");
  });
});

describe("toWebRequest client address", () => {
  function fakeReq(headers: Record<string, string>) {
    const req = Object.assign(new EventEmitter(), {
      headers,
      url: "/api/matrix",
      method: "GET",
      socket: { remoteAddress: "127.0.0.1" },
    });
    const res = new EventEmitter();
    return toWebRequest(
      req as unknown as IncomingMessage,
      res as unknown as ServerResponse,
      "localhost:3002",
    );
  }

  it("hands the routes only the trusted address", () => {
    const r = fakeReq({
      host: "riskmapper.app",
      "x-forwarded-for": "1.2.3.4, 203.0.113.7, 203.0.113.7",
      "x-real-ip": "5.6.7.8",
    });
    expect(r.headers.get("x-forwarded-for")).toBe("203.0.113.7");
    expect(r.headers.get("x-real-ip")).toBeNull();
  });

  it("uses the peer address when no proxy is in front", () => {
    const r = fakeReq({ host: "localhost:3002" });
    expect(r.headers.get("x-forwarded-for")).toBe("127.0.0.1");
  });
});

describe("isProxyPeer", () => {
  it("accepts loopback and private addresses, where a proxy would connect from", () => {
    for (const a of ["127.0.0.1", "::1", "::ffff:127.0.0.1", "10.1.2.3", "172.20.0.5", "192.168.1.9", "100.64.0.1", "fd12:3456::1"]) {
      expect(isProxyPeer(a), a).toBe(true);
    }
  });

  it("rejects public addresses and a missing peer", () => {
    for (const a of ["203.0.113.7", "172.32.0.1", "8.8.8.8", "2001:db8::1", undefined]) {
      expect(isProxyPeer(a), String(a)).toBe(false);
    }
  });
});
