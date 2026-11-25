import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import RiskMatrix from "../RiskMatrix";
import { GUIDANCE_STORAGE_KEY } from "./GuidanceContext";
import { DEFINITIONS, RUCKUS_URL } from "./guidanceCopy";

function enterInto(label: string, text: string) {
  const field = screen.getByRole("textbox", { name: label });
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value: text } });
  fireEvent.keyDown(field, { key: "Enter" });
}

const enterRisk = (text: string) => enterInto("Add a risk", text);

describe("safety planning guidance", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("opens with the intro and its Ruckus Society credit", () => {
    render(<RiskMatrix />);
    const intro = screen.getByRole("region", { name: "Safety planning" });
    const link = within(intro).getByRole("link", { name: "Ruckus Society" });
    expect(link.getAttribute("href")).toBe(RUCKUS_URL);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("shows an example in every empty step", () => {
    render(<RiskMatrix />);
    expect(screen.getByRole("region", { name: "Example risks" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Example plan" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Example actions" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Example resources" })).toBeTruthy();
    // Step 1's list, the matrix and step 3's card all carry this one.
    expect(screen.getAllByText("Cops or feds infiltrate as a participant").length).toBeGreaterThanOrEqual(3);
  });

  it("takes step 1's example away once a risk is entered", () => {
    render(<RiskMatrix />);
    enterRisk("Police arrest blockaders for trespassing at the gate");
    expect(screen.queryByRole("region", { name: "Example risks" })).toBeNull();
    // The matrix is still empty, so its example stays.
    expect(screen.getByRole("region", { name: "Example plan" })).toBeTruthy();
  });

  it("brings a step's examples back, or hides them, from its own link", () => {
    render(<RiskMatrix />);
    // Every step with an example has the link: steps 1 to 4 and Actions.
    expect(screen.getAllByRole("button", { name: "Hide examples" })).toHaveLength(5);

    // Steps 1 and 3 keep the link in the example box itself.
    const box = screen.getByRole("region", { name: "Example risks" });
    const hide = within(box).getByRole("button", { name: "Hide examples" });
    fireEvent.click(hide);
    expect(screen.queryByRole("region", { name: "Example risks" })).toBeNull();
    // The link that takes its place gets focus.
    const show = screen.getByRole("button", { name: "Show examples" });
    expect(document.activeElement).toBe(show);
    fireEvent.click(show);
    expect(document.activeElement).toBe(
      within(screen.getByRole("region", { name: "Example risks" })).getByRole("button", {
        name: "Hide examples",
      }),
    );

    enterRisk("Police arrest blockaders for trespassing at the gate");
    expect(screen.getByRole("region", { name: "Example risks" })).toBeTruthy();

    // Hiding one step's example leaves the others alone.
    const resourcesLink = screen.getAllByRole("button", { name: "Hide examples" })[2];
    fireEvent.click(resourcesLink);
    expect(screen.queryByRole("region", { name: "Example resources" })).toBeNull();
    expect(screen.getByRole("region", { name: "Example risks" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Example plan" })).toBeTruthy();
  });

  it("keeps the Actions panel's link in its example box", () => {
    render(<RiskMatrix />);
    const box = screen.getByRole("region", { name: "Example actions" });
    fireEvent.click(within(box).getByRole("button", { name: "Hide examples" }));
    expect(screen.queryByRole("region", { name: "Example actions" })).toBeNull();
    // Nothing is starred, so the panel says what goes there, with the way
    // back in that same box.
    const placeholder = document.querySelector(
      '[aria-label^="Placeholder: starred"]',
    ) as HTMLElement;
    const show = within(placeholder).getByRole("button", { name: "Show examples" });
    expect(document.activeElement).toBe(show);
  });

  it("keeps step 4's link in its example box too", () => {
    render(<RiskMatrix />);
    const plan = screen.getByRole("region", { name: "Example plan" });
    fireEvent.click(within(plan).getByRole("button", { name: "Hide examples" }));
    expect(screen.queryByRole("region", { name: "Example plan" })).toBeNull();
    // With nothing placed, step 4 falls back to saying what goes there,
    // and the link to bring the example back takes focus.
    expect(screen.getByText(/Your risks will show up here/)).toBeTruthy();
    const show = screen.getByRole("button", { name: "Show examples" });
    expect(document.activeElement).toBe(show);
    // It sits inside that placeholder box, where people are already looking.
    expect(show.closest('[aria-label^="Placeholder"]')).toBeTruthy();
    fireEvent.click(show);
    expect(screen.getByRole("region", { name: "Example plan" })).toBeTruthy();
  });

  it("keeps the plan's example until the first idea is written", () => {
    render(<RiskMatrix />);
    // "hi/hl" (high impact, high likelihood) is the typing shortcut that
    // places a risk straight in its cell.
    enterRisk("Police arrest blockaders for trespassing hi/hl");
    expect(document.querySelector('[data-drop-target="0-2"] textarea')).toBeTruthy();
    // The matrix's example goes with the first placed risk; the plan's stays.
    expect(screen.queryAllByText("Cops or feds infiltrate as a participant")).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Example plan" })).toBeTruthy();

    const idea = document.querySelector<HTMLTextAreaElement>("[data-sub-line-id]");
    expect(idea).toBeTruthy();
    fireEvent.change(idea!, { target: { value: "Practice latching at two trainings" } });
    expect(screen.queryByRole("region", { name: "Example plan" })).toBeNull();
  });

  it("adds a risk from the add field and clears it", () => {
    render(<RiskMatrix />);
    enterRisk("Counter-protesters block the driveway");
    const pool = document.querySelector('[data-drop-target="pool"]')!;
    const listed = Array.from(pool.querySelectorAll<HTMLTextAreaElement>("[data-line-id]"));
    expect(listed.map((t) => t.value)).toEqual(["Counter-protesters block the driveway"]);
    expect(
      (screen.getByRole("textbox", { name: "Add a risk" }) as HTMLTextAreaElement).value,
    ).toBe("");
  });

  it("adds one risk per line when a list is pasted into the add field", () => {
    render(<RiskMatrix />);
    const field = screen.getByRole("textbox", { name: "Add a risk" });
    fireEvent.paste(field, {
      clipboardData: { getData: () => "- Torrential rain\n- Infiltrators in the group chat" },
    });
    const pool = document.querySelector('[data-drop-target="pool"]')!;
    expect(
      Array.from(pool.querySelectorAll<HTMLTextAreaElement>("[data-line-id]")).map((t) => t.value),
    ).toEqual(["Torrential rain", "Infiltrators in the group chat"]);
  });

  it("brainstorms resources in their own step", () => {
    render(<RiskMatrix />);
    enterInto("Add a resource", "Two people with lockbox experience");
    expect(screen.queryByRole("region", { name: "Example resources" })).toBeNull();
    const list = screen.getByRole("list", { name: "Resources" });
    expect(within(list).getByRole("textbox", { name: "Resource" })).toHaveProperty(
      "value",
      "Two people with lockbox experience",
    );
  });

  it("nudges about a short risk right under it, until dismissed", () => {
    render(<RiskMatrix />);
    enterRisk("bad deployment");
    expect(screen.getByRole("status").textContent).toContain(
      'Be thorough - "bad deployment" is not very specific.',
    );
    const tip = screen.getByTestId("vague-risk-tip");
    const row = tip.previousElementSibling as HTMLElement;
    expect(row.querySelector("textarea")?.value).toBe("bad deployment");

    fireEvent.click(within(tip).getByRole("button", { name: "Got it" }));
    expect(screen.queryByTestId("vague-risk-tip")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("gives the tip to the first short risk only", () => {
    render(<RiskMatrix />);
    enterRisk("bad deployment");
    enterRisk("Infiltrators");
    const tips = screen.getAllByTestId("vague-risk-tip");
    expect(tips).toHaveLength(1);
    expect(tips[0].textContent).toContain('"bad deployment"');

    fireEvent.click(within(tips[0]).getByRole("button", { name: "Got it" }));
    enterRisk("Torrential rain");
    expect(screen.queryByTestId("vague-risk-tip")).toBeNull();
  });

  it("says nothing about a specific risk", () => {
    render(<RiskMatrix />);
    enterRisk("Blockaders don't successfully latch their gear");
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("opens a step's full instructions on request", () => {
    render(<RiskMatrix />);
    const more = screen.getAllByRole("button", { name: "More instructions" });
    // Intro, steps 1 to 4, and the Actions panel.
    expect(more).toHaveLength(6);
    fireEvent.click(more[1]);
    expect(more[1].getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Then look at each risk closely.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fewer instructions" })).toBe(more[1]);
  });

  it("defines a dotted word when it's clicked", () => {
    render(<RiskMatrix />);
    fireEvent.click(screen.getByRole("button", { name: "likelihood" }));
    expect(screen.getByText(DEFINITIONS.likelihood.body)).toBeTruthy();
  });

  it("returns focus to the button that opened the example plan", async () => {
    render(<RiskMatrix />);
    const opener = screen.getAllByRole("button", { name: "Show an example finished plan" })[1];
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Example safety plan" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    // Radix moves focus on a timer once the dialog unmounts.
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("drops selected text when Enter splits a resource", () => {
    render(<RiskMatrix />);
    enterInto("Add a resource", "Medic big van");
    const entry = within(screen.getByRole("list", { name: "Resources" })).getByRole(
      "textbox",
      { name: "Resource" },
    ) as HTMLTextAreaElement;
    entry.focus();
    entry.setSelectionRange(6, 10); // "big "
    fireEvent.keyDown(entry, { key: "Enter" });
    const texts = within(screen.getByRole("list", { name: "Resources" }))
      .getAllByRole("textbox", { name: "Resource" })
      .map((t) => (t as HTMLTextAreaElement).value);
    expect(texts).toEqual(["Medic ", "van"]);
  });

  it("shows the example finished plan on the matrix and as cards", () => {
    render(<RiskMatrix />);
    fireEvent.click(
      screen.getAllByRole("button", { name: "Show an example finished plan" })[0],
    );
    const dialog = screen.getByRole("dialog", { name: "Example safety plan" });
    expect(within(dialog).getByRole("table")).toBeTruthy();
    expect(within(dialog).getAllByText("Earthquake during the action")).toHaveLength(2);
    expect(within(dialog).getByRole("link", { name: "Ruckus Society" })).toBeTruthy();
  });

  it("turns all of it off with one switch, and remembers", () => {
    const { unmount } = render(<RiskMatrix />);
    const toggle = screen.getByRole("switch", { name: "Guidance" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByRole("region", { name: "Safety planning" })).toBeNull();
    expect(screen.queryByRole("button", { name: "More instructions" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Example risks" })).toBeNull();
    expect(screen.queryByText("Cops or feds infiltrate as a participant")).toBeNull();
    // Without the example, step 3 falls back to saying what goes there.
    expect(screen.getByText(/Your risks will show up here/)).toBeTruthy();
    expect(window.localStorage.getItem(GUIDANCE_STORAGE_KEY)).toBe("off");

    unmount();
    render(<RiskMatrix />);
    expect(
      screen.getByRole("switch", { name: "Guidance" }).getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("on narrow screens, opens the labelled switch from a lightbulb", () => {
    render(<RiskMatrix />);
    // The bare switch says nothing on a phone, so the icon names its state
    // and opens the switch with its label.
    fireEvent.click(screen.getByRole("button", { name: "Guidance: on" }));
    const switches = screen.getAllByRole("switch", { name: "Guidance" });
    // The wide-screen switch, hidden on phones by CSS, and the popover's.
    expect(switches).toHaveLength(2);
    fireEvent.click(switches[1]);
    expect(screen.getByRole("button", { name: "Guidance: off" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Safety planning" })).toBeNull();
  });

  it("gives no tip while guidance is off", () => {
    window.localStorage.setItem(GUIDANCE_STORAGE_KEY, "off");
    render(<RiskMatrix />);
    enterRisk("bad deployment");
    expect(screen.getByRole("status").textContent).toBe("");
  });
});
