"use client";

import React, { useRef, useState } from "react";
import AddField from "./AddField";
import LineRow from "./LineRow";
import GuidanceBrief from "./guidance/GuidanceBrief";
import { useGuidance, useStepExample } from "./guidance/GuidanceContext";
import VagueRiskTip from "./guidance/VagueRiskTip";
import {
  ExampleColumn,
  Step1Example,
  exampleColumnGridClass,
} from "./guidance/examples";
import {
  ADD_RISK_PLACEHOLDER,
  STEP_1,
  STEP_TITLES,
  isVagueRisk,
  vagueRiskTipText,
} from "./guidance/guidanceCopy";
import { DROP_TARGET_OUTLINE_CLASSES } from "./constants";
import StepSection from "./StepSection";
import type { DragState, DropIndicator, LineLocation, PoolLine } from "./types";

export type RiskPoolSectionProps = {
  pool: PoolLine[];
  /** How many risks with text sit in the matrix, for the step 1 example. */
  placedRiskCount: number;
  dragState: DragState | null;
  dragOverTarget: string | null;
  dropIndicator: DropIndicator | null;
  /** Adds risks from the add field; returns the ones that stayed in the pool. */
  onAddRisks: (texts: string[]) => PoolLine[];
  onChange: (loc: LineLocation, id: string, text: string) => void;
  onKeyDown: (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    loc: LineLocation,
    line: PoolLine,
  ) => void;
  onBlur: (
    e: React.FocusEvent<HTMLTextAreaElement>,
    loc: LineLocation,
    line: PoolLine,
  ) => void;
  onGripPointerDown: (e: React.PointerEvent, id: string) => void;
  /** Copy control on the step 1 header. */
  step1Actions?: React.ReactNode;
};

function CloseLook() {
  const { strong, text, questions } = STEP_1.closeLook;
  return (
    <div className="mt-3">
      <p>
        <strong className="font-semibold text-rm-ink">{strong}</strong> {text}
      </p>
      <dl className="mt-2 grid gap-x-5 gap-y-2 sm:grid-cols-2">
        {questions.map((q) => (
          <div key={q.label}>
            <dt className="font-semibold text-rm-ink">{q.label}</dt>
            <dd>{q.question}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** A drop line at the end of the list, where the add field begins. */
function EndDropLine() {
  return (
    <div
      data-testid="pool-drop-indicator-end"
      aria-hidden
      className="mx-px my-0.5 h-0.5 rounded-full bg-rm-ink"
    />
  );
}

export default function RiskPoolSection({
  pool,
  placedRiskCount,
  dragState,
  dragOverTarget,
  dropIndicator,
  onAddRisks,
  onChange,
  onKeyDown,
  onBlur,
  onGripPointerDown,
  step1Actions,
}: RiskPoolSectionProps) {
  const { enabled: guidance } = useGuidance();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [focusedLineId, setFocusedLineId] = useState<string | null>(null);
  const [tipLineId, setTipLineId] = useState<string | null>(null);
  // Only the first short entry gets the tip. After that it is a lesson
  // already given, so no later entry gets one, even once it is put away.
  const tipGiven = useRef(false);

  // The pool keeps a blank entry at its end for the older type-here line.
  // The add field took over that job, so a blank entry shows only while
  // someone is typing in it (after clearing a risk's text, say).
  const visible = pool.filter((l) => l.text !== "" || l.id === focusedLineId);
  const visibleIds = new Set(visible.map((l) => l.id));
  const poolIndicator = dropIndicator?.loc === "pool" ? dropIndicator : null;
  const dropAtEnd =
    poolIndicator !== null &&
    (poolIndicator.rowId === null || !visibleIds.has(poolIndicator.rowId));

  const riskTextCount =
    pool.filter((l) => l.text.trim().length > 0).length + placedRiskCount;
  const example = useStepExample("risks", riskTextCount === 0);

  // The tip follows its entry: it goes if the entry is edited to something
  // specific, dragged out of the pool, or deleted.
  const tipLine = tipLineId ? pool.find((l) => l.id === tipLineId) : undefined;
  const tipText =
    guidance && tipLine && isVagueRisk(tipLine.text) ? tipLine.text.trim() : null;

  const considerTip = (line: PoolLine) => {
    if (tipGiven.current || !guidance) return;
    const text = line.text.trim();
    if (text && isVagueRisk(text)) {
      tipGiven.current = true;
      setTipLineId(line.id);
    }
  };

  const dismissTip = () => {
    setTipLineId(null);
    fieldRef.current?.focus();
  };

  const handleAdd = (texts: string[]) => {
    const added = onAddRisks(texts);
    if (added.length === 1) considerTip(added[0]);
  };

  const handleKeyDown: RiskPoolSectionProps["onKeyDown"] = (e, loc, line) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      considerTip(line);
      // Enter at the end of a risk moves on to the add field, the one place
      // new risks start. Elsewhere in the text it still splits the risk.
      const el = e.target as HTMLTextAreaElement;
      const atEnd =
        el.selectionStart === el.selectionEnd &&
        (el.selectionStart ?? 0) >= line.text.length;
      if (atEnd) {
        e.preventDefault();
        fieldRef.current?.focus();
        return;
      }
    }
    onKeyDown(e, loc, line);
  };

  const handleBlur: RiskPoolSectionProps["onBlur"] = (e, loc, line) => {
    considerTip(line);
    onBlur(e, loc, line);
  };

  return (
    <StepSection
      step={1}
      actions={step1Actions}
      readingWidth={false}
      className="mb-6"
      title={STEP_TITLES[1]}
      guidance={
        <GuidanceBrief
          lead={STEP_1.lead}
          more={STEP_1.more}
          extra={<CloseLook />}
        />
      }
    >
      <div className={guidance ? exampleColumnGridClass(example.shown) : undefined}>
        {/* First in the page, so on phones the example sits above the
            list and the list stays next to the matrix for dragging. From
            md up it moves beside the list. */}
        {guidance ? (
          <ExampleColumn
            example={example}
            empty={riskTextCount === 0}
            box={Step1Example}
          />
        ) : null}
        <div
          data-drop-target="pool"
          onClick={(e) => {
            if (e.target === e.currentTarget) fieldRef.current?.focus();
          }}
          className={[
            "flex w-full cursor-text flex-col px-3 py-2.5 sm:px-4 sm:py-3",
            dragOverTarget === "pool" ? DROP_TARGET_OUTLINE_CLASSES : "",
          ].join(" ")}
        >
          <div className="w-full max-w-[46ch]">
            <div
              className="min-h-0"
              onFocus={(e) =>
                setFocusedLineId(
                  (e.target as HTMLElement).getAttribute("data-line-id"),
                )
              }
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setFocusedLineId(null);
                }
              }}
            >
              {visible.map((line) => (
                <React.Fragment key={line.id}>
                  <LineRow
                    line={line}
                    loc="pool"
                    isDragging={!!dragState && dragState.id === line.id}
                    dropEdge={
                      poolIndicator?.rowId === line.id ? poolIndicator.edge : null
                    }
                    onChange={onChange}
                    onKeyDown={handleKeyDown}
                    onBlur={handleBlur}
                    onGripPointerDown={onGripPointerDown}
                    inCell={false}
                  />
                  {tipText && line.id === tipLineId ? (
                    <VagueRiskTip text={tipText} onDismiss={dismissTip} />
                  ) : null}
                </React.Fragment>
              ))}
              {dropAtEnd ? <EndDropLine /> : null}
            </div>
            <AddField
              ref={fieldRef}
              label="Add a risk"
              placeholder={ADD_RISK_PLACEHOLDER}
              onAdd={handleAdd}
            />
            <p role="status" className="sr-only">
              {tipText ? `Tip: ${vagueRiskTipText(tipText)}` : ""}
            </p>
          </div>
        </div>
      </div>
    </StepSection>
  );
}
