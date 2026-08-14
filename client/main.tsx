import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RiskMatrix } from "@/components/risk-matrix";
import NotFound from "./NotFound";
import { AppShell } from "./AppShell";
import { resolveRoute } from "./routes";
import "./fonts.css";
import "./globals.css";

/**
 * Entry for `index.html`. Serves the app root and share links; anything the
 * server could not match to a file lands here too and renders not-found.
 *
 * The route is resolved once at startup and never re-resolved: nothing in
 * the app navigates between these views. `shareUrl.ts` does rewrite the URL
 * via `history.replaceState`, but deliberately without a re-render, since
 * `/` and `/grid/<id>` render the same component either way.
 */
const route = resolveRoute(window.location.pathname);

const container = document.getElementById("root");
if (!container) throw new Error("index.html is missing #root");

createRoot(container).render(
  <StrictMode>
    <AppShell>{route === "app" ? <RiskMatrix /> : <NotFound />}</AppShell>
  </StrictMode>,
);
