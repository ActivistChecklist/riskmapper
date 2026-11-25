import { OFFLINE_BUILD_META } from "@/lib/offlinePaths.mts";

/**
 * Whether the offline copy is old enough to suggest checking for a newer
 * one. Age counts from the build date (lib/releaseDate.ts), which the
 * Security page also shows, so the two can be compared.
 *
 * "Dismiss" is remembered per build, using the id the build writes into a
 * <meta> tag. That matters in Chromium browsers, where every HTML file opened
 * from disk shares one storage area: dismissing an old copy's notice must
 * not silence a different copy's.
 */

/** "More than a month old." */
export const STALE_AFTER_DAYS = 30;
/** How long "Dismiss" hides the notice before it comes back. */
export const DISMISS_FOR_DAYS = 30;

const DISMISSED_KEY = "rm-offline-update-dismissed";
const DAY_MS = 24 * 60 * 60 * 1000;

type Stamp = { build: string; at: number };

/** The build id from the offline file's <meta> tag, or null outside it. */
export function currentBuildId(doc: Document = document): string | null {
  return doc.querySelector(`meta[name="${OFFLINE_BUILD_META}"]`)?.getAttribute("content") ?? null;
}

function dismissedAt(storage: Storage, build: string): number | null {
  try {
    const raw = storage.getItem(DISMISSED_KEY);
    if (!raw) return null;
    const stamp = JSON.parse(raw) as Partial<Stamp>;
    return stamp.build === build && typeof stamp.at === "number" ? stamp.at : null;
  } catch {
    return null;
  }
}

/** Whether to show the notice now. */
export function shouldShowUpdateNotice(args: {
  storage: Storage;
  build: string | null;
  builtAt: number;
  now: number;
}): boolean {
  const { storage, build, builtAt, now } = args;
  if (!build || Number.isNaN(builtAt)) return false;
  if (now - builtAt <= STALE_AFTER_DAYS * DAY_MS) return false;
  const dismissed = dismissedAt(storage, build);
  return dismissed === null || now - dismissed > DISMISS_FOR_DAYS * DAY_MS;
}

/** Hide the notice for this build for `DISMISS_FOR_DAYS`. */
export function dismissUpdateNotice(args: { storage: Storage; build: string | null; now: number }): void {
  if (!args.build) return;
  try {
    args.storage.setItem(DISMISSED_KEY, JSON.stringify({ build: args.build, at: args.now } satisfies Stamp));
  } catch {
    // Storage full or blocked: it is still hidden for this visit.
  }
}
