import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeCollection,
  createFakeUpdatesCollection,
  type FakeCollection,
  type FakeUpdatesCollection,
} from "./fakeCollection";
import { __resetRateLimiterForTests } from "./rateLimit";
import { __resetPubSubForTests, subscribe, type UpdateEvent } from "./pubsub";
import { updateRowId } from "./types";

/**
 * Route-handler tests for `server/routes/**`. We mock the Mongo accessors
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
    expect(collHolder.matrices!.__dump()).toHaveLength(0);
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
    collHolder.matrices!.__setInsertError(new Error("connection lost"));
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

  it("stores a time-free _id rather than letting the driver mint an ObjectId", async () => {
    // A generated ObjectId embeds its creation time to the second, which
    // would put a precise wall-clock timestamp on every edit and defeat the
    // whole point of rounding `createdAt` to a calendar day. Regression
    // test for that leak; see MatrixUpdate._id.
    seedMatrix();
    await post(VALID_ID, { ciphertext: "v1.U1", clientId: "alice" });
    await post(VALID_ID, { ciphertext: "v1.U2", clientId: "alice" });

    const stored = collHolder.updates!.__dump();
    expect(stored.map((u) => u._id)).toEqual([
      updateRowId(VALID_ID, 1),
      updateRowId(VALID_ID, 2),
    ]);
    // Nothing in the id derives from the clock: the same record and seq
    // always produce the same string.
    expect(stored[0]._id).toBe(`${VALID_ID}:1`);
  });

  it("records only a calendar date per edit, never a time of day", async () => {
    seedMatrix();
    await post(VALID_ID, { ciphertext: "v1.U1", clientId: "alice" });
    const [row] = collHolder.updates!.__dump();
    expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // No other field may carry a timestamp either.
    expect(Object.keys(row).sort()).toEqual([
      "_id",
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
    collHolder.updates!.__seed({
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

    const stored = collHolder.matrices!.__dump()[0];
    expect(stored.baseline).toBe(NEW_BASELINE);
    expect(stored.baselineSeq).toBe(4);
    expect(stored.headSeq).toBe(5);
    // TTL: write bumps lastActivityDate to today.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    expect(stored.lastActivityDate.getTime()).toBe(today.getTime());

    // Updates at seq <= 4 are pruned; seq=5 survives.
    expect(collHolder.updates!.__dump().map((u) => u.seq)).toEqual([5]);
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
    expect(collHolder.matrices!.__dump()[0].baseline).toBe(VALID_CT);
    expect(collHolder.updates!.__dump().map((u) => u.seq)).toEqual([6, 7]);
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
    const finalBaselineSeq = collHolder.matrices!.__dump()[0].baselineSeq;
    expect(finalBaselineSeq).toBeGreaterThanOrEqual(6);
  });
});

describe("DELETE /api/matrix/[id]", () => {
  async function del(id: string) {
    const { DELETE } = await import("@/server/routes/matrixById");
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
    collHolder.updates!.__seed({
      recordId: VALID_ID,
      seq: 4,
      ciphertext: "v1.U4",
      clientId: "c",
      createdAt: "2026-01-01",
    });
    collHolder.updates!.__seed({
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
    collHolder.updates!.__seed({
      recordId: VALID_ID,
      seq: 4,
      ciphertext: "v1.U4",
      clientId: "c",
      createdAt: "2026-01-01",
    });
    collHolder.updates!.__seed({
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
