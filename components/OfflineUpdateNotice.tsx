import { useState } from "react";
import { Clock, X } from "lucide-react";
import {
  currentBuildId,
  dismissUpdateNotice,
  shouldShowUpdateNotice,
} from "@/lib/offlineAge";
import { isOfflineBuild, LIVE_SITE_ORIGIN } from "@/lib/offlineBuild";
import { builtOnLabel, builtOnMs } from "@/lib/releaseDate";
import { OFFLINE_SECTION_PATH } from "@/lib/offlinePaths.mts";

/**
 * A slim notice across the top of the offline file once its build is more
 * than a month old. It names the build date, which the Security page's
 * "latest offline copy" box also shows, and links there. The file
 * cannot check for updates itself (its CSP blocks every request), so this
 * only nudges; following the link is the user's choice. Dismissing hides it
 * for a month. Renders nothing on the website.
 */
export function OfflineUpdateNotice() {
  const [visible, setVisible] = useState(() => {
    if (!isOfflineBuild()) return false;
    try {
      return shouldShowUpdateNotice({
        storage: window.localStorage,
        build: currentBuildId(),
        builtAt: builtOnMs(),
        now: Date.now(),
      });
    } catch {
      // localStorage itself can throw when storage is blocked.
      return false;
    }
  });

  if (!visible) return null;

  const dismiss = () => {
    try {
      dismissUpdateNotice({ storage: window.localStorage, build: currentBuildId(), now: Date.now() });
    } catch {
      // Still hide it for this visit.
    }
    setVisible(false);
  };

  return (
    <aside
      aria-label="Update notice"
      className="border-b border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <div className="mx-auto flex w-full max-w-[1320px] items-center gap-3 px-4 py-2 text-sm sm:px-6 lg:px-8">
        <Clock className="size-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
        <p className="min-w-0 flex-1">
          This offline copy was built on {builtOnLabel()}, more than a month
          ago. A newer version may be available.{" "}
          <a
            href={`${LIVE_SITE_ORIGIN}${OFFLINE_SECTION_PATH}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rm-ring"
          >
            Check for a newer version
          </a>
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss update notice"
          className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rm-ring dark:hover:bg-amber-900/50"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </aside>
  );
}
