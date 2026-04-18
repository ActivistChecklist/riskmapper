"use client";

import React from "react";
import { GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";
import type { DragState } from "./types";

export type DragPreviewLayerProps = {
  dragState: DragState | null;
};

export default function DragPreviewLayer({ dragState }: DragPreviewLayerProps) {
  if (!dragState) return null;
  const left = dragState.x - dragState.offsetX;
  const top = dragState.y - dragState.offsetY;
  const isCell = dragState.variant === "cell";

  return (
    <div
      className={cn(
        "pointer-events-none fixed z-[1000] overflow-hidden rounded-[5px] border border-black/8",
        "shadow-[0_10px_28px_rgba(0,0,0,0.2)]",
        "rotate-[-2.5deg] origin-top-left",
      )}
      style={{
        left,
        top,
        width: dragState.width,
        minHeight: dragState.height,
      }}
    >
      {isCell && dragState.cellBgClass ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-0",
            dragState.cellBgClass,
          )}
          aria-hidden
        />
      ) : null}
      <div
        className={cn(
          "relative flex min-h-full items-start gap-0 p-0 sm:gap-0.5",
          isCell ? "bg-white/55" : "bg-rm-line",
        )}
      >
        <span
          className="flex w-[18px] shrink-0 select-none items-center justify-center self-stretch text-zinc-800 sm:w-[22px]"
          aria-hidden
        >
          <GripVertical size={14} className="opacity-50" />
        </span>
        <div className="min-w-0 flex-1 whitespace-pre-wrap break-words py-1.5 pl-0 pr-1 text-[15px] leading-[1.5] text-rm-ink sm:px-1.5">
          {dragState.text}
        </div>
      </div>
    </div>
  );
}
