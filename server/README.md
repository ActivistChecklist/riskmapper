# Risk Matrix Cloud API

A tiny Express + MongoDB relay for end-to-end-encrypted matrix sharing. The
server stores opaque ciphertext and never sees plaintext, titles, or keys.
See `../THREAT-MODEL.md` for the trust assumptions.

## Endpoints

| Method | Path                  | Purpose                                                 |
| ------ | --------------------- | ------------------------------------------------------- |
| `GET`  | `/healthz`            | Liveness probe.                                         |
| `POST` | `/api/matrix`         | Create a new record. Body: `{ id, ciphertext: "v1.…" }` (client-minted id). |
| `GET`  | `/api/matrix/:id`     | Read a record. Updates `lastReadDate`.                  |
| `PUT`  | `/api/matrix/:id`     | Update with `{ ciphertext, lamport, expectedVersion }`. Returns 409 + remote on conflict. |
| `DELETE` | `/api/matrix/:id`   | Delete a record. Idempotent.                            |

## Configuration (env vars)

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `8080` | |
| `MONGO_URI` | (required) | e.g. `mongodb://user:pass@host:27017` |
| `MONGO_DB` | `riskmatrix` | |
| `MONGO_COLLECTION` | `matrices` | |
| `MAX_CIPHERTEXT_BYTES` | `262144` | Mirror the client cap. |
| `RETENTION_DAYS` | `90` | Inactive records are purged after this. |
| `CORS_ALLOW_ORIGINS` | (required) | Comma-separated. **Server refuses to start without this.** |
| `WRITE_RATE_LIMIT_PER_MIN` | `30` | Per-IP token bucket on write endpoints (via `express-rate-limit`). |

## Trust-proxy note

`createApp()` sets `app.set("trust proxy", 1)` — one proxy hop in front of
the service (Railway's edge). If you deploy behind a different topology
(e.g. CDN → reverse proxy → app), update the hop count to match. Without
the right value, `req.ip` may be a client-controlled `X-Forwarded-For`
entry and the rate limiter becomes bypassable.

## Local development

```sh
cd server
yarn install
CORS_ALLOW_ORIGINS=http://localhost:3000 \
MONGO_URI=mongodb://localhost:27017 \
yarn dev
```

## Deploy on Railway

1. Add a MongoDB plugin to your Railway project. Copy `MONGO_URL` into
   `MONGO_URI`.
2. Add this directory as a service.
3. Set `CORS_ALLOW_ORIGINS` to your client origin.
4. Set `NEXT_PUBLIC_CLOUD_API_URL` on your client app to this service's URL.
5. Optional: schedule a daily cron to invoke purge (or rely on the
   in-process daily timer in `index.ts`).
