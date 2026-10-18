import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ActionsAside from "./ActionsAside";
import type { StarredAction } from "./types";

describe("ActionsAside", () => {
  it("calls onAddOther when the secondary Add other action button is used", () => {
    const onAddOther = vi.fn();
    render(
      <ActionsAside
        allActions={[]}
        otherActions={[]}
        onChangeSub={vi.fn()}
        onToggleStar={vi.fn()}
        onChangeOther={vi.fn()}
        onAddOther={onAddOther}
        onOtherKeyDown={vi.fn()}
        onOtherBlur={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /add other action/i }));
    expect(onAddOther).toHaveBeenCalledTimes(1);
  });

  it("groups actions under their tier label and leaves out the risk", () => {
    const action = (
      id: string,
      groupTone: StarredAction["groupTone"],
      text: string,
    ): StarredAction => ({
      subLine: { id, text, starred: true },
      cellKey: "0-2",
      parentLineId: `risk-${id}`,
      subType: "prepare",
      parentText: `Risk behind ${id}`,
      groupTone,
    });
    render(
      <ActionsAside
        allActions={[
          action("a", "red", "Bring goggles"),
          action("b", "orange", "Find a lawyer"),
        ]}
        otherActions={[{ id: "o1", text: "Book the van" }]}
        onChangeSub={vi.fn()}
        onToggleStar={vi.fn()}
        onChangeOther={vi.fn()}
        onAddOther={vi.fn()}
        onOtherKeyDown={vi.fn()}
        onOtherBlur={vi.fn()}
      />,
    );

    const highest = screen.getByRole("region", { name: "For highest risks" });
    expect(within(highest).getByDisplayValue("Bring goggles")).toBeTruthy();
    const high = screen.getByRole("region", { name: "For high risks" });
    expect(within(high).getByDisplayValue("Find a lawyer")).toBeTruthy();
    const other = screen.getByRole("region", { name: "Other" });
    expect(within(other).getByDisplayValue("Book the van")).toBeTruthy();
    expect(screen.queryByText(/Risk behind/)).toBeNull();
  });
});
