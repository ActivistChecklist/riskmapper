import { describe, expect, it } from "vitest";
import { spliceLines, splitPastedLines } from "./pasteLines";

describe("splitPastedLines", () => {
  it("leaves a single-line paste to the browser", () => {
    expect(splitPastedLines("abc", 1, 1, "xyz")).toBeNull();
  });

  it("makes one entry per line, keeping text around the selection", () => {
    expect(splitPastedLines("start end", 6, 6, "one\ntwo\nthree")).toEqual({
      texts: ["start one", "two", "threeend"],
      caret: 5,
    });
  });

  it("replaces the selected text", () => {
    expect(splitPastedLines("keep DROP tail", 5, 9, "a\nb")).toEqual({
      texts: ["keep a", "b tail"],
      caret: 1,
    });
  });

  it("drops blank lines, CRLF and list markers", () => {
    expect(
      splitPastedLines("", 0, 0, "- first\r\n\r\n  • second  \r\n3) third\r\n"),
    ).toEqual({ texts: ["first", "second", "third"], caret: 5 });
  });

  it("keeps a single line with a trailing newline in one entry", () => {
    expect(splitPastedLines("ab", 1, 1, "X\n")).toEqual({
      texts: ["aXb"],
      caret: 2,
    });
  });

  it("does not treat a hyphenated word or a year as a list marker", () => {
    expect(splitPastedLines("", 0, 0, "-not a marker\n2024 budget")?.texts).toEqual([
      "-not a marker",
      "2024 budget",
    ]);
  });
});

describe("spliceLines", () => {
  it("keeps the original's other fields and inserts the rest after it", () => {
    const list = [
      { id: "a", text: "A", starred: true },
      { id: "b", text: "B", starred: false },
    ];
    expect(
      spliceLines(list, "a", ["1", "2", "3"], (text, i) => ({
        id: `n${i}`,
        text,
        starred: false,
      })),
    ).toEqual([
      { id: "a", text: "1", starred: true },
      { id: "n0", text: "2", starred: false },
      { id: "n1", text: "3", starred: false },
      { id: "b", text: "B", starred: false },
    ]);
  });

  it("returns the list unchanged for an unknown id", () => {
    const list = [{ id: "a", text: "A" }];
    expect(spliceLines(list, "z", ["1", "2"], (text) => ({ id: "n", text }))).toBe(list);
  });
});

describe("splitPastedLines spacing", () => {
  it("keeps the space where the paste continues existing text", () => {
    expect(splitPastedLines("risk end", 4, 4, " one\ntwo ")).toEqual({
      texts: ["risk one", "two  end"],
      caret: 4,
    });
  });
});
