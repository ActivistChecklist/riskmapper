# Risk Mapper

A risk matrix and safety planning tool. Designed to help you think through risks
and how you can prepare for them.

All data is saved locally unless you use the "share" feature. In that case, all data is
end-to-end encrypted (not visible to our server).

**[Use Risk Mapper →](https://riskmapper.app/)**

## Deploying

Every deploy has to be signed with the YubiKey, or Railway will reject it.

1. Make your changes and commit them.
2. Plug in the YubiKey.
3. `yarn webcat:sign` — enter the PIN, then **tap the key** when prompted.
4. Commit the updated `public/.well-known/webcat/` files.
5. Push. Railway builds and deploys.
6. `yarn webcat:verify` to confirm the live site matches.

If a deploy comes back unhealthy, it almost always means step 3 was skipped:
the build no longer matches the signed manifest, so `/api/healthz` returns 503
and Railway keeps the previous version. Re-sign and push again.

## Local Development

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
# and edit. The default MONGO_URL in the example points at yarn db:up.
cp .env.local.example .env.local

yarn dev
```

| Command         | What it does                                          |
| --------------- | ----------------------------------------------------- |
| `yarn dev`      | Vite dev server (HMR) plus the API.                   |
| `yarn build`    | Production build: `dist/` + `dist-server/`.           |
| `yarn start`    | Serve the production build.                           |
| `yarn lint`     | ESLint                                                |
| `yarn test`     | Vitest (UI, server route, and static-resolution tests).|
| `yarn typecheck`| `tsc --noEmit`                                        |
| `yarn db:up`    | Start the dev MongoDB container.                      |
| `yarn db:down`  | Stop it (volume preserved).                           |
| `yarn db:logs`  | Tail Mongo logs.                                      |
| `yarn db:reset` | Stop AND wipe the dev volume.                         |

## Cloud sync (E2EE)

Cloud-saved matrices and link sharing are **opt-in per matrix** and
end-to-end encrypted: the server never sees plaintext, titles, or keys.
See [THREAT-MODEL.md](THREAT-MODEL.md) for the trust assumptions.

The API is served from the same origin as the app, so client requests use
relative URLs. To disable the feature entirely on a deploy that has no
database, set `VITE_CLOUD_SYNC_ENABLED=false` — all share affordances are
hidden.

## Project layout

```
index.html                     SPA entry document (hand-written head)
privacy/index.html             Privacy page, its own static document
client/                        Entries, app shell, router-less path dispatch
components/risk-matrix/        SPA components, hooks, local repo
lib/cloud/                     Server-side: Mongo, route helpers, rate limit
lib/e2ee/                      Client-side: XChaCha20-Poly1305 envelope
server/index.ts                Serves the static build and the API, one origin
server/routes/                 API handlers (Web Request/Response)
server/staticFiles.ts          Path resolution, traversal guards, cache policy
public/theme-boot.js           Blocking pre-paint theme script (never inlined)
docker-compose.dev.yml         Local Mongo for dev
MIGRATION.md                   Migration plan, decisions, security gate
THREAT-MODEL.md                In-scope guarantees and explicit out-of-scope risks
```

Built with Vite: `yarn build` produces the static client in `dist/` and the
server bundle in `dist-server/`. One Node process serves both, so the app is
same-origin by construction.

## License

See [LICENSE](LICENSE) (GNU GPL v3).
