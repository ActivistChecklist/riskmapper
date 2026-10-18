"use client";

import React, { useId, useMemo } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, Plus } from "lucide-react";
import MitigationLineRow from "./MitigationLineRow";
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
  GROUP_LABEL_TEXT_CLASS,
  GROUP_STRIPE_CLASS,
  MITIGATION_PROMPTS,
} from "./constants";
import { cn } from "@/lib/utils";
import {
  mitigationListKey,
  type MitigationListRef,
} from "./useMitigationDrag";
import type { InsertionEdge } from "./dropPosition";
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
  /** Sub-line being dragged, dimmed in place while its preview follows the pointer. */
  draggingSubId: string | null;
  /** Insertion line for the current mitigation drag, keyed by its list. */
  mitigationDropEdge: (InsertionEdge & { listKey: string }) | null;
  onMitigationGripPointerDown: (
    e: React.PointerEvent,
    list: MitigationListRef,
    subLine: SubLine,
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
  draggingSubId,
  mitigationDropEdge,
  onMitigationGripPointerDown,
  embeddedInStepSection = false,
}: CategorizedRiskGroupsProps) {
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

  if (!anyRisks) return null;

  return (
    <div
      className={cn(
        "min-w-0 bg-rm-well",
        embeddedInStepSection
          ? "mb-0 rounded-t-none rounded-b-md border border-x-0 border-b border-rm-border border-t border-rm-border"
          : "mb-3.5 rounded-md border border-rm-border",
      )}
    >
      {sectionsWithDisplay.map(
        ({ group, risks, displayRisks, hiddenInGroupCount }, sectionIndex) => {
          const isCollapsed = collapsed[group.key];
          const reveal = categorizedRevealHidden[group.key];
          return (
            <section
              key={group.key}
              className={sectionIndex > 0 ? "border-t border-rm-divider" : undefined}
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
                // Sticks below the (md+ only) sticky title bar.
                // `--rm-topbar-h` falls back to 0px below md.
                className={cn(
                  // Solid well background so cards scrolling under the
                  // sticky label don't show through it.
                  "sticky top-[var(--rm-topbar-h,0px)] z-20 flex w-full cursor-pointer select-none items-center justify-between gap-3 bg-rm-well px-3 pt-3 pb-2",
                  GROUP_LABEL_TEXT_CLASS[group.key],
                )}
              >
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  {isCollapsed ? (
                    <ChevronRight size={14} aria-hidden />
                  ) : (
                    <ChevronDown size={14} aria-hidden />
                  )}
                  <span className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide sm:text-sm">
                    {group.label}
                  </span>
                  <span className="shrink-0 text-xs text-rm-muted-2 sm:text-sm">
                    ({risks.length})
                  </span>
                </div>
                <div className="flex max-w-[min(100%,20rem)] shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                  {group.key === "green" && isCollapsed ? (
                    <span className="max-w-[min(100%,12rem)] text-right text-[11px] font-normal normal-case leading-snug tracking-normal text-rm-muted-2 sm:text-xs">
                      Hidden by default. Click to show.
                    </span>
                  ) : null}
                </div>
              </div>

              {!isCollapsed && (
                <div className="space-y-2 px-3 pb-3">
                  {displayRisks.map((r) => {
                    const rowKey = categorizedRiskRowKey(r.cellKey, r.line.id);
                    const isMarkedHidden = hiddenSet.has(rowKey);
                    const dimHiddenButRevealed = isMarkedHidden && reveal;
                    return (
                      <div
                        key={r.line.id}
                        // The card's left stripe is the only place the tier
                        // color repeats, so it stays visible on every risk
                        // after the section label has scrolled away.
                        className={cn(
                          "group/riskrow rounded-r-md border-l-4 bg-rm-surface px-3 pt-2 pb-3 shadow-[var(--rm-shadow-1)] sm:px-4",
                          dimHiddenButRevealed
                            ? "border-l-rm-border-strong"
                            : GROUP_STRIPE_CLASS[group.key],
                        )}
                      >
                        <div className="min-w-0 rounded-[5px] px-1 transition-colors hover:bg-rm-surface-hover focus-within:bg-rm-surface-hover">
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
                                    className="mt-0.5 shrink-0 rounded p-1 text-rm-ink opacity-100 hover:bg-rm-surface-hover-2 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rm-ring md:opacity-0 md:group-hover/riskrow:opacity-100"
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
                        {/* Each risk carries its own copy of the two questions,
                            so the prompt is always beside the list it heads.
                            Side by side from sm up, stacked below that. */}
                        {/* From sm up the columns share two rows through
                            subgrid, so when one question wraps to two lines
                            both lists still start at the same height. */}
                        <div className="mt-1.5 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 sm:grid-rows-[auto_auto] sm:gap-y-0">
                          {(["reduce", "prepare"] as const).map((subType) => (
                            <MitigationColumn
                              key={subType}
                              subType={subType}
                              line={r.line}
                              cellKey={r.cellKey}
                              onChangeSub={onChangeSub}
                              onSubKeyDown={onSubKeyDown}
                              onToggleStar={onToggleStar}
                              onPointerAddMitigationSubLine={
                                onPointerAddMitigationSubLine
                              }
                              draggingSubId={draggingSubId}
                              mitigationDropEdge={mitigationDropEdge}
                              onMitigationGripPointerDown={
                                onMitigationGripPointerDown
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {hiddenInGroupCount > 0 ? (
                    <div className="pt-1">
                      <button
                        type="button"
                        className="rounded-sm px-1 py-0.5 text-left text-[11px] font-medium text-rm-ink underline decoration-rm-muted underline-offset-2 hover:bg-rm-surface-hover hover:text-rm-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rm-ring sm:text-xs"
                        aria-pressed={reveal}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleCategorizedRevealHidden(group.key);
                        }}
                      >
                        {reveal ? "Hide hidden risks" : "Show hidden risks"}
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </section>
          );
        },
      )}
    </div>
  );
}

type MitigationColumnProps = Pick<
  CategorizedRiskGroupsProps,
  | "onChangeSub"
  | "onSubKeyDown"
  | "onToggleStar"
  | "onPointerAddMitigationSubLine"
  | "draggingSubId"
  | "mitigationDropEdge"
  | "onMitigationGripPointerDown"
> & {
  subType: "reduce" | "prepare";
  line: GridLine;
  cellKey: CellKey;
};

function MitigationColumn({
  subType,
  line,
  cellKey,
  onChangeSub,
  onSubKeyDown,
  onToggleStar,
  onPointerAddMitigationSubLine,
  draggingSubId,
  mitigationDropEdge,
  onMitigationGripPointerDown,
}: MitigationColumnProps) {
  const promptId = useId();
  const list: MitigationListRef = { cellKey, parentLineId: line.id, subType };
  const listKey = mitigationListKey(list);
  const dropEdge =
    mitigationDropEdge?.listKey === listKey ? mitigationDropEdge : null;
  const subLines = line[subType] || [];
  const last = subLines[subLines.length - 1];
  // An empty trailing line already reads as the place to type (see
  // MitigationLineRow), so the add box only shows once every line has text.
  const showAddBox = !last || last.text !== "";
  return (
    <div
      role="group"
      aria-labelledby={promptId}
      data-testid={`mitigation-${subType}-${line.id}`}
      // The whole column, prompt included, is the drop zone for this list.
      data-mitigation-list={listKey}
      className="flex min-w-0 flex-col sm:row-span-2 sm:grid sm:grid-rows-subgrid"
      onClick={(e) => {
        if (!isMitigationColumnEmptyBackgroundClick(e.target)) return;
        onPointerAddMitigationSubLine(cellKey, line.id, subType);
      }}
    >
      <p
        id={promptId}
        className="mb-0.5 px-1 text-[13px] leading-snug text-rm-muted-2"
      >
        {MITIGATION_PROMPTS[subType]}
      </p>
      <div className="flex min-w-0 flex-col">
        {subLines.map((s) => (
          <MitigationLineRow
            key={s.id}
            subLine={s}
            cellKey={cellKey}
            parentLineId={line.id}
            subType={subType}
            placeholder="Add an idea"
            onChange={onChangeSub}
            onKeyDown={onSubKeyDown}
            onToggleStar={onToggleStar}
            isDragging={draggingSubId === s.id}
            dropEdge={dropEdge?.rowId === s.id ? dropEdge.edge : null}
            onGripPointerDown={onMitigationGripPointerDown}
          />
        ))}
        {showAddBox ? (
          <PointerAddLineButton
            ariaLabel={
              subType === "reduce"
                ? "Add a way to reduce the likelihood"
                : "Add a way to limit the harm"
            }
            onTrigger={() =>
              onPointerAddMitigationSubLine(cellKey, line.id, subType)
            }
            className="mt-0.5 self-start text-[13px] font-normal text-rm-muted-2"
          >
            <Plus size={13} strokeWidth={2.25} className="shrink-0" aria-hidden />
            <span>Add an idea</span>
          </PointerAddLineButton>
        ) : null}
      </div>
    </div>
  );
}
