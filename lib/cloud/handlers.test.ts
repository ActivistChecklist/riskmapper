import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetDbForTests, __storeForTests, getCollection } from "./db";
import { __resetRateLimiterForTests } from "./rateLimit";
import { __resetPubSubForTests, subscribe, type UpdateEvent } from "./pubsub";
import * as sqliteTest from "./sqliteTestUtils";
import type { MatrixDoc, MatrixUpdate } from "./types";
import { hashWriteToken } from "./writeAuth";

/**
 * Route-handler tests for `server/routes/**`. They run against the real
 * SQLite store (`@/lib/cloud/db`), on a fresh temporary database file per
 * test, and control the rate limiter directly via env stubs +
 * `__resetRateLimiterForTests` so the budget is fresh for each case.
 */

const VALID_ID = "abcd1234efgh5678ijkl";
const VALID_CT = "v1." + "A".repeat(80);
// Shape of a real token (base64url of 32 bytes). The server never derives
// it, so any well-formed value stands in for one minted from a key.
const WRITE_TOKEN = "T".repeat(43);
const OTHER_TOKEN = "X".repeat(43);
const AUTH = { Authorization: `Bearer ${WRITE_TOKEN}` };

let tempDb: sqliteTest.TempDb;

beforeEach(() => {
  tempDb = sqliteTest.makeTempDb("riskmapper-handlers-");
  vi.stubEnv("SQLITE_PATH", tempDb.file);
  __resetDbForTests();
  vi.stubEnv("WRITE_RATE_LIMIT_PER_MIN", "10000");
  __resetRateLimiterForTests();
  __resetPubSubForTests();
});

afterEach(() => {
  __resetDbForTests();
  tempDb.remove();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  __resetRateLimiterForTests();
  __resetPubSubForTests();
});

// What the database holds, read straight from it, and seeding that skips
// the routes. They share the routes' connection.
const db = () => __storeForTests().db;
const dumpMatrices = () => sqliteTest.dumpMatrices(db());
const dumpUpdates = () => sqliteTest.dumpUpdates(db());
const seedMatrixDoc = (doc: MatrixDoc) => sqliteTest.seedMatrix(db(), doc);
const seedUpdateRow = (update: MatrixUpdate) => sqliteTest.seedUpdate(db(), update);

function jsonRequest(url: string, init: RequestInit & { json?: unknown }): Request {
  const { json, ...rest } = init;
  return new Request(url, {
    ...rest,
    // Authorized by default; the write-authorization tests build requests
    // without it, or with the wrong token, by hand.
    headers: { "Content-Type": "application/json", ...AUTH, ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : (rest.body as BodyInit | null | undefined),
  });
}

function seedMatrix(opts?: {
  headSeq?: number;
  baselineSeq?: number;
  /** Seed a record from before write authorization: no `writeHash`. */
  legacy?: boolean;
}): void {
  seedMatrixDoc({
    ...(opts?.legacy ? {} : { writeHash: hashWriteToken(WRITE_TOKEN) }),
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
    const { GET } = await import("@/server/routes/healthz");
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("reports WEBCAT manifest health, which Railway uses to gate a deploy", async () => {
    // A build whose bytes disagree with the signed manifest must not be
    // promoted: once enrolled, that state blocks the site for extension
    // users while looking fine to everyone else. The gate lives here because
    // healthcheckPath in railway.toml points at this route.
    const { GET } = await import("@/server/routes/healthz");
    const body = await (await GET()).json();
    expect(typeof body.webcat).toBe("string");
  });

  it("fails the healthcheck when the build does not match the manifest", async () => {
    const { runManifestCheck } = await import("@/server/manifestHealth");
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const nodePath = (await import("node:path")).default;

    const dist = mkdtempSync(nodePath.join(tmpdir(), "healthz-"));
    mkdirSync(nodePath.join(dist, ".well-known/webcat"), { recursive: true });
    writeFileSync(
      nodePath.join(dist, ".well-known/webcat/manifest.json"),
      JSON.stringify({ manifest: { files: { "/missing.js": "deadbeef" } } }),
    );

    vi.stubEnv("WEBCAT_VERIFY", "enforce");
    const quiet = { log: () => {}, error: () => {} } as unknown as Console;
    runManifestCheck(dist, quiet);

    const { GET } = await import("@/server/routes/healthz");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.problems.join(" ")).toMatch(/missing from the build/);

    // Leave the module-level cache healthy for any later test.
    vi.stubEnv("WEBCAT_VERIFY", "off");
    runManifestCheck(dist, quiet);
    vi.unstubAllEnvs();
  });
});

describe("POST /api/matrix", () => {
  it("creates a record at headSeq=0 with the client-minted id", async () => {
    const { POST } = await import("@/server/routes/matrix");
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
    const stored = dumpMatrices();
    expect(stored).toHaveLength(1);
    expect(stored[0]._id).toBe(VALID_ID);
    expect(stored[0].baseline).toBe(VALID_CT);
    expect(stored[0].headSeq).toBe(0);
    expect(stored[0].baselineSeq).toBe(0);
    // Idle cleanup: create stamps lastActivityDate (midnight UTC).
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    expect(stored[0].lastActivityDate.getTime()).toBe(today.getTime());
  });

  it("rejects an id that doesn't match the plausible-id regex", async () => {
    const { POST } = await import("@/server/routes/matrix");
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
    expect(dumpMatrices()).toHaveLength(0);
  });

  it("rejects a missing or non-envelope baseline", async () => {
    const { POST } = await import("@/server/routes/matrix");
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
    const { POST } = await import("@/server/routes/matrix");
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
    const { POST } = await import("@/server/routes/matrix");
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
    vi.spyOn(await getCollection(), "insertOne").mockRejectedValueOnce(
      new Error("disk I/O error"),
    );
    const { POST } = await import("@/server/routes/matrix");
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
    const { GET } = await import("@/server/routes/matrixById");
    return GET(new Request(`http://localhost/api/matrix/${id}${search}`), {
      params: Promise.resolve({ id }),
    });
  }

  it("returns baseline + all updates and bumps lastReadDate to today", async () => {
    seedMatrix({ headSeq: 2 });
    seedUpdateRow({
      recordId: VALID_ID,
      seq: 1,
      ciphertext: "v1." + "B".repeat(80),
      clientId: "c-1",
      createdAt: "2026-01-02",
    });
    seedUpdateRow({
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
    expect(dumpMatrices()[0].lastReadDate).toBe(body.lastReadDate);
    // Idle cleanup: read bumps lastActivityDate to today (midnight UTC).
    const stored = dumpMatrices()[0].lastActivityDate;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    expect(stored.getTime()).toBe(today.getTime());
  });

  it("with ?since=N >= baselineSeq, omits baseline and returns only updates past N", async () => {
    seedMatrix({ headSeq: 3 });
    for (const seq of [1, 2, 3]) {
      seedUpdateRow({
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
    seedUpdateRow({
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
    const { POST } = await import("@/server/routes/matrixUpdates");
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

    const stored = dumpUpdates();
    expect(stored.map((u) => u.seq)).toEqual([1, 2]);
    expect(stored[0].clientId).toBe("alice");
    expect(stored[1].clientId).toBe("bob");
    expect(dumpMatrices()[0].headSeq).toBe(2);
    // Idle cleanup: append refreshes lastActivityDate to today (midnight UTC).
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    expect(
      dumpMatrices()[0].lastActivityDate.getTime(),
    ).toBe(today.getTime());
  });

  it("stores no id or counter that could date an edit", async () => {
    // Under MongoDB a driver-minted ObjectId would have embedded each edit's
    // creation time to the second. The SQLite equivalent is a table's hidden
    // rowid, which would record the global order edits arrived in across
    // every matrix. Regression test for both; see MatrixUpdate._id.
    seedMatrix();
    await post(VALID_ID, { ciphertext: "v1.U1", clientId: "alice" });
    await post(VALID_ID, { ciphertext: "v1.U2", clientId: "alice" });

    const raw = db()
      .prepare("SELECT * FROM matrix_updates ORDER BY seq")
      .all() as { doc: string }[];
    expect(raw).toHaveLength(2);
    for (const row of raw) {
      expect(Object.keys(row).sort()).toEqual(["doc", "recordId", "seq"]);
      expect(Object.keys(JSON.parse(row.doc)).sort()).toEqual([
        "ciphertext",
        "clientId",
        "createdAt",
      ]);
    }
    for (const table of ["matrices", "matrix_updates"]) {
      expect(() => db().prepare(`SELECT rowid FROM ${table}`).all()).toThrow(
        /no such column: rowid/,
      );
    }
  });

  it("records only a calendar date per edit, never a time of day", async () => {
    seedMatrix();
    await post(VALID_ID, { ciphertext: "v1.U1", clientId: "alice" });
    const [row] = dumpUpdates();
    expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // No other field may carry a timestamp either.
    expect(Object.keys(row).sort()).toEqual([
      "ciphertext",
      "clientId",
      "createdAt",
      "recordId",
      "seq",
    ]);
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
    expect(dumpUpdates()).toHaveLength(0);
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
    expect(dumpMatrices()[0].headSeq).toBe(0);
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

describe("PUT /api/matrix/[id]/baseline", () => {
  async function put(id: string, body: unknown) {
    const { PUT } = await import("@/server/routes/matrixBaseline");
    return PUT(
      jsonRequest(`http://localhost/api/matrix/${id}/baseline`, {
        method: "PUT",
        json: body,
      }),
      { params: Promise.resolve({ id }) },
    );
  }

  function seedUpdate(seq: number, ct = `v1.U${seq}`): void {
    seedUpdateRow({
      recordId: VALID_ID,
      seq,
      ciphertext: ct,
      clientId: "c",
      createdAt: "2026-01-01",
    });
  }

  const NEW_BASELINE = "v1." + "Z".repeat(80);

  it("advances baselineSeq, replaces the baseline, and prunes folded updates", async () => {
    seedMatrix({ headSeq: 5, baselineSeq: 0 });
    for (const seq of [1, 2, 3, 4, 5]) seedUpdate(seq);

    const res = await put(VALID_ID, {
      baseline: NEW_BASELINE,
      baselineSeq: 4,
      clientId: "alice",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ baselineSeq: 4, headSeq: 5 });

    const stored = dumpMatrices()[0];
    expect(stored.baseline).toBe(NEW_BASELINE);
    expect(stored.baselineSeq).toBe(4);
    expect(stored.headSeq).toBe(5);
    // Idle cleanup: write bumps lastActivityDate to today.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    expect(stored.lastActivityDate.getTime()).toBe(today.getTime());

    // Updates at seq <= 4 are pruned; seq=5 survives.
    expect(dumpUpdates().map((u) => u.seq)).toEqual([5]);
  });

  it("returns 409 with current state when baselineSeq has already been reached", async () => {
    seedMatrix({ headSeq: 7, baselineSeq: 5 });
    seedUpdate(6);
    seedUpdate(7);
    const res = await put(VALID_ID, {
      baseline: NEW_BASELINE,
      baselineSeq: 5,
      clientId: "alice",
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "baseline not advanced",
      baselineSeq: 5,
      headSeq: 7,
    });
    // Baseline doc + updates are untouched.
    expect(dumpMatrices()[0].baseline).toBe(VALID_CT);
    expect(dumpUpdates().map((u) => u.seq)).toEqual([6, 7]);
  });

  it("returns 409 when baselineSeq is in the future (exceeds headSeq)", async () => {
    seedMatrix({ headSeq: 3, baselineSeq: 0 });
    const res = await put(VALID_ID, {
      baseline: NEW_BASELINE,
      baselineSeq: 99,
      clientId: "alice",
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "baseline not advanced",
      baselineSeq: 0,
      headSeq: 3,
    });
  });

  it("rejects an invalid baseline envelope", async () => {
    seedMatrix({ headSeq: 2, baselineSeq: 0 });
    for (const baseline of [undefined, 42, "no-prefix", ""]) {
      const res = await put(VALID_ID, {
        baseline,
        baselineSeq: 1,
        clientId: "alice",
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid baseline" });
    }
  });

  it("rejects invalid baselineSeq values", async () => {
    seedMatrix({ headSeq: 2, baselineSeq: 0 });
    for (const baselineSeq of [undefined, -1, 1.5, "1", null]) {
      const res = await put(VALID_ID, {
        baseline: NEW_BASELINE,
        baselineSeq,
        clientId: "alice",
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid baselineSeq" });
    }
  });

  it("rejects missing or malformed clientId", async () => {
    seedMatrix({ headSeq: 2, baselineSeq: 0 });
    for (const clientId of [undefined, "", "x".repeat(100), 42]) {
      const res = await put(VALID_ID, {
        baseline: NEW_BASELINE,
        baselineSeq: 1,
        clientId,
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid clientId" });
    }
  });

  it("returns 413 on oversized baseline", async () => {
    vi.stubEnv("MAX_CIPHERTEXT_BYTES", "50");
    seedMatrix({ headSeq: 2, baselineSeq: 0 });
    const res = await put(VALID_ID, {
      baseline: "v1." + "Y".repeat(200),
      baselineSeq: 1,
      clientId: "alice",
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "baseline too large" });
  });

  it("returns 404 when the matrix doesn't exist", async () => {
    const res = await put(VALID_ID, {
      baseline: NEW_BASELINE,
      baselineSeq: 1,
      clientId: "alice",
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });

  it("returns 404 for an implausible id", async () => {
    const res = await put("short", {
      baseline: NEW_BASELINE,
      baselineSeq: 1,
      clientId: "alice",
    });
    expect(res.status).toBe(404);
  });

  it("post-prune leaves later appends intact and read returns baseline + tail", async () => {
    seedMatrix({ headSeq: 5, baselineSeq: 0 });
    for (const seq of [1, 2, 3, 4, 5]) seedUpdate(seq);

    await put(VALID_ID, {
      baseline: NEW_BASELINE,
      baselineSeq: 5,
      clientId: "alice",
    });

    // A fresh read with no `since` returns the new baseline + no updates.
    const { GET } = await import("@/server/routes/matrixById");
    const res = await GET(new Request(`http://localhost/api/matrix/${VALID_ID}`), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    const body = await res.json();
    expect(body.baseline).toBe(NEW_BASELINE);
    expect(body.baselineSeq).toBe(5);
    expect(body.updates).toEqual([]);
  });

  it("only one of two concurrent compactors wins; the loser sees 409", async () => {
    seedMatrix({ headSeq: 10, baselineSeq: 0 });
    for (const seq of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) seedUpdate(seq);

    const [r1, r2] = await Promise.all([
      put(VALID_ID, {
        baseline: NEW_BASELINE,
        baselineSeq: 8,
        clientId: "alice",
      }),
      put(VALID_ID, {
        baseline: NEW_BASELINE,
        baselineSeq: 6,
        clientId: "bob",
      }),
    ]);
    const winners = [r1, r2].filter((r) => r.status === 200);
    const losers = [r1, r2].filter((r) => r.status === 409);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    // The seq-8 baseline must win regardless of arrival order — or, if seq=6
    // arrived first, seq=8 still wins because 8 > 6.
    const finalBaselineSeq = dumpMatrices()[0].baselineSeq;
    expect(finalBaselineSeq).toBeGreaterThanOrEqual(6);
  });
});

describe("DELETE /api/matrix/[id]", () => {
  async function del(id: string) {
    const { DELETE } = await import("@/server/routes/matrixById");
    return DELETE(
      new Request(`http://localhost/api/matrix/${id}`, {
        method: "DELETE",
        headers: AUTH,
      }),
      { params: Promise.resolve({ id }) },
    );
  }

  it("removes the record AND its updates and returns 204", async () => {
    seedMatrix({ headSeq: 2 });
    seedUpdateRow({
      recordId: VALID_ID,
      seq: 1,
      ciphertext: "v1.U",
      clientId: "c",
      createdAt: "2026-01-01",
    });
    seedUpdateRow({
      recordId: VALID_ID,
      seq: 2,
      ciphertext: "v1.U",
      clientId: "c",
      createdAt: "2026-01-01",
    });
    const res = await del(VALID_ID);
    expect(res.status).toBe(204);
    expect(dumpMatrices()).toHaveLength(0);
    expect(dumpUpdates()).toHaveLength(0);
  });

  it("is idempotent for unknown ids (still 204)", async () => {
    const res = await del(VALID_ID);
    expect(res.status).toBe(204);
  });

  it("is 204 for implausible ids without touching the DB", async () => {
    const res = await del("short");
    expect(res.status).toBe(204);
    // The database opens on first use, so its file not existing proves the
    // route never asked for it.
    expect(existsSync(tempDb.file)).toBe(false);
  });
});

describe("GET /api/matrix/[id]/events (SSE backfill)", () => {
  /**
   * Read frames from the SSE response stream until at least `wantFrames`
   * complete frames (delimited by `\n\n`) are available, then abort.
   * Returns the parsed frames, each as `{ event, id, data }`.
   */
  async function readFrames(
    res: Response,
    wantFrames: number,
    abort: AbortController,
    timeoutMs = 1000,
  ): Promise<Array<{ event: string; id: string | null; data: string }>> {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    const frames: Array<{ event: string; id: string | null; data: string }> = [];
    const start = Date.now();
    while (frames.length < wantFrames) {
      if (Date.now() - start > timeoutMs) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      while (true) {
        const idx = buffered.indexOf("\n\n");
        if (idx < 0) break;
        const raw = buffered.slice(0, idx);
        buffered = buffered.slice(idx + 2);
        if (raw.startsWith(":")) continue; // heartbeat comment
        const frame: { event: string; id: string | null; data: string } = {
          event: "message",
          id: null,
          data: "",
        };
        for (const line of raw.split("\n")) {
          if (line.startsWith("event: ")) frame.event = line.slice(7);
          else if (line.startsWith("id: ")) frame.id = line.slice(4);
          else if (line.startsWith("data: ")) frame.data += line.slice(6);
        }
        frames.push(frame);
      }
    }
    abort.abort();
    try {
      reader.releaseLock();
    } catch {
      // already released
    }
    return frames;
  }

  it("replays a `baseline` frame when Last-Event-ID is older than baselineSeq", async () => {
    seedMatrix({ headSeq: 5, baselineSeq: 3 });
    // After compaction, only updates with seq > baselineSeq survive.
    seedUpdateRow({
      recordId: VALID_ID,
      seq: 4,
      ciphertext: "v1.U4",
      clientId: "c",
      createdAt: "2026-01-01",
    });
    seedUpdateRow({
      recordId: VALID_ID,
      seq: 5,
      ciphertext: "v1.U5",
      clientId: "c",
      createdAt: "2026-01-01",
    });

    const { GET } = await import("@/server/routes/matrixEvents");
    const abort = new AbortController();
    const req = new Request(`http://localhost/api/matrix/${VALID_ID}/events`, {
      headers: { "last-event-id": "1" },
      signal: abort.signal,
    });
    const res = await GET(req, { params: Promise.resolve({ id: VALID_ID }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const frames = await readFrames(res, 3, abort);
    // First: baseline frame.
    expect(frames[0].event).toBe("baseline");
    expect(frames[0].id).toBe("3");
    expect(JSON.parse(frames[0].data)).toEqual({
      baselineSeq: 3,
      baseline: VALID_CT,
    });
    // Then update frames for seq 4 and 5 — NOT seq 1..3.
    expect(frames[1].event).toBe("update");
    expect(frames[1].id).toBe("4");
    expect(frames[2].event).toBe("update");
    expect(frames[2].id).toBe("5");
  });

  it("does NOT send a baseline frame when Last-Event-ID is at or past baselineSeq", async () => {
    seedMatrix({ headSeq: 5, baselineSeq: 3 });
    seedUpdateRow({
      recordId: VALID_ID,
      seq: 4,
      ciphertext: "v1.U4",
      clientId: "c",
      createdAt: "2026-01-01",
    });
    seedUpdateRow({
      recordId: VALID_ID,
      seq: 5,
      ciphertext: "v1.U5",
      clientId: "c",
      createdAt: "2026-01-01",
    });

    const { GET } = await import("@/server/routes/matrixEvents");
    const abort = new AbortController();
    const req = new Request(`http://localhost/api/matrix/${VALID_ID}/events`, {
      headers: { "last-event-id": "3" },
      signal: abort.signal,
    });
    const res = await GET(req, { params: Promise.resolve({ id: VALID_ID }) });
    const frames = await readFrames(res, 2, abort);
    expect(frames.every((f) => f.event === "update")).toBe(true);
    expect(frames.map((f) => f.id)).toEqual(["4", "5"]);
  });
});

describe("rate limiting", () => {
  it("returns 429 once the per-minute write budget is exceeded", async () => {
    vi.stubEnv("WRITE_RATE_LIMIT_PER_MIN", "2");
    __resetRateLimiterForTests();
    const { POST } = await import("@/server/routes/matrix");
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
    const { GET } = await import("@/server/routes/matrixById");
    for (let i = 0; i < 5; i++) {
      const res = await GET(new Request(`http://localhost/api/matrix/${VALID_ID}`), {
        params: Promise.resolve({ id: VALID_ID }),
      });
      expect(res.status).toBe(200);
    }
  });
});

describe("write authorization", () => {
  // The record id reaches the server in the path, so it shows up in access
  // logs. Before write authorization, the id alone was enough to delete a
  // shared matrix or append junk that stopped it from loading. Every write
  // now has to carry the token derived from the key.

  type Auth = "none" | "wrong" | "malformed";

  function headersFor(auth: Auth): Record<string, string> {
    if (auth === "none") return {};
    if (auth === "wrong") return { Authorization: `Bearer ${OTHER_TOKEN}` };
    return { Authorization: "Bearer not-a-real-token" };
  }

  async function append(auth: Auth | "ok") {
    const { POST } = await import("@/server/routes/matrixUpdates");
    return POST(
      new Request(`http://localhost/api/matrix/${VALID_ID}/updates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(auth === "ok" ? AUTH : headersFor(auth)),
        },
        body: JSON.stringify({ ciphertext: VALID_CT, clientId: "attacker" }),
      }),
      { params: Promise.resolve({ id: VALID_ID }) },
    );
  }

  async function del(auth: Auth) {
    const { DELETE } = await import("@/server/routes/matrixById");
    return DELETE(
      new Request(`http://localhost/api/matrix/${VALID_ID}`, {
        method: "DELETE",
        headers: headersFor(auth),
      }),
      { params: Promise.resolve({ id: VALID_ID }) },
    );
  }

  async function compact(auth: Auth) {
    const { PUT } = await import("@/server/routes/matrixBaseline");
    return PUT(
      new Request(`http://localhost/api/matrix/${VALID_ID}/baseline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...headersFor(auth) },
        body: JSON.stringify({
          baseline: "v1.JUNK",
          baselineSeq: 2,
          clientId: "attacker",
        }),
      }),
      { params: Promise.resolve({ id: VALID_ID }) },
    );
  }

  async function read(headers: Record<string, string> = {}) {
    const { GET } = await import("@/server/routes/matrixById");
    return GET(new Request(`http://localhost/api/matrix/${VALID_ID}`, { headers }), {
      params: Promise.resolve({ id: VALID_ID }),
    });
  }

  function seedTwoUpdates(): void {
    for (const seq of [1, 2]) {
      seedUpdateRow({
        recordId: VALID_ID,
        seq,
        ciphertext: `v1.U${seq}`,
        clientId: "c",
        createdAt: "2026-01-01",
      });
    }
  }

  it("refuses to create a record without a token", async () => {
    const { POST } = await import("@/server/routes/matrix");
    const res = await POST(
      new Request("http://localhost/api/matrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: VALID_ID, baseline: VALID_CT }),
      }),
    );
    expect(res.status).toBe(401);
    expect(dumpMatrices()).toEqual([]);
  });

  it("stores a hash of the token on create, never the token itself", async () => {
    const { POST } = await import("@/server/routes/matrix");
    const res = await POST(
      jsonRequest("http://localhost/api/matrix", {
        method: "POST",
        json: { id: VALID_ID, baseline: VALID_CT },
      }),
    );
    expect(res.status).toBe(201);
    const [doc] = dumpMatrices();
    expect(doc.writeHash).toBe(hashWriteToken(WRITE_TOKEN));
    expect(JSON.stringify(doc)).not.toContain(WRITE_TOKEN);
  });

  it.each([
    ["none", 401],
    ["malformed", 401],
    ["wrong", 403],
  ] as const)("refuses to append with %s token (%i)", async (auth, status) => {
    seedMatrix();
    const received: UpdateEvent[] = [];
    subscribe(VALID_ID, (e) => received.push(e));

    const res = await append(auth);

    expect(res.status).toBe(status);
    expect(dumpUpdates()).toEqual([]);
    expect(dumpMatrices()[0].headSeq).toBe(0);
    expect(received).toEqual([]);
  });

  it.each([
    ["none", 401],
    ["malformed", 401],
    ["wrong", 403],
  ] as const)("refuses to delete with %s token (%i)", async (auth, status) => {
    seedMatrix({ headSeq: 2 });
    seedTwoUpdates();

    const res = await del(auth);

    expect(res.status).toBe(status);
    expect(dumpMatrices()).toHaveLength(1);
    expect(dumpUpdates()).toHaveLength(2);
  });

  it.each([
    ["none", 401],
    ["malformed", 401],
    ["wrong", 403],
  ] as const)(
    "refuses to replace the baseline with %s token (%i), so it can't prune the log",
    async (auth, status) => {
      seedMatrix({ headSeq: 2 });
      seedTwoUpdates();

      const res = await compact(auth);

      expect(res.status).toBe(status);
      const [doc] = dumpMatrices();
      expect(doc.baseline).toBe(VALID_CT);
      expect(doc.baselineSeq).toBe(0);
      expect(dumpUpdates()).toHaveLength(2);
    },
  );

  it("still lets anyone with the id read, with or without a token", async () => {
    seedMatrix();
    expect((await read()).status).toBe(200);
    expect((await read({ Authorization: `Bearer ${OTHER_TOKEN}` })).status).toBe(200);
    // A wrong token on a read never overwrites the stored hash.
    expect(dumpMatrices()[0].writeHash).toBe(
      hashWriteToken(WRITE_TOKEN),
    );
  });

  describe("records created before write authorization", () => {
    it("are claimed by the first authenticated write, then refuse other tokens", async () => {
      seedMatrix({ legacy: true });

      expect((await append("ok")).status).toBe(201);
      expect(dumpMatrices()[0].writeHash).toBe(
        hashWriteToken(WRITE_TOKEN),
      );
      expect((await append("wrong")).status).toBe(403);
      expect((await del("wrong")).status).toBe(403);
      expect(dumpMatrices()).toHaveLength(1);
    });

    it("still refuse writes with no token at all", async () => {
      seedMatrix({ legacy: true });
      expect((await append("none")).status).toBe(401);
      expect((await del("none")).status).toBe(401);
      expect(dumpMatrices()[0].writeHash).toBeUndefined();
    });

    it("are claimed by a read that carries a token, so the window closes on open", async () => {
      seedMatrix({ legacy: true });

      expect((await read()).status).toBe(200);
      expect(dumpMatrices()[0].writeHash).toBeUndefined();

      expect((await read(AUTH)).status).toBe(200);
      expect(dumpMatrices()[0].writeHash).toBe(
        hashWriteToken(WRITE_TOKEN),
      );
      expect((await append("wrong")).status).toBe(403);
    });
  });
});
