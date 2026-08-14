"use client";

import type { ReactNode } from "react";
import { Analytics } from "@/components/Analytics";
import { Footer } from "@/components/Footer";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "./ErrorBoundary";

/**
 * The chrome that used to live in `app/layout.tsx`: footer, toaster, and
 * the analytics pageview ping, wrapped in an error boundary.
 *
 * The pieces `layout.tsx` also owned but a static build handles elsewhere:
 * the `<html>`/`<body>` classes and every head tag now live in the HTML
 * entry documents, and the font variables come from CSS rather than
 * `next/font` (see client/fonts.css).
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <div className="flex-1">{children}</div>
      <Footer />
      <Toaster />
      <Analytics />
    </ErrorBoundary>
  );
}
