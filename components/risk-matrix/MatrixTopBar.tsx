"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MatrixDocumentActions } from "./MatrixToolbar";
import type { MatrixWorkspaceApi } from "./useMatrixWorkspace";

type Props = {
  workspace: MatrixWorkspaceApi;
  /** Copy / export control. Rendered in the title row's far right
   *  cluster, immediately to the left of `cloudShareControl`. */
  copyMenu?: (opts: { iconOnly: boolean }) => React.ReactNode;
  /** Cloud share control. Rendered in the title row's far right (Google
   *  Docs style), not in the toolbar. */
  cloudShareControl?: React.ReactNode;
  /** Status indicator (Saved locally / Synced / …), rendered to the right
   *  of the title in the title row. */
  statusIndicator?: React.ReactNode;
};

const SITE_NAME = "Risk Matrix";

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
      </div>
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
        <div className="flex min-h-10 min-w-0 flex-nowrap items-center gap-x-3 sm:gap-x-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="shrink-0">
                <Image
                  src="/icon.svg"
                  alt={SITE_NAME}
                  width={140}
                  height={32}
                  className="h-7 w-auto sm:h-8"
                  priority
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Currently just the site name: {SITE_NAME}
            </TooltipContent>
          </Tooltip>
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
            className="min-w-0 max-w-88 flex-1 truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-rm-ink outline-none placeholder:opacity-45 hover:border-black/20 hover:bg-black/2 focus-visible:border-rm-primary focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-rm-primary/20 sm:text-xl"
          />
          {statusIndicator ? (
            <div className="shrink-0">{statusIndicator}</div>
          ) : null}
          {/* Right-anchored cluster (Google Docs style):
              [Copy] [Share]. Copy is neutral (outline), Share is the
              primary CTA. */}
          {copyMenu || cloudShareControl ? (
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {/* iconOnly is the small-screen hint; child components also
                  use Tailwind responsive classes to hide labels at the
                  same breakpoint, so the rendered DOM matches the layout
                  decision at every width. */}
              {copyMenu ? copyMenu({ iconOnly: false }) : null}
              {cloudShareControl}
            </div>
          ) : null}
        </div>

        <div
          ref={toolbarRef}
          className="relative flex min-h-10 w-full min-w-0 flex-nowrap items-center rounded-lg border border-black/10 bg-white/85 px-1.5 py-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
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
      </div>
    </TooltipProvider>
  );
}
