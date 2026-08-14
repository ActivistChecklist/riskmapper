"use client";

import { useEffect } from "react";
import { trackPageview } from "@/lib/analytics/events";

/**
 * Fires a single Umami pageview on mount via our server-side relay
 * (`/api/counter`). The relay anonymizes the IP before forwarding —
 * the browser never reaches Umami directly. See `server/routes/counter.ts`.
 *
 * Skipped in development so dev traffic doesn't pollute production stats.
 */
export function Analytics() {
  useEffect(() => {
    trackPageview();
  }, []);

  return null;
}
