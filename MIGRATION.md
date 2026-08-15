# Next.js → static SPA migration

Working document. Tracks the plan, the decisions, and what is actually done.
Update the status boxes as work lands, and add to the Decisions log whenever a
choice gets made that the code alone will not explain.

## Why

We are enrolling riskmapper in [WEBCAT](https://docs.webcat.tech), which gives the
browser extension a signed manifest of every file the site serves and blocks
anything that does not match. Two of its requirements are incompatible with our
current setup:

1. **The frontend must be fully static.** No server-generated HTML, JS, or CSS.
   The extension hashes the bytes of every `main_frame`, `script`, and
   `stylesheet` response against the manifest.
2. **No inline JavaScript, at all.** The
   [CSP spec](https://github.com/freedomofpress/webcat-spec/blob/main/csp.md)
   allows `script-src` only `'none'`, `'self'`, and `'wasm-unsafe-eval'`, and
   explicitly disallows `sha256-...` and `nonce-...`. Inline scripts cannot be
   whitelisted even by hash.

Next.js App Router emits inline scripts into every document (the React streaming
runtime, plus the RSC flight payload as `self.__next_f.push(...)`). Our own April
static export in `out/index.html` had six of them. Next's only strict-CSP story is
nonces, which require dynamic rendering, which requirement 1 forbids. So the
framework can never satisfy this policy, and the app moves to a plain Vite build.

WEBCAT itself is **out of scope for this document** beyond motivating the shape.
No enrollment, manifest, or signing work happens until the migration is complete
and the app is verified working.

## Constraints we are migrating toward

- Every HTML/JS/CSS byte served is a file on disk, produced at build time.
- No inline `<script>` anywhere in any served document.
- Scripts, styles, and fonts are same-origin (`'self'`). No third-party script
  hosts, which we already satisfy: analytics relays through `/api/counter`.
- Same-origin `/api/*` is fine. `xmlhttprequest` is in the extension's
  `PASS_THROUGH_TYPES`, so JSON responses are never hash-checked.
- libsodium uses WebAssembly, so the eventual CSP needs `'wasm-unsafe-eval'`.

## Target architecture

```
riskmapper.app  (one origin, one Railway service)
├── /                  index.html          → SPA (RiskMatrix)
├── /grid/<id>#<key>   index.html           (server fallback; SPA reads the path)
├── /privacy           privacy/index.html  → its own static document
├── /assets/*          hashed JS/CSS/fonts
├── /theme-boot.js     blocking theme script (external, not inline)
└── /api/*             route handlers, same origin
```

One Node process serves the static build **and** the API, so the app stays
same-origin and no CORS allow-list is reintroduced. See Decisions D3 and D5.

## Phases

### Phase 0 — regression net (done)

Strengthen the suite first so it can be the "nothing broke" check afterward.
Suite went 175 → 253 tests.

- [x] `lib/theme.test.ts` — theme prefs + boot script behaviour
- [x] `components/risk-matrix/shareUrl.history.test.ts` — the `replaceState` call sites
- [x] `components/risk-matrix/useShareImport.test.ts` — the whole share-link flow
- [x] `components/risk-matrix/cloudConfig.test.ts` — public env semantics
- [x] `lib/log.test.ts` — load-time debug flag
- [x] `components/Footer.test.tsx`, `app/not-found.test.tsx`,
      `app/privacy/page.test.tsx` — rendered `href`/`rel`/`target`, not `next/link`
- [x] `app/layout.metadata.test.ts` — document-head contract as a checklist
- [x] `vitest.setup.ts` — register RTL `cleanup`, which the repo was missing

### Phase 1 — drop Next-specific APIs (done, still running on Next)

Prove the net holds while removing framework coupling, with no build-system change
yet. Everything here is independently shippable.

- [x] `public/theme-boot.js` becomes the boot script's source of truth; deleted
      `buildThemeBootScript()` from `lib/theme.ts`; `lib/theme.test.ts` reads and
      executes the real file
- [x] `app/layout.tsx` references it as
      `<script src="/theme-boot.js" async={false} defer={false} />`
- [x] `next/link` → `<a>` in `components/Footer.tsx`, `app/not-found.tsx`,
      `app/privacy/page.tsx`
- [x] `next/image` → `<img>` in `components/risk-matrix/MatrixTopBar.tsx`
- [x] Suite green (254), `tsc --noEmit` clean
- [x] Verified in the browser: boot script loads external + non-async + non-defer,
      `.dark` applied from `prefers-color-scheme` and cleared by a stored `light`
      preference, logo renders as `<img src="/icon.svg">`, `/privacy` renders with
      its own title

Only `next/font/google` in `app/layout.tsx` still imports from `next/*` in client
code. Phase 2 removes it.

### Phase 2 — Vite build (done)

- [x] Added `vite`, `@fontsource/geist-sans`, `@fontsource/geist-mono`
- [x] `index.html` + `privacy/index.html` as build inputs. Head tags are now
      asserted by `client/head.test.ts`, which replaced
      `app/layout.metadata.test.ts` and is strictly better: it reads the real
      documents, and checks that neither contains an inline script.
- [x] `client/main.tsx` entry; `client/routes.ts` pathname dispatch
- [x] `client/ErrorBoundary.tsx` replacing `app/error.tsx`
- [x] Self-hosted Geist wired to `--font-geist-sans` / `--font-geist-mono`
- [x] `NEXT_PUBLIC_*` → `VITE_*`, read via `import.meta.env`
- [x] Deleted `app/layout.tsx`, `app/page.tsx`, `app/grid/`, `app/loading.tsx`,
      `app/error.tsx`, `next.config.ts`, `next-env.d.ts`, and moved the icons out
      of Next's file-based metadata convention into `public/`
- [x] Verified in the browser, both themes, against the real production build

The three items previously flagged for manual verification are resolved:

- [x] **Tailwind v4 source detection** still finds `components/`. Checked by
      grepping the built CSS for classes that appear only there
      (`bg-rm-surface-hover`, `border-rm-border-strong`, `text-rm-muted-2`,
      `bg-rm-actions`, `rm-topbar-h`): all present.
- [x] **One Yjs instance**, and more conclusively than expected: `node_modules`
      holds exactly one physical copy and no dependency declares its own, so
      `resolve.dedupe: ["yjs"]` is belt-and-braces rather than load-bearing.
      Confirmed functionally by a two-tab share-link edit propagating live.
- [x] **StrictMode** did not double-create a record; the live share flow
      produced exactly one.

### Phase 3 — API as its own service (done)

- [x] `app/api/**/route.ts` → `server/routes/**`. Handlers are byte-identical
      apart from the removed `runtime` directive; `app/` no longer exists.
- [x] `server/index.ts` serves the static build, mounts the API, redirects
      slashless directory paths, and falls back to the SPA
- [x] `server/staticFiles.ts`, `server/apiRoutes.ts` and `server/webRequest.ts`
      split out as pure, separately tested units (path traversal, route
      matching, client-disconnect wiring)
- [x] `lib/cloud/handlers.test.ts` import paths updated, assertions untouched
- [x] `vite build` for the client, SSR build for the server, `railway.toml`
      updated to `yarn build` / `yarn start`
- [x] `next` dropped from `dependencies` (still a devDependency: see the manual
      list below)
- [x] Verified end to end against local Mongo: create, append, read, SSE,
      413 on oversized ciphertext, delete, 404 after delete, plus a full
      encrypted two-tab share round trip in the browser

### End state, verified 2026-08-14

- 303 tests passing, up from 175 at the start. `tsc --noEmit` clean.
- Built HTML has **zero** inline scripts and references **no** external origin.
  Those are the two properties WEBCAT enrollment depends on.
- Server behaviour: `/` 200, `/privacy` 301 → `/privacy/`, `/privacy/` 200,
  `/grid/<id>` 200 fallback, `/nope` 200 fallback, traversal attempts 400,
  `/api/nope` 404 JSON, hashed assets `immutable`, HTML `no-cache`.
- The server stores ciphertext only: the plaintext of a test risk did not appear
  anywhere in the stored record.

### Deployed to production, 2026-08-14

Live on https://riskmapper.app and verified against the deployed artifact, not
just a local build:

- `/` 200, `/privacy` 301 → `/privacy/`, `/privacy/` 200, `/grid/<id>` 200
  fallback, `/nope` 200 fallback, `/api/healthz` 200
- Path traversal 400, `/api/nope` 404 with `application/json`
- **Zero inline scripts** in both documents, and **no external origin**
  referenced anywhere in the served HTML. The only scripts are
  `/theme-boot.js` and one hashed module. This is the state WEBCAT enrollment
  requires, now true in production.
- Self-hosted Geist resolving, theme boot applying `.dark`, footer linking to
  the canonical `/privacy/`

One thing to tidy: the shipped bundle still contains the debug log literals
(`mergeSnapshot skipped`, `bridge invoke`, `sse onUpdate`), so `VITE_DEBUG` is
not set to `"false"` on the Railway build. Production therefore logs sync
chatter, including `recordId`, to every visitor's console. Not a disclosure to
any third party, and analytics never receives it, but it is noise the flag
exists to suppress. Set `VITE_DEBUG=false` as a **build-time** variable.

### Phase 4 — WEBCAT (next)

Only after the above is running well in production. `webcat.config.json`,
`/.well-known/webcat/`, CI build-sign-deploy, then enrollment. Do not submit the
domain at enroll.webcat.tech until the manifest pipeline is verified: after
enrollment, a manifest mismatch hard-blocks the site for every extension user.

## Phase S — E2EE security re-evaluation (recurring gate, every phase)

Not a stage of its own: this runs **at the end of every phase above**, before
that phase is marked done. The migration touches how code is delivered, and
THREAT-MODEL.md names "a compromised version of Risk Matrix itself" as a live
threat, so delivery changes are in scope for security review even when the
crypto is untouched.

Re-run this checklist each time and record the date and outcome:

**Crypto core.** Confirm nothing changed under `lib/e2ee/`, `lib/cloud/`,
`components/risk-matrix/matrixCloudRepository.ts`,
`components/risk-matrix/useCloudMatrix.ts`,
`components/risk-matrix/shareUrl.ts`, or `app/api/`. If something did, review
it line by line:

```bash
git diff --name-only <base> -- lib/e2ee lib/cloud app/api \
  components/risk-matrix/matrixCloudRepository.ts \
  components/risk-matrix/useCloudMatrix.ts components/risk-matrix/shareUrl.ts
```

**Key-in-fragment containment.** The capability key is the URL fragment. Check
that no new code reads `location.hash` or `location.href`, that
`<meta name="referrer" content="no-referrer">` is present in every entry
document, and that `document.title` is still never assigned dynamically (it is
sent to analytics, so a matrix title landing there would be a content leak).

**Analytics payload.** `sendAnalytics` transmits `url`, `referrer`, `hostname`,
`title`, `userAgent`, `screen`, `language`. `lib/analytics/events.ts` overrides
`url` and `referrer` with `sanitizePath`/`sanitizeReferrer` versions that
collapse `/grid/<recordId>` to `/grid/`. Confirm both overrides still apply on
every entry point, including new ones.

**Realtime edit path.** The Yjs update log is the least-protected surface:
AAD binds `recordId` and `schemaVersion` only, not `seq` and not `clientId`.
Re-check that seq handling and the `isSelf` skip in `useCloudMatrix` have not
become more trusting, and see finding F1 below.

**Delivery and supply chain.** Review any new dependency for executable content
and install scripts, review `yarn.lock` changes by hand, and confirm no
third-party origin appears in any entry document.

### Findings log

**2026-08-14, found during live testing.**

- **F6 (moderate, availability — FIXED).** `lib/cloud/db.ts` cached the *connect
  promise*, including a rejected one. A single transient Mongo outage therefore
  bricked the API for the lifetime of the process: every later request re-awaited
  the same cached rejection and returned 500 long after the database was healthy
  again. This mattered little under a framework that reloads modules, but the
  server is now long-lived, so recovery required a manual restart. Found for real
  when the dev Mongo container was stopped and the API kept 500ing afterwards;
  confirmed by a fresh process serving the identical request correctly while the
  old one still failed. Fixed by evicting a failed attempt (and closing its
  client) so the next request reconnects. Covered by `lib/cloud/db.test.ts`, and
  verified live through a full stop/start cycle: same process, no restart,
  200 after recovery.
- **F7 (low, footgun — FIXED in docs).** `.env.local.example` claimed to show
  defaults but listed `MONGO_DB=riskmapper`, while the code default in
  `lib/cloud/config.ts` is `riskmatrix`. Following the example silently points
  the app at a different database, where existing records appear to have vanished
  (the client falls back to its local cache and the server 404s). The example now
  states the real default and warns about the effect.

**2026-08-14, after Phase 3.** The API handlers were verified byte-identical to
their originals apart from the deleted `export const runtime = "nodejs"` line
and two doc-comment path updates (diffed individually against `HEAD`). The new
surface is the hand-written server, and it turned up one regression of my own:

- **F4 (moderate, availability — FIXED).** The SSE handler hangs its cleanup off
  `req.signal`'s abort event (`server/routes/matrixEvents.ts:141`), which is how
  it releases its pub/sub subscription and clears its 25s heartbeat. The first
  version of `server/index.ts` built its `Request` without a signal, so that
  listener could never fire and every dropped SSE connection would have leaked a
  subscription and a live interval for the process lifetime: a slow-motion
  denial of service. Fixed by `server/webRequest.ts`, which aborts on response
  close, request abort, and request error, with `server/webRequest.test.ts`
  pinning the wiring. Verified live by churning connections and confirming the
  server stayed healthy and kept accepting updates.
- **F5 (low, DoS — open, pre-existing).** Request bodies are parsed before the
  ciphertext size cap is checked, so a very large body is buffered in memory
  before being rejected with 413. This was equally true under Next, which
  applies no body limit to Route Handlers, so it is not a regression. It is now
  ours to fix, and the natural place is a byte cap in `server/index.ts` before
  the body reaches a handler.

Deliberate hardening added along the way, none of it required: two independent
traversal guards (a segment check in `resolveStaticRequest`, plus a re-derived
containment check against the build root in `safeJoin`), verified live to return
400; `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer` on
static responses; `Content-Type` from an allowlist rather than sniffing;
`no-cache` on HTML so a stale document cannot be pinned against a fresh
manifest; and unmatched `/api/*` answering 404 JSON rather than falling through
to the SPA, so a client expecting JSON can never receive HTML.

Also confirmed: `dist/` contains no source maps and no `.env*`; the server
serves only `dist/`, never the repo root or `dist-server/`; and
`@activistchecklist/umami-extra-privacy/next` is only *named* for Next and
imports nothing from it, so moving `next` to devDependencies is safe. The
counter route was exercised live and returned `{"success":true}`.

**2026-08-14, after Phases 1 and 2.** No change to any security-critical path
(verified with the command above: empty output). No regression found. Two
pre-existing findings surfaced, neither caused by the migration:

- **F1 (moderate, integrity — open).** `clientId` is attacker-controllable and
  a spoof causes a permanent silent drop of a collaborator's edit. It is
  supplied by the client, only length-checked
  (`app/api/matrix/[id]/updates/route.ts:46`), stored verbatim, and rebroadcast
  over SSE. It is not in the AEAD's AAD, so it is unauthenticated.
  `useCloudMatrix.ts:294` derives `isSelf` from it; when true the update is not
  applied (`:302`) but `lastHeadSeq` still advances (`:305`), so a reconnect
  asking `sinceSeq = lastHeadSeq` never re-fetches it. Every client's id is
  broadcast in every SSE frame, so any collaborator (or the host) can target a
  specific client and silently desynchronize it. Confidentiality is unaffected.
- **F2 (doc drift — open).** THREAT-MODEL.md states "No real-time
  collaboration ... the second to save sees a 'this was edited from another
  device' prompt". The code has SSE subscription, a sequenced update log, live
  `Y.applyUpdate` with `REMOTE_ORIGIN`, and baseline compaction. The document
  appears to describe a superseded design. A threat model that understates the
  live surface is itself a risk.

## Decisions log

**D1 — Sigstore over Sigsum.** Sigstore has GitHub Actions support and keyless
signing via OIDC. Sigsum has no automation path that does not put a long-lived
Ed25519 key in CI, which defeats its own offline-key model.

**D2 — No router dependency.** `/privacy` becomes its own HTML document reached by
a plain anchor, so it needs no client-side routing. That leaves only `/` and
`/grid/<id>` sharing the SPA, and the app already reads `window.location.pathname`
itself in `useShareImport`. A pathname check in the entry covers it. Adding
react-router for this would also fight `shareUrl.ts`, which calls
`history.replaceState` directly and deliberately does not re-render.

**D3 — Unknown paths serve `index.html`, not a 404 document.** WEBCAT resolves any
main_frame path missing from the manifest through `default_fallback`, which must
point at a single file in the manifest. Share links at `/grid/<id>` can never be
in the manifest (ids are unbounded), so the fallback has to be `index.html` or
share links break under enforcement. The SPA therefore renders the not-found view
client-side for unrecognized paths.

**D4 — `public/theme-boot.js` is hand-written, not generated.** Making the file the
source of truth removes any build-time codegen and any chance of drift between a
generated file and the TS that produced it. `lib/theme.test.ts` loads the real file
from disk and executes it, and asserts it references the same
`THEME_STORAGE_KEY` the React layer writes.

**D5 — One process serves static files and the API.** Keeps the app same-origin, so
`connect-src 'self'` is enough and the "no CORS allow-list" property in AGENTS.md
survives. The alternative (static host plus `api.` subdomain) would mean
reintroducing server-side origin validation.

**D6 — Build the server with Vite's SSR mode.** It already resolves the `@/` alias
and externalizes `node_modules`, so no extra bundler or a `tsx` runtime dependency
in production. The bundle is emitted as `index.mjs`, not `index.js`: it is ESM and
package.json has no `"type": "module"`, so the explicit extension avoids Node
reparsing the file (and warning), which is narrower than flipping the whole
package to ESM.

**D7 — `/privacy/` keeps its trailing slash, and the slashless form redirects.**
Found by testing: `/privacy` resolves to the SPA, `/privacy/` to the privacy
document. This is load-bearing for WEBCAT, not cosmetic. Serving the privacy
document's bytes at `/privacy` would fail the extension's lookup, which finds no
exact match, applies `default_index` only to paths ending in `/`, and so falls
through to `default_fallback` (index.html) whose hash will not match. So the
server answers 301 and the footer links straight to the canonical form.

**D8 — No HTTP framework.** The route handlers already speak Web
`Request`/`Response`, so `node:http` plus two small pure modules was enough, and
it adds no dependency to a project whose threat model calls out the build
pipeline. The cost is owning path-traversal safety ourselves, which is why
`server/staticFiles.ts` is pure and separately tested, and why `server/index.ts`
re-checks containment against the build root independently.

## Things only you can do

Ordered by what would break first if skipped.

**Before the next deploy — will break the site otherwise**

- [x] ~~Rename the Railway env vars.~~ Deployed and working 2026-08-14.
      **Still outstanding:** set `VITE_DEBUG=false` as a build-time variable.
      The deployed bundle still contains the debug log literals, so production
      is logging sync chatter (including `recordId`) to visitors' consoles.
- [x] ~~Check Railway's build runs devDependencies.~~ Confirmed by the
      successful 2026-08-14 deploy.

**Review, because I changed things a careful reviewer would want to see**

- [x] ~~`git diff yarn.lock` for the hand-edit.~~ **Resolved 2026-08-14.** The
      hand-edit had already been overwritten by yarn's own regeneration during
      later add/remove operations, and the lockfile was then rebuilt from
      scratch (`rm yarn.lock node_modules && yarn install`). It is now provably
      machine-generated: `yarn install --frozen-lockfile` reports "Already
      up-to-date".
- [ ] **Three new dependencies.** `@fontsource/geist-sans` and
      `@fontsource/geist-mono` ship to users; I verified they contain only CSS,
      woff/woff2 and a type declaration, with no JS and no install scripts.
      `vite` and `concurrently` are devDependencies.
- [ ] **The dependency refresh of 2026-08-14** (see the log below), in
      particular the React 19.2.4 → 19.2.8 and Tailwind 4.2 → 4.3 bumps, which
      touch every rendered pixel.
- [ ] **`server/staticFiles.ts` and `server/index.ts`.** This is the code that
      decides which bytes on disk a stranger's URL can reach. It has two
      independent traversal guards and direct tests, and I verified 400s live,
      but a second pair of eyes on hand-written path handling is worth it.
- [ ] **Decide on finding F1** (unauthenticated `clientId` allows a targeted,
      silent, permanent drop of a collaborator's edit). Pre-existing, not caused
      by this work. The fix is to bind `clientId` into the AEAD's AAD, which is a
      wire-format change, or to stop trusting it for the `isSelf` decision.
- [ ] **Reconcile finding F2.** THREAT-MODEL.md says "No real-time
      collaboration"; the code has live SSE collaboration. Tell me which is
      authoritative and I will bring them into line.

**Cleanups I deliberately left alone**

- [ ] 11 pre-existing `react/no-unescaped-entities` errors in
      `components/risk-matrix/MatrixHelpSection.tsx` and an unused-var warning in
      `components/risk-matrix/pdf/MatrixPdfDocument.tsx`. Unrelated to the
      migration, and they fail the `yarn lint` gate in AGENTS.md today.
- [ ] `next` is still a devDependency purely because `eslint-config-next`
      requires it at runtime (removing it breaks `yarn lint`). Replacing that
      config with typescript-eslint + eslint-plugin-react-hooks directly would
      drop the last Next-shaped thing in the repo, at the cost of three new
      devDependencies and a config rewrite.
- [ ] Next boilerplate SVGs still in `public/` (`next.svg`, `vercel.svg`,
      `file.svg`, `globe.svg`, `window.svg`). Dead weight that will otherwise end
      up in the WEBCAT manifest.
- [ ] The stale April static export in `out/` is now unused and gitignored.
- [ ] Finding F5: cap request body size in `server/index.ts` before a handler
      parses it, so an oversized body is refused rather than buffered.

**Then, and only then**

- [ ] Phase 4 (WEBCAT). Do not submit the domain at enroll.webcat.tech until the
      manifest pipeline is verified end to end: after enrollment, a manifest
      mismatch hard-blocks the site for every extension user.

## Dependency refresh, 2026-08-14

`yarn.lock` rebuilt from scratch so it is machine-generated end to end, which
also pulled every in-range update. Four exactly-pinned entries were bumped by
hand because a fresh install would not move them: `react` and `react-dom`
19.2.4 → 19.2.8, `@types/node` ^20 → ^22 (it was tracking the wrong major, since
`engines` pins Node 22), and `next` + `eslint-config-next` 16.2.4 → 16.3.1 kept
in step with each other.

Notable in-range moves: tailwindcss and @tailwindcss/postcss 4.2.2 → 4.3.3,
@tiptap/* 3.22.5 → 3.30.1, mongodb 7.2.0 → 7.5.0, yjs 13.6.30 → 13.6.32,
vite 8.0.8 → 8.2.1, vitest 4.1.4 → 4.1.10, lucide-react 1.8.0 → 1.31.0,
@radix-ui/* and @react-pdf/renderer minors.

**libsodium-wrappers was already on the latest release (0.8.4) and did not
move.** The crypto path is unchanged by this refresh.

Majors deliberately held back, each of which needs its own change:

- `typescript` 5.9 → 7.0: a major language-tooling jump, on its own please.
- `eslint` 9 → 10: `eslint-config-next` does not support it yet.
- `jsdom` 29 → 30: test-environment major; nothing needs it.
- `fractional-indexing` 3 → 4: it orders every risk in the matrix, so a major
  wants deliberate testing of the ordering behaviour.
- `@types/node` 26 would track Node 26; we are on 22.

`@activistchecklist/umami-extra-privacy` stays pinned to a git commit SHA, which
is the right call for a dependency that handles analytics on an E2EE app: the
SHA is immutable in a way a version range is not.

Verified after the refresh: 303 tests, `tsc --noEmit` clean, clean build with
still zero inline scripts and no external origins, all server routes behaving
(including traversal 400 and the `/privacy` 301), and a live browser pass on the
production build covering tiptap input, an encrypted share round trip, and
realtime two-tab propagation.

## Verification

Run before calling any phase done:

```bash
yarn test && npx tsc --noEmit && yarn lint
```

Known pre-existing lint failures, unrelated to this work: 11
`react/no-unescaped-entities` errors in `components/risk-matrix/MatrixHelpSection.tsx`
and an unused-var warning in `components/risk-matrix/pdf/MatrixPdfDocument.tsx`.
