import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PrivacyPage from "./PrivacyPage";
import { AppShell } from "./AppShell";
import "./fonts.css";
import "./globals.css";

/**
 * Entry for `privacy/index.html`. Its own document rather than a client
 * route, so a reader can land on /privacy without downloading the app.
 */
const container = document.getElementById("root");
if (!container) throw new Error("privacy/index.html is missing #root");

createRoot(container).render(
  <StrictMode>
    <AppShell>
      <PrivacyPage />
    </AppShell>
  </StrictMode>,
);
