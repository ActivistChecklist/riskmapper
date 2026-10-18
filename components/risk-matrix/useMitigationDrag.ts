"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  beforeIdAtY,
  clampStarredBeforeId,
  insertionEdge,
  type InsertionEdge,
} from "./dropPosition";
import type { CellKey, DragState, GridLine, SubLine } from "./types";

export type MitigationSubType = "reduce" | "prepare";

/** Identifies one mitigation list: a risk's reduce or prepare column. */
export type MitigationListRef = {
  cellKey: CellKey;
  parentLineId: string;
  subType: MitigationSubType;
};

/** Value of `data-mitigation-list` on the list container, used in hit tests. */
export function mitigationListKey(ref: MitigationListRef): string {
  return `${ref.cellKey}|${ref.parentLineId}|${ref.subType}`;
}

/** Inverse of {@link mitigationListKey}; null for anything malformed. */
export function parseMitigationListKey(key: string): MitigationListRef | null {
  const [cellKey, parentLineId, subType] = key.split("|");
  if (!cellKey || !parentLineId) return null;
  if (subType !== "reduce" && subType !== "prepare") return null;
  return { cellKey, parentLineId, subType };
}

/** Where a dragged mitigation would land: ahead of `beforeId` in `list`. */
export type MitigationDropTarget = {
  list: MitigationListRef;
  beforeId: string | null;
};

type MitigationDrag = DragState & {
  list: MitigationListRef;
  starred: boolean;
};

function subLinesIn(
  grid: Record<CellKey, GridLine[]>,
  list: MitigationListRef,
): SubLine[] {
  const line = (grid[list.cellKey] || []).find((l) => l.id === list.parentLineId);
  return line?.[list.subType] || [];
}

/**
 * Pointer drag to move a mitigation within its list, to the other question
 * on the same risk, or to another risk. Same feel as dragging risks (grip,
 * tilted preview, insertion line). A line keeps its star wherever it goes,
 * and never lands across the destination's starred block boundary, so
 * starred lines stay at the top of every list.
 */
export function useMitigationDrag({
  grid,
  onMove,
}: {
  grid: Record<CellKey, GridLine[]>;
  onMove: (from: MitigationListRef, subId: string, to: MitigationDropTarget) => void;
}) {
  const [drag, setDrag] = useState<MitigationDrag | null>(null);
  // Null while the pointer isn't over any mitigation list: no drop.
  const [target, setTarget] = useState<MitigationDropTarget | null>(null);

  // Handlers registered for the life of one drag read the latest grid
  // through this ref rather than re-subscribing. Same latest-value pattern
  // as poolRef in useRiskMatrix.
  const gridRef = useRef(grid);
  // eslint-disable-next-line react-hooks/refs
  gridRef.current = grid;

  const onGripPointerDown = useCallback(
    (e: React.PointerEvent, list: MitigationListRef, subLine: SubLine) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!subLine.text) return;
      e.preventDefault();
      e.stopPropagation();
      const row = (e.currentTarget as HTMLElement).closest("[data-sub-row-id]");
      const rect = row
        ? row.getBoundingClientRect()
        : { left: e.clientX - 90, top: e.clientY - 22, width: 180, height: 44 };
      setDrag({
        id: subLine.id,
        text: subLine.text,
        x: e.clientX,
        y: e.clientY,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        width: rect.width,
        height: rect.height,
        variant: "mitigation",
        cellBgClass: null,
        list,
        starred: subLine.starred,
      });
      setTarget(null);
      if (document.activeElement && "blur" in document.activeElement) {
        (document.activeElement as HTMLElement).blur();
      }
    },
    [],
  );

  // Subscribe once per drag; the pointer position changing every move
  // doesn't need new listeners.
  const dragId = drag?.id;
  const dragList = drag?.list;
  const dragStarred = drag?.starred ?? false;
  useEffect(() => {
    if (!dragId || !dragList) return;
    const targetAt = (x: number, y: number): MitigationDropTarget | null => {
      const listEl = document
        .elementFromPoint(x, y)
        ?.closest<HTMLElement>("[data-mitigation-list]");
      const list = parseMitigationListKey(listEl?.dataset.mitigationList ?? "");
      if (!listEl || !list) return null;
      const rows = Array.from(
        listEl.querySelectorAll<HTMLElement>("[data-sub-row-id]"),
        (row) => {
          const rect = row.getBoundingClientRect();
          return { id: row.dataset.subRowId ?? "", top: rect.top, height: rect.height };
        },
      );
      return {
        list,
        beforeId: clampStarredBeforeId(
          subLinesIn(gridRef.current, list),
          dragId,
          dragStarred,
          beforeIdAtY(rows, y, dragId),
        ),
      };
    };
    const sameTarget = (a: MitigationDropTarget | null, b: MitigationDropTarget | null) =>
      a === b ||
      (a !== null &&
        b !== null &&
        a.beforeId === b.beforeId &&
        mitigationListKey(a.list) === mitigationListKey(b.list));
    const onPointerMove = (e: PointerEvent) => {
      e.preventDefault();
      setDrag((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : prev));
      const next = targetAt(e.clientX, e.clientY);
      setTarget((prev) => (sameTarget(prev, next) ? prev : next));
    };
    const onPointerUp = (e: PointerEvent) => {
      const to = targetAt(e.clientX, e.clientY);
      if (to) onMove(dragList, dragId, to);
      setDrag(null);
      setTarget(null);
    };
    const onCancel = () => {
      setDrag(null);
      setTarget(null);
    };
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [dragId, dragList, dragStarred, onMove]);

  // Drawn for every valid target, including a drop that leaves the line
  // where it is. That case matters most when the starred block has stopped
  // the line from going further: the bar shows where it will actually land.
  const dropEdge = useMemo((): (InsertionEdge & { listKey: string }) | null => {
    if (!drag || !target) return null;
    return {
      listKey: mitigationListKey(target.list),
      ...insertionEdge(subLinesIn(grid, target.list), drag.id, target.beforeId),
    };
  }, [drag, target, grid]);

  return {
    mitigationDragState: drag,
    draggingSubId: drag?.id ?? null,
    mitigationDropEdge: dropEdge,
    onMitigationGripPointerDown: onGripPointerDown,
  };
}
