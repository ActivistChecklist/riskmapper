import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp, type AppCollection } from "./app.js";
import { createFakeCollection } from "./fakeCollection.js";

const VALID_ID = "abcd1234efgh5678ijkl";
const VALID_CT = "v1." + "A".repeat(80);
const CORS_ORIGIN = "https://app.example";

function setup(opts?: {
  rateLimitPerMin?: number | false;
  maxCiphertextBytes?: number;
}) {
  const coll = createFakeCollection();
  const app = createApp({
    getColl: async () => coll,
    corsOrigins: [CORS_ORIGIN],
    rateLimitPerMin: opts?.rateLimitPerMin ?? false,
    maxCiphertextBytes: opts?.maxCiphertextBytes,
  });
  return { app, coll };
}

describe("GET /healthz", () => {
  it("returns ok", async () => {
    const { app } = setup();
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe("POST /api/matrix", () => {
  it("creates a record with the client-minted id", async () => {
    const { app, coll } = setup();
    const res = await request(app)
      .post("/api/matrix")
      .send({ id: VALID_ID, ciphertext: VALID_CT });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(VALID_ID);
    expect(res.body.version).toBe(1);
    expect(res.body.lastReadDate).toBe(null);
    expect(res.body.createdDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const stored = coll.__dump();
    expect(stored).toHaveLength(1);
    expect(stored[0]._id).toBe(VALID_ID);
    expect(stored[0].ciphertext).toBe(VALID_CT);
    expect(stored[0].version).toBe(1);
    expect(stored[0].lamport).toBe(1);
  });

  it("rejects an id that doesn't match the plausible-id regex", async () => {
    const { app, coll } = setup();
    const tooShort = "abc";
    const tooLong = "x".repeat(80);
    const badChars = "abc def ghi jkl mno";
    for (const id of [tooShort, tooLong, badChars]) {
      const res = await request(app)
        .post("/api/matrix")
        .send({ id, ciphertext: VALID_CT });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invalid id");
    }
    expect(coll.__dump()).toHaveLength(0);
  });

  it("rejects a missing or non-envelope ciphertext", async () => {
    const { app } = setup();
    const cases: [string, unknown][] = [
      ["missing", undefined],
      ["not a string", 42],
      ["wrong shape", "no-dot-prefix"],
      ["empty", ""],
    ];
    for (const [, ct] of cases) {
      const res = await request(app)
        .post("/api/matrix")
        .send({ id: VALID_ID, ciphertext: ct });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invalid ciphertext");
    }
  });

  it("returns 413 when ciphertext exceeds the cap", async () => {
    const { app } = setup({ maxCiphertextBytes: 100 });
    const ct = "v1." + "A".repeat(200);
    const res = await request(app)
      .post("/api/matrix")
      .send({ id: VALID_ID, ciphertext: ct });
    expect(res.status).toBe(413);
    expect(res.body.error).toBe("ciphertext too large");
  });

  it("returns 409 on duplicate id", async () => {
    const { app, coll } = setup();
    coll.__seed({
      _id: VALID_ID,
      ciphertext: VALID_CT,
      lamport: 1,
      version: 1,
      createdDate: "2026-01-01",
      lastWriteDate: "2026-01-01",
      lastReadDate: null,
    });
    const res = await request(app)
      .post("/api/matrix")
      .send({ id: VALID_ID, ciphertext: VALID_CT });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("id already exists");
  });

  it("returns 500 on unexpected DB failure (not duplicate)", async () => {
    const { app, coll } = setup();
    coll.__setInsertError(new Error("connection lost"));
    const res = await request(app)
      .post("/api/matrix")
      .send({ id: VALID_ID, ciphertext: VALID_CT });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("internal");
  });
});

describe("GET /api/matrix/:id", () => {
  it("returns the record and bumps lastReadDate to today", async () => {
    const { app, coll } = setup();
    coll.__seed({
      _id: VALID_ID,
      ciphertext: VALID_CT,
      lamport: 4,
      version: 7,
      createdDate: "2026-01-01",
      lastWriteDate: "2026-01-15",
      lastReadDate: "2025-12-30",
    });
    const res = await request(app).get(`/api/matrix/${VALID_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.ciphertext).toBe(VALID_CT);
    expect(res.body.version).toBe(7);
    expect(res.body.lamport).toBe(4);
    expect(res.body.lastReadDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // lastReadDate was advanced
    expect(res.body.lastReadDate).not.toBe("2025-12-30");
    expect(coll.__dump()[0].lastReadDate).toBe(res.body.lastReadDate);
  });

  it("returns 404 for an implausible id", async () => {
    const { app } = setup();
    const res = await request(app).get("/api/matrix/short");
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown id", async () => {
    const { app } = setup();
    const res = await request(app).get(`/api/matrix/${VALID_ID}`);
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/matrix/:id", () => {
  beforeEach(() => {});

  it("updates the record and increments version when expectedVersion matches", async () => {
    const { app, coll } = setup();
    coll.__seed({
      _id: VALID_ID,
      ciphertext: "v1.OLD",
      lamport: 1,
      version: 3,
      createdDate: "2026-01-01",
      lastWriteDate: "2026-01-01",
      lastReadDate: null,
    });
    const newCt = "v1." + "B".repeat(80);
    const res = await request(app)
      .put(`/api/matrix/${VALID_ID}`)
      .send({ ciphertext: newCt, lamport: 2, expectedVersion: 3 });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(4);
    expect(coll.__dump()[0].ciphertext).toBe(newCt);
    expect(coll.__dump()[0].version).toBe(4);
    expect(coll.__dump()[0].lamport).toBe(2);
  });

  it("returns 409 + remote payload when expectedVersion mismatches", async () => {
    const { app, coll } = setup();
    coll.__seed({
      _id: VALID_ID,
      ciphertext: "v1.REMOTE",
      lamport: 9,
      version: 5,
      createdDate: "2026-01-01",
      lastWriteDate: "2026-01-15",
      lastReadDate: null,
    });
    const res = await request(app)
      .put(`/api/matrix/${VALID_ID}`)
      .send({ ciphertext: VALID_CT, lamport: 8, expectedVersion: 3 });
    expect(res.status).toBe(409);
    expect(res.body.ciphertext).toBe("v1.REMOTE");
    expect(res.body.version).toBe(5);
    expect(res.body.lamport).toBe(9);
    // Record must be unchanged
    expect(coll.__dump()[0].ciphertext).toBe("v1.REMOTE");
    expect(coll.__dump()[0].version).toBe(5);
  });

  it("returns 404 when the record does not exist", async () => {
    const { app } = setup();
    const res = await request(app)
      .put(`/api/matrix/${VALID_ID}`)
      .send({ ciphertext: VALID_CT, lamport: 1, expectedVersion: 1 });
    expect(res.status).toBe(404);
  });

  it("returns 400 on invalid body", async () => {
    const { app, coll } = setup();
    coll.__seed({
      _id: VALID_ID,
      ciphertext: "v1.OLD",
      lamport: 1,
      version: 1,
      createdDate: "2026-01-01",
      lastWriteDate: "2026-01-01",
      lastReadDate: null,
    });
    const cases: Array<Record<string, unknown>> = [
      { ciphertext: VALID_CT, lamport: -1, expectedVersion: 1 },
      { ciphertext: VALID_CT, lamport: 1, expectedVersion: -1 },
      { ciphertext: VALID_CT, lamport: 1.5, expectedVersion: 1 },
      { ciphertext: VALID_CT, expectedVersion: 1 },
      { ciphertext: "not-an-envelope", lamport: 1, expectedVersion: 1 },
    ];
    for (const body of cases) {
      const res = await request(app).put(`/api/matrix/${VALID_ID}`).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invalid body");
    }
    // Record must be unchanged
    expect(coll.__dump()[0].ciphertext).toBe("v1.OLD");
  });

  it("returns 413 when the ciphertext exceeds the cap", async () => {
    const { app, coll } = setup({ maxCiphertextBytes: 100 });
    coll.__seed({
      _id: VALID_ID,
      ciphertext: "v1.OLD",
      lamport: 1,
      version: 1,
      createdDate: "2026-01-01",
      lastWriteDate: "2026-01-01",
      lastReadDate: null,
    });
    const big = "v1." + "X".repeat(200);
    const res = await request(app)
      .put(`/api/matrix/${VALID_ID}`)
      .send({ ciphertext: big, lamport: 1, expectedVersion: 1 });
    expect(res.status).toBe(413);
  });
});

describe("DELETE /api/matrix/:id", () => {
  it("removes the record and returns 204", async () => {
    const { app, coll } = setup();
    coll.__seed({
      _id: VALID_ID,
      ciphertext: VALID_CT,
      lamport: 1,
      version: 1,
      createdDate: "2026-01-01",
      lastWriteDate: "2026-01-01",
      lastReadDate: null,
    });
    const res = await request(app).delete(`/api/matrix/${VALID_ID}`);
    expect(res.status).toBe(204);
    expect(coll.__dump()).toHaveLength(0);
  });

  it("is idempotent for unknown ids (still 204)", async () => {
    const { app } = setup();
    const res = await request(app).delete(`/api/matrix/${VALID_ID}`);
    expect(res.status).toBe(204);
  });

  it("is 204 for implausible ids without touching the DB", async () => {
    const calls: unknown[] = [];
    const fake: AppCollection = {
      async insertOne() { calls.push("insertOne"); return null; },
      async findOne() { calls.push("findOne"); return null; },
      async findOneAndUpdate() { calls.push("findOneAndUpdate"); return null; },
      async deleteOne() { calls.push("deleteOne"); return null; },
    };
    const isolated = createApp({
      getColl: async () => fake,
      corsOrigins: [CORS_ORIGIN],
      rateLimitPerMin: false,
    });
    const res = await request(isolated).delete("/api/matrix/short");
    expect(res.status).toBe(204);
    expect(calls).toEqual([]);
  });
});

describe("rate limiting", () => {
  it("returns 429 once the per-minute budget is exceeded", async () => {
    const { app } = setup({ rateLimitPerMin: 2 });
    const make = () =>
      request(app).post("/api/matrix").send({ id: VALID_ID, ciphertext: VALID_CT });
    const r1 = await make();
    const r2 = await make();
    const r3 = await make();
    // The first hits 201, the second hits 409 (duplicate; same id) — both
    // count toward the budget. The third must be throttled.
    expect([201, 409]).toContain(r1.status);
    expect([201, 409]).toContain(r2.status);
    expect(r3.status).toBe(429);
    expect(r3.body.error).toBe("rate limited");
  });

  it("does NOT throttle reads (only writes)", async () => {
    const { app, coll } = setup({ rateLimitPerMin: 1 });
    coll.__seed({
      _id: VALID_ID,
      ciphertext: VALID_CT,
      lamport: 1,
      version: 1,
      createdDate: "2026-01-01",
      lastWriteDate: "2026-01-01",
      lastReadDate: null,
    });
    for (let i = 0; i < 5; i++) {
      const res = await request(app).get(`/api/matrix/${VALID_ID}`);
      expect(res.status).toBe(200);
    }
  });
});

describe("CORS", () => {
  it("echoes Access-Control-Allow-Origin for an allowed origin", async () => {
    const { app } = setup();
    const res = await request(app)
      .get(`/api/matrix/${VALID_ID}`)
      .set("Origin", CORS_ORIGIN);
    // 404 is fine — we just want the CORS header to be present
    expect(res.headers["access-control-allow-origin"]).toBe(CORS_ORIGIN);
  });

  it("does NOT set Access-Control-Allow-Origin for a disallowed origin", async () => {
    const { app } = setup();
    const res = await request(app)
      .get(`/api/matrix/${VALID_ID}`)
      .set("Origin", "https://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

afterEach(() => {});
