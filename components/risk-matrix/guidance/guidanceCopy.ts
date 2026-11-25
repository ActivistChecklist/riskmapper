/**
 * Guidance for the safety planning steps, adapted with permission from
 * Ruckus Society's Safety Planning worksheet. The app, its exports and the
 * PDF all read the text from here so it stays the same everywhere.
 *
 * Two deliberate edits to the worksheet's wording:
 * - The worksheet calls each item a "threat". The app calls it a "risk"
 *   everywhere, because "threat" reads as an outside attacker and the app
 *   means anything that could go wrong.
 * - The worksheet's example "communications break down" is too vague for a
 *   worksheet about being specific, so it reads "marshals can't reach each
 *   other when cell service drops".
 */

import { COLOR_GROUPS } from "../constants";
import type { CellKey, ColorGroupKey } from "../types";

export const RUCKUS_URL = "https://www.ruckus.org/resources";
export const RUCKUS_NAME = "Ruckus Society";

/** Words in the guidance that open a short definition. */
export type DefinitionKey = "risk" | "likelihood" | "impact" | "resource";

export const DEFINITIONS: Record<
  DefinitionKey,
  { title: string; body: string }
> = {
  risk: {
    title: "Risk",
    body: "A risk is a potential problem that could derail a meaningful part of your work. This could be a misstep of your own, a targeted attack, disruptively bad weather, etc.",
  },
  likelihood: {
    title: "Likelihood",
    body: "How likely it is to actually happen for a group like yours. If you're unsure, ask people doing similar work in your area. Grounding the estimate in real experience pulls you out of reactive fear.",
  },
  impact: {
    title: "Impact",
    body: "How bad it would be if it happened.",
  },
  resource: {
    title: "Resource",
    body: "A resource, for purposes of this exercise, is anything that can help you achieve your goals and stay safer.",
  },
};

/** A piece of a lead line: plain text, or a word that opens its definition. */
export type LeadPart = string | { term: DefinitionKey; text: string };

/** The one line each step opens with: an optional bold start, then text. */
export type Lead = { readonly strong?: string; readonly parts: readonly LeadPart[] };

/** The four questions for looking at each risk closely. */
export type CloseLookQuestion = { label: string; question: string };

export const INTRO = {
  heading: "Safety planning",
  lead: {
    parts: [
      "There comes a time in every activist group's life when they need to build a safety plan. Whether sending organizers out doorknocking, planning an action, or facing state repression, methodical planning around potential safety issues is important work.",
    ],
  } satisfies Lead,
  more: [
    "It's best to go through this process with some clear edges to what you are assessing - assess safety for an action or from now until the end of a campaign, not from now til the end of time. Do this work with a good variety of people in your circle who have helpful experience and a stake in the outcome.",
  ],
} as const;

export const STEP_TITLES = {
  1: "What risks concern you the most right now?",
  2: "Drag the risks into the matrix",
  3: "What resources does your group have?",
  4: "Write your safety plan. Star the items you intend to act on.",
} as const;

/** Placeholders for the two add fields. */
export const ADD_RISK_PLACEHOLDER = "Type a risk, then press Enter";
export const ADD_RESOURCE_PLACEHOLDER = "Type a resource, then press Enter";

/** The worksheet's own example of a vague entry, and the specific ones. */
export const VAGUE_EXAMPLE = "bad deployment";
export const SPECIFIC_EXAMPLES = [
  "cannot access the site on the day of the action",
  "blockaders don't successfully latch gear",
  "marshals can't reach each other when cell service drops",
] as const;

/** The worksheet's "Be thorough" sentence, as step 1's instructions quote it. */
export function beThoroughText(vague: string): string {
  const [a, b, c] = SPECIFIC_EXAMPLES;
  return `Be thorough - "${vague}" is not specific. Consider separate entries to your list for distinct possibilities, like "${a}", "${b}", and "${c}".`;
}

/**
 * The tip under a short entry: the worksheet's sentence, softened to "not
 * very specific" since a short entry can still be a fine one, and cut to
 * two examples so it stays a quick read.
 */
export function vagueRiskTipText(vague: string): string {
  const [a, b] = SPECIFIC_EXAMPLES;
  return `Be thorough - "${vague}" is not very specific. Consider separate entries to your list for distinct possibilities, like "${a}" and "${b}".`;
}

export const STEP_1 = {
  lead: {
    strong: "Get imaginative.",
    parts: [
      " List every ",
      { term: "risk", text: "risk" },
      " that could befall you, and make each one specific.",
    ],
  } satisfies Lead,
  more: [
    "The first thing to do is get imaginative - using all you know about your current situation, make a list of all the risks that could befall you. " +
      beThoroughText(VAGUE_EXAMPLE) +
      " This list may be quite long.",
  ],
  closeLook: {
    strong: "Then look at each risk closely.",
    text: "Now you need to sort through this mess! Examine the points on your list one at a time using the following format:",
    questions: [
      {
        label: "Who or What",
        question:
          "Who or what is causing the harm? Who can you sway or defend against?",
      },
      {
        label: "The Harm",
        question:
          "Describe the harm. If there are drastically different levels of harm, make multiple listings.",
      },
      {
        label: "Accelerants",
        question:
          "What plausible external factors could make this worse or more likely?",
      },
      {
        label: "Deescalators",
        question:
          "What plausible external factors could make this risk less bad or less likely?",
      },
    ] satisfies readonly CloseLookQuestion[],
  },
} as const;

export const STEP_2 = {
  lead: {
    strong: "Place every risk on the matrix",
    parts: [
      " by its ",
      { term: "likelihood", text: "likelihood" },
      " and ",
      { term: "impact", text: "impact" },
      ". Then look at where they clump.",
    ],
  } satisfies Lead,
  more: [
    "Take your list and map it onto a risk matrix. In your group, place every one of your risks onto the matrix. That way you can see where you have a concentration of risks and get a sense of your general risk level. Do you have an even smattering of risks? A huge clump of risks that are reasonably likely and pretty harmful?",
  ],
} as const;

export const STEP_3 = {
  lead: {
    strong: "Take stock of what's on your side.",
    parts: [
      " List the ",
      { term: "resource", text: "resources" },
      " your group holds: skills and experience, practices and social structures, physical objects and infrastructure, necessities and commodities, and money.",
    ],
  } satisfies Lead,
  more: [
    "Let's get serious about what we have on our side. Set up a series of brainstorms about what resources the group holds. We find it's most useful to break the megabrainstorm into separate smaller sessions focusing on different categories of resource: Skills and experience held by the group; practices and social structures; physical objects and infrastructure; necessities and commodities; and money.",
  ],
} as const;

export const STEP_4 = {
  lead: {
    strong: "For each risk,",
    parts: [
      " write how you'll steer clear of it and what you'll do if it happens.",
    ],
  } satisfies Lead,
  more: [
    "Finally, let's put this all together into a plan. Keeping in mind all your resources, go through and write out your preferred responses to each risk - both preemptive activities to avoid the risk and what you intend to do if it comes to pass, anyway.",
  ],
} as const;

/** Closes the Actions panel: the worksheet's "That's it!" */
export const FINISHED = {
  lead: { strong: "That's it!", parts: [" Now you have a safety plan!"] } satisfies Lead,
  more: [
    "Do an inventory of things you need to get or set up in order to be able to follow your plan. Check in with your plan regularly, especially if the plan is for an ongoing group not just a single action. Make sure it still feels accurate and make changes as your group or the landscape changes. After the action, make sure to include the safety plan in your debrief.",
  ],
} as const;

/** Plain text of a lead line, for formats without popovers. */
export function leadText(lead: Lead): string {
  const rest = lead.parts
    .map((p) => (typeof p === "string" ? p : p.text))
    .join("");
  return (lead.strong ?? "") + rest;
}

export const EXAMPLE_LABEL = "Example";
export const EXAMPLE_GOES_AWAY = "This goes away when you add your own.";
export const SHOW_EXAMPLE_PLAN = "Show an example finished plan";
export const EXAMPLE_PLAN_TITLE = "Example safety plan";
export const MORE_INSTRUCTIONS = "More instructions";
export const FEWER_INSTRUCTIONS = "Fewer instructions";
export const SHOW_EXAMPLES = "Show examples";
export const HIDE_EXAMPLES = "Hide examples";

export type ExampleMitigation = { text: string; starred?: boolean };

export type ExampleRisk = {
  text: string;
  /** Where the worksheet's likelihood and harm put it on the 3x3 matrix. */
  cellKey: CellKey;
  reduce: ExampleMitigation[];
  prepare: ExampleMitigation[];
};

/**
 * The worksheet's example plan, ordered as the step 1 example lists it.
 * Its 5-point likelihood and harm scores map onto the app's 3x3 matrix.
 */
export const EXAMPLE_PLAN: ExampleRisk[] = [
  {
    text: "Can't access site day-of",
    cellKey: "1-1",
    reduce: [{ text: "Scout night before and early morning of action" }],
    prepare: [
      {
        text: "If site is open-able without changing our risk model, we open it",
      },
      {
        text: "If not, backup protest site with or w/o certain action elements",
      },
    ],
  },
  {
    text: "Infiltrators",
    cellKey: "0-2",
    reduce: [
      { text: "Strengthen vetting process for new members", starred: true },
      { text: "Train everyone on operational security", starred: true },
    ],
    prepare: [
      {
        text: "Engage pre-planned process for researching, confirming, and outing infiltrator",
      },
      { text: "Stay calm and avoid snitchjacketing" },
      {
        text: "If useful and seemingly safe, continue to get free labor from government employee until we figure out what to do, firewalling their access to sensitive info as we go",
      },
    ],
  },
  {
    text: "Dehydration and overheating on the picket line",
    cellKey: "0-0",
    reduce: [
      {
        text: "Everyone including medics bring extra water and electrolytes",
      },
      { text: "Set up shade area nearby action site" },
    ],
    prepare: [
      { text: "First aid" },
      {
        text: 'Use emergency support crew to move "victims" to recovery site if needed',
      },
    ],
  },
  {
    text: "Torrential rain",
    cellKey: "1-0",
    reduce: [
      { text: "Check weather leading up to event" },
      { text: "Plan a rain-ready action" },
      { text: "Bring extra ponchos and hand warmers", starred: true },
      { text: "Set up dry/warm space nearby action site" },
    ],
    prepare: [
      {
        text: "If the rain is too torrential for safety, reschedule or minimize action",
      },
      { text: "If it's manageable, we get wet and be ready to call it early" },
      {
        text: "Consider amending technical aspects of action if needed for rain safety",
      },
    ],
  },
  {
    text: "Nuclear war",
    cellKey: "2-2",
    reduce: [{ text: "Uhh...total disarmament?" }],
    prepare: [{ text: "n/a" }],
  },
];

export function exampleTier(cellKey: CellKey): ColorGroupKey {
  return COLOR_GROUPS.find((g) => g.cells.includes(cellKey))?.key ?? "yellow";
}

/** Example risks grouped by matrix cell, for drawing them on a matrix. */
export const EXAMPLE_CELLS: Readonly<Record<CellKey, string[]>> = (() => {
  const cells: Record<CellKey, string[]> = {};
  for (const r of EXAMPLE_PLAN) (cells[r.cellKey] ??= []).push(r.text);
  return cells;
})();

/** The example cards the plan step shows before your first idea. */
export const PLAN_EXAMPLE_RISKS = ["Infiltrators", "Torrential rain"] as const;

/**
 * Example resources for step 3. New copy, drawn from the worksheet's
 * example plan: each is something that plan relies on.
 */
export const EXAMPLE_RESOURCES = [
  "Medics who can give first aid",
  "An emergency support crew",
  "A vetting process for new members",
  "Extra ponchos and hand warmers",
  "A shade area and a dry, warm space near the site",
  "Extra water and electrolytes",
] as const;

/**
 * A short entry probably names a category rather than a specific risk.
 * Word count is a rough signal, so the tip it triggers stays a suggestion.
 */
export function isVagueRisk(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 3;
}
