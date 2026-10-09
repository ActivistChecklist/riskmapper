import { render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import RiskMatrix from "./RiskMatrix";
import { installMatrixTestDomPolyfills } from "./testDomPolyfills";

/**
 * The top bar has two layouts. From md up: one title row, with the document
 * toolbar as a full-width labeled row beneath. Below md: the title and status
 * badge share the first row, and the toolbar joins Export and Share on the
 * second as large icon-only buttons. The toolbar must render exactly once in
 * either layout, since it owns dialogs and the import file input.
 */

beforeAll(() => {
  installMatrixTestDomPolyfills();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function setViewport(mdUp: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query === "(min-width: 768px)" ? mdUp : false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

function titleRow(): HTMLElement {
  const row = screen.getByLabelText("Matrix title").closest<HTMLElement>(
    '[class*="md:sticky"]',
  );
  if (!row) throw new Error("title row not found");
  return row;
}

describe("top bar layout", () => {
  it("below md, puts the toolbar on the button row as icon buttons", () => {
    setViewport(false);
    render(<RiskMatrix />);
    const newMatrix = screen.getByRole("button", { name: "New matrix" });
    expect(titleRow().contains(newMatrix)).toBe(true);
    expect(newMatrix.textContent).toBe("");
    expect(newMatrix.querySelector("svg")?.getAttribute("width")).toBe("18");
    expect(screen.getAllByTestId("matrix-file-input")).toHaveLength(1);
  });

  it("from md up, keeps the labeled toolbar on its own row", () => {
    setViewport(true);
    render(<RiskMatrix />);
    const newMatrix = screen.getByRole("button", { name: /new/i });
    expect(titleRow().contains(newMatrix)).toBe(false);
    expect(screen.getAllByTestId("matrix-file-input")).toHaveLength(1);
  });

  it("keeps the status badge in the same group as the title", () => {
    setViewport(false);
    render(<RiskMatrix />);
    const title = screen.getByLabelText("Matrix title");
    const group = title.parentElement?.parentElement;
    expect(group?.textContent).toMatch(/saved locally/i);
  });
});
