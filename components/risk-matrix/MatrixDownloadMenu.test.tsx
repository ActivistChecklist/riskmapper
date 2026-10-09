import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import MatrixDownloadMenu from "./MatrixDownloadMenu";
import { INITIAL_CATEGORIZED_REVEAL_HIDDEN, INITIAL_COLLAPSED } from "./constants";
import { MATRIX_FILE_FORMAT } from "./matrixFile";
import type { RiskMatrixSnapshot } from "./matrixTypes";
import { emptyGrid } from "./riskMatrixUtils";
import { installMatrixTestDomPolyfills } from "./testDomPolyfills";

beforeAll(() => {
  installMatrixTestDomPolyfills();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function snapshot(): RiskMatrixSnapshot {
  const grid = emptyGrid();
  grid["0-2"] = [{ id: "a", text: "Doxxing", reduce: [], prepare: [] }];
  return {
    pool: [],
    grid,
    collapsed: INITIAL_COLLAPSED,
    otherActions: [],
    hiddenCategorizedRiskKeys: [],
    categorizedRevealHidden: INITIAL_CATEGORIZED_REVEAL_HIDDEN,
    notes: "",
  };
}

/** Capture the Blob and filename the menu hands to the browser. */
function captureDownloads() {
  const blobs: Blob[] = [];
  const names: string[] = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
    blobs.push(b as Blob);
    return "blob:test";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });
  return { blobs, names };
}

function renderMenu(hasContent = true) {
  return render(
    <TooltipProvider>
      <MatrixDownloadMenu
        title="Direct action: plan"
        getSnapshot={snapshot}
        hasContent={hasContent}
      />
    </TooltipProvider>,
  );
}

describe("MatrixDownloadMenu", () => {
  it("downloads a CSV of the matrix", async () => {
    const user = userEvent.setup();
    const { blobs, names } = captureDownloads();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "Download" }));
    await user.click(screen.getByRole("menuitem", { name: /spreadsheet/i }));
    expect(names).toEqual(["RiskMapper.app - Direct action- plan.csv"]);
    expect(blobs[0].type).toBe("text/csv;charset=utf-8");
    expect(await blobs[0].text()).toContain("Highest risk,High,High,Doxxing");
  });

  it("downloads an importable matrix file", async () => {
    const user = userEvent.setup();
    const { blobs, names } = captureDownloads();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "Download" }));
    await user.click(screen.getByRole("menuitem", { name: /matrix file/i }));
    // Nothing is saved until the person has read the handling advice.
    const dialog = await screen.findByRole("dialog", { name: /download matrix file/i });
    expect(names).toEqual([]);
    expect(within(dialog).getByText(/not encrypted/i)).toBeTruthy();
    expect(within(dialog).getByText(/Signal/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: /download file/i }));
    expect(names).toEqual(["RiskMapper.app - Direct action- plan.json"]);
    expect(screen.queryByRole("dialog")).toBeNull();
    const parsed = JSON.parse(await blobs[0].text()) as { format: string };
    expect(parsed.format).toBe(MATRIX_FILE_FORMAT);
  });

  it("downloads nothing if the matrix-file dialog is cancelled", async () => {
    const user = userEvent.setup();
    const { names } = captureDownloads();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "Download" }));
    await user.click(screen.getByRole("menuitem", { name: /matrix file/i }));
    const dialog = await screen.findByRole("dialog", { name: /download matrix file/i });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(names).toEqual([]);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Download" }),
    );
  });

  it("disables every format when the matrix is empty", async () => {
    const user = userEvent.setup();
    renderMenu(false);
    await user.click(screen.getByRole("button", { name: "Download" }));
    for (const item of screen.getAllByRole("menuitem")) {
      expect(item.getAttribute("aria-disabled")).toBe("true");
    }
  });
});
