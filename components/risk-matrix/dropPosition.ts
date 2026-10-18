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

/** The row edge an insertion line is drawn on; `rowId` null is an empty list. */
export type InsertionEdge = { rowId: string | null; edge: "before" | "after" };

/**
 * Where to draw the insertion line for a drop into `lines` ahead of
 * `beforeId`, ignoring whether the drop is a no-op. `lines` may still
 * contain the dragged line.
 */
export function insertionEdge(
  lines: readonly Line[],
  draggedId: string,
  beforeId: string | null,
): InsertionEdge {
  const rest = lines.filter((l) => l.id !== draggedId);
  const at = dropInsertIndex(rest, beforeId);
  if (at < rest.length) return { rowId: rest[at].id, edge: "before" };
  const last = rest[rest.length - 1];
  if (last) return { rowId: last.id, edge: "after" };
  return { rowId: null, edge: "before" };
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
  return { loc: target.loc, ...insertionEdge(lines, draggedId, target.beforeId) };
}

/**
 * `beforeId` adjusted so a dragged mitigation stays on its side of the
 * destination list's starred block: a starred line can't drop below the
 * first unstarred line, and an unstarred one can't drop above the last
 * starred line. `lines` is the destination as rendered, and contains the
 * dragged line only when it is a reorder within the same list.
 */
export function clampStarredBeforeId(
  lines: readonly (Line & { starred: boolean })[],
  draggedId: string,
  draggedStarred: boolean,
  beforeId: string | null,
): string | null {
  const rest = lines.filter((l) => l.id !== draggedId);
  const starredCount = rest.filter((l) => l.starred).length;
  const at = dropInsertIndex(rest, beforeId);
  const clamped = draggedStarred
    ? Math.min(at, starredCount)
    : Math.max(at, starredCount);
  return clamped < rest.length ? rest[clamped].id : null;
}
