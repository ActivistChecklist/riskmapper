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

  it("keeps plain and rich lists aligned for starred actions", () => {
    const starredActions: StarredAction[] = [
      starred({
        subType: "reduce",
        subLine: { id: "s1", text: "Do X", starred: true },
      }),
    ];
    const plain = formatAllForClipboard(starredActions, []);
    const inner = formatAllForClipboardHtmlInner(starredActions, []);
    expect(plain).toContain("1. Do X");
    // The exporter now prepends a tone-circle emoji to the risk name
    // (see riskTone.prependToneCircle). Allow any non-whitespace
    // prefix token between "Reduction for " and the risk text so this
    // assertion stays meaningful without coupling to the specific
    // emoji set.
    expect(plain).toMatch(/Reduction for (?:\S+ )?Risk A/);
    expect(inner).toContain("Do X");
    expect(inner).toContain("Reduction for");
    expect(inner).toContain("Risk A");
    expect(inner).toContain("<ol");
  });

  it("adds Other actions heading when both starred rows and manual lines exist", () => {
    const starredActions: StarredAction[] = [
      starred({
        subType: "prepare",
        subLine: { id: "s1", text: "Prep", starred: true },
      }),
    ];
    const other: OtherAction[] = [{ id: "o1", text: "Manual" }];
    const plain = formatAllForClipboard(starredActions, other);
    const inner = formatAllForClipboardHtmlInner(starredActions, other);
    expect(plain).toContain("Other actions:");
    expect(plain).toContain("1. Manual");
    expect(inner).toContain("Other actions:");
    expect(inner).toContain("Manual");
  });

  it("does not prefix Other actions when there are only manual lines", () => {
    const other: OtherAction[] = [{ id: "o1", text: "Only" }];
    const plain = formatAllForClipboard([], other);
    const inner = formatAllForClipboardHtmlInner([], other);
    expect(plain).toBe("1. Only");
    expect(inner).not.toContain("Other actions");
    expect(inner).toContain("Only");
  });

  it("escapes user content in HTML but not in plain", () => {
    const other: OtherAction[] = [{ id: "o1", text: "<script>x</script>" }];
    const { plain, html } = buildActionsClipboardPayload([], other);
    expect(plain).toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>x</script>");
  });
});
