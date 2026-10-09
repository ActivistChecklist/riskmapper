import { describe, expect, it } from "vitest";
import { formatAllForClipboard } from "./actionsClipboard";
import { escapeMarkdownFetches } from "./markdownEscape";
import { buildFullPlainReport } from "./matrixExport";
import { formatAllMitigationsMarkdown } from "./mitigationsMarkdown";
import { emptyGrid } from "./riskMatrixUtils";

const IMAGE = "![](https://tracker.example/p.gif)";
const HTML = '<img src="https://tracker.example/p.gif">';

describe("escapeMarkdownFetches", () => {
  it("escapes image syntax and raw HTML", () => {
    expect(escapeMarkdownFetches(IMAGE)).toBe("!\\[](https://tracker.example/p.gif)");
    expect(escapeMarkdownFetches(HTML)).toBe('\\<img src="https://tracker.example/p.gif">');
  });

  it("leaves ordinary text, emphasis and links alone", () => {
    const text = "Don't use *personal* phones, see [guide](https://example.com)!";
    expect(escapeMarkdownFetches(text)).toBe(text);
  });
});

describe("plain-text exports never carry a fetching construct", () => {
  const grid = emptyGrid();
  grid["0-2"] = [
    {
      id: "a",
      text: IMAGE,
      reduce: [{ id: "s", text: HTML, starred: true }],
      prepare: [],
    },
  ];
  const fetching = /(^|[^\\])(!\[|<img)/;

  it("full worksheet", () => {
    const report = buildFullPlainReport({
      title: IMAGE,
      pool: [{ id: "p", text: HTML }],
      grid,
      allActions: [
        {
          subLine: grid["0-2"][0].reduce![0],
          cellKey: "0-2",
          parentLineId: "a",
          subType: "reduce",
          parentText: IMAGE,
          groupTone: "red",
        },
      ],
      otherActions: [{ id: "o", text: IMAGE }],
    });
    expect(report).not.toMatch(fetching);
  });

  it("mitigations and actions", () => {
    expect(formatAllMitigationsMarkdown(grid)).not.toMatch(fetching);
    expect(formatAllForClipboard([], [{ id: "o", text: HTML }])).not.toMatch(fetching);
  });
});
