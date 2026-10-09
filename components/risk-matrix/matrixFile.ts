import {
  INITIAL_CATEGORIZED_REVEAL_HIDDEN,
  INITIAL_COLLAPSED,
} from "./constants";
import { DEFAULT_DRAFT_MATRIX_TITLE, type RiskMatrixSnapshot } from "./matrixTypes";
import { categorizedRiskRowKey, emptyGrid } from "./riskMatrixUtils";
import type { CellKey, GridLine, SubLine } from "./types";

/**
 * Portable matrix file: a JSON document someone can download, hand to
 * another person over whatever channel they trust, and import, without the
 * matrix ever reaching our server.
 *
 * The format is deliberately not `RiskMatrixSnapshot`. That type is internal
 * storage and carries line ids, opaque cell keys like `"0-2"`, and per-viewer
 * UI state. A file is a contract with people's saved copies, so it uses
 * readable likelihood/impact words, has no ids, and can be written by hand.
 *
 * What it leaves out on purpose:
 * - Cloud-sync metadata. `CloudMatrixMeta.keyB64` is the decryption key for
 *   a shared matrix; putting it in a file would hand out edit access.
 * - Timestamps. A file passed around should not reveal when it was worked on.
 * - Collapsed / revealed sections, which are one viewer's preferences.
 */

export const MATRIX_FILE_FORMAT = "riskmapper-matrix";
export const MATRIX_FILE_VERSION = 1;

/**
 * Import limits. A file can come from anyone, so every dimension is bounded:
 * the byte size keeps parsing cheap and leaves room in localStorage, and the
 * counts keep the canvas from rendering tens of thousands of textareas. Each
 * is far above a real matrix (a busy one is tens of risks and a few KB).
 */
export const MATRIX_FILE_LIMITS = {
  bytes: 1024 * 1024,
  titleChars: 200,
  textChars: 5_000,
  notesChars: 100_000,
  risks: 500,
  unplacedRisks: 500,
  mitigationsPerRisk: 100,
  mitigationsTotal: 5_000,
  otherActions: 500,
} as const;

export type MatrixFileLevel = "low" | "medium" | "high";

export type MatrixFileMitigation = { text: string; starred?: boolean };

export type MatrixFileRisk = {
  text: string;
  likelihood: MatrixFileLevel;
  impact: MatrixFileLevel;
  /** Hidden from the mitigations list until revealed. */
  hidden?: boolean;
  reductions?: MatrixFileMitigation[];
  preparations?: MatrixFileMitigation[];
};

export type MatrixFileV1 = {
  format: typeof MATRIX_FILE_FORMAT;
  version: typeof MATRIX_FILE_VERSION;
  title: string;
  /** Risks brainstormed but not yet placed on the matrix. */
  unplacedRisks: string[];
  risks: MatrixFileRisk[];
  otherActions: string[];
  /** Markdown. */
  notes: string;
};

const LIKELIHOOD_BY_ROW: MatrixFileLevel[] = ["high", "medium", "low"];
const IMPACT_BY_COL: MatrixFileLevel[] = ["low", "medium", "high"];
const LEVELS: readonly string[] = ["low", "medium", "high"];

function isBlank(text: string): boolean {
  return text.trim().length === 0;
}

function toFileMitigations(
  subs: SubLine[] | undefined,
): MatrixFileMitigation[] | undefined {
  const out = (subs ?? [])
    .filter((s) => !isBlank(s.text))
    .map((s) => (s.starred ? { text: s.text, starred: true } : { text: s.text }));
  return out.length > 0 ? out : undefined;
}

export function buildMatrixFile(args: {
  title: string;
  snapshot: RiskMatrixSnapshot;
}): MatrixFileV1 {
  const { snapshot } = args;
  const hidden = new Set(snapshot.hiddenCategorizedRiskKeys);
  const risks: MatrixFileRisk[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cellKey: CellKey = `${row}-${col}`;
      for (const line of snapshot.grid[cellKey] ?? []) {
        if (isBlank(line.text)) continue;
        const risk: MatrixFileRisk = {
          text: line.text,
          likelihood: LIKELIHOOD_BY_ROW[row],
          impact: IMPACT_BY_COL[col],
        };
        if (hidden.has(categorizedRiskRowKey(cellKey, line.id))) {
          risk.hidden = true;
        }
        const reductions = toFileMitigations(line.reduce);
        if (reductions) risk.reductions = reductions;
        const preparations = toFileMitigations(line.prepare);
        if (preparations) risk.preparations = preparations;
        risks.push(risk);
      }
    }
  }
  return {
    format: MATRIX_FILE_FORMAT,
    version: MATRIX_FILE_VERSION,
    title: args.title.trim() || DEFAULT_DRAFT_MATRIX_TITLE,
    unplacedRisks: snapshot.pool.map((p) => p.text).filter((t) => !isBlank(t)),
    risks,
    otherActions: snapshot.otherActions
      .map((o) => o.text)
      .filter((t) => !isBlank(t)),
    notes: snapshot.notes,
  };
}

export function serializeMatrixFile(file: MatrixFileV1): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** A file that can't be imported. `message` is written for the person importing it. */
export class MatrixFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatrixFileError";
  }
}

/**
 * Characters with no business in typed text, removed from everything a file
 * brings in:
 * - C0/C1 control characters other than tab and newline. They render as
 *   nothing, survive into CSV and clipboard exports, and NUL in particular
 *   truncates strings in some consumers.
 * - Bidi embedding, override and isolate controls (U+202A..U+202E,
 *   U+2066..U+2069), the "Trojan Source" characters. They can make text
 *   display in a different order than it is stored, so a risk or a download
 *   filename could read differently from what it is. Ordinary right-to-left
 *   text does not need them; the LRM/RLM marks it does use are kept.
 */
const STRIPPED_CHARS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g;
/** An unpaired UTF-16 surrogate, which JSON allows but is not text. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function sanitizeImportedText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(STRIPPED_CHARS, "")
    .replace(LONE_SURROGATE, "\uFFFD");
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function invalid(path: string, expected: string): never {
  throw new MatrixFileError(
    `This file is damaged: ${path} should be ${expected}.`,
  );
}

function tooLarge(what: string, limit: number): never {
  throw new MatrixFileError(
    `This file is too large to open: ${what} is over the limit of ${limit.toLocaleString("en-US")}.`,
  );
}

function optionalString(
  value: unknown,
  path: string,
  maxChars: number = MATRIX_FILE_LIMITS.textChars,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") invalid(path, "text");
  if (value.length > maxChars) tooLarge(`the text of ${path}`, maxChars);
  return sanitizeImportedText(value);
}

function requiredString(value: unknown, path: string): string {
  const text = optionalString(value, path);
  if (text === undefined) invalid(path, "text");
  return text;
}

function optionalArray(
  value: unknown,
  path: string,
  maxItems: number,
): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) invalid(path, "a list");
  if (value.length > maxItems) tooLarge(`the number of ${path}`, maxItems);
  return value;
}

function stringList(value: unknown, path: string, maxItems: number): string[] {
  return optionalArray(value, path, maxItems).map((item, i) =>
    requiredString(item, `${path}[${i}]`),
  );
}

function level(value: unknown, path: string): MatrixFileLevel {
  if (typeof value !== "string" || !LEVELS.includes(value)) {
    invalid(path, `"low", "medium", or "high"`);
  }
  return value as MatrixFileLevel;
}

function optionalBoolean(value: unknown, path: string): boolean {
  if (value === undefined) return false;
  if (typeof value !== "boolean") invalid(path, "true or false");
  return value;
}

/**
 * Validate an untrusted file and convert it into a fresh snapshot. Every
 * line gets a new id in the shape `useRiskMatrix` continues numbering from,
 * so a file can never collide with ids already in the workspace.
 */
export function parseMatrixFile(text: string): {
  title: string;
  snapshot: RiskMatrixSnapshot;
} {
  if (text.length > MATRIX_FILE_LIMITS.bytes) {
    tooLarge("the file", MATRIX_FILE_LIMITS.bytes);
  }
  let raw: unknown;
  try {
    // Editors on Windows often save JSON with a byte-order mark, which
    // JSON.parse rejects. Deep nesting throws a RangeError, caught here too.
    raw = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new MatrixFileError("This file isn't in RiskMapper.app export format.");
  }
  if (!isRecord(raw) || raw.format !== MATRIX_FILE_FORMAT) {
    throw new MatrixFileError("This file isn't in RiskMapper.app export format.");
  }
  if (typeof raw.version !== "number") invalid("version", "a number");
  if (raw.version > MATRIX_FILE_VERSION) {
    throw new MatrixFileError(
      "This file was made by a newer version of RiskMapper.app. Reload the page and try again.",
    );
  }
  if (raw.version !== MATRIX_FILE_VERSION) invalid("version", "1");

  let lineSeq = 0;
  let subSeq = 0;
  const lineId = () => `rm-ln-i-${++lineSeq}`;
  const subLines = (value: unknown, path: string): SubLine[] =>
    optionalArray(value, path, MATRIX_FILE_LIMITS.mitigationsPerRisk).map(
      (m, i) => {
        if (!isRecord(m)) invalid(`${path}[${i}]`, "an object");
        if (subSeq >= MATRIX_FILE_LIMITS.mitigationsTotal) {
          tooLarge("the number of mitigations", MATRIX_FILE_LIMITS.mitigationsTotal);
        }
        return {
          id: `rm-sub-s-${++subSeq}`,
          text: requiredString(m.text, `${path}[${i}].text`),
          starred: optionalBoolean(m.starred, `${path}[${i}].starred`),
        };
      },
    );

  const grid = emptyGrid();
  const hiddenCategorizedRiskKeys: string[] = [];
  optionalArray(raw.risks, "risks", MATRIX_FILE_LIMITS.risks).forEach((r, i) => {
    const path = `risks[${i}]`;
    if (!isRecord(r)) invalid(path, "an object");
    const rText = requiredString(r.text, `${path}.text`);
    const row = LIKELIHOOD_BY_ROW.indexOf(level(r.likelihood, `${path}.likelihood`));
    const col = IMPACT_BY_COL.indexOf(level(r.impact, `${path}.impact`));
    const cellKey: CellKey = `${row}-${col}`;
    const line: GridLine = {
      id: lineId(),
      text: rText,
      reduce: subLines(r.reductions, `${path}.reductions`),
      prepare: subLines(r.preparations, `${path}.preparations`),
    };
    if (optionalBoolean(r.hidden, `${path}.hidden`)) {
      hiddenCategorizedRiskKeys.push(categorizedRiskRowKey(cellKey, line.id));
    }
    grid[cellKey].push(line);
  });

  const pool = stringList(
    raw.unplacedRisks,
    "unplacedRisks",
    MATRIX_FILE_LIMITS.unplacedRisks,
  ).map((t) => ({ id: lineId(), text: t }));
  const otherActions = stringList(
    raw.otherActions,
    "otherActions",
    MATRIX_FILE_LIMITS.otherActions,
  ).map((t, i) => ({ id: `rm-other-o-${i + 1}`, text: t }));
  // A title is one line: it lands in the title input and download filenames.
  const title = optionalString(raw.title, "title", MATRIX_FILE_LIMITS.titleChars)
    ?.replace(/\s+/g, " ")
    .trim();

  return {
    title: title || DEFAULT_DRAFT_MATRIX_TITLE,
    snapshot: {
      pool,
      grid,
      collapsed: { ...INITIAL_COLLAPSED },
      otherActions,
      hiddenCategorizedRiskKeys,
      categorizedRevealHidden: { ...INITIAL_CATEGORIZED_REVEAL_HIDDEN },
      notes:
        optionalString(raw.notes, "notes", MATRIX_FILE_LIMITS.notesChars) ?? "",
    },
  };
}

export type MatrixImportSummary = {
  risks: number;
  unplacedRisks: number;
  mitigations: number;
  starred: number;
  otherActions: number;
  hasNotes: boolean;
  /** Web, mail or phone links anywhere in the text. */
  links: number;
};

const LINK_RE = /\b(?:https?:\/\/|www\.|mailto:|tel:)/gi;

/** What an import would bring in, shown before anything is saved. */
export function summarizeImport(snapshot: RiskMatrixSnapshot): MatrixImportSummary {
  const lines = Object.values(snapshot.grid).flat();
  const subs = lines.flatMap((l) => [...(l.reduce ?? []), ...(l.prepare ?? [])]);
  const texts = [
    ...snapshot.pool.map((p) => p.text),
    ...lines.map((l) => l.text),
    ...subs.map((s) => s.text),
    ...snapshot.otherActions.map((o) => o.text),
    snapshot.notes,
  ];
  return {
    risks: lines.length,
    unplacedRisks: snapshot.pool.length,
    mitigations: subs.length,
    starred: subs.filter((s) => s.starred).length,
    otherActions: snapshot.otherActions.length,
    hasNotes: snapshot.notes.trim().length > 0,
    links: texts.reduce((n, t) => n + (t.match(LINK_RE)?.length ?? 0), 0),
  };
}

/**
 * The title to save an import under. A file whose title matches a matrix
 * already in the library gets " (imported)", so a copy cannot pass itself
 * off as the user's own matrix in Open recent.
 */
export function importedTitle(title: string, existingTitles: string[]): string {
  const taken = new Set(existingTitles.map((t) => t.trim().toLowerCase()));
  if (!taken.has(title.trim().toLowerCase())) return title;
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? `${title} (imported)` : `${title} (imported ${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
