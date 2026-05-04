import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CloudNetworkError,
  CloudNotFoundError,
  CloudPayloadTooLargeError,
  createMatrixCloudRepository,
  type EventSourceLike,
} from "./matrixCloudRepository";
import { generateKey, SCHEMA_VERSION } from "@/lib/e2ee";

/**
 * Repository-level tests for the cloud-sync HTTP/SSE surface. We inject a
 * stub `fetch` and a fake `EventSource` so the tests don't depend on a
 * live server. Encryption is real (libsodium) so we can verify roundtrips
 * decrypt back to the original bytes when needed.
 */

beforeEach(() => {
  // Same-origin: API base is empty, paths are relative.
  vi.stubEnv("NEXT_PUBLIC_CLOUD_API_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const RECORD_ID = "abcd1234efgh5678ijkl";

async function makeHandle() {
  return {
    recordId: RECORD_ID,
    key: await generateKey(),
    schemaVersion: SCHEMA_VERSION as typeof SCHEMA_VERSION,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createMatrixCloudRepository: compact", () => {
  it("PUTs to /baseline with the encrypted snapshot and returns 'applied' on 200", async () => {
    const handle = await makeHandle();
    let captured: { url: string; body: unknown; method?: string } | null = null;
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      captured = {
        url,
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      };
      return jsonResponse({ baselineSeq: 42, headSeq: 50 });
    });

    const repo = createMatrixCloudRepository({ fetchFn });
    const result = await repo.compact({
      handle,
      bytes: new Uint8Array([1, 2, 3, 4]),
      baselineSeq: 42,
      clientId: "alice",
    });

    expect(result).toEqual({ kind: "applied", baselineSeq: 42, headSeq: 50 });
    expect(captured!.url).toBe(`/api/matrix/${RECORD_ID}/baseline`);
    expect(captured!.method).toBe("PUT");
    const body = captured!.body as {
      baseline: string;
      baselineSeq: number;
      clientId: string;
    };
    expect(body.baselineSeq).toBe(42);
    expect(body.clientId).toBe("alice");
    expect(body.baseline).toMatch(/^v[12]\./);
  });

  it("returns 'raceLost' on 409 with the server's current baselineSeq/headSeq", async () => {
    const handle = await makeHandle();
    const fetchFn = vi.fn(async () =>
      jsonResponse(
        { error: "baseline not advanced", baselineSeq: 100, headSeq: 150 },
        409,
      ),
    );
    const repo = createMatrixCloudRepository({ fetchFn });
    const result = await repo.compact({
      handle,
      bytes: new Uint8Array([1, 2, 3]),
      baselineSeq: 50,
      clientId: "bob",
    });
    expect(result).toEqual({ kind: "raceLost", baselineSeq: 100, headSeq: 150 });
  });

  it("throws CloudNotFoundError on 404", async () => {
    const handle = await makeHandle();
    const fetchFn = vi.fn(async () => new Response(null, { status: 404 }));
    const repo = createMatrixCloudRepository({ fetchFn });
    await expect(
      repo.compact({
        handle,
        bytes: new Uint8Array([1]),
        baselineSeq: 1,
        clientId: "c",
      }),
    ).rejects.toBeInstanceOf(CloudNotFoundError);
  });

  it("throws CloudPayloadTooLargeError on 413", async () => {
    const handle = await makeHandle();
    const fetchFn = vi.fn(async () => new Response(null, { status: 413 }));
    const repo = createMatrixCloudRepository({ fetchFn });
    await expect(
      repo.compact({
        handle,
        bytes: new Uint8Array([1]),
        baselineSeq: 1,
        clientId: "c",
      }),
    ).rejects.toBeInstanceOf(CloudPayloadTooLargeError);
  });

  it("throws CloudNetworkError on 5xx", async () => {
    const handle = await makeHandle();
    const fetchFn = vi.fn(async () => new Response(null, { status: 500 }));
    const repo = createMatrixCloudRepository({ fetchFn });
    await expect(
      repo.compact({
        handle,
        bytes: new Uint8Array([1]),
        baselineSeq: 1,
        clientId: "c",
      }),
    ).rejects.toBeInstanceOf(CloudNetworkError);
  });
});

describe("createMatrixCloudRepository: subscribe baseline frames", () => {
  type Listener = (e: { data: string; lastEventId: string }) => void;

  function makeFakeEventSource(): EventSourceLike & {
    fire(type: "update" | "baseline", data: unknown, lastEventId?: string): void;
    closeCalled: boolean;
  } {
    const listeners: Record<string, Listener[]> = { update: [], baseline: [] };
    let closed = false;
    const es = {
      addEventListener(type: string, listener: Listener) {
        (listeners[type] ??= []).push(listener);
      },
      onopen: null,
      onerror: null,
      close() {
        closed = true;
      },
      get closeCalled() {
        return closed;
      },
      fire(type: "update" | "baseline", data: unknown, lastEventId = "") {
        for (const l of listeners[type] ?? []) {
          l({ data: JSON.stringify(data), lastEventId });
        }
      },
    };
    return es as unknown as EventSourceLike & {
      fire: (
        type: "update" | "baseline",
        data: unknown,
        lastEventId?: string,
      ) => void;
      closeCalled: boolean;
    };
  }

  it("dispatches baseline frames to onBaseline with decrypted bytes", async () => {
    const handle = await makeHandle();

    // Encrypt a fake baseline so subscribe has something it can decrypt.
    const { encryptBytes } = await import("@/lib/e2ee");
    const baselineBytes = new Uint8Array([7, 8, 9, 10, 11]);
    const { envelope } = await encryptBytes({
      bytes: baselineBytes,
      key: handle.key,
      aad: { recordId: handle.recordId, schemaVersion: SCHEMA_VERSION },
    });

    const fakeEs = makeFakeEventSource();
    const repo = createMatrixCloudRepository({
      fetchFn: vi.fn(),
      eventSourceFactory: () => fakeEs,
    });

    const baselineCalls: Array<{ baselineSeq: number; bytes: Uint8Array }> = [];
    const updateCalls: number[] = [];
    const sub = repo.subscribe(
      { handle, sinceSeq: 0 },
      {
        onUpdate(event) {
          updateCalls.push(event.seq);
        },
        onBaseline(event) {
          baselineCalls.push({
            baselineSeq: event.baselineSeq,
            bytes: event.bytes,
          });
        },
      },
    );

    fakeEs.fire("baseline", { baselineSeq: 42, baseline: envelope });
    // Wait for the async decrypt to settle.
    await new Promise((r) => setTimeout(r, 10));

    expect(baselineCalls).toHaveLength(1);
    expect(baselineCalls[0].baselineSeq).toBe(42);
    expect(Array.from(baselineCalls[0].bytes)).toEqual(Array.from(baselineBytes));
    expect(updateCalls).toEqual([]);
    sub.close();
    expect(fakeEs.closeCalled).toBe(true);
  });

  it("suppresses update frames whose seq is at or before a delivered baselineSeq", async () => {
    const handle = await makeHandle();
    const { encryptBytes } = await import("@/lib/e2ee");

    const baselineBytes = new Uint8Array([1, 2, 3]);
    const baselineEnv = (
      await encryptBytes({
        bytes: baselineBytes,
        key: handle.key,
        aad: { recordId: handle.recordId, schemaVersion: SCHEMA_VERSION },
      })
    ).envelope;
    const update5Env = (
      await encryptBytes({
        bytes: new Uint8Array([99]),
        key: handle.key,
        aad: { recordId: handle.recordId, schemaVersion: SCHEMA_VERSION },
      })
    ).envelope;

    const fakeEs = makeFakeEventSource();
    const repo = createMatrixCloudRepository({
      fetchFn: vi.fn(),
      eventSourceFactory: () => fakeEs,
    });

    const baselineCalls: number[] = [];
    const updateCalls: number[] = [];
    repo.subscribe(
      { handle, sinceSeq: 0 },
      {
        onUpdate(event) {
          updateCalls.push(event.seq);
        },
        onBaseline(event) {
          baselineCalls.push(event.baselineSeq);
        },
      },
    );

    // Server sequence: baseline at seq=10, then a stale update frame for
    // seq=8 (raced from the live stream before the baseline was emitted),
    // then a fresh update at seq=11.
    fakeEs.fire("baseline", { baselineSeq: 10, baseline: baselineEnv });
    await new Promise((r) => setTimeout(r, 10));
    fakeEs.fire("update", {
      seq: 8,
      ciphertext: update5Env,
      clientId: "c",
    });
    fakeEs.fire("update", {
      seq: 11,
      ciphertext: update5Env,
      clientId: "c",
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(baselineCalls).toEqual([10]);
    expect(updateCalls).toEqual([11]);
  });
});
