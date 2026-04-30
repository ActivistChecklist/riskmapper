import cors from "cors";
import express, { type Response } from "express";
import { rateLimit } from "express-rate-limit";
import {
  CORS_ALLOW_ORIGINS,
  MAX_CIPHERTEXT_BYTES,
  WRITE_RATE_LIMIT_PER_MIN,
} from "./config.js";
import { getCollection, todayUtc, type MatrixDoc } from "./db.js";

/**
 * Risk Matrix cloud relay — accepts OPAQUE encrypted blobs only.
 *
 * The server cannot decrypt anything. It only stores and returns ciphertext +
 * monotonic metadata, with optimistic-concurrency `expectedVersion` checks on
 * writes. See `THREAT-MODEL.md`.
 *
 * **Logging hygiene:** never log request bodies — they're ciphertext, but we
 * also don't want to write opaque blobs into our log pipeline.
 *
 * **Rate limiting:** uses `express-rate-limit`, which keys on `req.ip`.
 * Combined with a correctly-configured `trust proxy` setting (a hop count
 * matching the deployment), `req.ip` is the proxy-injected client IP and
 * resists `X-Forwarded-For` spoofing. See README for the trust-proxy note.
 */
export function createApp() {
  const app = express();
  // ONE proxy hop in front of the app (Railway's edge). If you deploy behind
  // a different topology (e.g. a CDN in front of a reverse proxy), update
  // this to match the actual hop count.
  app.set("trust proxy", 1);
  app.use(express.json({ limit: MAX_CIPHERTEXT_BYTES + 1024 }));

  // CORS is required: a deployer who forgets `CORS_ALLOW_ORIGINS` would
  // otherwise ship an API responding to every origin's simple GETs. We
  // fail-fast at startup instead (see config.ts assertion).
  app.use(
    cors({
      origin: CORS_ALLOW_ORIGINS,
      methods: ["GET", "POST", "PUT", "DELETE"],
      allowedHeaders: ["Content-Type"],
      credentials: false,
    }),
  );

  const writeLimiter = rateLimit({
    windowMs: 60_000,
    limit: WRITE_RATE_LIMIT_PER_MIN,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "rate limited" },
  });

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/matrix", writeLimiter, async (req, res) => {
    const body = req.body as { id?: unknown; ciphertext?: unknown };
    const ct = body.ciphertext;
    if (!validCiphertext(ct)) {
      res.status(400).json({ error: "invalid ciphertext" });
      return;
    }
    if (ct.length > MAX_CIPHERTEXT_BYTES) {
      res.status(413).json({ error: "ciphertext too large" });
      return;
    }
    if (typeof body.id !== "string" || !isPlausibleId(body.id)) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    const id = body.id;
    const today = todayUtc();
    const doc: MatrixDoc = {
      _id: id,
      ciphertext: ct,
      lamport: 1,
      version: 1,
      createdDate: today,
      lastWriteDate: today,
      lastReadDate: null,
    };
    try {
      const coll = await getCollection();
      await coll.insertOne(doc);
    } catch (err) {
      // Duplicate-key → astronomically unlikely with 128-bit randomUUID, but
      // reject cleanly. Anything else is a 500.
      if (isDuplicateKey(err)) {
        res.status(409).json({ error: "id already exists" });
        return;
      }
      sendInternal(res, err);
      return;
    }
    res.status(201).json({
      id,
      version: 1,
      createdDate: today,
      lastWriteDate: today,
      lastReadDate: null,
    });
  });

  app.get("/api/matrix/:id", async (req, res) => {
    const id = req.params.id;
    if (!isPlausibleId(id)) {
      res.status(404).json({ error: "not found" });
      return;
    }
    try {
      const coll = await getCollection();
      const today = todayUtc();
      const doc = await coll.findOneAndUpdate(
        { _id: id },
        { $set: { lastReadDate: today } },
        { returnDocument: "after" },
      );
      if (!doc) {
        res.status(404).json({ error: "not found" });
        return;
      }
      res.json({
        ciphertext: doc.ciphertext,
        version: doc.version,
        lamport: doc.lamport,
        createdDate: doc.createdDate,
        lastWriteDate: doc.lastWriteDate,
        lastReadDate: doc.lastReadDate,
      });
    } catch (err) {
      sendInternal(res, err);
    }
  });

  app.put("/api/matrix/:id", writeLimiter, async (req, res) => {
    const id = req.params.id;
    if (!isPlausibleId(id)) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const body = req.body as {
      ciphertext?: unknown;
      lamport?: unknown;
      expectedVersion?: unknown;
    };
    if (
      !validCiphertext(body.ciphertext) ||
      !Number.isInteger(body.lamport) ||
      (body.lamport as number) < 0 ||
      !Number.isInteger(body.expectedVersion) ||
      (body.expectedVersion as number) < 0
    ) {
      res.status(400).json({ error: "invalid body" });
      return;
    }
    if (body.ciphertext.length > MAX_CIPHERTEXT_BYTES) {
      res.status(413).json({ error: "ciphertext too large" });
      return;
    }
    try {
      const coll = await getCollection();
      const today = todayUtc();
      const expectedVersion = body.expectedVersion as number;
      const updated = await coll.findOneAndUpdate(
        { _id: id, version: expectedVersion },
        {
          $set: {
            ciphertext: body.ciphertext,
            lamport: body.lamport as number,
            lastWriteDate: today,
          },
          $inc: { version: 1 },
        },
        { returnDocument: "after" },
      );
      if (updated) {
        res.json({ version: updated.version, lastWriteDate: updated.lastWriteDate });
        return;
      }
      const current = await coll.findOne({ _id: id });
      if (!current) {
        res.status(404).json({ error: "not found" });
        return;
      }
      // Existing record + version mismatch → 409 Conflict.
      res.status(409).json({
        ciphertext: current.ciphertext,
        version: current.version,
        lamport: current.lamport,
      });
    } catch (err) {
      sendInternal(res, err);
    }
  });

  app.delete("/api/matrix/:id", writeLimiter, async (req, res) => {
    const id = req.params.id;
    if (!isPlausibleId(id)) {
      res.status(204).end();
      return;
    }
    try {
      const coll = await getCollection();
      await coll.deleteOne({ _id: id });
      res.status(204).end();
    } catch (err) {
      sendInternal(res, err);
    }
  });

  return app;
}

function validCiphertext(value: unknown): value is string {
  // Accept any v1./v2. envelope-shaped string; the server doesn't decrypt.
  return (
    typeof value === "string" &&
    value.length >= 4 &&
    /^v\d+\./.test(value)
  );
}

function isPlausibleId(id: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(id);
}

function isDuplicateKey(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === 11000
  );
}

function sendInternal(res: Response, err: unknown): void {
  // Log a redacted message; never the body.
  const message = err instanceof Error ? err.message : "unknown";
  console.error("[risk-matrix-api] internal error:", message);
  res.status(500).json({ error: "internal" });
}

export type App = ReturnType<typeof createApp>;
