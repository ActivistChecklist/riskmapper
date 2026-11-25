import { describe, expect, it } from "vitest";
import {
  DEFINITIONS,
  EXAMPLE_CELLS,
  EXAMPLE_PLAN,
  FINISHED,
  INTRO,
  SPECIFIC_EXAMPLES,
  STEP_1,
  STEP_2,
  STEP_3,
  STEP_4,
  STEP_TITLES,
  EXAMPLE_RESOURCES,
  beThoroughText,
  vagueRiskTipText,
  exampleTier,
  isVagueRisk,
  leadText,
} from "./guidanceCopy";

/** Every string reachable from the guidance copy. */
function allStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(allStrings);
  }
  return [];
}

const ALL_COPY = allStrings([
  DEFINITIONS,
  EXAMPLE_PLAN,
  FINISHED,
  INTRO,
  SPECIFIC_EXAMPLES,
  STEP_1,
  STEP_2,
  STEP_3,
  STEP_4,
  STEP_TITLES,
  EXAMPLE_RESOURCES,
  beThoroughText("bad deployment"),
  vagueRiskTipText("bad deployment"),
]).join("\n");

describe("guidance copy", () => {
  it("calls every item a risk, never a threat", () => {
    // "Threat" reads as an outside attacker; the app means anything that
    // could go wrong, so the worksheet's word is adapted everywhere.
    expect(ALL_COPY).not.toMatch(/threat/i);
  });

  it("uses straight quotes and no em-dashes", () => {
    expect(ALL_COPY).not.toMatch(/[\u2014\u2018\u2019\u201c\u201d]/);
  });

  it("replaces the worksheet's vague communications example", () => {
    expect(ALL_COPY).not.toMatch(/communications break down/i);
    expect(beThoroughText("bad deployment")).toContain(
      "marshals can't reach each other when cell service drops",
    );
  });

  it("drops the sticky notes line, since the app replaces the wall", () => {
    expect(ALL_COPY).not.toMatch(/sticky notes/i);
  });

  it("softens the tip and gives it two examples", () => {
    expect(vagueRiskTipText("bad deployment")).toBe(
      'Be thorough - "bad deployment" is not very specific. Consider separate entries to your list for distinct possibilities, like "cannot access the site on the day of the action" and "blockaders don\'t successfully latch gear".',
    );
  });

  it("reads a lead line as plain text for formats without popovers", () => {
    expect(leadText(STEP_2.lead)).toBe(
      "Place every risk on the matrix by its likelihood and impact. Then look at where they clump.",
    );
  });
});

describe("isVagueRisk", () => {
  it("flags short entries", () => {
    expect(isVagueRisk("bad deployment")).toBe(true);
    expect(isVagueRisk("  Infiltrators ")).toBe(true);
  });

  it("leaves specific entries and empty lines alone", () => {
    expect(isVagueRisk("cannot access the site on the day of the action")).toBe(false);
    expect(isVagueRisk("")).toBe(false);
    expect(isVagueRisk("   ")).toBe(false);
  });
});

describe("the example plan", () => {
  it("lands each risk in the tier its worksheet scores give it", () => {
    const tiers = Object.fromEntries(
      EXAMPLE_PLAN.map((r) => [r.text, exampleTier(r.cellKey)]),
    );
    expect(tiers).toEqual({
      "Can't access site day-of": "yellow",
      Infiltrators: "red",
      "Dehydration and overheating on the picket line": "yellow",
      "Torrential rain": "green",
      "Nuclear war": "yellow",
    });
  });

  it("puts every example risk in exactly one matrix cell", () => {
    expect(Object.values(EXAMPLE_CELLS).flat().sort()).toEqual(
      EXAMPLE_PLAN.map((r) => r.text).sort(),
    );
  });
});
