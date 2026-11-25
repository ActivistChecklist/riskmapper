"use client";

import React, { useRef } from "react";
import AddField from "./AddField";
import LineShell from "./LineShell";
import StepSection from "./StepSection";
import GuidanceBrief from "./guidance/GuidanceBrief";
import { useGuidance } from "./guidance/GuidanceContext";
import { ResourcesExample } from "./guidance/examples";
import {
  ADD_RESOURCE_PLACEHOLDER,
  STEP_3,
  STEP_TITLES,
} from "./guidance/guidanceCopy";
import type { ResourceLine } from "./types";

export type ResourcesSectionProps = {
  resources: ResourceLine[];
  onAdd: (texts: string[]) => void;
  onChange: (id: string, text: string) => void;
  /** Returns false when focus should move to the add field. */
  onKeyDown: (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    resource: ResourceLine,
  ) => boolean;
  onBlur: (e: React.FocusEvent<HTMLTextAreaElement>, resource: ResourceLine) => void;
  /** Copy control on the step header. */
  actions?: React.ReactNode;
  className?: string;
};

/**
 * Step 3: a brainstorm of what the group has on its side, built like
 * step 1's list. Resources aren't placed anywhere, so they have no grip.
 */
export default function ResourcesSection({
  resources,
  onAdd,
  onChange,
  onKeyDown,
  onBlur,
  actions,
  className,
}: ResourcesSectionProps) {
  const { enabled: guidance } = useGuidance();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const showExample =
    guidance && !resources.some((r) => r.text.trim().length > 0);

  return (
    <StepSection
      step={3}
      actions={actions}
      readingWidth={false}
      className={className}
      title={STEP_TITLES[3]}
      guidance={<GuidanceBrief lead={STEP_3.lead} more={STEP_3.more} />}
    >
      <div
        className={
          showExample
            ? "grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(220px,300px)] md:gap-x-7"
            : undefined
        }
      >
        <div
          className="flex w-full cursor-text flex-col px-3 py-2.5 sm:px-4 sm:py-3"
          onClick={(e) => {
            if (e.target === e.currentTarget) fieldRef.current?.focus();
          }}
        >
          <div className="w-full max-w-[46ch]">
            {resources.length > 0 ? (
              <ul aria-label="Resources">
                {resources.map((r) => (
                  <li key={r.id}>
                    <LineShell
                      className={
                        r.text === ""
                          ? "my-1 border-transparent bg-transparent"
                          : "my-1 border-rm-border bg-rm-line"
                      }
                      leftAffordance={
                        <span
                          aria-hidden
                          className="flex w-[18px] shrink-0 items-center justify-center self-stretch sm:w-[22px]"
                        >
                          <span className="size-1.5 rounded-full bg-rm-muted-2" />
                        </span>
                      }
                      textareaProps={{
                        lineId: r.id,
                        value: r.text,
                        ariaLabel: "Resource",
                        onChange: (e) => onChange(r.id, e.target.value),
                        onKeyDown: (e) => {
                          if (!onKeyDown(e, r)) fieldRef.current?.focus();
                        },
                        onBlur: (e) => onBlur(e, r),
                        className: "max-sm:pl-0 max-sm:pr-1 sm:pl-1.5 sm:pr-1.5",
                      }}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
            <AddField
              ref={fieldRef}
              label="Add a resource"
              placeholder={ADD_RESOURCE_PLACEHOLDER}
              onAdd={onAdd}
            />
          </div>
        </div>
        {showExample ? (
          <div className="px-3 pb-3 sm:px-4 md:pl-0 md:pt-3">
            <ResourcesExample />
          </div>
        ) : null}
      </div>
    </StepSection>
  );
}
