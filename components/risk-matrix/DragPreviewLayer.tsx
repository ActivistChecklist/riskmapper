"use client";

import React from "react";
import type { DragState } from "./types";

export type DragPreviewLayerProps = {
  dragState: DragState | null;
};

export default function DragPreviewLayer({ dragState }: DragPreviewLayerProps) {
  if (!dragState) return null;
  return (
    <div
      className="pointer-events-none fixed z-[1000] rounded-[5px] border border-black/20 bg-white py-0.5 pr-2 pl-[26px] text-[13px] leading-[1.45] text-rm-ink opacity-95 shadow-[0_6px_20px_rgba(0,0,0,0.18)] whitespace-pre-wrap break-words"
      style={{
        left: dragState.x - dragState.offsetX,
        top: dragState.y - dragState.offsetY,
        width: dragState.width,
      }}
    >
      {dragState.text}
    </div>
  );
}
