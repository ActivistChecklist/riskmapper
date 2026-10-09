import { describe, expect, it } from "vitest";
import {
  beforeIdAtY,
  dropIndicatorFor,
  dropInsertIndex,
  insertAtDrop,
  isNoopReorder,
  reorderAtDrop,
} from "./dropPosition";

const line = (id: string, text = id) => ({ id, text });
const ids = (lines: { id: string }[]) => lines.map((l) => l.id);

// Three 40px rows stacked from y=0: midpoints at 20, 60, 100.
const rows = [
  { id: "a", top: 0, height: 40 },
  { id: "b", top: 40, height: 40 },
  { id: "c", top: 80, height: 40 },
];

describe("beforeIdAtY", () => {
  it("picks the first row whose midpoint is below the pointer", () => {
    expect(beforeIdAtY(rows, 5, "x")).toBe("a");
    expect(beforeIdAtY(rows, 25, "x")).toBe("b");
    expect(beforeIdAtY(rows, 59, "x")).toBe("b");
    expect(beforeIdAtY(rows, 61, "x")).toBe("c");
  });

  it("returns null past the last midpoint", () => {
    expect(beforeIdAtY(rows, 101, "x")).toBeNull();
  });

  it("skips the dragged row so hovering it resolves to the next row", () => {
    expect(beforeIdAtY(rows, 45, "b")).toBe("c");
    expect(beforeIdAtY(rows, 110, "c")).toBeNull();
  });
});

describe("dropInsertIndex", () => {
  it("lands ahead of the named row", () => {
    expect(dropInsertIndex([line("a"), line("b")], "b")).toBe(1);
  });

  it("appends at the end", () => {
    expect(dropInsertIndex([line("a"), line("b")], null)).toBe(2);
  });

  it("keeps a trailing empty entry row last", () => {
    expect(dropInsertIndex([line("a"), line("e", "")], null)).toBe(1);
  });

  it("treats an unknown row as the end", () => {
    expect(dropInsertIndex([line("a")], "gone")).toBe(1);
  });
});

describe("insertAtDrop", () => {
  it("inserts between two rows", () => {
    expect(ids(insertAtDrop([line("a"), line("b")], line("n"), "b"))).toEqual([
      "a",
      "n",
      "b",
    ]);
  });

  it("inserts into an empty list", () => {
    expect(ids(insertAtDrop([], line("n"), null))).toEqual(["n"]);
  });
});

describe("reorderAtDrop", () => {
  const list = [line("a"), line("b"), line("c"), line("e", "")];

  it("moves a row up", () => {
    expect(ids(reorderAtDrop(list, "c", "a"))).toEqual(["c", "a", "b", "e"]);
  });

  it("moves a row down", () => {
    expect(ids(reorderAtDrop(list, "a", "c"))).toEqual(["b", "a", "c", "e"]);
  });

  it("moves a row to the end, ahead of the trailing empty row", () => {
    expect(ids(reorderAtDrop(list, "a", null))).toEqual(["b", "c", "a", "e"]);
  });
});

describe("isNoopReorder", () => {
  const list = [line("a"), line("b"), line("c")];

  it("is a no-op when dropping just ahead of the next row", () => {
    expect(isNoopReorder(list, "a", "b")).toBe(true);
  });

  it("is a no-op when the last row drops at the end", () => {
    expect(isNoopReorder(list, "c", null)).toBe(true);
  });

  it("is a real move otherwise", () => {
    expect(isNoopReorder(list, "a", "c")).toBe(false);
    expect(isNoopReorder(list, "c", "b")).toBe(false);
  });
});

describe("dropIndicatorFor", () => {
  const list = [line("a"), line("b"), line("c")];

  it("draws above the row the line lands ahead of", () => {
    expect(dropIndicatorFor(list, "x", { loc: "0-0", beforeId: "b" }, "pool"))
      .toEqual({ loc: "0-0", rowId: "b", edge: "before" });
  });

  it("draws below the last row for an end drop", () => {
    expect(dropIndicatorFor(list, "x", { loc: "0-0", beforeId: null }, "pool"))
      .toEqual({ loc: "0-0", rowId: "c", edge: "after" });
  });

  it("draws above a trailing empty entry row for an end drop", () => {
    expect(
      dropIndicatorFor(
        [line("a"), line("e", "")],
        "x",
        { loc: "pool", beforeId: null },
        "0-0",
      ),
    ).toEqual({ loc: "pool", rowId: "e", edge: "before" });
  });

  it("draws at the top of an empty list", () => {
    expect(dropIndicatorFor([], "x", { loc: "1-1", beforeId: null }, "pool"))
      .toEqual({ loc: "1-1", rowId: null, edge: "before" });
  });

  it("draws nothing when a reorder would not move the line", () => {
    expect(
      dropIndicatorFor(list, "b", { loc: "0-0", beforeId: "c" }, "0-0"),
    ).toBeNull();
  });

  it("still draws for the same position in a different list", () => {
    expect(
      dropIndicatorFor(list, "b", { loc: "0-0", beforeId: "c" }, "pool"),
    ).toEqual({ loc: "0-0", rowId: "c", edge: "before" });
  });
});
