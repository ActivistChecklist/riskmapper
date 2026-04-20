"use client";

import React, { useLayoutEffect, useMemo, useRef } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff } from "lucide-react";
import MitigationLineRow from "./MitigationLineRow";
import MitigationsTableHeaderRow from "./MitigationsTableHeaderRow";
import PointerAddLineButton from "./PointerAddLineButton";
import RiskLineRow from "./RiskLineRow";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  COLOR_GROUPS,
  type ColorGroup,
  GROUP_HEADER_CLASS,
  POINTER_ADD_ROW_HOVER_CLASSES,
} from "./constants";
import { cn } from "@/lib/utils";
import {
  categorizedRiskRowKey,
  isMitigationColumnEmptyBackgroundClick,
} from "./riskMatrixUtils";
import type {
  CellKey,
  CategorizedRevealHiddenState,
  CollapsedState,
  ColorGroupKey,
  GridLine,
  SubLine,
} from "./types";

export type CategorizedRiskGroupsProps = {
  anyRisks: boolean;
  risksByColor: Record<string, { line: GridLine; cellKey: CellKey }[]>;
  collapsed: CollapsedState;
  setCollapsed: React.Dispatch<React.SetStateAction<CollapsedState>>;
  hiddenCategorizedRiskKeys: string[];
  categorizedRevealHidden: CategorizedRevealHiddenState;
  onToggleCategorizedRiskHidden: (cellKey: CellKey, lineId: string) => void;
  onToggleCategorizedRevealHidden: (groupKey: ColorGroupKey) => void;
  onChangeRisk: (loc: CellKey, id: string, text: string) => void;
  onRiskKeyDown: (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    cellKey: CellKey,
    line: GridLine,
  ) => void;
  onChangeSub: (
    cellKey: CellKey,
    parentLineId: string,
    subType: "reduce" | "prepare",
    subId: string,
    text: string,
  ) => void;
  onSubKeyDown: (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    cellKey: CellKey,
    parentLineId: string,
    subType: "reduce" | "prepare",
    subLine: SubLine,
  ) => void;
  onToggleStar: (
    cellKey: CellKey,
    parentLineId: string,
    subType: "reduce" | "prepare",
    subId: string,
  ) => void;
  onPointerAddMitigationSubLine: (
    cellKey: CellKey,
    parentLineId: string,
    subType: "reduce" | "prepare",
  ) => void;
  /** Tucked under a {@link StepSection} primary header — no outer top radius. */
  embeddedInStepSection?: boolean;
};

type Section = { group: ColorGroup; risks: { line: GridLine; cellKey: CellKey }[] };

export default function CategorizedRiskGroups({
  anyRisks,
  risksByColor,
  collapsed,
  setCollapsed,
  hiddenCategorizedRiskKeys,
  categorizedRevealHidden,
  onToggleCategorizedRiskHidden,
  onToggleCategorizedRevealHidden,
  onChangeRisk,
  onRiskKeyDown,
  onChangeSub,
  onSubKeyDown,
  onToggleStar,
  onPointerAddMitigationSubLine,
  embeddedInStepSection = false,
}: CategorizedRiskGroupsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLDivElement>(null);

  const sections = useMemo((): Section[] => {
    return COLOR_GROUPS.flatMap((group) => {
      const risks = risksByColor[group.key] || [];
      if (risks.length === 0) return [];
      return [{ group, risks }];
    });
  }, [risksByColor]);

  const hiddenSet = useMemo(
    () => new Set(hiddenCategorizedRiskKeys),
    [hiddenCategorizedRiskKeys],
  );

  const sectionsWithDisplay = useMemo(() => {
    return sections.map(({ group, risks }) => {
      const reveal = categorizedRevealHidden[group.key];
      const visible: { line: GridLine; cellKey: CellKey }[] = [];
      const hiddenShown: { line: GridLine; cellKey: CellKey }[] = [];
      for (const r of risks) {
        const k = categorizedRiskRowKey(r.cellKey, r.line.id);
        if (!hiddenSet.has(k)) {
          visible.push(r);
        } else if (reveal) {
          hiddenShown.push(r);
        }
      }
      const displayRisks = [...visible, ...hiddenShown];
      const hiddenInGroupCount = risks.filter((r) =>
        hiddenSet.has(categorizedRiskRowKey(r.cellKey, r.line.id)),
      ).length;
      return { group, risks, displayRisks, hiddenInGroupCount };
    });
  }, [sections, hiddenSet, categorizedRevealHidden]);

  const riskRowOffsetByGroup = useMemo(() => {
    let acc = 0;
    const m = new Map<ColorGroupKey, number>();
    for (const { group, displayRisks } of sectionsWithDisplay) {
      m.set(group.key, acc);
      acc += displayRisks.length;
    }
    return m;
  }, [sectionsWithDisplay]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const thead = theadRef.current;
    if (!root || !thead) return;
    const sync = () => {
      root.style.setProperty("--rm-mit-thead-h", `${thead.offsetHeight}px`);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(thead);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--rm-mit-thead-h");
    };
  }, [sectionsWithDisplay]);

  if (!anyRisks) return null;

  return (
    <div
      ref={rootRef}
      className={cn(
        "min-w-0 bg-white [--rm-mit-thead-h:3.25rem]",
        embeddedInStepSection
          ? "mb-0 rounded-t-none rounded-b-md border border-x-0 border-b border-black/10 border-t border-black/10"
          : "mb-3.5 rounded-md border border-black/10",
      )}
    >
      <MitigationsTableHeaderRow ref={theadRef} />

      {sectionsWithDisplay.map(
        ({ group, risks, displayRisks, hiddenInGroupCount }, sectionIndex) => {
          const isCollapsed = collapsed[group.key];
          const reveal = categorizedRevealHidden[group.key];
          return (
            <section
              key={group.key}
              className={sectionIndex > 0 ? "border-t border-black/10" : undefined}
            >
              <div
                role="button"
                tabIndex={0}
                aria-expanded={!isCollapsed}
                onClick={() =>
                  setCollapsed((c) => ({ ...c, [group.key]: !c[group.key] }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setCollapsed((c) => ({ ...c, [group.key]: !c[group.key] }));
                  }
                }}
                className="sticky top-[var(--rm-mit-thead-h)] z-20 flex w-full cursor-pointer select-none items-center justify-between gap-3 border-b border-black/8 bg-zinc-100 px-3 py-2 shadow-[0_1px_0_rgba(0,0,0,0.03)]"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {isCollapsed ? (
                    <ChevronRight size={14} aria-hidden />
                  ) : (
                    <ChevronDown size={14} aria-hidden />
                  )}
                  <span
                    aria-hidden
                    className={[
                      "inline-block h-6 min-w-[2.75rem] shrink-0 rounded-full border border-black/20 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)]",
                      GROUP_HEADER_CLASS[group.key],
                    ].join(" ")}
                  />
                  <span className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide sm:text-sm">
                    {group.label}
                  </span>
                  <span className="shrink-0 text-xs opacity-85 sm:text-sm">
                    ({risks.length})
                  </span>
                </div>
                <div className="flex max-w-[min(100%,20rem)] shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                  {hiddenInGroupCount > 0 && !isCollapsed ? (
                    <button
                      type="button"
                      className="w-full rounded-sm px-1 py-0.5 text-left text-[11px] font-medium text-zinc-800 underline decoration-zinc-600/90 underline-offset-2 hover:bg-black/[0.04] hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/40 sm:w-auto sm:text-right sm:text-xs"
                      aria-pressed={reveal}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleCategorizedRevealHidden(group.key);
                      }}
                    >
                      {reveal ? "Hide hidden risks" : "Show hidden risks"}
                    </button>
                  ) : null}
                  {group.key === "green" && isCollapsed && hiddenInGroupCount === 0 ? (
                    <span className="max-w-[min(100%,12rem)] text-right text-[11px] font-normal normal-case leading-snug tracking-normal text-zinc-600 sm:text-xs">
                      Hidden by default. Click to show.
                    </span>
                  ) : null}
                </div>
              </div>

              {!isCollapsed && (
                <div className="bg-white px-0 pb-2">
                  {displayRisks.map((r, i) => {
                    const reduce = r.line.reduce || [];
                    const prepare = r.line.prepare || [];
                    const rowIdx =
                      (riskRowOffsetByGroup.get(group.key) ?? 0) + i;
                    const stripe = rowIdx % 2 === 1 ? "bg-zinc-50/90" : "bg-white";
                    const rowKey = categorizedRiskRowKey(r.cellKey, r.line.id);
                    const isMarkedHidden = hiddenSet.has(rowKey);
                    const dimHiddenButRevealed = isMarkedHidden && reveal;
                    return (
                      <div
                        key={r.line.id}
                        className={[
                          "group/riskrow grid items-start gap-4 px-3 py-2 [grid-template-columns:minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]",
                          stripe,
                          i === 0 ? "" : "border-t border-black/5",
                        ].join(" ")}
                      >
                        <div
                          className={[
                            "min-w-0 rounded-[5px] px-1.5 py-1",
                            dimHiddenButRevealed
                              ? "border border-zinc-300/90 bg-zinc-100"
                              : [
                                  GROUP_HEADER_CLASS[group.key],
                                  "border border-black/8",
                                ].join(" "),
                          ].join(" ")}
                        >
                          <div className="flex min-w-0 items-start gap-1">
                            <div className="min-w-0 flex-1">
                              <RiskLineRow
                                line={r.line}
                                cellKey={r.cellKey}
                                onChange={onChangeRisk}
                                onKeyDown={onRiskKeyDown}
                              />
                            </div>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="mt-0.5 shrink-0 rounded p-1 text-zinc-800 opacity-100 hover:bg-black/10 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/50 md:opacity-0 md:group-hover/riskrow:opacity-100"
                                    aria-label={
                                      isMarkedHidden
                                        ? "Always show this risk in the list"
                                        : "Hide this risk from the list"
                                    }
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onToggleCategorizedRiskHidden(
                                        r.cellKey,
                                        r.line.id,
                                      );
                                    }}
                                  >
                                    {isMarkedHidden ? (
                                      <Eye size={16} strokeWidth={2} aria-hidden />
                                    ) : (
                                      <EyeOff size={16} strokeWidth={2} aria-hidden />
                                    )}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  {isMarkedHidden
                                    ? "Show this risk in the list again"
                                    : "Hide this risk from the list (it stays in the matrix)"}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </div>
                        <div
                          role="presentation"
                          data-testid={`mitigation-reduce-${r.line.id}`}
                          className="group flex min-h-0 min-w-0 flex-col"
                          onClick={(e) => {
                            if (!isMitigationColumnEmptyBackgroundClick(e.target)) {
                              return;
                            }
                            onPointerAddMitigationSubLine(
                              r.cellKey,
                              r.line.id,
                              "reduce",
                            );
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            {reduce.map((s, j) => (
                              <MitigationLineRow
                                key={s.id}
                                subLine={s}
                                cellKey={r.cellKey}
                                parentLineId={r.line.id}
                                subType="reduce"
                                placeholder={j === 0 ? "Start typing" : undefined}
                                onChange={onChangeSub}
                                onKeyDown={onSubKeyDown}
                                onToggleStar={onToggleStar}
                              />
                            ))}
                          </div>
                          <div
                            className={[
                              "mt-0.5 flex shrink-0 justify-start",
                              POINTER_ADD_ROW_HOVER_CLASSES,
                            ].join(" ")}
                          >
                            <PointerAddLineButton
                              ariaLabel="Add another reduce mitigation"
                              onTrigger={() =>
                                onPointerAddMitigationSubLine(
                                  r.cellKey,
                                  r.line.id,
                                  "reduce",
                                )
                              }
                            />
                          </div>
                        </div>
                        <div
                          role="presentation"
                          data-testid={`mitigation-prepare-${r.line.id}`}
                          className="group flex min-h-0 min-w-0 flex-col"
                          onClick={(e) => {
                            if (!isMitigationColumnEmptyBackgroundClick(e.target)) {
                              return;
                            }
                            onPointerAddMitigationSubLine(
                              r.cellKey,
                              r.line.id,
                              "prepare",
                            );
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            {prepare.map((s, j) => (
                              <MitigationLineRow
                                key={s.id}
                                subLine={s}
                                cellKey={r.cellKey}
                                parentLineId={r.line.id}
                                subType="prepare"
                                placeholder={j === 0 ? "Start typing" : undefined}
                                onChange={onChangeSub}
                                onKeyDown={onSubKeyDown}
                                onToggleStar={onToggleStar}
                              />
                            ))}
                          </div>
                          <div
                            className={[
                              "mt-0.5 flex shrink-0 justify-start",
                              POINTER_ADD_ROW_HOVER_CLASSES,
                            ].join(" ")}
                          >
                            <PointerAddLineButton
                              ariaLabel="Add another prepare mitigation"
                              onTrigger={() =>
                                onPointerAddMitigationSubLine(
                                  r.cellKey,
                                  r.line.id,
                                  "prepare",
                                )
                              }
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        },
      )}
    </div>
  );
}
