import { describe, expect, it } from "vitest";
import {
  INITIAL_CATEGORIZED_REVEAL_HIDDEN,
  INITIAL_COLLAPSED,
} from "./constants";
import {
  buildMatrixFile,
  importedTitle,
  MATRIX_FILE_FORMAT,
  MATRIX_FILE_LIMITS,
  MatrixFileError,
  parseMatrixFile,
  sanitizeImportedText,
  serializeMatrixFile,
  summarizeImport,
} from "./matrixFile";
import type { RiskMatrixSnapshot } from "./matrixTypes";
import { emptyGrid } from "./riskMatrixUtils";

function sampleSnapshot(): RiskMatrixSnapshot {
  const grid = emptyGrid();
  grid["0-2"] = [
    {
      id: "uuid-risk-a",
      text: "Doxxing",
      reduce: [
        { id: "s1", text: "Lock down social accounts", starred: true },
        { id: "s2", text: "", starred: false },
      ],
      prepare: [{ id: "s3", text: "Know a lawyer", starred: false }],
    },
    { id: "blank", text: "  ", reduce: [], prepare: [] },
  ];
  grid["2-0"] = [{ id: "uuid-risk-b", text: "Rain", reduce: [], prepare: [] }];
  return {
    pool: [
      { id: "p1", text: "Infiltrator" },
      { id: "p2", text: "" },
    ],
    grid,
    collapsed: { red: true, orange: true, yellow: true, green: true },
    otherActions: [{ id: "o1", text: "Phone tree" }],
    hiddenCategorizedRiskKeys: ["2-0:uuid-risk-b"],
    categorizedRevealHidden: { red: true, orange: false, yellow: false, green: false },
    notes: "## Plan\n\n- **bold**",
  };
}

function fileText(overrides: Record<string, unknown>): string {
  return JSON.stringify({ format: MATRIX_FILE_FORMAT, version: 1, ...overrides });
}

describe("buildMatrixFile", () => {
  it("writes readable likelihood/impact, skips blanks, and keeps no ids", () => {
    const file = buildMatrixFile({ title: " Action ", snapshot: sampleSnapshot() });
    expect(file).toEqual({
      format: MATRIX_FILE_FORMAT,
      version: 1,
      title: "Action",
      unplacedRisks: ["Infiltrator"],
      risks: [
        {
          text: "Doxxing",
          likelihood: "high",
          impact: "high",
          reductions: [{ text: "Lock down social accounts", starred: true }],
          preparations: [{ text: "Know a lawyer" }],
        },
        { text: "Rain", likelihood: "low", impact: "low", hidden: true },
      ],
      otherActions: ["Phone tree"],
      notes: "## Plan\n\n- **bold**",
    });
    expect(serializeMatrixFile(file)).not.toMatch(/uuid-|"id"/);
  });

  it("never includes cloud metadata or timestamps", () => {
    const text = serializeMatrixFile(
      buildMatrixFile({ title: "T", snapshot: sampleSnapshot() }),
    );
    expect(text).not.toMatch(/cloud|key|recordId|updatedAt|20\d\d-/i);
  });
});

describe("parseMatrixFile", () => {
  it("round-trips through export", () => {
    const original = buildMatrixFile({ title: "Action", snapshot: sampleSnapshot() });
    const { title, snapshot } = parseMatrixFile(serializeMatrixFile(original));
    expect(title).toBe("Action");
    expect(buildMatrixFile({ title, snapshot })).toEqual(original);
  });

  it("assigns fresh ids that useRiskMatrix keeps numbering from", () => {
    const { snapshot } = parseMatrixFile(
      serializeMatrixFile(buildMatrixFile({ title: "T", snapshot: sampleSnapshot() })),
    );
    expect(snapshot.grid["0-2"][0].id).toBe("rm-ln-i-1");
    expect(snapshot.grid["2-0"][0].id).toBe("rm-ln-i-2");
    expect(snapshot.pool[0].id).toBe("rm-ln-i-3");
    expect(snapshot.grid["0-2"][0].reduce?.[0].id).toBe("rm-sub-s-1");
    expect(snapshot.otherActions[0].id).toBe("rm-other-o-1");
    expect(snapshot.hiddenCategorizedRiskKeys).toEqual(["2-0:rm-ln-i-2"]);
  });

  it("resets per-viewer UI state instead of trusting the file", () => {
    const { snapshot } = parseMatrixFile(fileText({ collapsed: { red: true } }));
    expect(snapshot.collapsed).toEqual(INITIAL_COLLAPSED);
    expect(snapshot.categorizedRevealHidden).toEqual(
      INITIAL_CATEGORIZED_REVEAL_HIDDEN,
    );
  });

  it("accepts a minimal hand-written file", () => {
    const { title, snapshot } = parseMatrixFile(
      fileText({ risks: [{ text: "Rain", likelihood: "medium", impact: "low" }] }),
    );
    expect(title).toBe("Untitled");
    expect(snapshot.grid["1-0"].map((l) => l.text)).toEqual(["Rain"]);
    expect(snapshot.pool).toEqual([]);
    expect(snapshot.notes).toBe("");
  });

  it.each([
    ["not JSON", "{nope", /isn't a Risk Mapper matrix file/],
    ["some other JSON", JSON.stringify({ hello: 1 }), /isn't a Risk Mapper matrix file/],
    ["a JSON array", "[]", /isn't a Risk Mapper matrix file/],
    [
      "a newer version",
      JSON.stringify({ format: MATRIX_FILE_FORMAT, version: 2 }),
      /newer version/,
    ],
    [
      "a bad level",
      fileText({ risks: [{ text: "x", likelihood: "extreme", impact: "low" }] }),
      /risks\[0\]\.likelihood/,
    ],
    [
      "a non-string risk",
      fileText({ risks: [{ text: 5, likelihood: "low", impact: "low" }] }),
      /risks\[0\]\.text/,
    ],
    [
      "a bad starred flag",
      fileText({
        risks: [
          {
            text: "x",
            likelihood: "low",
            impact: "low",
            reductions: [{ text: "y", starred: "yes" }],
          },
        ],
      }),
      /risks\[0\]\.reductions\[0\]\.starred/,
    ],
    ["a non-list pool", fileText({ unplacedRisks: "x" }), /unplacedRisks/],
    ["non-string notes", fileText({ notes: { html: "<b>" } }), /notes/],
  ])("rejects %s", (_label, text, message) => {
    expect(() => parseMatrixFile(text)).toThrow(MatrixFileError);
    expect(() => parseMatrixFile(text)).toThrow(message);
  });
});

describe("parseMatrixFile limits", () => {
  const risk = { text: "r", likelihood: "low", impact: "low" };

  it.each([
    ["the file", "x".repeat(MATRIX_FILE_LIMITS.bytes + 1)],
    ["risks", fileText({ risks: Array(MATRIX_FILE_LIMITS.risks + 1).fill(risk) })],
    [
      "unplacedRisks",
      fileText({ unplacedRisks: Array(MATRIX_FILE_LIMITS.unplacedRisks + 1).fill("x") }),
    ],
    [
      "otherActions",
      fileText({ otherActions: Array(MATRIX_FILE_LIMITS.otherActions + 1).fill("x") }),
    ],
    [
      "risks[0].reductions",
      fileText({
        risks: [
          {
            ...risk,
            reductions: Array(MATRIX_FILE_LIMITS.mitigationsPerRisk + 1).fill({ text: "m" }),
          },
        ],
      }),
    ],
    [
      "mitigations",
      fileText({
        risks: Array(MATRIX_FILE_LIMITS.risks).fill({
          ...risk,
          reductions: Array(
            Math.ceil(MATRIX_FILE_LIMITS.mitigationsTotal / MATRIX_FILE_LIMITS.risks) + 1,
          ).fill({ text: "m" }),
        }),
      }),
    ],
    ["title", fileText({ title: "t".repeat(MATRIX_FILE_LIMITS.titleChars + 1) })],
    [
      "risks[0].text",
      fileText({ risks: [{ ...risk, text: "r".repeat(MATRIX_FILE_LIMITS.textChars + 1) }] }),
    ],
    ["notes", fileText({ notes: "n".repeat(MATRIX_FILE_LIMITS.notesChars + 1) })],
  ])("rejects too many or too long: %s", (what, text) => {
    expect(() => parseMatrixFile(text)).toThrow(MatrixFileError);
    expect(() => parseMatrixFile(text)).toThrow(/too large/);
    expect(() => parseMatrixFile(text)).toThrow(what);
  });

  it("accepts a file exactly at the limits", () => {
    const { snapshot } = parseMatrixFile(
      fileText({ risks: Array(MATRIX_FILE_LIMITS.risks).fill(risk) }),
    );
    expect(Object.values(snapshot.grid).flat()).toHaveLength(MATRIX_FILE_LIMITS.risks);
  });

  it("survives absurd nesting without crashing the tab", () => {
    const deep = "[".repeat(100_000) + "]".repeat(100_000);
    expect(() => parseMatrixFile(deep)).toThrow(MatrixFileError);
  });

  it("accepts a file saved with a byte-order mark", () => {
    expect(parseMatrixFile(`\uFEFF${fileText({ title: "BOM" })}`).title).toBe("BOM");
  });
});

describe("imported text sanitizing", () => {
  it("strips controls and bidi overrides, keeps tabs, newlines and RTL marks", () => {
    expect(
      sanitizeImportedText("a\u0000b\u0007c\u009Fd\te\nf\u200Fg\u202Eh\u2066i\u2069"),
    ).toBe("abcd\te\nf\u200Fghi");
  });

  it("normalizes line endings and repairs lone surrogates", () => {
    expect(sanitizeImportedText("a\r\nb\rc")).toBe("a\nb\nc");
    expect(sanitizeImportedText("x\uD800y\uDC00z 😀")).toBe("x\uFFFDy\uFFFDz 😀");
  });

  it("is applied to every field of an imported file", () => {
    const bad = "evil\u202Etxt.exe\u0000";
    const { title, snapshot } = parseMatrixFile(
      fileText({
        title: `Plan\n${bad}`,
        unplacedRisks: [bad],
        risks: [
          {
            text: bad,
            likelihood: "low",
            impact: "low",
            reductions: [{ text: bad }],
          },
        ],
        otherActions: [bad],
        notes: bad,
      }),
    );
    expect(title).toBe("Plan eviltxt.exe");
    const line = snapshot.grid["2-0"][0];
    for (const t of [
      snapshot.pool[0].text,
      line.text,
      line.reduce?.[0].text,
      snapshot.otherActions[0].text,
      snapshot.notes,
    ]) {
      expect(t).toBe("eviltxt.exe");
    }
  });
});

describe("summarizeImport", () => {
  it("counts what the file brings in, including links", () => {
    const { snapshot } = parseMatrixFile(
      fileText({
        unplacedRisks: ["see www.example.com"],
        risks: [
          {
            text: "r",
            likelihood: "low",
            impact: "low",
            reductions: [{ text: "a", starred: true }, { text: "b" }],
            preparations: [{ text: "call tel:5551234" }],
          },
        ],
        otherActions: ["x"],
        notes: "[hotline](https://example.com) and mailto:a@example.com",
      }),
    );
    expect(summarizeImport(snapshot)).toEqual({
      risks: 1,
      unplacedRisks: 1,
      mitigations: 3,
      starred: 1,
      otherActions: 1,
      hasNotes: true,
      links: 4,
    });
  });
});

describe("importedTitle", () => {
  it("keeps a new title and renames one that matches an existing matrix", () => {
    expect(importedTitle("Plan", ["Other"])).toBe("Plan");
    expect(importedTitle("Plan", ["plan "])).toBe("Plan (imported)");
    expect(importedTitle("Plan", ["Plan", "Plan (imported)"])).toBe("Plan (imported 2)");
  });
});
