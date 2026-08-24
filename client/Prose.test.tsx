import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Prose } from "./Prose";

/**
 * The Markdown renderer behind the Privacy and Security documents.
 *
 * The block-level parsing itself belongs to `notesMarkdown.ts`; what is
 * asserted here is the part this file owns: which element each block becomes,
 * how links are made safe, and the passthrough that lets a page drop a React
 * component into the middle of its prose.
 */

describe("Prose", () => {
  it("renders headings at their Markdown level", () => {
    render(<Prose>{"## A section\n\n### A subsection"}</Prose>);
    expect(
      screen.getByRole("heading", { level: 2, name: "A section" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 3, name: "A subsection" }),
    ).toBeTruthy();
  });

  it("joins wrapped lines into one paragraph", () => {
    // Source files wrap at 80 columns; readers should not see the wrapping.
    const { container } = render(<Prose>{"one line\nand its wrap"}</Prose>);
    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(screen.getByText("one line and its wrap")).toBeTruthy();
  });

  it("renders emphasis, strong text, and inline code", () => {
    const { container } = render(
      <Prose>{"**bold** and *italic* and `code`"}</Prose>,
    );
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("italic");
    expect(container.querySelector("code")?.textContent).toBe("code");
  });

  it("opens off-site links in a new tab, safely", () => {
    render(<Prose>{"see [the repo](https://github.com/example/repo)"}</Prose>);
    const link = screen.getByRole("link", { name: "the repo" });
    expect(link.getAttribute("href")).toBe("https://github.com/example/repo");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("keeps same-site links in the current tab", () => {
    // A new tab for /privacy/ would be a bug, not a hardening measure.
    render(<Prose>{"see [Privacy](/privacy/)"}</Prose>);
    const link = screen.getByRole("link", { name: "Privacy" });
    expect(link.getAttribute("target")).toBeNull();
    expect(link.getAttribute("rel")).toBeNull();
  });

  it("bullets an ordinary list", () => {
    const { container } = render(<Prose>{"- first\n- second"}</Prose>);
    const list = container.querySelector("ul");
    expect(list?.className).toContain("list-disc");
    expect(list?.querySelectorAll("li")).toHaveLength(2);
  });

  it("numbers an ordered list", () => {
    const { container } = render(<Prose>{"1. first\n2. second"}</Prose>);
    expect(container.querySelector("ol")?.className).toContain("list-decimal");
  });

  it("uses a leading ✅/❌ as the marker instead of a bullet", () => {
    const { container } = render(
      <Prose>{"- ✅ kept\n- ❌ not kept"}</Prose>,
    );
    const list = container.querySelector("ul");
    expect(list?.className).not.toContain("list-disc");
    // The emoji is decorative: the heading above the list carries the sense.
    expect(list?.querySelector("span")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(screen.getByText("kept")).toBeTruthy();
  });

  it("keeps ordinary bullets when only some items are marked", () => {
    // Otherwise one stray ✅ silently restyles a list it does not belong to.
    const { container } = render(<Prose>{"- ✅ marked\n- plain"}</Prose>);
    expect(container.querySelector("ul")?.className).toContain("list-disc");
  });

  it("passes non-string children through untouched", () => {
    render(
      <Prose>
        {"## Events"}
        <table>
          <tbody>
            <tr>
              <td>an exception Markdown cannot express</td>
            </tr>
          </tbody>
        </table>
        {"and prose after it"}
      </Prose>,
    );
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("and prose after it")).toBeTruthy();
  });

  it("escapes rather than interprets HTML in the source", () => {
    // No dangerouslySetInnerHTML anywhere in the pipeline.
    const { container } = render(
      <Prose>{"a <script>alert(1)</script> tag"}</Prose>,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });
});
