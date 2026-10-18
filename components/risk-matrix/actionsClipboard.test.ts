import { describe, expect, it } from "vitest";
import {
  buildActionsClipboardPayload,
  escapeHtml,
  formatAllForClipboard,
  formatAllForClipboardHtmlInner,
} from "./actionsClipboard";
import type { OtherAction, StarredAction } from "./types";

function starred(
  partial: Partial<StarredAction> & Pick<StarredAction, "subLine" | "subType">,
): StarredAction {
  return {
    cellKey: "0-0",
    parentLineId: "p1",
    parentText: "Risk A",
    groupTone: "green",
    ...partial,
  };
}

describe("actionsClipboard", () => {
  it("escapes HTML special characters", () => {
    expect(escapeHtml(`a & b <c> "d"`)).toBe(
      "a &amp; b &lt;c&gt; &quot;d&quot;",
    );
  });

  it("groups starred actions by tier and leaves out the source risk", () => {
    const starredActions: StarredAction[] = [
      starred({
        subType: "reduce",
        groupTone: "orange",
        subLine: { id: "s1", text: "Do X", starred: true },
      }),
      starred({
        subType: "prepare",
        groupTone: "red",
        subLine: { id: "s2", text: "Do Y", starred: true },
      }),
    ];
    const plain = formatAllForClipboard(starredActions, []);
    expect(plain).toBe(
      "**🔴 For highest risks**\n\n- Do Y\n\n**🟠 For high risks**\n\n- Do X",
    );
    const inner = formatAllForClipboardHtmlInner(starredActions, []);
    expect(inner).toContain("For highest risks");
    expect(inner).toContain("★ Do Y");
    expect(inner.indexOf("Do Y")).toBeLessThan(inner.indexOf("Do X"));
    for (const out of [plain, inner]) {
      expect(out).not.toContain("Risk A");
      expect(out).not.toMatch(/Reduction|Preparation/);
    }
  });

  it("labels other actions only when starred ones come first", () => {
    const starredActions: StarredAction[] = [
      starred({
        subType: "prepare",
        subLine: { id: "s1", text: "Prep", starred: true },
      }),
    ];
    const other: OtherAction[] = [{ id: "o1", text: "Manual" }];
    expect(formatAllForClipboard(starredActions, other)).toContain(
      "**Other**\n\n- Manual",
    );
    expect(formatAllForClipboardHtmlInner(starredActions, other)).toContain(
      ">Other</p>",
    );
    expect(formatAllForClipboard([], other)).toBe("- Manual");
    expect(formatAllForClipboardHtmlInner([], other)).not.toContain("Other");
  });

  it("escapes user content in HTML but not in plain", () => {
    const other: OtherAction[] = [{ id: "o1", text: "<script>x</script>" }];
    const { plain, html } = buildActionsClipboardPayload([], other);
    expect(plain).toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>x</script>");
  });
});
