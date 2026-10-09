import { COLOR_GROUPS } from "./constants";
import type { CellKey, GridLine, OtherAction, PoolLine, SubLine } from "./types";

/**
 * Spreadsheet export: one flat table so it can be sorted and filtered.
 *
 * - A placed risk gets one row per non-empty mitigation, or a single row
 *   with the mitigation columns blank if it has none.
 * - Risks still in the pool come next, with no level, likelihood or impact.
 * - Other actions come last, with only the mitigation columns filled.
 *
 * Filtering the Action column to "Yes" gives the same list as the Actions
 * panel. Notes are free-form Markdown and are left out.
 */

export const MATRIX_CSV_HEADERS = [
  "Risk level",
  "Likelihood",
  "Impact",
  "Risk",
  "Type",
  "Mitigation or action",
  "Action",
] as const;

const LIKELIHOOD_BY_ROW = ["High", "Medium", "Low"] as const;
const IMPACT_BY_COL = ["Low", "Medium", "High"] as const;
const UNPLACED_LEVEL = "Not yet placed";

/**
 * Spreadsheet apps evaluate a cell starting with one of these as a formula.
 * A shared matrix can come from someone else, and `=HYPERLINK(...)` or
 * `=WEBSERVICE(...)` in a risk would make the reader's spreadsheet contact
 * a third party. Prefixing an apostrophe keeps the cell as text (OWASP
 * "CSV injection" guidance).
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export function escapeCsvField(value: string): string {
  const safe = FORMULA_TRIGGER.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

type Row = string[];

function nonEmpty(subs: SubLine[] | undefined): SubLine[] {
  return (subs ?? []).filter((s) => s.text.trim().length > 0);
}

function placedRiskRows(line: GridLine, cellKey: CellKey, level: string): Row[] {
  const [row, col] = cellKey.split("-").map(Number);
  const base = [level, LIKELIHOOD_BY_ROW[row], IMPACT_BY_COL[col], line.text];
  const mitigations = [
    ...nonEmpty(line.reduce).map((s) => ["Reduction", s] as const),
    ...nonEmpty(line.prepare).map((s) => ["Preparation", s] as const),
  ];
  if (mitigations.length === 0) return [[...base, "", "", ""]];
  return mitigations.map(([type, s]) => [
    ...base,
    type,
    s.text,
    s.starred ? "Yes" : "",
  ]);
}

export function buildMatrixCsv(args: {
  pool: PoolLine[];
  grid: Record<CellKey, GridLine[]>;
  otherActions: OtherAction[];
}): string {
  const rows: Row[] = [[...MATRIX_CSV_HEADERS]];
  for (const group of COLOR_GROUPS) {
    for (const cellKey of group.cells) {
      for (const line of args.grid[cellKey] ?? []) {
        if (!line.text.trim()) continue;
        rows.push(...placedRiskRows(line, cellKey, group.label));
      }
    }
  }
  for (const p of args.pool) {
    if (!p.text.trim()) continue;
    rows.push([UNPLACED_LEVEL, "", "", p.text, "", "", ""]);
  }
  for (const o of args.otherActions) {
    if (!o.text.trim()) continue;
    rows.push(["", "", "", "", "Other action", o.text, "Yes"]);
  }
  // RFC 4180 line endings, and a BOM so Excel reads the file as UTF-8
  // instead of mangling accents and the tone emoji people paste in.
  return "﻿" + rows.map((r) => r.map(escapeCsvField).join(",")).join("\r\n") + "\r\n";
}
