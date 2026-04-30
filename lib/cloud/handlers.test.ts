import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeCollection } from "./fakeCollection";
import { __resetRateLimiterForTests } from "./rateLimit";

/**
 * Route-handler tests for `app/api/matrix/**`. We mock the Mongo singleton
 * (`@/lib/cloud/db`) so route logic exercises a deterministic in-memory
 * collection, and we control the rate limiter directly via env stubs +
 * `__resetRateLimiterForTests` so the budget is fresh for each case.
 */

const VALID_ID = "abcd1234efgh5678ijkl";
const VALID_CT = "v1." + "A".repeat(80);

// Hoisted holder so the vi.mock factory below can reach `current` at call time.
const collHolder = vi.hoisted(() => ({
  current: null as ReturnType<typeof createFakeCollection> | null,
}));

vi.mock("./db", () => ({
  getCollection: async () => {
    if (!collHolder.current) {
      throw new Error("test setup forgot to seed the fake collection");
    }
    return collHolder.current;
  },
}));

beforeEach(() => {
  collHolder.current = createFakeCollection();
  // High default budget so most tests don't accidentally trip 429.
  vi.stubEnv("WRITE_RATE_LIMIT_PER_MIN", "10000");
  __resetRateLimiterForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetRateLimiterForTests();
});

function jsonRequest(url: string, init: RequestInit & { json?: unknown }): Request {
  const { json, ...rest } = init;
  return new Request(url, {
    ...rest,
    headers: { "Content-Type": "application/json", ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : (rest.body as BodyInit | null | undefined),
  });
}

describe("GET /api/healthz", () => {
  it("returns ok", async () => {
    const { GET } = await import("@/app/api/healthz/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("POST /api/matrix", () => {
  it("creates a record with the client-minted id", async () => {
    const { POST } = await import("@/app/api/matrix/route");
    const res = await POST(
      jsonRequest("http://localhost/api/matrix", {
        method: "POST",
        json: { id: VALID_ID, ciphertext: VALID_CT },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe(VALID_ID);
    expect(body.version).toBe(1);
    expect(body.lastReadDate).toBe(null);
    expect(body.createdDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const stored = collHolder.current!.__dump();
    expect(stored).toHaveLength(1);
    expect(stored[0]._id).toBe(VALID_ID);
    expect(stored[0].ciphertext).toBe(VALID_CT);
    expect(stored[0].version).toBe(1);
    expect(stored[0].lamport).toBe(1);
  });

  it("rejects an id that doesn't match the plausible-id regex", async () => {
    const { POST } = await import("@/app/api/matrix/route");
    for (const id of ["abc", "x".repeat(80), "abc def ghi jkl mno"]) {
      const res = await POST(
        jsonRequest("http://localhost/api/matrix", {
          method: "POST",
          json: { id, ciphertext: VALID_CT },
        }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid id" });
    }
    expect(collHolder.current!.__dump()).toHaveLength(0);
  });

  it("rejects a missing or non-envelope ciphertext", async () => {
    const { POST } = await import("@/app/api/matrix/route");
    const cases: Array<unknown> = [undefined, 42, "no-dot-prefix", ""];
    for (const ct of cases) {
      const res = await POST(
        jsonRequest("http://localhost/api/matrix", {
          method: "POST",
          json: { id: VALID_ID, ciphertext: ct },
        }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid ciphertext" });
    }
  });

  it("returns 413 when ciphertext exceeds the cap", async () => {
    vi.stubEnv("MAX_CIPHERTEXT_BYTES", "100");
    const { POST } = await import("@/app/api/matrix/route");
    const ct = "v1." + "A".repeat(200);
    const res = await POST(
      jsonRequest("http://localhost/api/matrix", {
        method: "POST",
        json: { id: VALID_ID, ciphertext: ct },
      }),
    );
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "ciphertext too large" });
  });

  it("returns 409 on duplicate id", async () => {
    collHolder.current!.__seed({
      _id: VALID_ID,
      ciphertext: VALID_CT,
      lamport: 1,
      version: 1,
      createdDate: "2026-01-01",
      lastWriteDate: "2026-01-01",
      lastReadDate: null,
    });
    const { POST } = await import("@/app/api/matrix/route");
    const res = await POST(
      jsonRequest("http://localhost/api/matrix", {
        method: "POST",
        json: { id: VALID_ID, ciphertext: VALID_CT },
      }),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "id already exists" });
  });

  it("returns 500 on unexpected DB failure (not duplicate)", async () => {
    collHolder.current!.__setInsertError(new Error("connection lost"));
    const { POST } = await import("@/app/api/matrix/route");
    const res = await POST(
      jsonRequest("http://localhost/api/matrix", {
        method: "POST",
        json: { id: VALID_ID, ciphertext: VALID_CT },
      }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal" });
  });
});

describe("GET /api/matrix/[id]", () => {
  async function get(id: string) {
    const { GET } = await import("@/app/api/matrix/[id]/route");
    return GET(new Request(`http://localhost/api/matrix/${id}`), {
      params: Promise.resolve({ id }),
    });
  }

  it("returns the record and bumps lastReadDate to today", async () => {
    collHolder.current!.__seed({
      _id: VALID_ID,
      ciphertext: VALID_CT,
      lamport: 4,
      version: 7,
      createdDate: "2026-01-01",
      lastWriteDate: "2026-01-15",
      lastReadDate: "2025-12-30",
    });
    const res = await get(VALID_ID);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ciphertext).toBe(VALID_CT);
    expect(body.version).toBe(7);
    expect(body.lamport).toBe(4);
    expect(body.lastReadDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.lastReadDate).not.toBe("2025-12-30");
    expect(collHolder.current!.__dump()[0].lastReadDate).toBe(body.lastReadDate);
  });

  it("returns 404 for an implausible id", async () => {
    const res = await get("short");
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown id", async () => {
    const res = await get(VALID_ID);
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/matrix/[id]", () => {
  async function put(id: string, body: unknown) {
    const { PUT } = await import("@/app/api/matrix/[id]/route");
    return PUT(
      jsonRequest(`http://localhost/api/matrix/${id}`, { method: "PUT", json: body }),
      { params: Promise.resolve({ id }) },
    );
  }

  it("updates the record and increments version when expectedVersion matches", async () => {
    collHolder.current!.__seed({
      _id: VALID_ID,
      ciphertext: "v1.OLD",
      lamport: 1,
      version: 3,
      createdDate: "2026-01-01",
      lastWriteDate: "2026-01-01",
      lastReadDate: null,
    });
    const newCt = "v1." + "B".repeat(80);
    const res = await put(VALID_ID, {
      ciphertext: newCt,
      lamport: 2,
      expectedVersion: 3,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).version).toBe(4);
    const stored = collHolder.current!.__dump()[0];
    expect(stored.ciphertext).toBe(newCt);
    expect(stored.version).toBe(4);
    expect(stored.lamport).toBe(2);
  });

  it("returns 409 + remote payload when expectedVersion mismatches", async () => {
    collHolder.current!.__seed({
      _id: VALID_ID,
      ciphertext: "v1.REMOTE",
      lamport: 9,
      version: 5,
      createdDate: "2026-01-01",
      lastWriteDate: "2026-01-15",
      lastReadDate: null,
    });
    const res = await put(VALID_ID, {
      ciphertext: VALID_CT,
      lamport: 8,
      expectedVersion: 3,
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      ciphertext: "v1.REMOTE",
      version: 5,
      lamport: 9,
    });
    expect(collHolder.current!.__dump()[0].ciphertext).toBe("v1.REMOTE");
  });

  it("returns 404 when the record does not exist", async () => {
    const res = await put(VALID_ID, {
      ciphertext: VALID_CT,
      lamport: 1,
      expectedVersion: 1,
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 on invalid body", async () => {
    collHolder.current!.__seed({
      _id: VALID_ID,
      ciphertext: "v1.OLD",
      lamport: 1,
      version: 1,
      createdDate: "2026-01-01",
      lastWriteDate: "2026-01-01",
      lastReadDate: null,
    });
    const cases = [
      { ciphertext: VALID_CT, lamport: -1, expectedVersion: 1 },
      { ciphertext: VALID_CT, lamport: 1, expectedVersion: -1 },
      { ciphertext: VALID_CT, lamport: 1.5, expectedVersion: 1 },
      { ciphertext: VALID_CT, expectedVersion: 1 },
      { ciphertext: "not-an-envelope", lamport: 1, expectedVersion: 1 },
    ];
    for (const body of cases) {
      const res = await put(VALID_ID, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid body" });
    }
    expect(collHolder.current!.__dump()[0].ciphertext).toBe("v1.OLD");
  });

  it("returns 413 when the ciphertext exceeds the cap", async () => {
    vi.stubEnv("MAX_CIPHERTEXT_BYTES", "100");
    collHolder.current!.__seed({
      _id: VALID_ID,
      ciphertext: "v1.OLD",
      lamport: 1,
      version: 1,
      createdDate: "2026-01-01",
      lastWriteDate: "2026-01-01",
      lastReadDate: null,
    });
    const res = await put(VALID_ID, {
      ciphertext: "v1." + "X".repeat(200),
      lamport: 1,
      expectedVersion: 1,
    });
    expect(res.status).toBe(413);
  });
});

describe("DELETE /api/matrix/[id]", () => {
  async function del(id: string) {
    const { DELETE } = await import("@/app/api/matrix/[id]/route");
    return DELETE(new Request(`http://localhost/api/matrix/${id}`, { method: "DELETE" }), {
      params: Promise.resolve({ id }),
    });
  }

  it("removes the record and returns 204", async () => {
    collHolder.current!.__seed({
      _id: VALID_ID,
      ciphertext: VALID_CT,
      lamport: 1,
      version: 1,
      createdDate: "2026-01-01",
      lastWriteDate: "2026-01-01",
      lastReadDate: null,
    });
    const res = await del(VALID_ID);
    expect(res.status).toBe(204);
    expect(collHolder.current!.__dump()).toHaveLength(0);
  });

  it("is idempotent for unknown ids (still 204)", async () => {
    const res = await del(VALID_ID);
    expect(res.status).toBe(204);
  });

  it("is 204 for implausible ids without touching the DB", async () => {
    // Force getCollection to throw if it gets called — the implausible-id
    // short-circuit must skip the DB entirely.
    collHolder.current = null;
    const res = await del("short");
    expect(res.status).toBe(204);
  });
});

describe("rate limiting", () => {
  it("returns 429 once the per-minute write budget is exceeded", async () => {
    vi.stubEnv("WRITE_RATE_LIMIT_PER_MIN", "2");
    __resetRateLimiterForTests();
    const { POST } = await import("@/app/api/matrix/route");
    const fire = () =>
      POST(
        jsonRequest("http://localhost/api/matrix", {
          method: "POST",
          headers: { "x-forwarded-for": "10.0.0.1" },
          json: { id: VALID_ID, ciphertext: VALID_CT },
        }),
      );
    const r1 = await fire();
    const r2 = await fire();
    const r3 = await fire();
    // The first hits 201, the second hits 409 (duplicate id); both consume
    // a token. The third must be throttled.
    expect([201, 409]).toContain(r1.status);
    expect([201, 409]).toContain(r2.status);
    expect(r3.status).toBe(429);
    expect(await r3.json()).toEqual({ error: "rate limited" });
    expect(r3.headers.get("Retry-After")).toBeTruthy();
  });

  it("does NOT throttle reads (only writes)", async () => {
    vi.stubEnv("WRITE_RATE_LIMIT_PER_MIN", "1");
    __resetRateLimiterForTests();
    collHolder.current!.__seed({
      _id: VALID_ID,
      ciphertext: VALID_CT,
      lamport: 1,
      version: 1,
      createdDate: "2026-01-01",
      lastWriteDate: "2026-01-01",
      lastReadDate: null,
    });
    const { GET } = await import("@/app/api/matrix/[id]/route");
    for (let i = 0; i < 5; i++) {
      const res = await GET(new Request(`http://localhost/api/matrix/${VALID_ID}`), {
        params: Promise.resolve({ id: VALID_ID }),
      });
      expect(res.status).toBe(200);
    }
  });
});
