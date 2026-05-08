import { sendAnalytics } from "@activistchecklist/umami-extra-privacy/client";
import type { RiskMatrixSnapshot } from "@/components/risk-matrix/matrixTypes";

/**
 * Privacy-preserving analytics for Risk Mapper. Events are fired through
 * `/api/counter`, the server-side relay that anonymizes the client IP
 * via `geo-hash` before forwarding to Umami. The relay never sees
 * plaintext matrix content; this module never includes user-typed
 * strings in event payloads either. Only event names cross the wire.
 *
 * In development, events are dropped so dev traffic does not pollute
 * production stats.
 */

const ENDPOINT = "/api/counter";
const skipInDev = () => process.env.NODE_ENV !== "production";

/**
 * Strip the per-matrix recordId from share URLs before reporting them.
 * `/grid/<recordId>` collapses to `/grid/`; every other path passes
 * through unchanged. The umami client auto-fills `url` from
 * `window.location.pathname`, so without this any pageview or event
 * fired on a shared matrix would leak the recordId to our analytics.
 *
 * Exported for testing.
 */
export function sanitizePath(pathname: string): string {
  if (pathname === "/grid" || pathname === "/grid/") return "/grid/";
  if (pathname.startsWith("/grid/")) return "/grid/";
  return pathname;
}

function sanitizeReferrer(ref: string): string {
  if (!ref) return "";
  try {
    const u = new URL(ref);
    return u.origin + sanitizePath(u.pathname);
  } catch {
    return "";
  }
}

function currentUrl(): string {
  if (typeof window === "undefined") return "/";
  return sanitizePath(window.location.pathname);
}

function currentReferrer(): string {
  if (typeof document === "undefined") return "";
  return sanitizeReferrer(document.referrer);
}

export type FirstTimeEvent =
  | "first_pool_item"
  | "first_grid_item"
  | "first_mitigation_typed"
  | "first_mitigation_starred"
  | "first_notes_content";

export type AnalyticsEvent =
  | "share_matrix"
  | "copy_worksheet"
  | "download_pdf"
  | FirstTimeEvent;

/**
 * Free-form key/value data attached to an event. Restricted to
 * primitive types so it's clear at the call site that nothing
 * structured (and nothing that could accidentally include user-typed
 * content) is being passed through.
 */
export type AnalyticsEventData = Record<string, string | number | boolean>;

const FIRST_TIME_KEYS: FirstTimeEvent[] = [
  "first_pool_item",
  "first_grid_item",
  "first_mitigation_typed",
  "first_mitigation_starred",
  "first_notes_content",
];

type FirstTimeFlags = Record<FirstTimeEvent, boolean>;

/** Fire a Umami pageview through the relay. */
export function trackPageview(): void {
  void sendAnalytics(
    { url: currentUrl(), referrer: currentReferrer() },
    { endpoint: ENDPOINT, skip: skipInDev },
  );
}

/**
 * Fire a named event. Optional `data` carries umami event properties
 * (e.g. `{ type: "plain" }`). Never include user-typed content.
 */
export function trackEvent(
  name: AnalyticsEvent,
  data?: AnalyticsEventData,
): void {
  void sendAnalytics(
    { name, data, url: currentUrl(), referrer: currentReferrer() },
    { endpoint: ENDPOINT, skip: skipInDev },
  );
}

// Notes is Markdown; an "empty" paragraph round-trips as an NBSP per
// NotesEditor.tsx. Strip whitespace AND NBSP before checking.
const NOTES_BLANK = /[\s\u00A0]/g;

/**
 * Pure derivation of "has any X" flags from a matrix snapshot. Exported
 * for testing.
 */
export function computeFirstTimeFlags(
  snapshot: RiskMatrixSnapshot,
): FirstTimeFlags {
  const lines = Object.values(snapshot.grid).flat();
  const sublines = lines.flatMap(
    (l) => [...(l.reduce ?? []), ...(l.prepare ?? [])],
  );
  return {
    first_pool_item: snapshot.pool.some((p) => p.text.trim().length > 0),
    first_grid_item: lines.some((l) => l.text.trim().length > 0),
    first_mitigation_typed: sublines.some((s) => s.text.trim().length > 0),
    first_mitigation_starred: sublines.some((s) => s.starred),
    first_notes_content: snapshot.notes.replace(NOTES_BLANK, "").length > 0,
  };
}

const sessionFired = new Set<FirstTimeEvent>();

export type FirstTimeTracker = (snapshot: RiskMatrixSnapshot) => void;

/**
 * Construct one tracker per canvas mount. Within that canvas, fires on
 * a false-to-true transition for each first-time key. Events whose
 * flag was already true on the canvas's first observation are blocked
 * for the lifetime of that tracker — the user did not "add" them,
 * they came in pre-populated (e.g. switching to a populated saved
 * matrix).
 *
 * Across the whole page session, each event name fires at most once
 * via `sessionFired` — so deleting and re-adding the same content
 * does not re-fire.
 *
 * `fire` is exposed as a constructor parameter so tests can capture
 * dispatches without mocking the umami transport.
 */
export function createFirstTimeTracker(
  fire: (key: FirstTimeEvent) => void = (k) => trackEvent(k),
): FirstTimeTracker {
  let prev: FirstTimeFlags | null = null;
  let blocked: Set<FirstTimeEvent> | null = null;
  return (snapshot) => {
    const current = computeFirstTimeFlags(snapshot);
    if (prev === null) {
      prev = current;
      blocked = new Set(FIRST_TIME_KEYS.filter((k) => current[k]));
      return;
    }
    for (const key of FIRST_TIME_KEYS) {
      if (blocked!.has(key)) continue;
      if (sessionFired.has(key)) continue;
      if (prev[key]) continue;
      if (!current[key]) continue;
      sessionFired.add(key);
      fire(key);
    }
    prev = current;
  };
}

/** Test-only: drop the per-session fired set. */
export function __resetAnalyticsSessionForTests(): void {
  sessionFired.clear();
}
