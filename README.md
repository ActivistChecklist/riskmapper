# Risk Matrix

A client-side risk matrix workspace built with Next.js (App Router). Organize risks, categories, and mitigations in the browser.

## Requirements

- Node.js 20+
- [Yarn](https://yarnpkg.com/)

## Setup

```bash
yarn install
yarn dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command           | Description              |
| ----------------- | ------------------------ |
| `yarn dev`        | Development server (HMR) |
| `yarn dev:turbo`  | Dev server with Turbopack |
| `yarn build`      | Production build (static export) |
| `yarn start`      | Serve production build locally |
| `yarn lint`       | ESLint                   |
| `yarn test`       | Vitest (run once)        |
| `yarn test:watch` | Vitest watch mode        |
| `yarn typecheck`  | TypeScript (`tsc --noEmit`) |

## Deployment

The app is configured for static export (`output: "export"`). For GitHub Pages under a project URL, set `NEXT_PUBLIC_BASE_PATH` to the repository path (for example `/riskmatrix`) when building so assets resolve correctly.

## License

See [LICENSE](LICENSE).
