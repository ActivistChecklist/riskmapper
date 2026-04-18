"use client";

import React, { useLayoutEffect, useMemo, useRef } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import MitigationLineRow from "./MitigationLineRow";
import MitigationsStep3Prompt from "./MitigationsStep3Prompt";
import MitigationsTableHeaderRow from "./MitigationsTableHeaderRow";
import RiskLineRow from "./RiskLineRow";
import {
  COLOR_GROUPS,
  type ColorGroup,
  GROUP_HEADER_CLASS,
} from "./constants";
import type {
  CellKey,
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
};

type Section = { group: ColorGroup; risks: { line: GridLine; cellKey: CellKey }[] };

export default function CategorizedRiskGroups({
  anyRisks,
  risksByColor,
  collapsed,
  setCollapsed,
  onChangeRisk,
  onRiskKeyDown,
  onChangeSub,
  onSubKeyDown,
  onToggleStar,
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

  const riskRowOffsetByGroup = useMemo(() => {
    let acc = 0;
    const m = new Map<ColorGroupKey, number>();
    for (const { group, risks } of sections) {
      m.set(group.key, acc);
      acc += risks.length;
    }
    return m;
  }, [sections]);

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
  }, [sections]);

  if (!anyRisks) return null;

  return (
    <div
      ref={rootRef}
      className="min-w-0 mb-3.5 rounded-md border border-black/10 bg-white [--rm-mit-thead-h:3.25rem]"
    >
      <MitigationsStep3Prompt />
      <MitigationsTableHeaderRow ref={theadRef} />

      {sections.map(({ group, risks }, sectionIndex) => {
        const isCollapsed = collapsed[group.key];
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
              <div className="flex min-w-0 items-center gap-2">
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
              {group.key === "green" && isCollapsed && (
                <span className="max-w-[min(100%,12rem)] shrink-0 text-right text-[11px] font-normal normal-case leading-snug tracking-normal text-zinc-500 sm:text-xs">
                  Hidden by default. Click to show.
                </span>
              )}
            </div>

            {!isCollapsed && (
              <div className="bg-white px-0 pb-2">
                {risks.map((r, i) => {
                  const reduce = r.line.reduce || [];
                  const prepare = r.line.prepare || [];
                  const rowIdx =
                    (riskRowOffsetByGroup.get(group.key) ?? 0) + i;
                  const stripe = rowIdx % 2 === 1 ? "bg-zinc-50/90" : "bg-white";
                  return (
                    <div
                      key={r.line.id}
                      className={[
                        "grid items-start gap-4 px-3 py-2 [grid-template-columns:minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]",
                        stripe,
                        i === 0 ? "" : "border-t border-black/5",
                      ].join(" ")}
                    >
                      <div
                        className={[
                          "min-w-0 rounded-[5px] border border-black/8 px-1.5 py-1",
                          GROUP_HEADER_CLASS[group.key],
                        ].join(" ")}
                      >
                        <RiskLineRow
                          line={r.line}
                          cellKey={r.cellKey}
                          onChange={onChangeRisk}
                          onKeyDown={onRiskKeyDown}
                        />
                      </div>
                      <div className="min-w-0">
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
                      <div className="min-w-0">
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
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
