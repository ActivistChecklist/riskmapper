# Risk Mapper

A risk matrix and safety planning tool. Designed to help you think through risks
and how you can prepare for them.

**Security:** All data is saved locally unless you use the "share" feature. In that case, all data is end-to-end encrypted (not visible to our server).

**[Use Risk Mapper →](https://riskmapper.app/)**

## Deploying

Every deploy has to be signed with the YubiKey, or Railway will reject it.

Pushing `main` offers to do it for you, which is the easy path:

1. Make your changes, commit them, plug in the YubiKey.
2. `git push`. The hook notices the signature is stale and asks. Say yes.
3. Enter the PIN, then **tap the key** when prompted.
4. It commits the refreshed `public/.well-known/webcat/` and stops the push,
   because the ref git was about to send does not include that commit yet.
5. `git push` again. Railway builds and deploys.
6. `yarn webcat:verify` to confirm the live site matches.

By hand it is the same thing in a different order: `yarn webcat:sign`, commit
`public/.well-known/webcat/`, push.

If a deploy comes back unhealthy, it almost always means the signing was
skipped: the build no longer matches the signed manifest, so `/api/healthz`
returns 503 and Railway keeps the previous version. Re-sign and push again.
See [Git hooks](#git-hooks) for what the prompt does and how to skip it.

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
| `yarn hooks:install` | Point git at `.githooks/`. Runs on install.      |

### Git hooks

`.githooks/` holds the repo's hooks, and `yarn install` points git at them
(`core.hooksPath`). Install them by hand with `yarn hooks:install`.

The one that matters is the WEBCAT signing prompt, on **pre-push**. Pushing
`main` when the tree has changed since the last signature asks `Sign it now?`:

- **Yes** runs `yarn webcat:sign` right there (PIN, tap), commits the result as
  "Update webcat", and stops the push. The ref list git computed before that
  commit existed cannot carry it, so the next `git push` is the one that ships
  it.
- **No** lets the push through, and says what that costs: the site stops
  loading for anyone running the WEBCAT extension, invisibly to everyone else,
  and the deploy does not promote because `/api/healthz` fails on a manifest
  mismatch.

Push is the right moment for this rather than commit: signing hashes a build,
so it can only describe a finished state, and a push is the last point where
signing still changes what ships.

Some details worth knowing:

- It only fires for a push that lands on `refs/heads/main`, and only when files
  that can change `dist/` have changed since the commit that last touched
  `manifest.json`. Prose, CI config, and hook edits pass without a word. Sign
  and the prompt goes quiet on its own.
- If the working tree has uncommitted changes to build files it will not offer
  to sign, because signing hashes a build of the working tree and the signature
  would describe bytes you are not pushing. It asks whether to push unsigned,
  defaulting to no.
- With no terminal attached (a scripted push, a GUI client) it prints the
  reminder and lets the push through rather than hanging on a question nobody
  can see.
- `WEBCAT_SIGN_REMINDER=off git push` skips it entirely. So does a gate that
  crashes: only a deliberate stop blocks a push.
- A repo-local `core.hooksPath` shadows a global one completely, so each hook
  in `.githooks/` calls its global namesake first, replaying stdin to both.
  If your global hooks directory gains a hook that has no matching file in
  `.githooks/`, `yarn hooks:install` says so.

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
