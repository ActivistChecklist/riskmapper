# Risk Matrix

A risk matrix workspace built with Next.js (App Router). Organize risks,
categories, and mitigations in the browser, with optional end-to-end
encrypted cloud sync and link sharing.

**[View Risk Matrix site →](https://activistchecklist.github.io/riskmatrix/)**

## Setup

```bash
yarn install
yarn dev
```

Open [http://localhost:3000](http://localhost:3000).

The local-only experience works out of the box — matrices persist in
`localStorage`. To exercise the cloud-sync feature in dev, you also need a
local MongoDB:

```bash
# Boot a Mongo container (persistent volume; survives restarts).
yarn db:up

# Tell the app where to find it. Copy .env.local.example → .env.local
# and edit. The default MONGO_URI in the example points at yarn db:up.
cp .env.local.example .env.local

yarn dev
```

| Command         | What it does                                          |
| --------------- | ----------------------------------------------------- |
| `yarn dev`      | Next.js dev server (HMR). Use this, not `build`.      |
| `yarn build`    | Production build. **Don't run during agent sessions.** |
| `yarn start`    | Serve the production build.                           |
| `yarn lint`     | ESLint                                                |
| `yarn test`     | Vitest (UI + Route Handler tests).                    |
| `yarn typecheck`| `tsc --noEmit`                                        |
| `yarn db:up`    | Start the dev MongoDB container.                      |
| `yarn db:down`  | Stop it (volume preserved).                           |
| `yarn db:logs`  | Tail Mongo logs.                                      |
| `yarn db:reset` | Stop AND wipe the dev volume.                         |

## Cloud sync (E2EE)

Cloud-saved matrices and link sharing are **opt-in per matrix** and
end-to-end encrypted: the server never sees plaintext, titles, or keys.
See [THREAT-MODEL.md](THREAT-MODEL.md) for the trust assumptions.

The API lives under `app/api/matrix/**` in this same Next.js app, so
client requests are same-origin (relative URLs). To disable the feature
entirely on a deploy that has no database, set
`NEXT_PUBLIC_CLOUD_SYNC_ENABLED=false` — all share affordances are hidden.

## Project layout

```
app/                           Next.js App Router
  api/healthz/route.ts         GET /api/healthz
  api/matrix/route.ts          POST /api/matrix
  api/matrix/[id]/route.ts     GET / PUT / DELETE
components/risk-matrix/        SPA components, hooks, local repo
lib/cloud/                     Server-side: Mongo, route helpers, rate limit
lib/e2ee/                      Client-side: XChaCha20-Poly1305 envelope, padding
docker-compose.dev.yml         Local Mongo for dev
THREAT-MODEL.md                In-scope guarantees and explicit out-of-scope risks
```

See [AGENTS.md](AGENTS.md) for the server-vs-client conventions.

## License

See [LICENSE](LICENSE) (GNU GPL v3).
