import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  INITIAL_COLLAPSED,
  INITIAL_CATEGORIZED_REVEAL_HIDDEN,
  MITIGATION_PROMPTS,
} from "./constants";
import CategorizedRiskGroups from "./CategorizedRiskGroups";
import { installMatrixTestDomPolyfills } from "./testDomPolyfills";
import type { CellKey, GridLine } from "./types";

beforeAll(() => {
  installMatrixTestDomPolyfills();
});

function renderGroups(
  lines: GridLine[],
  onPointerAddMitigationSubLine = vi.fn(),
  onMitigationGripPointerDown = vi.fn(),
) {
  render(
    <CategorizedRiskGroups
      anyRisks
      risksByColor={{
        red: lines.map((line) => ({ line, cellKey: "0-2" as CellKey })),
      }}
      collapsed={{ ...INITIAL_COLLAPSED, green: false }}
      setCollapsed={() => {}}
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
      draggingSubId={null}
      mitigationDropEdge={null}
      onMitigationGripPointerDown={onMitigationGripPointerDown}
    />,
  );
  return onPointerAddMitigationSubLine;
}

describe("CategorizedRiskGroups per-risk prompts", () => {
  it("repeats both questions for every risk and names each list by its question", () => {
    renderGroups([
      { id: "r1", text: "Kettling", reduce: [], prepare: [] },
      { id: "r2", text: "Doxxing", reduce: [], prepare: [] },
    ]);

    expect(screen.getAllByText(MITIGATION_PROMPTS.reduce)).toHaveLength(2);
    expect(screen.getAllByText(MITIGATION_PROMPTS.prepare)).toHaveLength(2);
    expect(
      screen.getAllByRole("group", { name: MITIGATION_PROMPTS.reduce }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("group", { name: MITIGATION_PROMPTS.prepare }),
    ).toHaveLength(2);
  });

  it("shows an add box once every line has text, and calls add when clicked", () => {
    const onAdd = renderGroups([
      {
        id: "r1",
        text: "Kettling",
        reduce: [{ id: "m1", text: "Scout exits", starred: false }],
        prepare: [{ id: "m2", text: "", starred: false }],
      },
    ]);

    const reduce = screen.getByTestId("mitigation-reduce-r1");
    const prepare = screen.getByTestId("mitigation-prepare-r1");
    expect(within(reduce).getByText("Add an idea")).toBeTruthy();
    // The empty trailing line is the box to type in, so no second one.
    expect(within(prepare).queryByText("Add an idea")).toBeNull();
    expect(within(prepare).getByPlaceholderText("Add an idea")).toBeTruthy();

    fireEvent.click(
      within(reduce).getByRole("button", {
        name: "Add a way to reduce the likelihood",
      }),
    );
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith("0-2", "r1", "reduce");
  });

  it("starts a drag from a filled line's grip but not an empty one's", () => {
    const onGrip = vi.fn();
    renderGroups(
      [
        {
          id: "r1",
          text: "Kettling",
          reduce: [
            { id: "m1", text: "Scout exits", starred: false },
            { id: "m2", text: "", starred: false },
          ],
          prepare: [],
        },
      ],
      vi.fn(),
      onGrip,
    );

    const grip = (subId: string) =>
      document.querySelector(`[data-sub-row-id="${subId}"] [title="Drag to reorder"]`);
    expect(grip("m2")).toBeNull();
    fireEvent.pointerDown(grip("m1")!);
    expect(onGrip).toHaveBeenCalledTimes(1);
    expect(onGrip.mock.calls[0][1]).toEqual({
      cellKey: "0-2",
      parentLineId: "r1",
      subType: "reduce",
    });
    expect(onGrip.mock.calls[0][2]).toMatchObject({ id: "m1" });
  });
});
