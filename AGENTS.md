<!-- BEGIN:nextjs-agent-rules -->

# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated -- the docs are the source of truth.

<!-- END:nextjs-agent-rules -->

# Project Guidelines

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

## Conventions

- Co-locate related files: component, styles, tests, and types in the same directory.
- Use `next/image` for images, `next/link` for navigation, `next/font` for fonts.
- Fetch data in Server Components. Avoid `useEffect` for data fetching on the client.
- Use loading.tsx, error.tsx, and not-found.tsx for route-level UI states.
- Accessibility is required: meet WCAG 2.1 AA color contrast, preserve visible keyboard focus states, and ensure all interactive controls have clear labels.

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
