"use client";

import React from "react";
import { Check, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ACTION_GROUP_LABEL,
  CELL_BG_CLASSES,
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
  SPECIFIC_EXAMPLES,
  PLAN_EXAMPLE_RISKS,
  VAGUE_EXAMPLE,
  exampleTier,
  type ExampleMitigation,
  type ExampleRisk,
} from "./guidanceCopy";

/** The small "Example" label under each example. */
export function ExampleLabel({ className }: { className?: string }) {
  return (
    <span className={cn("block text-[11.5px] leading-tight text-rm-muted", className)}>
      {EXAMPLE_LABEL}
    </span>
  );
}

/** Heading of an example block: the tag, and that it leaves on its own. */
export function ExampleHeading({ note = true }: { note?: boolean }) {
  return (
    <p className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-xs text-rm-muted">
      <span className="font-semibold text-rm-ink">{EXAMPLE_LABEL}</span>
      {note ? <span>{EXAMPLE_GOES_AWAY}</span> : null}
    </p>
  );
}

/** The worksheet's example list for step 1, with its specificity examples. */
export function Step1Example() {
  return (
    <section
      aria-label="Example risks"
      className="rounded-lg border border-dashed border-rm-border-strong px-3 pb-3 pt-2"
    >
      <ExampleHeading />
      <ul className="text-[13.5px] italic text-rm-muted">
        {EXAMPLE_PLAN.map((r) => (
          <li key={r.text} className="py-0.5">
            {r.text}
          </li>
        ))}
      </ul>
      <div className="mt-2 border-t border-rm-divider pt-2 text-[12.5px] leading-snug">
        <p className="mb-1 font-semibold text-rm-ink">Be thorough</p>
        <ul className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1">
          <li className="contents">
            <X size={14} strokeWidth={2.5} className="mt-px text-rm-red-text" aria-hidden />
            <span>
              <span className="sr-only">Too vague: </span>
              {`"${VAGUE_EXAMPLE}" is not specific`}
            </span>
          </li>
          {SPECIFIC_EXAMPLES.map((s) => (
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
export function ResourcesExample() {
  return (
    <section
      aria-label="Example resources"
      className="rounded-lg border border-dashed border-rm-border-strong px-3 pb-3 pt-2"
    >
      <ExampleHeading />
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
      <div className="rounded-md border border-dashed border-rm-ink/35 px-2 py-1 text-[13px] leading-snug italic text-rm-muted">
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
 * A read-only risk card laid out like step 3's. `ghost` draws it dashed and
 * gray, for an example sitting where the person's own cards will go.
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
            ? "bg-rm-surface/60 text-rm-muted outline-[1.5px] -outline-offset-[1.5px] outline-dashed outline-rm-border-strong"
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
      {ghost ? <ExampleLabel className="mt-0.5 pl-2" /> : null}
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
            {group.label}{" "}
            <span className="font-normal normal-case text-rm-muted-2">({inTier.length})</span>
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
                      className="mb-1 rounded-md border border-rm-border bg-rm-line px-2 py-1 leading-snug text-rm-ink"
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

/** Starred example items, grouped the way the Actions panel groups them. */
export function ExampleActions() {
  const byTier = new Map<ColorGroupKey, string[]>();
  for (const r of EXAMPLE_PLAN) {
    for (const m of [...r.reduce, ...r.prepare]) {
      if (!m.starred) continue;
      const tier = exampleTier(r.cellKey);
      byTier.set(tier, [...(byTier.get(tier) ?? []), m.text]);
    }
  }
  return (
    <section
      aria-label="Example actions"
      className="rounded-lg border border-dashed border-rm-border-strong px-2.5 pb-2.5 pt-2"
    >
      <ExampleHeading />
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
            <div className={cn("rounded-r-md border-l-4 px-1 py-1 italic text-rm-muted", GROUP_STRIPE_CLASS[g.key])}>
              <ExampleMitigationList
                items={(byTier.get(g.key) ?? []).map((text) => ({ text, starred: true }))}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The plan step before your first idea: two example cards. */
export function PlanExample() {
  const risks = EXAMPLE_PLAN.filter((r) =>
    (PLAN_EXAMPLE_RISKS as readonly string[]).includes(r.text),
  );
  return (
    <section
      aria-label="Example plan"
      className="min-w-0 rounded-b-md border-t border-rm-border bg-rm-well pb-1 pt-2.5"
    >
      <div className="px-3">
        <ExampleHeading />
      </div>
      <ExampleTiers risks={risks} ghost />
    </section>
  );
}
