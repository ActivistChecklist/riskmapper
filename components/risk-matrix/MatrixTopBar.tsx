"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MATRIX_READING_COLUMN_CLASS } from "./constants";
import { MatrixDocumentActions } from "./MatrixToolbar";
import type { MatrixWorkspaceApi } from "./useMatrixWorkspace";

type Props = {
  workspace: MatrixWorkspaceApi;
  /** Copy / export control — receives compact mode when the toolbar switches to icon-only. */
  copyMenu?: (opts: { iconOnly: boolean }) => React.ReactNode;
  /** Cloud share control, rendered on the right side of the toolbar. */
  cloudShareControl?: React.ReactNode;
  /** Status indicator (Saved locally / Synced / …), rendered to the right
   *  of the title in the title row. */
  statusIndicator?: React.ReactNode;
};

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
          Delete
        </span>
        <span className={chip}>
          <span className="inline-block w-[15px] shrink-0" />
          Copy
        </span>
      </div>
      <span className={chip}>
        <span className="inline-block w-[15px] shrink-0" />
        Share
      </span>
    </div>
  );
}

export default function MatrixTopBar({
  workspace: ws,
  copyMenu,
  cloudShareControl,
  statusIndicator,
}: Props) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [iconOnlyToolbar, setIconOnlyToolbar] = useState(false);

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
  }, []);

  return (
    <TooltipProvider delayDuration={400}>
      <div className="mb-3 flex flex-col gap-3">
        <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-2">
          <h1
            className={[
              "inline-flex shrink-0 items-center rounded-lg border border-black/12",
              "bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-rm-ink",
              "shadow-[0_1px_2px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.9)]",
              "sm:px-3.5 sm:py-2 sm:text-sm",
            ].join(" ")}
          >
            risk matrix
          </h1>
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
            className="min-w-0 max-w-[min(100%,28rem)] flex-1 basis-[min(100%,18rem)] border-b border-black/20 bg-transparent pb-1 pl-0.5 pr-0.5 pt-1 text-sm font-medium text-rm-ink outline-none placeholder:opacity-45 focus-visible:border-rm-primary focus-visible:ring-2 focus-visible:ring-black/10"
          />
          {statusIndicator ? (
            <div className="ml-auto shrink-0">{statusIndicator}</div>
          ) : null}
        </div>

        <div
          ref={toolbarRef}
          className={[
            MATRIX_READING_COLUMN_CLASS,
            "relative flex min-h-10 min-w-0 flex-nowrap items-center rounded-lg border border-black/10 bg-white/85 px-1.5 py-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
          ].join(" ")}
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
            toolbarCopyMenu={copyMenu?.({ iconOnly: iconOnlyToolbar })}
            toolbarShareControl={cloudShareControl}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
