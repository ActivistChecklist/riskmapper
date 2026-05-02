import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeCollection,
  createFakeUpdatesCollection,
  type FakeCollection,
  type FakeUpdatesCollection,
} from "./fakeCollection";
import { __resetRateLimiterForTests } from "./rateLimit";
import { __resetPubSubForTests, subscribe, type UpdateEvent } from "./pubsub";

/**
 * Route-handler tests for `app/api/matrix/**`. We mock the Mongo accessors
 * (`@/lib/cloud/db`) so route logic exercises deterministic in-memory
 * collections, and we control the rate limiter directly via env stubs +
 * `__resetRateLimiterForTests` so the budget is fresh for each case.
 */

const VALID_ID = "abcd1234efgh5678ijkl";
const VALID_CT = "v1." + "A".repeat(80);

const collHolder = vi.hoisted(() => ({
  matrices: null as FakeCollection | null,
  updates: null as FakeUpdatesCollection | null,
}));

vi.mock("./db", () => ({
  getCollection: async () => {
    if (!collHolder.matrices) {
      throw new Error("test setup forgot to seed the fake matrices collection");
    }
    return collHolder.matrices;
  },
  getUpdatesCollection: async () => {
    if (!collHolder.updates) {
      throw new Error("test setup forgot to seed the fake updates collection");
    }
    return collHolder.updates;
  },
}));

beforeEach(() => {
  collHolder.matrices = createFakeCollection();
  collHolder.updates = createFakeUpdatesCollection();
  vi.stubEnv("WRITE_RATE_LIMIT_PER_MIN", "10000");
  __resetRateLimiterForTests();
  __resetPubSubForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetRateLimiterForTests();
  __resetPubSubForTests();
});

function jsonRequest(url: string, init: RequestInit & { json?: unknown }): Request {
  const { json, ...rest } = init;
  return new Request(url, {
    ...rest,
    headers: { "Content-Type": "application/json", ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : (rest.body as BodyInit | null | undefined),
  });
}

function seedMatrix(opts?: { headSeq?: number; baselineSeq?: number }): void {
  collHolder.matrices!.__seed({
    _id: VALID_ID,
    baseline: VALID_CT,
    baselineSeq: opts?.baselineSeq ?? 0,
    headSeq: opts?.headSeq ?? 0,
    createdDate: "2026-01-01",
    lastWriteDate: "2026-01-01",
    lastReadDate: null,
    lastActivityDate: new Date("2026-01-01T00:00:00Z"),
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
  it("creates a record at headSeq=0 with the client-minted id", async () => {
    const { POST } = await import("@/app/api/matrix/route");
    const res = await POST(
      jsonRequest("http://localhost/api/matrix", {
        method: "POST",
        json: { id: VALID_ID, baseline: VALID_CT },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe(VALID_ID);
    expect(body.baselineSeq).toBe(0);
    expect(body.headSeq).toBe(0);
    expect(body.lastReadDate).toBe(null);
    expect(body.createdDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const stored = collHolder.matrices!.__dump();
    expect(stored).toHaveLength(1);
    expect(stored[0]._id).toBe(VALID_ID);
    expect(stored[0].baseline).toBe(VALID_CT);
    expect(stored[0].headSeq).toBe(0);
    expect(stored[0].baselineSeq).toBe(0);
    // TTL: create stamps lastActivityDate (midnight UTC).
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    expect(stored[0].lastActivityDate.getTime()).toBe(today.getTime());
  });

  it("rejects an id that doesn't match the plausible-id regex", async () => {
    const { POST } = await import("@/app/api/matrix/route");
    for (const id of ["abc", "x".repeat(80), "abc def ghi jkl mno"]) {
      const res = await POST(
        jsonRequest("http://localhost/api/matrix", {
          method: "POST",
          json: { id, baseline: VALID_CT },
        }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid id" });
    }
    expect(collHolder.matrices!.__dump()).toHaveLength(0);
  });

  it("rejects a missing or non-envelope baseline", async () => {
    const { POST } = await import("@/app/api/matrix/route");
    const cases: Array<unknown> = [undefined, 42, "no-dot-prefix", ""];
    for (const baseline of cases) {
      const res = await POST(
        jsonRequest("http://localhost/api/matrix", {
          method: "POST",
          json: { id: VALID_ID, baseline },
        }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid baseline" });
    }
  });

  it("returns 413 when baseline exceeds the cap", async () => {
    vi.stubEnv("MAX_CIPHERTEXT_BYTES", "100");
    const { POST } = await import("@/app/api/matrix/route");
    const res = await POST(
      jsonRequest("http://localhost/api/matrix", {
        method: "POST",
        json: { id: VALID_ID, baseline: "v1." + "A".repeat(200) },
      }),
    );
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "baseline too large" });
  });

  it("returns 409 on duplicate id", async () => {
    seedMatrix();
    const { POST } = await import("@/app/api/matrix/route");
    const res = await POST(
      jsonRequest("http://localhost/api/matrix", {
        method: "POST",
        json: { id: VALID_ID, baseline: VALID_CT },
      }),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "id already exists" });
  });

  it("returns 500 on unexpected DB failure (not duplicate)", async () => {
    collHolder.matrices!.__setInsertError(new Error("connection lost"));
    const { POST } = await import("@/app/api/matrix/route");
    const res = await POST(
      jsonRequest("http://localhost/api/matrix", {
        method: "POST",
        json: { id: VALID_ID, baseline: VALID_CT },
      }),
    );
    expect(res.status).toBe(500);
  });
});

describe("GET /api/matrix/[id]", () => {
  async function get(id: string, search = "") {
    const { GET } = await import("@/app/api/matrix/[id]/route");
    return GET(new Request(`http://localhost/api/matrix/${id}${search}`), {
      params: Promise.resolve({ id }),
    });
  }

  it("returns baseline + all updates and bumps lastReadDate to today", async () => {
    seedMatrix({ headSeq: 2 });
    collHolder.updates!.__seed({
      recordId: VALID_ID,
      seq: 1,
      ciphertext: "v1." + "B".repeat(80),
      clientId: "c-1",
      createdAt: "2026-01-02",
    });
    collHolder.updates!.__seed({
      recordId: VALID_ID,
      seq: 2,
      ciphertext: "v1." + "C".repeat(80),
      clientId: "c-2",
      createdAt: "2026-01-03",
    });
    const res = await get(VALID_ID);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.baseline).toBe(VALID_CT);
    expect(body.baselineSeq).toBe(0);
    expect(body.headSeq).toBe(2);
    expect(body.updates).toEqual([
      { seq: 1, ciphertext: "v1." + "B".repeat(80), clientId: "c-1" },
      { seq: 2, ciphertext: "v1." + "C".repeat(80), clientId: "c-2" },
    ]);
    expect(body.lastReadDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(collHolder.matrices!.__dump()[0].lastReadDate).toBe(body.lastReadDate);
    // TTL: read bumps lastActivityDate to today (midnight UTC).
    const stored = collHolder.matrices!.__dump()[0].lastActivityDate;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    expect(stored.getTime()).toBe(today.getTime());
  });

  it("with ?since=N >= baselineSeq, omits baseline and returns only updates past N", async () => {
    seedMatrix({ headSeq: 3 });
    for (const seq of [1, 2, 3]) {
      collHolder.updates!.__seed({
        recordId: VALID_ID,
        seq,
        ciphertext: `v1.${"X".repeat(20)}-${seq}`,
        clientId: "c",
        createdAt: "2026-01-01",
      });
    }
    const res = await get(VALID_ID, "?since=1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.baseline).toBeNull();
    expect(body.baselineSeq).toBe(0);
    expect(body.headSeq).toBe(3);
    expect(body.updates.map((u: { seq: number }) => u.seq)).toEqual([2, 3]);
  });

  it("with ?since=N < baselineSeq, includes baseline (since the caller is too far behind)", async () => {
    seedMatrix({ headSeq: 5, baselineSeq: 4 });
    collHolder.updates!.__seed({
      recordId: VALID_ID,
      seq: 5,
      ciphertext: "v1.UPD",
      clientId: "c",
      createdAt: "2026-01-01",
    });
    const res = await get(VALID_ID, "?since=2");
    const body = await res.json();
    expect(body.baseline).toBe(VALID_CT);
    expect(body.updates.map((u: { seq: number }) => u.seq)).toEqual([5]);
  });

  it("rejects invalid since", async () => {
    seedMatrix();
    for (const v of ["nope", "-1", "1.5"]) {
      const res = await get(VALID_ID, `?since=${v}`);
      expect(res.status).toBe(400);
    }
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

describe("POST /api/matrix/[id]/updates", () => {
  async function post(id: string, body: unknown) {
    const { POST } = await import("@/app/api/matrix/[id]/updates/route");
    return POST(
      jsonRequest(`http://localhost/api/matrix/${id}/updates`, {
        method: "POST",
        json: body,
      }),
      { params: Promise.resolve({ id }) },
    );
  }

  it("appends one update and assigns a monotonic seq", async () => {
    seedMatrix();
    const res1 = await post(VALID_ID, { ciphertext: "v1.U1", clientId: "alice" });
    expect(res1.status).toBe(201);
    expect(await res1.json()).toEqual({ seq: 1 });
    const res2 = await post(VALID_ID, { ciphertext: "v1.U2", clientId: "bob" });
    expect(await res2.json()).toEqual({ seq: 2 });

    const stored = collHolder.updates!.__dump();
    expect(stored.map((u) => u.seq)).toEqual([1, 2]);
    expect(stored[0].clientId).toBe("alice");
    expect(stored[1].clientId).toBe("bob");
    expect(collHolder.matrices!.__dump()[0].headSeq).toBe(2);
    // TTL: append refreshes lastActivityDate to today (midnight UTC).
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    expect(
      collHolder.matrices!.__dump()[0].lastActivityDate.getTime(),
    ).toBe(today.getTime());
  });

  it("publishes each update to subscribers", async () => {
    seedMatrix();
    const received: UpdateEvent[] = [];
    const off = subscribe(VALID_ID, (e) => received.push(e));
    await post(VALID_ID, { ciphertext: "v1.U", clientId: "alice" });
    off();
    expect(received).toEqual([{ seq: 1, ciphertext: "v1.U", clientId: "alice" }]);
  });

  it("returns 404 when the matrix does not exist", async () => {
    const res = await post(VALID_ID, { ciphertext: "v1.X", clientId: "c" });
    expect(res.status).toBe(404);
    expect(collHolder.updates!.__dump()).toHaveLength(0);
  });

  it("returns 400 on invalid body", async () => {
    seedMatrix();
    for (const body of [
      { ciphertext: "no-prefix", clientId: "c" },
      { ciphertext: "v1.OK" },
      { ciphertext: "v1.OK", clientId: "" },
      { ciphertext: "v1.OK", clientId: "x".repeat(100) },
    ]) {
      const res = await post(VALID_ID, body);
      expect(res.status).toBe(400);
    }
    expect(collHolder.matrices!.__dump()[0].headSeq).toBe(0);
  });

  it("returns 413 on oversized ciphertext", async () => {
    vi.stubEnv("MAX_CIPHERTEXT_BYTES", "50");
    seedMatrix();
    const res = await post(VALID_ID, {
      ciphertext: "v1." + "Y".repeat(200),
      clientId: "c",
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

  it("removes the record AND its updates and returns 204", async () => {
    seedMatrix({ headSeq: 2 });
    collHolder.updates!.__seed({
      recordId: VALID_ID,
      seq: 1,
      ciphertext: "v1.U",
      clientId: "c",
      createdAt: "2026-01-01",
    });
    collHolder.updates!.__seed({
      recordId: VALID_ID,
      seq: 2,
      ciphertext: "v1.U",
      clientId: "c",
      createdAt: "2026-01-01",
    });
    const res = await del(VALID_ID);
    expect(res.status).toBe(204);
    expect(collHolder.matrices!.__dump()).toHaveLength(0);
    expect(collHolder.updates!.__dump()).toHaveLength(0);
  });

  it("is idempotent for unknown ids (still 204)", async () => {
    const res = await del(VALID_ID);
    expect(res.status).toBe(204);
  });

  it("is 204 for implausible ids without touching the DB", async () => {
    collHolder.matrices = null;
    collHolder.updates = null;
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
          json: { id: VALID_ID, baseline: VALID_CT },
        }),
      );
    const r1 = await fire();
    const r2 = await fire();
    const r3 = await fire();
    expect([201, 409]).toContain(r1.status);
    expect([201, 409]).toContain(r2.status);
    expect(r3.status).toBe(429);
    expect(await r3.json()).toEqual({ error: "rate limited" });
    expect(r3.headers.get("Retry-After")).toBeTruthy();
  });

  it("does NOT throttle reads (only writes)", async () => {
    vi.stubEnv("WRITE_RATE_LIMIT_PER_MIN", "1");
    __resetRateLimiterForTests();
    seedMatrix();
    const { GET } = await import("@/app/api/matrix/[id]/route");
    for (let i = 0; i < 5; i++) {
      const res = await GET(new Request(`http://localhost/api/matrix/${VALID_ID}`), {
        params: Promise.resolve({ id: VALID_ID }),
      });
      expect(res.status).toBe(200);
    }
  });
});
