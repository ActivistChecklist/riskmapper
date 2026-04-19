import { COLOR_GROUPS } from "./constants";
import type { CellKey, GridLine, PoolLine } from "./types";

/**
 * Non-empty risks in categorized table order (same as `risksByColor` / step 3 UI):
 * color group order, then cell order within group, then line order within cell.
 */
export function getCategorizedRisksFlat(
  grid: Record<CellKey, GridLine[]>,
): { cellKey: CellKey; lineId: string }[] {
  const out: { cellKey: CellKey; lineId: string }[] = [];
  for (const group of COLOR_GROUPS) {
    for (const cellKey of group.cells) {
      for (const line of grid[cellKey] || []) {
        if (line.text.trim().length > 0) {
          out.push({ cellKey, lineId: line.id });
        }
      }
    }
  }
  return out;
}

/** Matrix cell: treat click as “empty chrome” (not an existing line or control). */
export function isMatrixCellEmptyBackgroundClick(target: unknown): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest("textarea")) return false;
  if (target.closest("button")) return false;
  if (target.closest("[data-row-id]")) return false;
  return true;
}

/** Mitigation column: treat click as empty padding (not an existing mitigation row or control). */
export function isMitigationColumnEmptyBackgroundClick(target: unknown): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest("textarea")) return false;
  if (target.closest("button")) return false;
  if (target.closest("[data-mitigation-row]")) return false;
  return true;
}

/** Stable id for a risk row in the categorized mitigations table. */
export function categorizedRiskRowKey(cellKey: CellKey, lineId: string): string {
  return `${cellKey}:${lineId}`;
}

export function emptyGrid(): Record<CellKey, GridLine[]> {
  const g: Record<CellKey, GridLine[]> = {};
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      g[`${r}-${c}`] = [];
    }
  }
  return g;
}

/** Ensure every cell key exists (older snapshots may omit empty cells). */
export function mergeHydratedGrid(
  g: Record<CellKey, GridLine[]> | undefined,
): Record<CellKey, GridLine[]> {
  const base = emptyGrid();
  if (!g) return base;
  for (const k of Object.keys(base)) {
    base[k] = g[k] ?? [];
  }
  return base;
}

export function parseImpactToken(token: string): 0 | 1 | 2 | null {
  const t = token.trim().toUpperCase();
  if (["LI", "IL", "LOWI"].includes(t)) return 0;
  if (["MI", "IM", "ML"].includes(t)) return 1;
  if (["HI", "IH"].includes(t)) return 2;
  return null;
}

export function parseLikelihoodToken(token: string): 0 | 1 | 2 | null {
  const t = token.trim().toUpperCase();
  if (["HL", "LH", "HI"].includes(t)) return 0;
  if (["ML", "LM", "MI"].includes(t)) return 1;
  if (["LL", "LOWL", "LI"].includes(t)) return 2;
  return null;
}

export function parseRiskCellShortcut(text: string): {
  cleanedText: string;
  targetCell: CellKey;
} | null {
  const match = text.match(/^(.*?)(?:\s+)?([A-Za-z-]+)\s*\/\s*([A-Za-z-]+)\s*$/);
  if (!match) return null;
  const cleanedText = match[1].trim();
  const impactCol = parseImpactToken(match[2]);
  const likelihoodRow = parseLikelihoodToken(match[3]);
  if (impactCol == null || likelihoodRow == null || cleanedText.length === 0) {
    return null;
  }
  return { cleanedText, targetCell: `${likelihoodRow}-${impactCol}` };
}

export function normalizePoolLines(lines: PoolLine[]): PoolLine[] {
  if (lines.length === 0) return lines;
  const lastNonEmptyIdx = (() => {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].text !== "") return i;
    }
    return -1;
  })();

  if (lastNonEmptyIdx < 0) {
    const first = lines[0];
    return first ? [{ id: first.id, text: "" }] : lines;
  }

  const prefix = lines.slice(0, lastNonEmptyIdx + 1);
  const tail = lines.slice(lastNonEmptyIdx + 1);
  const tailEmpties = tail.filter((l) => l.text === "");
  if (tailEmpties.length <= 1) return lines;
  return [...prefix, tailEmpties[0]];
}

/**
 * Pure pool text update (including `impact / likelihood` shortcut → matrix cell).
 * Call `setPool(result.pool)` and, if `result.gridAppend` is set, `setGrid` separately —
 * never nest `setGrid` inside a `setPool` functional updater (React Strict Mode / concurrent
 * re-runs would append duplicate lines to the grid).
 */
export function applyPoolTextUpdate(
  prev: PoolLine[],
  id: string,
  text: string,
  newLineId: () => string,
): {
  pool: PoolLine[];
  gridAppend: { cell: CellKey; line: GridLine } | null;
} {
  const shortcut = parseRiskCellShortcut(text);
  const next = normalizePoolLines(
    prev.map((l) =>
      l.id === id ? { ...l, text: shortcut ? shortcut.cleanedText : text } : l,
    ),
  );

  if (!shortcut) {
    const last = next[next.length - 1];
    if (!last || last.text !== "") {
      return {
        pool: normalizePoolLines([...next, { id: newLineId(), text: "" }]),
        gridAppend: null,
      };
    }
    return { pool: next, gridAppend: null };
  }

  const moved = next.find((line) => line.id === id);
  if (!moved || moved.text.trim().length === 0) {
    const last = next[next.length - 1];
    if (!last || last.text !== "") {
      return {
        pool: normalizePoolLines([...next, { id: newLineId(), text: "" }]),
        gridAppend: null,
      };
    }
    return { pool: next, gridAppend: null };
  }

  const gridLine: GridLine = {
    ...(moved as GridLine),
    id: newLineId(),
  };
  let withoutMoved = normalizePoolLines(next.filter((line) => line.id !== id));
  const lastAfter = withoutMoved[withoutMoved.length - 1];
  if (withoutMoved.length === 0 || (lastAfter && lastAfter.text !== "")) {
    withoutMoved = normalizePoolLines([
      ...withoutMoved,
      { id: newLineId(), text: "" },
    ]);
  }
  return {
    pool: withoutMoved,
    gridAppend: { cell: shortcut.targetCell, line: gridLine },
  };
}
