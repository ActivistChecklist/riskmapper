import { COL_LABELS, COLOR_GROUPS, ROW_LABELS } from "./constants";
import { cellKeyToTone, toneToCircle } from "./riskTone";
import type { CellKey, GridLine, OtherAction, PoolLine, SubLine } from "./types";

/**
 * Two spreadsheet exports share this file:
 * - `buildMatrixCsv`, a flat table to sort and filter;
 * - `buildWorksheetCsv`, laid out like the page itself.
 */

/**
 * Flat table: one row per item so it can be sorted and filtered.
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
  return toCsv(rows);
}

function toCsv(rows: Row[]): string {
  // Pad to one width so every row has the same number of fields.
  const width = Math.max(...rows.map((r) => r.length));
  const padded = rows.map((r) => [...r, ...Array<string>(width - r.length).fill("")]);
  // RFC 4180 line endings, and a BOM so Excel reads the file as UTF-8
  // instead of mangling accents and the tone emoji.
  return (
    "\uFEFF" +
    padded.map((r) => r.map(escapeCsvField).join(",")).join("\r\n") +
    "\r\n"
  );
}

/**
 * Worksheet layout: the page as a spreadsheet, top to bottom. The risk pool,
 * then the 3x3 matrix with every risk in its cell (one per line, each with
 * the cell's colored circle), then mitigations in the page's three columns,
 * grouped by color with as many rows per risk as it has mitigations, then
 * actions and notes. Headers are ruled with ━ so they stand out without
 * formatting, which CSV cannot carry.
 */
const STAR = "⭐";
const BULLET = "•";

function sectionHeading(text: string): Row {
  return [`━━ ${text} ━━`];
}

function subLineCell(s: SubLine | undefined): string {
  if (!s) return "";
  return `${s.starred ? STAR : BULLET} ${s.text}`;
}

// The notes editor writes an otherwise-empty paragraph as an NBSP.
const BLANK_LINE = /^[\s\u00A0]*$/;

function notesRows(notes: string): Row[] {
  const rows: Row[] = [];
  for (const line of notes.split("\n")) {
    if (BLANK_LINE.test(line)) {
      // Keep paragraph breaks, but never two blank rows in a row.
      if (rows.length > 0 && rows[rows.length - 1][0] !== "") rows.push([""]);
      continue;
    }
    rows.push([line.replace(/^(\s*)[-*+]\s+/, `$1${BULLET} `)]);
  }
  while (rows.length > 0 && rows[rows.length - 1][0] === "") rows.pop();
  return rows;
}

function filled<T extends { text: string }>(items: T[] | undefined): T[] {
  return (items ?? []).filter((i) => i.text.trim().length > 0);
}

export function buildWorksheetCsv(args: {
  title: string;
  pool: PoolLine[];
  grid: Record<CellKey, GridLine[]>;
  otherActions: OtherAction[];
  notes: string;
}): string {
  const { grid } = args;
  const title = args.title.replace(/\s+/g, " ").trim() || "Untitled";
  const rows: Row[] = [[`# ${title}`], []];

  rows.push(sectionHeading("STEP 1 · RISK POOL (not yet on the matrix)"));
  const pool = filled(args.pool);
  if (pool.length === 0) rows.push(["(No risks left in the pool)"]);
  for (const p of pool) rows.push([`${BULLET} ${p.text}`]);
  rows.push([]);

  rows.push(sectionHeading("STEP 2 · RISK MATRIX"));
  rows.push(["Likelihood ↓   Impact →", ...COL_LABELS]);
  ROW_LABELS.forEach((rowLabel, row) => {
    const cells = COL_LABELS.map((_, col) => {
      const cellKey: CellKey = `${row}-${col}`;
      const circle = toneToCircle(cellKeyToTone(cellKey));
      return filled(grid[cellKey])
        .map((l) => `${circle} ${l.text}`)
        .join("\n");
    });
    rows.push([rowLabel, ...cells]);
  });
  rows.push([]);

  rows.push(
    sectionHeading(`STEP 3 · MITIGATIONS (${STAR} = an action you intend to take)`),
  );
  rows.push([
    "Risk",
    "How can we reduce the likelihood of this happening?",
    "How can we limit the harm if it happens?",
  ]);
  let anyPlaced = false;
  // Collected in the same order the Actions panel lists them.
  const starred: Row[] = [];
  for (const group of COLOR_GROUPS) {
    const circle = toneToCircle(group.key);
    const risks = group.cells.flatMap((cellKey) => filled(grid[cellKey]));
    if (risks.length === 0) continue;
    anyPlaced = true;
    rows.push([`${circle} ${group.label.toUpperCase()}`]);
    for (const risk of risks) {
      const reduce = filled(risk.reduce);
      const prepare = filled(risk.prepare);
      const height = Math.max(1, reduce.length, prepare.length);
      for (let i = 0; i < height; i++) {
        rows.push([
          i === 0 ? `${circle} ${risk.text}` : "",
          subLineCell(reduce[i]),
          subLineCell(prepare[i]),
        ]);
      }
      for (const [kind, subs] of [
        ["Reduction", reduce],
        ["Preparation", prepare],
      ] as const) {
        for (const s of subs.filter((x) => x.starred)) {
          starred.push([`${STAR} ${s.text}`, `${kind} for ${circle} ${risk.text}`]);
        }
      }
    }
  }
  if (!anyPlaced) rows.push(["(No risks on the matrix yet)"]);
  rows.push([]);

  rows.push(sectionHeading(`${STAR} ACTIONS`));
  const others = filled(args.otherActions);
  if (starred.length === 0 && others.length === 0) {
    rows.push(["(No actions yet. Star a mitigation to add it here.)"]);
  }
  rows.push(...starred);
  if (others.length > 0) {
    if (starred.length > 0) rows.push(["Other actions"]);
    for (const o of others) rows.push([`${BULLET} ${o.text}`]);
  }

  const notes = notesRows(args.notes);
  if (notes.length > 0) {
    rows.push([]);
    rows.push(sectionHeading("NOTES"));
    rows.push(...notes);
  }
  return toCsv(rows);
}
