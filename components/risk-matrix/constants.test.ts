import { describe, expect, it } from "vitest";
import {
  CELL_BG_CLASSES,
  COLOR_GROUPS,
  COL_LABELS,
  GROUP_LABEL_TEXT_CLASS,
  GROUP_STRIPE_CLASS,
  ROW_LABELS,
} from "./constants";

describe("risk-matrix constants", () => {
  it("defines a 3×3 cell class grid", () => {
    expect(CELL_BG_CLASSES).toHaveLength(3);
    for (const row of CELL_BG_CLASSES) {
      expect(row).toHaveLength(3);
      for (const cls of row) {
        expect(cls).toMatch(/^bg-rm-/);
      }
    }
  });

  it("keeps matrix labels in sync with grid size", () => {
    expect(ROW_LABELS).toHaveLength(3);
    expect(COL_LABELS).toHaveLength(3);
  });

  it("covers every matrix cell in exactly one color group", () => {
    const keys = new Set<string>();
    for (const g of COLOR_GROUPS) {
      for (const cell of g.cells) keys.add(cell);
    }
    expect(keys.size).toBe(9);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        expect(keys.has(`${r}-${c}`)).toBe(true);
      }
    }
  });

  it("gives each group tone a label text color and a card stripe", () => {
    for (const g of COLOR_GROUPS) {
      expect(GROUP_LABEL_TEXT_CLASS[g.key]).toBe(`text-rm-${g.key}-text`);
      expect(GROUP_STRIPE_CLASS[g.key]).toBe(`border-l-rm-${g.key}-strong`);
    }
  });
});
