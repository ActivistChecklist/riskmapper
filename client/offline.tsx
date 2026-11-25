import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import OfflinePage from "./OfflinePage";
import { AppShell } from "./AppShell";
import "./fonts.css";
import "./globals.css";

/**
 * Entry for `offline/index.html`. Its own document rather than a client
 * route, so a reader can land on /offline/ without downloading the app.
 */
const container = document.getElementById("root");
if (!container) throw new Error("offline/index.html is missing #root");

createRoot(container).render(
  <StrictMode>
    <AppShell>
      <OfflinePage />
    </AppShell>
  </StrictMode>,
);
