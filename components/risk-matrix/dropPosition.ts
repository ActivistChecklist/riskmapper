import type { DropIndicator, DropTarget } from "./types";

type Line = { id: string; text: string };

/** A row's vertical extent in viewport coordinates. */
export type RowBox = { id: string; top: number; height: number };

/**
 * The row a pointer at `y` would drop ahead of: the first row whose
 * midpoint is below the pointer, or null when the pointer is past them
 * all. The dragged row is skipped, so hovering over it resolves to the
 * row after it, which is where it already sits.
 */
export function beforeIdAtY(
  rows: readonly RowBox[],
  y: number,
  draggedId: string,
): string | null {
  for (const row of rows) {
    if (row.id === draggedId) continue;
    if (y < row.top + row.height / 2) return row.id;
  }
  return null;
}

/**
 * Index in `lines` where a dropped line lands. A null or unknown
 * `beforeId` means the end, which stays ahead of a trailing empty line so
 * the blank entry row remains last.
 */
export function dropInsertIndex(
  lines: readonly Line[],
  beforeId: string | null,
): number {
  if (beforeId !== null) {
    const i = lines.findIndex((l) => l.id === beforeId);
    if (i >= 0) return i;
  }
  const last = lines[lines.length - 1];
  return last && last.text === "" ? lines.length - 1 : lines.length;
}

/** `lines` with `line` inserted at the drop position. */
export function insertAtDrop<T extends Line>(
  lines: readonly T[],
  line: T,
  beforeId: string | null,
): T[] {
  const next = [...lines];
  next.splice(dropInsertIndex(lines, beforeId), 0, line);
  return next;
}

/** `lines` with the line `id` moved to the drop position. */
export function reorderAtDrop<T extends Line>(
  lines: readonly T[],
  id: string,
  beforeId: string | null,
): T[] {
  const line = lines.find((l) => l.id === id);
  if (!line) return [...lines];
  return insertAtDrop(
    lines.filter((l) => l.id !== id),
    line,
    beforeId,
  );
}

/** True when dropping `id` before `beforeId` would leave the order as is. */
export function isNoopReorder(
  lines: readonly Line[],
  id: string,
  beforeId: string | null,
): boolean {
  const from = lines.findIndex((l) => l.id === id);
  if (from < 0) return true;
  const rest = lines.filter((l) => l.id !== id);
  return dropInsertIndex(rest, beforeId) === from;
}

/**
 * Where to draw the insertion line for a drop into `lines`, or null when
 * the drop would not move anything. `lines` is the destination list as
 * rendered, which still contains the dragged line when it is a reorder.
 */
export function dropIndicatorFor(
  lines: readonly Line[],
  draggedId: string,
  target: DropTarget,
  sourceLoc: DropTarget["loc"],
): DropIndicator | null {
  if (
    sourceLoc === target.loc &&
    isNoopReorder(lines, draggedId, target.beforeId)
  ) {
    return null;
  }
  const rest = lines.filter((l) => l.id !== draggedId);
  const at = dropInsertIndex(rest, target.beforeId);
  if (at < rest.length) {
    return { loc: target.loc, rowId: rest[at].id, edge: "before" };
  }
  const last = rest[rest.length - 1];
  if (last) return { loc: target.loc, rowId: last.id, edge: "after" };
  return { loc: target.loc, rowId: null, edge: "before" };
}
