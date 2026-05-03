<!-- BEGIN:nextjs-agent-rules -->

# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated -- the docs are the source of truth.

<!-- END:nextjs-agent-rules -->

## Writing

- NEVER use an em-dash ("—").

## Commands

| Command      | Purpose                                          |
| ------------ | ------------------------------------------------ |
| `yarn dev`   | Start dev server with HMR. Use this, not `build` |
| `yarn lint`  | Run ESLint                                       |
| `yarn test`  | Run test suite                                   |
| `yarn build` | Production build. **Never run during agent sessions** -- it replaces `.next/` with production assets and breaks HMR |

## Architecture

- **App Router** (`app/` directory). Do not use Pages Router patterns.
- **Client side by default.** Assume all of this app runs on the client side unless we need to add a server side compontent.
- **TypeScript required.** All new files must be `.ts`/`.tsx`. No `any` types without a comment explaining why.
- **Cloud-sync API** lives in `app/api/matrix/**/route.ts` (Node runtime). Shared route helpers live in `lib/cloud/`. The relay stores opaque ciphertext only — see `THREAT-MODEL.md`.

## Server vs. client — when to use each

This is a single Next.js app with both client (SPA) and server (Route Handlers) code in the same tree. Be deliberate about which side a piece of work belongs on.

**Use server (`app/api/**/route.ts`, `lib/cloud/**`) only when you need to:**

- Touch the MongoDB collection (`getCollection` from `lib/cloud/db.ts`).
- Enforce a security invariant the client cannot be trusted with — e.g. ciphertext size cap, rate limit, optimistic-concurrency check.
- Hold a secret (DB credentials, future API keys). Anything imported from a Route Handler is server-only and is **not** sent to the browser.

**Use client (`components/`, `app/page.tsx`, hooks under `components/risk-matrix/`) for:**

- Anything React, hooks, DOM, drag-and-drop, localStorage.
- Anything that touches `lib/e2ee/*` — encryption MUST run client-side; the server never sees plaintext or keys.
- Anything reading `window.location` (share-link import lives client-side).

**Don't import server modules into client code.** A `"use client"` file that imports from `lib/cloud/db.ts` will leak `mongodb` and connection logic into the browser bundle. The line is enforced informally — if a client file imports from `lib/cloud/`, that's a smell to check.

**Don't import client modules into Route Handlers.** Anything under `components/` is client UI; importing it server-side will fail at build time on `"use client"` boundaries.

**Same-origin by design.** The client repository (`components/risk-matrix/matrixCloudRepository.ts`) hits relative URLs like `/api/matrix`. There's no CORS allow-list; the API only responds to same-origin requests. If you change this, also re-add server-side origin validation.

**Rate limiter is in-process.** `lib/cloud/rateLimit.ts` uses `rate-limiter-flexible` with the memory backend. Sufficient for a single-instance deploy; for horizontal scale, swap `RateLimiterMemory` for `RateLimiterRedis` (same API).

## Conventions

- Co-locate related files: component, styles, tests, and types in the same directory.
- Use `next/image` for images, `next/link` for navigation, `next/font` for fonts.
- Fetch data in Server Components. Avoid `useEffect` for data fetching on the client.
- Use loading.tsx, error.tsx, and not-found.tsx for route-level UI states.
- Accessibility is required: meet WCAG 2.1 AA color contrast, preserve visible keyboard focus states, and ensure all interactive controls have clear labels.

## Theming: keep dark mode in lockstep with light

The app supports light + dark modes via class-based Tailwind v4 (`@custom-variant dark` in `app/globals.css`). Whenever you touch styles, **the dark mode treatment must land in the same change as the light mode treatment.** Do not ship a light-mode-only update.

- **Prefer the semantic tokens.** `bg-rm-surface`, `bg-rm-surface-2`, `bg-rm-surface-hover`, `border-rm-border`, `border-rm-border-strong`, `border-rm-divider`, `text-rm-muted`, `text-rm-muted-2`, `bg-rm-overlay`, `ring-rm-ring`, plus the matrix palette (`rm-canvas`, `rm-ink`, `rm-line`, `rm-actions`, `rm-primary`, `rm-{green,yellow,orange,red}` and their `-saturated`/`-strong` siblings) all auto-swap via CSS variables defined in `:root` and `.dark`. Reach for one of these before adding a literal `bg-white` or `text-zinc-600`.
- **If a token doesn't fit, define one.** Add the variable in both `:root` and `.dark` in `app/globals.css`, expose it under `@theme inline`, and use it. Don't sprinkle ad-hoc `dark:` variants when a token would do.
- **`dark:` variants are reserved for status tints.** Domain colors that don't live in the rm-* palette (sky/amber/red/emerald pills, etc.) should pair every light-mode utility with a `dark:` counterpart in the same className: `bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200`.
- **Test every change in both themes.** Toggle via the Theme button in the top bar (light / dark / system). Watch for: tinted hover backgrounds that don't cover the underlying cell color, focus rings that disappear on dark, shadows that vanish on dark canvas, and copy that drops below WCAG AA contrast.
- **Avoid raw hardcoded colors.** `bg-white`, `border-black/X`, `text-zinc-X`, `bg-black/X`, `ring-black/X` are smells — they don't switch with the theme. Replace with semantic tokens.

## Testing

- Write or update tests alongside every major change. If we're debugging something major, wait to add tests until the change is actually fixes the problem.
- Co-locate test files next to the code they test (e.g., `Button.test.tsx` beside `Button.tsx`).
- If you add a component, add a test. If you fix a bug, add a regression test.

## When Adding Dependencies

1. `yarn add` the package.
2. Restart the dev server so Next.js picks up the change.

## Before Submitting

1. `yarn lint` passes with no errors.
2. `yarn test` passes (if tests exist for the changed code).
3. No TypeScript errors (`npx tsc --noEmit`).
4. Verify the change works in the browser via the dev server.
