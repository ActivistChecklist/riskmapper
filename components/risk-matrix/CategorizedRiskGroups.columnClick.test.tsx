import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { INITIAL_COLLAPSED, INITIAL_CATEGORIZED_REVEAL_HIDDEN } from "./constants";
import CategorizedRiskGroups from "./CategorizedRiskGroups";
import { installMatrixTestDomPolyfills } from "./testDomPolyfills";
import type { CellKey, GridLine } from "./types";

const noop = () => {};

beforeAll(() => {
  installMatrixTestDomPolyfills();
});

describe("CategorizedRiskGroups mitigation column background click", () => {
  it("calls onPointerAddMitigationSubLine when clicking empty column chrome", () => {
    const onPointerAddMitigationSubLine = vi.fn();
    const line: GridLine = {
      id: "risk-1",
      text: "Smoke in the hall",
      reduce: [{ id: "m1", text: "Check detectors", starred: false }],
      prepare: [{ id: "m2", text: "Evac plan", starred: false }],
    };
    const cellKey = "0-2" as CellKey;

    render(
      <CategorizedRiskGroups
        anyRisks
        risksByColor={{ red: [{ line, cellKey }] }}
        collapsed={{ ...INITIAL_COLLAPSED, green: false }}
        setCollapsed={noop}
        hiddenCategorizedRiskKeys={[]}
        categorizedRevealHidden={{ ...INITIAL_CATEGORIZED_REVEAL_HIDDEN }}
        onToggleCategorizedRiskHidden={vi.fn()}
        onToggleCategorizedRevealHidden={vi.fn()}
        onChangeRisk={vi.fn()}
        onRiskKeyDown={vi.fn()}
        onChangeSub={vi.fn()}
        onSubKeyDown={vi.fn()}
        onToggleStar={vi.fn()}
        onPointerAddMitigationSubLine={onPointerAddMitigationSubLine}
      />,
    );

    const reduceCol = screen.getByTestId(`mitigation-reduce-${line.id}`);
    fireEvent.click(reduceCol);

    expect(onPointerAddMitigationSubLine).toHaveBeenCalledTimes(1);
    expect(onPointerAddMitigationSubLine).toHaveBeenCalledWith(
      cellKey,
      line.id,
      "reduce",
    );
  });

  it("does not call onPointerAddMitigationSubLine when clicking inside a mitigation row", () => {
    const onPointerAddMitigationSubLine = vi.fn();
    const line: GridLine = {
      id: "risk-2",
      text: "Blocked exit",
      reduce: [{ id: "m1", text: "Clear path", starred: false }],
      prepare: [{ id: "m2", text: "", starred: false }],
    };

    render(
      <CategorizedRiskGroups
        anyRisks
        risksByColor={{ red: [{ line, cellKey: "0-2" }] }}
        collapsed={{ ...INITIAL_COLLAPSED, green: false }}
        setCollapsed={noop}
        hiddenCategorizedRiskKeys={[]}
        categorizedRevealHidden={{ ...INITIAL_CATEGORIZED_REVEAL_HIDDEN }}
        onToggleCategorizedRiskHidden={vi.fn()}
        onToggleCategorizedRevealHidden={vi.fn()}
        onChangeRisk={vi.fn()}
        onRiskKeyDown={vi.fn()}
        onChangeSub={vi.fn()}
        onSubKeyDown={vi.fn()}
        onToggleStar={vi.fn()}
        onPointerAddMitigationSubLine={onPointerAddMitigationSubLine}
      />,
    );

    const ta = screen.getAllByRole("textbox").find((el) =>
      el.getAttribute("data-sub-line-id"),
    );
    expect(ta).toBeTruthy();
    fireEvent.click(ta!);

    expect(onPointerAddMitigationSubLine).not.toHaveBeenCalled();
  });
});
