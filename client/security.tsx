import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SecurityPage from "./SecurityPage";
import { AppShell } from "./AppShell";
import "./fonts.css";
import "./globals.css";

/**
 * Entry for `security/index.html`. Its own document rather than a client
 * route, so a reader can land on /security/ without downloading the app.
 */
const container = document.getElementById("root");
if (!container) throw new Error("security/index.html is missing #root");

createRoot(container).render(
  <StrictMode>
    <AppShell>
      <SecurityPage />
    </AppShell>
  </StrictMode>,
);
