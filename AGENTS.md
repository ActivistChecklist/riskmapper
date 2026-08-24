# This is no longer a Next.js app

It was, until the migration recorded in `MIGRATION.md`. It is now a static Vite
SPA plus a small Node server. **Do not reintroduce Next.js patterns**: no
`next/link`, `next/image`, `next/font`, `metadata` exports, Route Handlers under
`app/`, or Server Components. `next` remains only as a devDependency because
`eslint-config-next` needs it.

# Never let a user's IP reach a server that isn't ours

This is the hardest rule in the repo. The people using this tool are planning
around surveillance; a request to a third party tells that third party the
user's IP address, roughly when they used the app, and often what they were
doing. **No exceptions, including for things that feel harmless: fonts, icons,
CDNs, analytics, error reporting, source maps, telemetry, `<link rel=preconnect>`,
embedded media.** Vendor the asset into the build and serve it from our own
origin instead.

This is not hypothetical. The PDF export used to pull four Roboto files from
`cdn.jsdelivr.net` at generation time, so exporting a matrix told a CDN the
user's IP and that they had exported. It also made
[privacy page](client/PrivacyPage.tsx) inaccurate, which claims "Nothing in your
browser talks to anyone other than this site." Fonts are now imported as assets
in `components/risk-matrix/pdf/fonts.ts` and emitted into `dist/assets/`.

Analytics is the one deliberate exception, and it is built to obey the rule: the
browser never contacts Umami. It posts to our own `/api/counter`, which
anonymizes the IP server-side before forwarding.

Two enforcement mechanisms, keep both working:

- `server/csp.ts` denies every off-origin source, so a new third-party request
  fails loudly in the browser rather than silently succeeding.
- `server/csp.test.ts` asserts no directive contains a `//`, so adding a host to
  the policy fails a test.

Two constraints exist for WEBCAT code-signing, and breaking either breaks the
site for anyone running the extension:

- **No inline `<script>`, ever.** `script-src` cannot use hashes or nonces.
  Anything that must run before paint goes in its own file, like
  `public/theme-boot.js`.
- **Every HTML/JS/CSS byte served is a file built at build time.** No
  server-rendered or otherwise dynamic markup, scripts, or styles.

Inline **styles** are a different story from inline scripts: WEBCAT's CSP spec
allows `style-src 'unsafe-inline'` (discouraged, but allowed), and we need it
regardless because sonner, tiptap and Radix all inject `<style>` elements and
`style` attributes at runtime. So do not go hunting for inline styles expecting
to tighten the CSP — you cannot remove the library ones without dropping those
dependencies, and our own are mostly runtime measurements. Prefer a Tailwind
class anyway (see Conventions), but know it buys tidiness, not a stricter
policy.

## Writing

- NEVER use an em-dash ("—").

## Commands

| Command             | Purpose                                                     |
| ------------------- | ----------------------------------------------------------- |
| `yarn dev`          | Vite dev server (HMR) plus the API, both at once            |
| `yarn dev:web`      | Vite only, port 3000; proxies `/api` to port 3001           |
| `yarn dev:api`      | Build the server bundle and run it on port 3001             |
| `yarn lint`         | Run ESLint                                                  |
| `yarn test`         | Run test suite                                              |
| `yarn typecheck`    | `tsc --noEmit`                                              |
| `yarn build`        | Production build: `dist/` (client) and `dist-server/`        |
| `yarn start`        | Run the built server. Env comes from the platform.           |
| `yarn start:local`  | Same, but also loads `.env.local`                            |
| `yarn hooks:install`| Point git at `.githooks/` (also runs on `yarn install`)      |

`start` deliberately carries no `--env-file` flag: that option is only in Node
22.9+, and `engines` allows any 22.x, so relying on it can break a deploy at
boot. Local runs use `start:local`.

`yarn build` is safe to run now: it writes `dist/` and `dist-server/` and does
not disturb the dev server.

Pushing `main` offers to WEBCAT-sign first (`.githooks/pre-push` and
`scripts/webcat-sign-gate.mjs`). Saying yes runs `yarn webcat:sign`, commits
the artifacts, and stops the push so the next one carries them; saying no lets
the push through with the consequence spelled out. It stays quiet unless files
that can change `dist/` have changed since the last signature.
`WEBCAT_SIGN_REMINDER=off` turns it off for one command.

## Architecture

- **Static SPA.** `index.html` is the app; `privacy/index.html` is a separate
  document. Entries and the app shell live in `client/`.
- **No router library.** `client/routes.ts` maps the pathname to a view. The
  server serves `index.html` for anything it cannot match to a file, so the SPA
  renders its own not-found view. See `MIGRATION.md` D2 and D3.
- **Client side by default.** Assume all of this app runs on the client side unless we need to add a server side compontent.
- **TypeScript required.** All new files must be `.ts`/`.tsx`. No `any` types without a comment explaining why.
- **Client env vars** are `VITE_*`, read via `import.meta.env`. `process.env` is
  not available in the browser bundle, and tests cannot catch that mistake
  because vitest runs in Node.
- **Cloud-sync API** lives in `server/routes/*.ts` as plain Web
  `Request`/`Response` handlers, wired up by `server/apiRoutes.ts`. Shared
  helpers live in `lib/cloud/`. The relay stores opaque ciphertext only — see
  `THREAT-MODEL.md`.
- **The privacy page URL keeps its trailing slash** (`/privacy/`). A slashless
  path resolves to the SPA, and WEBCAT applies `default_index` only to paths
  ending in `/`.

## Server vs. client — when to use each

Client and server code share one tree and one origin. Be deliberate about which side a piece of work belongs on.

**Use server (`server/routes/*.ts`, `lib/cloud/**`) only when you need to:**

- Touch the MongoDB collection (`getCollection` from `lib/cloud/db.ts`).
- Enforce a security invariant the client cannot be trusted with — e.g. ciphertext size cap, rate limit, optimistic-concurrency check.
- Hold a secret (DB credentials, future API keys). Anything imported only from `server/` is server-only and is **not** sent to the browser.

**Use client (`client/`, `components/`, hooks under `components/risk-matrix/`) for:**

- Anything React, hooks, DOM, drag-and-drop, localStorage.
- Anything that touches `lib/e2ee/*` — encryption MUST run client-side; the server never sees plaintext or keys.
- Anything reading `window.location` (share-link import lives client-side).

**Don't import server modules into client code.** A `"use client"` file that imports from `lib/cloud/db.ts` will leak `mongodb` and connection logic into the browser bundle. The line is enforced informally — if a client file imports from `lib/cloud/`, that's a smell to check.

**Don't import client modules into server code.** Anything under `client/` or `components/` is client UI. It also pulls in `import.meta.env`, which is a client-only construct.

**Same-origin by design.** The client repository (`components/risk-matrix/matrixCloudRepository.ts`) hits relative URLs like `/api/matrix`, and one process serves both the static build and the API. There's no CORS allow-list. If you split the API onto another origin, re-add server-side origin validation and widen `connect-src`.

**Rate limiter is in-process.** `lib/cloud/rateLimit.ts` uses `rate-limiter-flexible` with the memory backend. Sufficient for a single-instance deploy; for horizontal scale, swap `RateLimiterMemory` for `RateLimiterRedis` (same API).

## Conventions

- Co-locate related files: component, styles, tests, and types in the same directory.
- Plain `<img>` for images and plain `<a>` for navigation. Fonts are self-hosted via `@fontsource/*`, wired to CSS variables in `client/fonts.css`.
- Error states go through `client/ErrorBoundary.tsx`. The not-found view is `client/NotFound.tsx`, rendered by path dispatch.
- **Style with classes and tokens, not `style={{ }}`.** Reserve inline styles for
  values that genuinely only exist at runtime: a measured element height, a drag
  position, a width from a ResizeObserver. A static string like
  `style={{ top: "var(--rm-topbar-h, 0px)" }}` belongs in a class
  (`top-[var(--rm-topbar-h,0px)]`). This is a readability rule, not a security
  one — see the CSP note at the top of this file for why it cannot tighten
  `style-src`. Note `<View style={...}>` in `components/risk-matrix/pdf/` is
  react-pdf's own styling API and never reaches the DOM.
- Accessibility is required: meet WCAG 2.1 AA color contrast, preserve visible keyboard focus states, and ensure all interactive controls have clear labels.

## Theming: keep dark mode in lockstep with light

The app supports light + dark modes via class-based Tailwind v4 (`@custom-variant dark` in `client/globals.css`). Whenever you touch styles, **the dark mode treatment must land in the same change as the light mode treatment.** Do not ship a light-mode-only update.

- **Prefer the semantic tokens.** `bg-rm-surface`, `bg-rm-surface-2`, `bg-rm-surface-hover`, `border-rm-border`, `border-rm-border-strong`, `border-rm-divider`, `text-rm-muted`, `text-rm-muted-2`, `bg-rm-overlay`, `ring-rm-ring`, plus the matrix palette (`rm-canvas`, `rm-ink`, `rm-line`, `rm-actions`, `rm-primary`, `rm-{green,yellow,orange,red}` and their `-saturated`/`-strong` siblings) all auto-swap via CSS variables defined in `:root` and `.dark`. Reach for one of these before adding a literal `bg-white` or `text-zinc-600`.
- **If a token doesn't fit, define one.** Add the variable in both `:root` and `.dark` in `client/globals.css`, expose it under `@theme inline`, and use it. Don't sprinkle ad-hoc `dark:` variants when a token would do.
- **`dark:` variants are reserved for status tints.** Domain colors that don't live in the rm-* palette (sky/amber/red/emerald pills, etc.) should pair every light-mode utility with a `dark:` counterpart in the same className: `bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200`.
- **Test every change in both themes.** Toggle via the Theme button in the top bar (light / dark / system). Watch for: tinted hover backgrounds that don't cover the underlying cell color, focus rings that disappear on dark, shadows that vanish on dark canvas, and copy that drops below WCAG AA contrast.
- **Avoid raw hardcoded colors.** `bg-white`, `border-black/X`, `text-zinc-X`, `bg-black/X`, `ring-black/X` are smells — they don't switch with the theme. Replace with semantic tokens.

## Testing

- Write or update tests alongside every major change. If we're debugging something major, wait to add tests until the change is actually fixes the problem.
- Co-locate test files next to the code they test (e.g., `Button.test.tsx` beside `Button.tsx`).
- If you add a component, add a test. If you fix a bug, add a regression test.

## When Adding Dependencies

1. `yarn add` the package.
2. Restart the dev server so Vite picks up the change.

## Before Submitting

1. `yarn lint` passes with no errors.
2. `yarn test` passes (if tests exist for the changed code).
3. No TypeScript errors (`npx tsc --noEmit`).
4. Verify the change works in the browser via the dev server.
