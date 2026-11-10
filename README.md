# Risk Mapper

A risk matrix and safety planning tool. Designed to help you think through risks
and how you can prepare for them.

**Security:** All data is saved locally unless you use the "share" feature. In that case, all data is end-to-end encrypted (not visible to our server). The full story is on the site's [Security page](https://riskmapper.app/security/), and the trust assumptions are in [THREAT-MODEL.md](THREAT-MODEL.md).

**[Use Risk Mapper →](https://riskmapper.app/)**

## Local Development

```bash
yarn install
yarn dev
```

Open [http://localhost:3000](http://localhost:3000).

Matrices persist in `localStorage`, and cloud sync works out of the box
too: the API keeps shared matrices in a SQLite file, using Node's built-in
`node:sqlite`, so there is no database server to run. It creates
`.data/riskmapper.sqlite` (gitignored) on first use. Delete that file to start
over. Settings, all optional locally, are in `.env.local.example`:

```bash
cp .env.local.example .env.local
```

| Command         | What it does                                          |
| --------------- | ----------------------------------------------------- |
| `yarn dev`      | Vite dev server (HMR) plus the API.                   |
| `yarn build`    | Production build: `dist/` + `dist-server/`.           |
| `yarn start`    | Serve the production build.                           |
| `yarn lint`     | ESLint                                                |
| `yarn test`     | Vitest (UI, server route, and static-resolution tests).|
| `yarn typecheck`| `tsc --noEmit`                                        |
| `yarn sqlite:cleanup` | Delete matrices idle for 90 days. Run daily.    |
| `yarn sqlite:backup`  | Snapshot the database for an offsite upload.    |
| `yarn hooks:install` | Point git at `.githooks/`. Runs on install.      |

### Git hooks

`.githooks/` holds the repo's hooks, and `yarn install` points git at them
(`core.hooksPath`). Install them by hand with `yarn hooks:install`.

The one that matters is the WEBCAT signing prompt, on **pre-push**. Pushing
`main` when the tree has changed since the last signature asks `Sign it now?`:

- **Yes** runs `yarn webcat:sign` right there (PIN, tap), commits the result as
  "Update webcat", and pushes it, replaying every ref the original push was
  going to send. Then it stops that original push, which cannot carry the new
  commit: git resolved its ref list before the hook ran. So `git push` exits
  non-zero and prints `error: failed to push some refs` even though everything
  arrived. Nothing to redo.
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
- `git push --dry-run` looks exactly like a real push from in here, so answering
  yes to a dry run really does sign, commit, and push. Answer no.
- The push the hook makes runs on your terminal, so passphrase, touch, and 2FA
  prompts work, and it carries `WEBCAT_SIGN_GATE_PUSHING=1` so it does not walk
  back into this hook.
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

## Storage

Shared matrices live in one SQLite file at `SQLITE_PATH` (default
`.data/riskmapper.sqlite`, relative to the working directory). The server is
a single process and holds the only long-lived connection. Each matrix is a
JSON document, so adding a field needs no migration. The adapter is
`lib/cloud/sqliteStore.mts`; it explains the privacy-relevant choices, such as
no hidden row ids and day-only dates.

Two jobs keep it in shape on the server. Both run straight from the source
tree with `node`, no build step, and print counts only:

- **`node scripts/sqlite-cleanup.mts`**, daily. Deletes matrices with no read
  or write for `RETENTION_DAYS` (90), their updates, and orphaned updates.
  The Security page promises this deletion, so if the job stops running the
  promise stops being true.
- **`node scripts/sqlite-backup.mts`**. Takes a consistent snapshot with
  `VACUUM INTO` and runs `SQLITE_BACKUP_UPLOAD_CMD` on it. Where backups go,
  and the keys to get them there, are configured only in the server's
  environment. The command should encrypt the snapshot and the destination
  should expire old ones: a backup keeps a deleted matrix until the backup
  itself is deleted.

Both refuse to create a database, so a job pointed at the wrong path fails
loudly. `scripts/mongo-to-sqlite/` holds the one-time copy from the old
MongoDB.

## Project layout

```
index.html                     SPA entry document (hand-written head)
privacy/index.html             Privacy page, its own static document
security/index.html            Security page, its own static document
client/                        Entries, app shell, router-less path dispatch
client/Prose.tsx               Markdown renderer behind both static documents
components/risk-matrix/        SPA components, hooks, local repo
lib/cloud/                     Server-side: SQLite store, route helpers, rate limit
lib/e2ee/                      Client-side: XChaCha20-Poly1305 envelope
server/index.ts                Serves the static build and the API, one origin
server/routes/                 API handlers (Web Request/Response)
server/staticFiles.ts          Path resolution, traversal guards, cache policy
public/theme-boot.js           Blocking pre-paint theme script (never inlined)
scripts/sqlite-*.mts           Daily cleanup and backup jobs for the database
MIGRATION.md                   Migration plan, decisions, security gate
THREAT-MODEL.md                In-scope guarantees and explicit out-of-scope risks
```

Built with Vite: `yarn build` produces the static client in `dist/` and the
server bundle in `dist-server/`. One Node process serves both, so the app is
same-origin by construction.

## License

See [LICENSE](LICENSE) (GNU GPL v3).
