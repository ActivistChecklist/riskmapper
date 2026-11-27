import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import RiskMatrix from "./RiskMatrix";

function addRisk(text: string) {
  const field = screen.getByRole("textbox", { name: "Add a risk" });
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value: text } });
  fireEvent.keyDown(field, { key: "Enter" });
}

function poolRisk(text: string): HTMLTextAreaElement {
  const pool = document.querySelector('[data-drop-target="pool"]') as HTMLElement;
  return within(pool).getByDisplayValue(text) as HTMLTextAreaElement;
}

function arrowDownFromEnd(el: HTMLTextAreaElement) {
  el.focus();
  el.setSelectionRange(el.value.length, el.value.length);
  fireEvent.keyDown(el, { key: "ArrowDown" });
}

describe("step 1 keyboard", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("moves ArrowDown from the last risk shown to the add field", () => {
    // The pool keeps a blank entry after its risks, hidden on screen. The
    // arrow skips it rather than getting stuck on the risk.
    render(<RiskMatrix />);
    addRisk("Police arrest blockaders for trespassing at the gate");
    const risk = poolRisk("Police arrest blockaders for trespassing at the gate");
    arrowDownFromEnd(risk);
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Add a risk" }),
    );
  });

  it("still moves ArrowDown from one risk to the next", () => {
    render(<RiskMatrix />);
    addRisk("Police arrest blockaders for trespassing at the gate");
    addRisk("Counter-protesters follow marshals to their cars");
    arrowDownFromEnd(poolRisk("Police arrest blockaders for trespassing at the gate"));
    expect(document.activeElement).toBe(
      poolRisk("Counter-protesters follow marshals to their cars"),
    );
  });
});
