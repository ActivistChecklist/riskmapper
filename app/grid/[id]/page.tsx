import { RiskMatrix } from "@/components/risk-matrix";

/**
 * Share-link landing route. Renders the same SPA as `/`; the client picks
 * up the recordId from `window.location.pathname` and the key from
 * `window.location.hash` via `useShareImport`. The `[id]` segment is here
 * so Next.js gives this URL a real route — no other server-side work
 * happens here. After the import completes, the client `replaceState`s
 * back to `/` so reloads don't re-trigger the flow.
 */
export default function GridSharePage() {
  return <RiskMatrix />;
}
