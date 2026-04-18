import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ActionsAside from "./ActionsAside";

describe("ActionsAside", () => {
  it("calls onAddOther when the secondary Add other action button is used", () => {
    const onAddOther = vi.fn();
    render(
      <ActionsAside
        grid={{}}
        allActions={[]}
        otherActions={[]}
        onChangeSub={vi.fn()}
        onToggleStar={vi.fn()}
        onChangeOther={vi.fn()}
        onRemoveOther={vi.fn()}
        onAddOther={onAddOther}
        onOtherKeyDown={vi.fn()}
        onOtherBlur={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /add other action/i }));
    expect(onAddOther).toHaveBeenCalledTimes(1);
  });
});
