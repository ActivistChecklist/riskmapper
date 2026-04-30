import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCHEMA_VERSION, encryptPayload, generateKey } from "@/lib/e2ee";
import { __resetRollbackStoreForTests } from "./cloudRollbackStore";
import {
  CloudConflictError,
  CloudNotFoundError,
  CloudPayloadTooLargeError,
  CloudRollbackError,
  createMatrixCloudRepository,
} from "./matrixCloudRepository";
import type { RiskMatrixSnapshot } from "./matrixTypes";

const SAMPLE_SNAPSHOT: RiskMatrixSnapshot = {
  pool: [{ id: "p1", text: "lorem" }],
  grid: {},
  collapsed: { red: false, orange: false, yellow: false, green: false },
  hasCompletedFirstDragToMatrix: false,
  otherActions: [],
  hiddenCategorizedRiskKeys: [],
  categorizedRevealHidden: { red: false, orange: false, yellow: false, green: false },
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CLOUD_API_URL", "https://api.example");
  __resetRollbackStoreForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetRollbackStoreForTests();
});

type Call = { url: string; init?: RequestInit };

function makeFetchSequence(responses: Array<Response | (() => Response)>): {
  fetchFn: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  let i = 0;
  const fetchFn: typeof fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = responses[i++];
    if (!next) throw new Error(`No response queued for call #${i} to ${url}`);
    return typeof next === "function" ? next() : next;
  }) as typeof fetch;
  return { fetchFn, calls };
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("createMatrixCloudRepository.create", () => {
  it("POSTs once with a client-minted id, returns handle and version", async () => {
    let postedId: string | null = null;
    let postedUrl = "";
    let postedMethod = "";
    const fetchWithEcho: typeof fetch = (async (url, init) => {
      postedUrl = String(url);
      postedMethod = String(init?.method ?? "GET");
      const body = JSON.parse(String(init?.body ?? "{}")) as { id?: string };
      postedId = body.id ?? null;
      return jsonResponse(
        {
          id: postedId,
          version: 1,
          createdDate: "2026-04-29",
          lastWriteDate: "2026-04-29",
          lastReadDate: null,
        },
        { status: 201 },
      );
    }) as typeof fetch;
    const repo = createMatrixCloudRepository({ fetchFn: fetchWithEcho });
    const result = await repo.create({ snapshot: SAMPLE_SNAPSHOT, title: "Secret matrix" });

    expect(result.handle.recordId).toBe(postedId);
    expect(result.handle.key).toHaveLength(32);
    expect(result.version).toBe(1);
    expect(postedUrl).toBe("https://api.example/api/matrix");
    expect(postedMethod).toBe("POST");
    expect(postedId).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
  });

  it("rejects when the server echoes a different id (defense in depth)", async () => {
    const { fetchFn } = makeFetchSequence([
      jsonResponse({
        id: "wrong-id-from-malicious-server",
        version: 1,
        createdDate: "2026-04-29",
        lastWriteDate: "2026-04-29",
        lastReadDate: null,
      }, { status: 201 }),
    ]);
    const repo = createMatrixCloudRepository({ fetchFn });
    await expect(
      repo.create({ snapshot: SAMPLE_SNAPSHOT, title: "x" }),
    ).rejects.toThrowError(/different record id/);
  });

  it("never sends plaintext title or snapshot in the request body", async () => {
    const sent: string[] = [];
    const fetchWithEcho: typeof fetch = (async (_url, init) => {
      const raw = String(init?.body ?? "");
      sent.push(raw);
      const body = JSON.parse(raw || "{}") as { id?: string };
      return jsonResponse(
        {
          id: body.id,
          version: 1,
          createdDate: "2026-04-29",
          lastWriteDate: "2026-04-29",
          lastReadDate: null,
        },
        { status: 201 },
      );
    }) as typeof fetch;
    const repo = createMatrixCloudRepository({ fetchFn: fetchWithEcho });
    await repo.create({ snapshot: SAMPLE_SNAPSHOT, title: "Threats from State Actor X" });

    for (const body of sent) {
      expect(body).not.toContain("Threats from State Actor X");
      expect(body).not.toContain("lorem");
    }
  });
});

describe("createMatrixCloudRepository.read", () => {
  it("decrypts a fetched record", async () => {
    const key = await generateKey();
    const recordId = "rec-1";
    const version = 7;
    const lamport = 4;
    const { envelope } = await encryptPayload({
      payload: { schemaVersion: SCHEMA_VERSION, title: "shhh", snapshot: SAMPLE_SNAPSHOT, lamport },
      key,
      aad: { recordId, schemaVersion: SCHEMA_VERSION, version, lamport },
    });
    const { fetchFn } = makeFetchSequence([
      jsonResponse({
        ciphertext: envelope,
        version,
        lamport,
        createdDate: "2026-04-01",
        lastWriteDate: "2026-04-29",
        lastReadDate: "2026-04-29",
      }),
    ]);
    const repo = createMatrixCloudRepository({ fetchFn });
    const out = await repo.read({ recordId, key, schemaVersion: SCHEMA_VERSION });
    expect(out.title).toBe("shhh");
    expect(out.snapshot).toEqual(SAMPLE_SNAPSHOT);
    expect(out.version).toBe(version);
    expect(out.lamport).toBe(lamport);
  });

  it("404 maps to CloudNotFoundError", async () => {
    const { fetchFn } = makeFetchSequence([
      new Response("not found", { status: 404 }),
    ]);
    const repo = createMatrixCloudRepository({ fetchFn });
    const key = await generateKey();
    await expect(
      repo.read({ recordId: "rec-x", key, schemaVersion: SCHEMA_VERSION }),
    ).rejects.toBeInstanceOf(CloudNotFoundError);
  });

  it("rejects when the server returns a strictly older version (rollback)", async () => {
    const key = await generateKey();
    const recordId = "rec-1";
    const { envelope: env10 } = await encryptPayload({
      payload: { schemaVersion: SCHEMA_VERSION, title: "ok", snapshot: SAMPLE_SNAPSHOT, lamport: 1 },
      key,
      aad: { recordId, schemaVersion: SCHEMA_VERSION, version: 10, lamport: 1 },
    });
    const { envelope: env5 } = await encryptPayload({
      payload: { schemaVersion: SCHEMA_VERSION, title: "older", snapshot: SAMPLE_SNAPSHOT, lamport: 1 },
      key,
      aad: { recordId, schemaVersion: SCHEMA_VERSION, version: 5, lamport: 1 },
    });
    const { fetchFn } = makeFetchSequence([
      jsonResponse({ ciphertext: env10, version: 10, lamport: 1, createdDate: null, lastWriteDate: null, lastReadDate: null }),
      jsonResponse({ ciphertext: env5, version: 5, lamport: 1, createdDate: null, lastWriteDate: null, lastReadDate: null }),
    ]);
    const repo = createMatrixCloudRepository({ fetchFn });
    await repo.read({ recordId, key, schemaVersion: SCHEMA_VERSION });
    await expect(
      repo.read({ recordId, key, schemaVersion: SCHEMA_VERSION }),
    ).rejects.toBeInstanceOf(CloudRollbackError);
  });

  it("decrypt failure surfaces as a hard error", async () => {
    const key = await generateKey();
    const wrongKey = await generateKey();
    const recordId = "rec-1";
    const { envelope } = await encryptPayload({
      payload: { schemaVersion: SCHEMA_VERSION, title: "x", snapshot: SAMPLE_SNAPSHOT, lamport: 1 },
      key,
      aad: { recordId, schemaVersion: SCHEMA_VERSION, version: 1, lamport: 1 },
    });
    const { fetchFn } = makeFetchSequence([
      jsonResponse({ ciphertext: envelope, version: 1, lamport: 1, createdDate: null, lastWriteDate: null, lastReadDate: null }),
    ]);
    const repo = createMatrixCloudRepository({ fetchFn });
    await expect(
      repo.read({ recordId, key: wrongKey, schemaVersion: SCHEMA_VERSION }),
    ).rejects.toThrowError(/Authentication failed/);
  });
});

describe("createMatrixCloudRepository.write", () => {
  it("PUTs and returns the new server version", async () => {
    const key = await generateKey();
    const { fetchFn, calls } = makeFetchSequence([
      jsonResponse({ version: 8, lastWriteDate: "2026-04-29" }),
    ]);
    const repo = createMatrixCloudRepository({ fetchFn });
    const out = await repo.write({
      handle: { recordId: "rec-1", key, schemaVersion: SCHEMA_VERSION },
      snapshot: SAMPLE_SNAPSHOT,
      title: "t",
      expectedVersion: 7,
      lamport: 5,
    });
    expect(out.version).toBe(8);
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.expectedVersion).toBe(7);
    expect(body.lamport).toBe(5);
    expect(body.ciphertext.startsWith("v1.")).toBe(true);
  });

  it("409 maps to CloudConflictError carrying remote ciphertext + version", async () => {
    const key = await generateKey();
    const { envelope: remote } = await encryptPayload({
      payload: { schemaVersion: SCHEMA_VERSION, title: "remote", snapshot: SAMPLE_SNAPSHOT, lamport: 9 },
      key,
      aad: { recordId: "rec-1", schemaVersion: SCHEMA_VERSION, version: 9, lamport: 9 },
    });
    const { fetchFn } = makeFetchSequence([
      jsonResponse(
        { ciphertext: remote, version: 9, lamport: 9 },
        { status: 409 },
      ),
    ]);
    const repo = createMatrixCloudRepository({ fetchFn });
    await expect(
      repo.write({
        handle: { recordId: "rec-1", key, schemaVersion: SCHEMA_VERSION },
        snapshot: SAMPLE_SNAPSHOT,
        title: "mine",
        expectedVersion: 7,
        lamport: 8,
      }),
    ).rejects.toMatchObject({
      name: "CloudConflictError",
      conflict: { remoteVersion: 9, remoteLamport: 9 },
    });
  });

  it("payload too large bubbles up as CloudPayloadTooLargeError", async () => {
    const key = await generateKey();
    const { fetchFn } = makeFetchSequence([
      new Response("", { status: 413 }),
    ]);
    const repo = createMatrixCloudRepository({ fetchFn });
    await expect(
      repo.write({
        handle: { recordId: "rec-1", key, schemaVersion: SCHEMA_VERSION },
        snapshot: SAMPLE_SNAPSHOT,
        title: "t",
        expectedVersion: 1,
        lamport: 1,
      }),
    ).rejects.toBeInstanceOf(CloudPayloadTooLargeError);
  });
});

describe("createMatrixCloudRepository.delete", () => {
  it("DELETEs the record and forgets the rollback bound", async () => {
    const key = await generateKey();
    const { fetchFn, calls } = makeFetchSequence([
      new Response(null, { status: 204 }),
    ]);
    const repo = createMatrixCloudRepository({ fetchFn });
    await repo.delete({ recordId: "rec-1", key, schemaVersion: SCHEMA_VERSION });
    expect(calls[0].init?.method).toBe("DELETE");
    expect(calls[0].url).toBe("https://api.example/api/matrix/rec-1");
  });
});

describe("CloudConflictError", () => {
  it("carries the conflict payload", () => {
    const err = new CloudConflictError({
      remoteCiphertext: "v1.AAAA",
      remoteVersion: 3,
      remoteLamport: 2,
    });
    expect(err.conflict.remoteVersion).toBe(3);
    expect(err.name).toBe("CloudConflictError");
  });
});

describe("isCloudEnabled / cloudUrl", () => {
  it("is enabled by default and uses same-origin (relative) URLs", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLOUD_SYNC_ENABLED", "");
    vi.stubEnv("NEXT_PUBLIC_CLOUD_API_URL", "");
    const mod = await import("./cloudConfig");
    expect(mod.isCloudEnabled()).toBe(true);
    expect(mod.cloudUrl("/api/matrix")).toBe("/api/matrix");
  });

  it("is false when explicitly disabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLOUD_SYNC_ENABLED", "false");
    const mod = await import("./cloudConfig");
    expect(mod.isCloudEnabled()).toBe(false);
  });

  it("uses the override base URL when provided", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLOUD_API_URL", "https://api.example/");
    const mod = await import("./cloudConfig");
    expect(mod.cloudUrl("/api/matrix")).toBe("https://api.example/api/matrix");
  });
});
