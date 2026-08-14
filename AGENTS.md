# This is no longer a Next.js app

It was, until the migration recorded in `MIGRATION.md`. It is now a static Vite
SPA plus a small Node server. **Do not reintroduce Next.js patterns**: no
`next/link`, `next/image`, `next/font`, `metadata` exports, Route Handlers under
`app/`, or Server Components. `next` remains only as a devDependency because
`eslint-config-next` needs it.

Two constraints exist for WEBCAT code-signing, and breaking either breaks the
site for anyone running the extension:

- **No inline `<script>`, ever.** `script-src` cannot use hashes or nonces.
  Anything that must run before paint goes in its own file, like
  `public/theme-boot.js`.
- **Every HTML/JS/CSS byte served is a file built at build time.** No
  server-rendered or otherwise dynamic markup, scripts, or styles.

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
| `yarn start`        | Run the built server, serving `dist/` and the API           |

`yarn build` is safe to run now: it writes `dist/` and `dist-server/` and does
not disturb the dev server.

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
