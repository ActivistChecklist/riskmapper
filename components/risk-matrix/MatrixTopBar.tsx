"use client";

import React, {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MatrixDocumentActions } from "./MatrixToolbar";
import ThemeToggle from "./ThemeToggle";
import type { MatrixWorkspaceApi } from "./useMatrixWorkspace";

type Props = {
  workspace: MatrixWorkspaceApi;
  /** Export menu (downloads and clipboard copies). Rendered in the title
   *  row's far right cluster, immediately to the left of
   *  `cloudShareControl`. */
  exportMenu?: React.ReactNode;
  /** Cloud share control. Rendered in the title row's far right (Google
   *  Docs style), not in the toolbar. */
  cloudShareControl?: React.ReactNode;
  /** Status indicator (Saved locally / Synced / …), rendered to the right
   *  of the title in the title row. */
  statusIndicator?: React.ReactNode;
};

const SITE_NAME = "Risk Mapper";

/**
 * Whether the viewport is at least Tailwind's `md`. Decides where the
 * document toolbar renders: it must render in exactly one place, because it
 * owns dialogs and a hidden file input that would otherwise be duplicated.
 * Without matchMedia (tests that don't install it) the desktop layout is
 * assumed.
 */
const MD_QUERY = "(min-width: 768px)";

function subscribeMd(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(MD_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function isMdUpNow(): boolean {
  if (typeof window.matchMedia !== "function") return true;
  return window.matchMedia(MD_QUERY).matches;
}

/** Invisible row matching full-label toolbar width — stable “does it fit?” probe (avoids compact/full flicker). */
function MatrixToolbarWidthProbe() {
  const chip =
    "inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap";
  return (
    <div className="flex w-max max-w-none flex-nowrap items-center gap-2 sm:gap-4">
      <div className="flex flex-nowrap items-center gap-1">
        <span className={chip}>
          <span className="inline-block w-[15px] shrink-0" />
          New
        </span>
        <span className={chip}>
          <span className="inline-block w-[15px] shrink-0" />
          Open recent
        </span>
        <span className={chip}>
          <span className="inline-block w-[15px] shrink-0" />
          Import
        </span>
        <span className={chip}>
          <span className="inline-block w-[15px] shrink-0" />
          Delete
        </span>
      </div>
    </div>
  );
}

export default function MatrixTopBar({
  workspace: ws,
  exportMenu,
  cloudShareControl,
  statusIndicator,
}: Props) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const titleMirrorRef = useRef<HTMLSpanElement>(null);
  const titleRowRef = useRef<HTMLDivElement>(null);
  const [iconOnlyToolbar, setIconOnlyToolbar] = useState(false);
  const [titleInputWidthPx, setTitleInputWidthPx] = useState(0);
  const isMdUp = useSyncExternalStore(subscribeMd, isMdUpNow, () => true);

  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    const measure = measureRef.current;
    if (!toolbar || !measure) return;

    const update = () => {
      const needIcons =
        measure.getBoundingClientRect().width > toolbar.clientWidth + 1;
      setIconOnlyToolbar(needIcons);
    };

    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      window.requestAnimationFrame(update);
    });
    ro.observe(toolbar);
    return () => {
      ro.disconnect();
    };
  }, [isMdUp]);

  // Publish the title-row height as `--rm-topbar-h` whenever the title row
  // is actually sticky (md+), so other sticky descendants (matrix impact
  // header, mitigations table headers) can offset themselves under it.
  // Below md the var stays 0px so those descendants keep sticking at the
  // viewport top.
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window.matchMedia !== "function") return;
    const row = titleRowRef.current;
    if (!row) return;
    const root = document.documentElement;
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => {
      if (mq.matches) {
        root.style.setProperty("--rm-topbar-h", `${row.offsetHeight}px`);
      } else {
        root.style.setProperty("--rm-topbar-h", "0px");
      }
    };
    sync();
    const ro =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => window.requestAnimationFrame(sync));
    ro?.observe(row);
    mq.addEventListener("change", sync);
    return () => {
      ro?.disconnect();
      mq.removeEventListener("change", sync);
      root.style.removeProperty("--rm-topbar-h");
    };
  }, []);

  useLayoutEffect(() => {
    const mirror = titleMirrorRef.current;
    if (!mirror) return;
    const measure = () =>
      setTitleInputWidthPx(Math.ceil(mirror.getBoundingClientRect().width));
    measure();
    // The first measurement can run before the Geist web font has loaded,
    // in the narrower fallback font, which left the title truncated until
    // it was edited. Re-measure whenever the mirror's size changes.
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(mirror);
    return () => ro.disconnect();
  }, [ws.activeTitle]);

  return (
    <TooltipProvider delayDuration={400}>
      {/* No flex-column wrapper here on purpose: the title row is sticky
          (md+), and a wrapping flex container would constrain its sticky
          range to the wrapper's own height (~100px). With these as
          direct children of the page canvas, the row sticks for the
          entire page scroll. */}
      <div
        ref={titleRowRef}
        className="mb-3 flex min-h-10 min-w-0 flex-wrap items-center gap-x-3 gap-y-2 bg-rm-canvas py-3 sm:gap-x-4 md:sticky md:top-0 md:z-30 md:flex-nowrap"
      >
          {/* Logo, title and status badge never wrap apart: below md this
              group fills the first row and the buttons wrap to a second, and
              a long title truncates here instead of pushing the badge down. */}
          <div className="flex min-w-0 shrink items-center gap-x-3 max-md:w-full sm:gap-x-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="shrink-0">
                  {/* A plain <img>: the source is a static SVG we ship, so
                      there's nothing for an image optimizer to do, and the
                      build has no server to do it. */}
                  <img
                    src="/icon.svg"
                    alt={SITE_NAME}
                    width={32}
                    height={32}
                    className="size-7 sm:size-8"
                    fetchPriority="high"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {SITE_NAME}
              </TooltipContent>
            </Tooltip>
            {/* The title hugs its measured text width and shrinks only when
                the row runs out of room. Below md the buttons wrap to a second
                row, so the title shares its row with just the logo and status
                badge and is no longer truncated to "Unti...". The 22rem cap
                applies from md up, where the buttons share the row too. */}
            <div
              className="relative w-(--rm-title-w) min-w-0 shrink md:max-w-88"
              style={{ "--rm-title-w": `${titleInputWidthPx}px` } as React.CSSProperties}
            >
              <span
                ref={titleMirrorRef}
                className="pointer-events-none invisible absolute left-0 top-0 whitespace-pre rounded-md border border-transparent px-2 py-1 text-lg font-semibold sm:text-xl"
                aria-hidden
              >
                {ws.activeTitle || "Matrix title"}
              </span>
              <input
                type="text"
                value={ws.activeTitle}
                onChange={(e) => ws.setActiveTitle(e.target.value)}
                onBlur={(e) => {
                  const t = e.target.value.trim();
                  ws.setActiveTitle(t.length > 0 ? t : "Untitled");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder="Matrix title"
                aria-label="Matrix title"
                className="w-full min-w-0 truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-rm-ink outline-none placeholder:opacity-45 hover:border-rm-border-strong hover:bg-rm-surface-hover focus-visible:border-rm-primary focus-visible:bg-rm-surface focus-visible:ring-2 focus-visible:ring-rm-primary/20 sm:text-xl"
              />
            </div>
            {statusIndicator ? (
              <div className="shrink-0">{statusIndicator}</div>
            ) : null}
          </div>
          {/* Right-anchored cluster (Google Docs style):
              [Export] [Share]. Export is neutral (outline), Share is the
              primary CTA. */}
          <div className="ml-auto flex shrink-0 items-center gap-2 max-md:w-full">
            {/* Below md the document toolbar joins this row, on the left,
                instead of taking a full-width row of its own. */}
            {!isMdUp ? (
              <div className="mr-auto flex h-9 items-center rounded-lg border border-rm-border bg-rm-surface-translucent px-0.5">
                <MatrixDocumentActions iconOnly toolbar large workspace={ws} />
              </div>
            ) : null}
            {/* iconOnly is the small-screen hint; child components also
                use Tailwind responsive classes to hide labels at the
                same breakpoint, so the rendered DOM matches the layout
                decision at every width. */}
            <ThemeToggle />
            {exportMenu}
            {cloudShareControl}
          </div>
        </div>

      {isMdUp ? (
        <div
          ref={toolbarRef}
          className="relative mb-3 flex min-h-10 w-full min-w-0 flex-nowrap items-center rounded-lg border border-rm-border bg-rm-surface-translucent px-1.5 py-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
        >
            <div
              ref={measureRef}
              className="pointer-events-none invisible absolute top-0 left-0 z-0 flex w-max max-w-none flex-nowrap items-center"
              aria-hidden
            >
              <MatrixToolbarWidthProbe />
            </div>
          <MatrixDocumentActions
            iconOnly={iconOnlyToolbar}
            toolbar
            workspace={ws}
          />
        </div>
      ) : null}
    </TooltipProvider>
  );
}
