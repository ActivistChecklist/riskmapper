import type { CellKey, GridLine, PoolLine } from "./types";

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
