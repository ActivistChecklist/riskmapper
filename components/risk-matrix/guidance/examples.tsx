"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ACTION_GROUP_LABEL,
  CELL_BG_CLASSES,
  CELL_RISK_CARD_CLASS,
  COLOR_GROUPS,
  COL_LABELS,
  GROUP_LABEL_TEXT_CLASS,
  GROUP_STRIPE_CLASS,
  MITIGATION_PROMPTS,
  ROW_LABELS,
} from "../constants";
import type { CellKey, ColorGroupKey } from "../types";
import {
  EXAMPLE_GOES_AWAY,
  EXAMPLE_LABEL,
  EXAMPLE_PLAN,
  EXAMPLE_RESOURCES,
  HIDE_EXAMPLES,
  SHOW_EXAMPLES,
  BE_SPECIFIC_HEADING,
  BOX_SPECIFIC_EXAMPLES,
  PLAN_EXAMPLE_RISKS,
  VAGUE_EXAMPLE,
  exampleTier,
  type ExampleMitigation,
  type ExampleRisk,
} from "./guidanceCopy";
import type { StepExample } from "./GuidanceContext";
import CountBadge from "../CountBadge";
import MitigationsTablePlaceholder from "../MitigationsTablePlaceholder";
import { GUIDANCE_LINK_BUTTON_CLASS, GUIDANCE_SMALL_BUTTON_CLASS } from "./linkButton";

/**
 * The dashed edge every example box shares, dark enough to read as a
 * boundary in both themes.
 */
const EXAMPLE_BORDER_CLASS = "rounded-lg rm-dashed";

/**
 * An example box on a gray step body. No fill of its own, so only the
 * person's own entries are white: the dashed edge sets it apart.
 */
const EXAMPLE_BOX_CLASS = `${EXAMPLE_BORDER_CLASS} px-3 pb-3 pt-2`;

/** The small "Example" label under each example. */
export function ExampleLabel({ className }: { className?: string }) {
  return (
    <span className={cn("block text-[11.5px] leading-tight text-rm-muted", className)}>
      {EXAMPLE_LABEL}
    </span>
  );
}

/**
 * Heading of an example block: the tag, that it leaves on its own (while
 * that is still true), and the box's own Hide examples link if it has one.
 */
export function ExampleHeading({
  note = true,
  toggle,
}: {
  note?: boolean;
  toggle?: React.ReactNode;
}) {
  return (
    <div className="mb-1.5 flex items-start gap-x-3 text-xs text-rm-muted">
      <p className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
        <span className="font-semibold text-rm-ink">{EXAMPLE_LABEL}</span>
        {note ? <span>{EXAMPLE_GOES_AWAY}</span> : null}
      </p>
      {toggle ? <span className="shrink-0">{toggle}</span> : null}
    </div>
  );
}

/** What a list step's example box needs from its column. */
export type ExampleBoxProps = {
  /** Say the box leaves on its own: true while the step is still empty. */
  note: boolean;
  /** The box's Hide examples link. */
  toggle: React.ReactNode;
};

/**
 * "Show examples" or "Hide examples". The one that replaces the link just
 * clicked takes focus, so a keyboard user stays where they were.
 */
type ToggleLook = "link" | "button";

function ExampleToggle({
  shown,
  onToggle,
  focusOnMount,
  onFocused,
  look,
}: {
  shown: boolean;
  onToggle: () => void;
  focusOnMount: boolean;
  onFocused: () => void;
  look: ToggleLook;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!focusOnMount) return;
    ref.current?.focus();
    onFocused();
  }, [focusOnMount, onFocused]);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onToggle}
      className={look === "button" ? GUIDANCE_SMALL_BUTTON_CLASS : GUIDANCE_LINK_BUTTON_CLASS}
    >
      {shown ? HIDE_EXAMPLES : SHOW_EXAMPLES}
    </button>
  );
}

/**
 * The step's examples link, for its box or the spot the box left. Moving
 * between the two remounts it, which is when it takes focus.
 */
export function useExampleToggle(
  example: StepExample,
  look: ToggleLook = "link",
): React.ReactNode {
  const [moveFocus, setMoveFocus] = useState(false);
  return (
    <ExampleToggle
      look={look}
      shown={example.shown}
      onToggle={() => {
        setMoveFocus(true);
        example.toggle();
      }}
      focusOnMount={moveFocus}
      onFocused={() => setMoveFocus(false)}
    />
  );
}

/**
 * The example column beside a list step. The box carries its own Hide
 * examples link; once it is hidden, a Show examples link stays in its place.
 */
export function ExampleColumn({
  example,
  empty,
  box: Box,
}: {
  example: StepExample;
  /** True while the step has none of the person's own entries. */
  empty: boolean;
  box: React.ComponentType<ExampleBoxProps>;
}) {
  const toggle = useExampleToggle(example);
  // It comes first in the page: above the list on phones, and moved to the
  // right-hand column from md up.
  return example.shown ? (
    <div className="px-3 pt-3 sm:px-4 md:order-last md:pb-3 md:pl-0">
      <Box note={empty} toggle={toggle} />
    </div>
  ) : (
    <div className="px-3 pt-3 sm:px-4 md:order-last md:pb-3 md:pl-0 md:pt-4">{toggle}</div>
  );
}

/** Grid for a list step: the list, then its example column. */
export function exampleColumnGridClass(boxShown: boolean): string {
  return boxShown
    ? "grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(220px,300px)] md:gap-x-7"
    : "grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] md:gap-x-7";
}

/** The worksheet's example list for step 1, with its specificity examples. */
export function Step1Example({ note, toggle }: ExampleBoxProps) {
  return (
    <section
      aria-label="Example risks"
      className={EXAMPLE_BOX_CLASS}
    >
      <ExampleHeading note={note} toggle={toggle} />
      <ul className="text-[13.5px] italic text-rm-muted">
        {EXAMPLE_PLAN.map((r) => (
          <li key={r.text} className="py-0.5">
            {r.text}
          </li>
        ))}
      </ul>
      <div className="mt-2 border-t border-rm-divider pt-2 text-[12.5px] leading-snug">
        <p className="mb-1 font-semibold text-rm-ink">{BE_SPECIFIC_HEADING}</p>
        <ul className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1">
          <li className="contents">
            <X size={14} strokeWidth={2.5} className="mt-px text-rm-red-text" aria-hidden />
            <span>
              <span className="sr-only">Too vague: </span>
              {`"${VAGUE_EXAMPLE}" is not specific`}
            </span>
          </li>
          {BOX_SPECIFIC_EXAMPLES.map((s) => (
            <li key={s} className="contents">
              <Check size={14} strokeWidth={2.5} className="mt-px text-rm-green-text" aria-hidden />
              <span>
                <span className="sr-only">Specific: </span>
                {`"${s}"`}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Example resources for step 3, beside its add field. */
export function ResourcesExample({ note, toggle }: ExampleBoxProps) {
  return (
    <section
      aria-label="Example resources"
      className={EXAMPLE_BOX_CLASS}
    >
      <ExampleHeading note={note} toggle={toggle} />
      <ul className="text-[13.5px] italic text-rm-muted">
        {EXAMPLE_RESOURCES.map((r) => (
          <li key={r} className="py-0.5">
            {r}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** An example risk drawn in a matrix cell. */
export function ExampleChip({ text }: { text: string }) {
  return (
    <div className="pointer-events-none mt-1 select-none">
      <div className="rm-dashed rounded-md px-2 py-1 text-[13px] leading-snug italic text-rm-muted [--rm-dash-color:color-mix(in_srgb,var(--rm-ink)_60%,transparent)]">
        {text}
      </div>
      <ExampleLabel className="mt-0.5 pl-1" />
    </div>
  );
}

function ExampleMitigationList({ items }: { items: readonly ExampleMitigation[] }) {
  return (
    <ul>
      {items.map((m) => (
        <li key={m.text} className="flex items-start gap-1.5 px-1 py-0.5 text-[13.5px] leading-snug">
          <Star
            size={13}
            strokeWidth={1.75}
            className={cn("mt-[3px] shrink-0", m.starred ? "text-rm-star" : "text-rm-muted-2")}
            fill={m.starred ? "currentColor" : "none"}
            aria-hidden
          />
          <span>
            {m.starred ? <span className="sr-only">Starred: </span> : null}
            {m.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A read-only risk card laid out like step 4's. `ghost` draws it without a
 * fill, in gray text, for the example inside step 4's dashed example box.
 */
export function ExampleRiskCard({
  risk,
  ghost = false,
}: {
  risk: ExampleRisk;
  ghost?: boolean;
}) {
  const tier = exampleTier(risk.cellKey);
  return (
    <div>
      <div
        className={cn(
          "rounded-r-md border-l-4 px-3 pb-3 pt-2 sm:px-4",
          GROUP_STRIPE_CLASS[tier],
          ghost
            ? // No fill of its own: the gray behind it shows through, so
              // the person's own white cards stand out from the example.
              // The dashed box around the whole example marks it.
              "text-rm-muted"
            : "bg-rm-surface text-rm-ink shadow-[var(--rm-shadow-1)]",
        )}
      >
        <p className={cn("px-1 text-[15px] font-medium leading-snug", ghost && "italic")}>
          {risk.text}
        </p>
        <div className="mt-1.5 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {(["reduce", "prepare"] as const).map((k) => (
            <div key={k} className="min-w-0">
              <p className="mb-0.5 px-1 text-[13px] leading-snug text-rm-muted-2">
                {MITIGATION_PROMPTS[k]}
              </p>
              <ExampleMitigationList items={risk[k]} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Example risks under their tier labels, highest risk first, as step 3 groups them. */
export function ExampleTiers({
  risks,
  ghost = false,
}: {
  risks: readonly ExampleRisk[];
  ghost?: boolean;
}) {
  const sections = COLOR_GROUPS.map((group) => ({
    group,
    risks: risks.filter((r) => exampleTier(r.cellKey) === group.key),
  })).filter((s) => s.risks.length > 0);
  return (
    <div className="space-y-1">
      {sections.map(({ group, risks: inTier }) => (
        <section key={group.key} aria-label={group.label}>
          <p
            className={cn(
              "px-3 pb-2 pt-3 text-xs font-semibold uppercase tracking-wide sm:text-sm",
              GROUP_LABEL_TEXT_CLASS[group.key],
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              {group.label}
              <CountBadge count={inTier.length} />
            </span>
          </p>
          <div className="space-y-2 px-3 pb-3">
            {inTier.map((r) => (
              <ExampleRiskCard key={r.text} risk={r} ghost={ghost} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** A read-only 3x3 matrix holding the example risks. */
export function ExampleMatrix({
  cells,
}: {
  cells: Readonly<Record<CellKey, string[]>>;
}) {
  return (
    <table className="w-full table-fixed border-collapse text-[13px]">
      <thead>
        <tr>
          <td className="w-8 sm:w-10" />
          {COL_LABELS.map((label) => (
            <th
              key={label}
              scope="col"
              className="px-1 pb-1.5 text-center text-xs font-medium text-rm-ink sm:text-sm"
            >
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ROW_LABELS.map((rowLabel, row) => (
          <tr key={rowLabel}>
            <th scope="row" className="px-0 align-middle text-xs font-medium text-rm-ink sm:text-sm">
              <span className="inline-block whitespace-nowrap [writing-mode:vertical-rl] rotate-180">
                {rowLabel}
              </span>
            </th>
            {[0, 1, 2].map((col) => {
              const key = `${row}-${col}` as CellKey;
              return (
                <td
                  key={col}
                  className={cn(
                    CELL_BG_CLASSES[row][col],
                    "h-20 border border-rm-border p-1 align-top",
                  )}
                >
                  {(cells[key] ?? []).map((t) => (
                    <div
                      key={t}
                      className={cn(
                        "mb-1 rounded-md border px-2 py-1 leading-snug text-rm-ink",
                        CELL_RISK_CARD_CLASS,
                      )}
                    >
                      {t}
                    </div>
                  ))}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The starred items of some example risks, grouped by tier the way the
 * Actions panel groups them. `ghost` draws them gray and italic, for the
 * example inside the panel; otherwise they look like real actions.
 */
export function ExampleActionGroups({
  risks,
  ghost = false,
}: {
  risks: readonly ExampleRisk[];
  ghost?: boolean;
}) {
  const byTier = new Map<ColorGroupKey, string[]>();
  for (const r of risks) {
    for (const m of [...r.reduce, ...r.prepare]) {
      if (!m.starred) continue;
      const tier = exampleTier(r.cellKey);
      byTier.set(tier, [...(byTier.get(tier) ?? []), m.text]);
    }
  }
  return (
    <div className="space-y-2.5">
      {COLOR_GROUPS.filter((g) => byTier.has(g.key)).map((g) => (
        <div key={g.key}>
          <p
            className={cn(
              "mb-1 px-1 text-xs font-semibold uppercase tracking-wide",
              GROUP_LABEL_TEXT_CLASS[g.key],
            )}
          >
            {ACTION_GROUP_LABEL[g.key]}
          </p>
          <div
            className={cn(
              "rounded-r-md border-l-4 px-1 py-1",
              GROUP_STRIPE_CLASS[g.key],
              ghost
                ? "italic text-rm-muted"
                : "bg-rm-surface text-rm-ink shadow-[var(--rm-shadow-1)]",
            )}
          >
            <ExampleMitigationList
              items={(byTier.get(g.key) ?? []).map((text) => ({ text, starred: true }))}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The Actions panel's example: starred items from the risks step 4's
 * example shows, so the two examples tell one story.
 */
export function ExampleActions({ note, toggle }: ExampleBoxProps) {
  const shown: readonly string[] = PLAN_EXAMPLE_RISKS;
  return (
    <section
      aria-label="Example actions"
      className={cn(EXAMPLE_BORDER_CLASS, "px-2.5 pb-2.5 pt-2")}
    >
      <ExampleHeading note={note} toggle={toggle} />
      <ExampleActionGroups
        risks={EXAMPLE_PLAN.filter((p) => shown.includes(p.text))}
        ghost
      />
    </section>
  );
}

/** The example resources as a plain list, for the example plan dialog. */
export function ExampleResourceList() {
  return (
    <ul className="space-y-1">
      {EXAMPLE_RESOURCES.map((r) => (
        <li
          key={r}
          className="flex items-center gap-2 rounded-[5px] border border-rm-border bg-rm-surface px-2 py-1.5 text-[14px] leading-snug text-rm-ink shadow-[var(--rm-shadow-1)]"
        >
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-rm-muted-2" />
          {r}
        </li>
      ))}
    </ul>
  );
}

/** The plan step before your first idea: two example cards. */
export function PlanExample({ note, toggle }: ExampleBoxProps) {
  const risks = EXAMPLE_PLAN.filter((r) =>
    (PLAN_EXAMPLE_RISKS as readonly string[]).includes(r.text),
  );
  return (
    <section
      aria-label="Example plan"
      // No top border: it always follows step 4's instructions, whose
      // bottom edge already separates them.
      className="min-w-0 bg-rm-well p-3 last:rounded-b-md"
    >
      {/* One dashed box around the whole example, like steps 1 and 3. */}
      <div className="rm-dashed rounded-lg pb-1 pt-2.5">
        <div className="px-3">
          <ExampleHeading note={note} toggle={toggle} />
        </div>
        <ExampleTiers risks={risks} ghost />
      </div>
    </section>
  );
}

/**
 * The plan step's example: two cards ahead of the person's own, with the
 * box's own Hide examples button. Step 4 is wide and busy, so its toggle is
 * a bordered button rather than a text link. While nothing is placed, the
 * "your risks will show up here" slot follows the example, so the step
 * still says where the person's own cards go. Once hidden, Show examples
 * goes where the eye already is: inside that slot while nothing is placed,
 * or above the cards after.
 */
export function PlanExampleArea({
  example,
  empty,
  nothingPlaced,
}: {
  example: StepExample;
  /** True until the first idea is written. */
  empty: boolean;
  /** No risk is on the matrix yet, so there are no cards to sit under. */
  nothingPlaced: boolean;
}) {
  const toggle = useExampleToggle(example, "button");
  if (example.shown) {
    return (
      <>
        <PlanExample note={empty} toggle={toggle} />
        {nothingPlaced ? <MitigationsTablePlaceholder afterExample /> : null}
      </>
    );
  }
  if (nothingPlaced) {
    return <MitigationsTablePlaceholder embeddedInStepSection action={toggle} />;
  }
  return (
    <div className="bg-rm-well px-3 py-3">{toggle}</div>
  );
}
