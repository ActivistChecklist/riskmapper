import { describe, expect, it } from "vitest";
import { isSafeHref, parseNotesMarkdown } from "./notesMarkdown";

function inlines(md: string) {
  const [block] = parseNotesMarkdown(md);
  if (!block || !("inlines" in block)) throw new Error("expected a paragraph");
  return block.inlines;
}

describe("isSafeHref", () => {
  it.each([
    "https://example.com",
    "http://example.com",
    "mailto:a@example.com",
    "tel:+15551234",
    "/privacy/",
    "#section",
  ])("allows %s", (href) => {
    expect(isSafeHref(href)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<b>x</b>",
    "file:///etc/passwd",
    "ms-msdt:/id",
    "vbscript:x",
    "//evil.example/path",
    "relative/path",
  ])("refuses %s", (href) => {
    expect(isSafeHref(href)).toBe(false);
  });
});

describe("parseNotesMarkdown links", () => {
  it("keeps safe links", () => {
    expect(inlines("[hotline](https://example.com)")).toEqual([
      { kind: "link", text: "hotline", href: "https://example.com" },
    ]);
  });

  it("turns an unsafe link into its plain text", () => {
    expect(inlines("[Read this](javascript:alert(1))")).toEqual([
      { kind: "text", text: "Read this" },
      { kind: "text", text: ")" },
    ]);
  });
});

describe("parseNotesMarkdown performance", () => {
  // These inputs were quadratic before the regex repeats were bounded:
  // 20k "[" took ~250ms, so 100k took several seconds and a 1 MB note
  // would freeze the tab for minutes.
  it.each([
    ["unclosed brackets", "[".repeat(100_000)],
    ["unclosed links", "[a](".repeat(25_000)],
  ])("parses %s in linear time", (_label, md) => {
    const start = performance.now();
    parseNotesMarkdown(md);
    expect(performance.now() - start).toBeLessThan(1500);
  });
});
