"use client";

import React, { useRef } from "react";
import AddField from "./AddField";
import EmptySlot from "./EmptySlot";
import LineShell from "./LineShell";
import StepSection from "./StepSection";
import GuidanceBrief from "./guidance/GuidanceBrief";
import { useGuidance, useStepExample } from "./guidance/GuidanceContext";
import {
  ExampleColumn,
  ResourcesExample,
  exampleColumnGridClass,
} from "./guidance/examples";
import {
  ADD_RESOURCE_PLACEHOLDER,
  STEP_3,
  STEP_TITLES,
} from "./guidance/guidanceCopy";
import type { ResourceLine } from "./types";

/** What step 3 says while it has no resources, example or not. */
export const RESOURCES_EMPTY =
  "Add a resource in the box below. Your resources will show up here.";

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
  const empty = !resources.some((r) => r.text.trim().length > 0);
  const example = useStepExample("resources", empty);

  return (
    <StepSection
      step={3}
      actions={actions}
      readingWidth={false}
      className={className}
      title={STEP_TITLES[3]}
      guidance={
        <GuidanceBrief lead={STEP_3.lead} more={STEP_3.more} />
      }
    >
      {/* Gray body, white rows: the same as step 4 and the Actions
          panel, where the person's own entries are the white objects. */}
      <div
        className={
          guidance ? `bg-rm-well ${exampleColumnGridClass(example.shown)}` : "bg-rm-well"
        }
      >
        {/* First in the page so phones show it above the list, as step 1
            does; from md up it sits beside the list. */}
        {guidance ? (
          <ExampleColumn example={example} empty={empty} box={ResourcesExample} />
        ) : null}
        <div
          className="flex w-full cursor-text flex-col px-3 py-2.5 sm:px-4 sm:py-3"
          onClick={(e) => {
            if (e.target === e.currentTarget) fieldRef.current?.focus();
          }}
        >
          <div className="w-full max-w-[46ch]">
            {resources.length === 0 ? (
              // Where the list will be, as step 4 and the Actions panel
              // have, so an example beside it isn't mistaken for theirs.
              <EmptySlot className="mt-1">{RESOURCES_EMPTY}</EmptySlot>
            ) : (
              <ul aria-label="Resources">
                {resources.map((r) => (
                  <li key={r.id}>
                    <LineShell
                      className={
                        r.text === ""
                          ? "my-1 border-transparent bg-transparent"
                          : "my-1 border-rm-border bg-rm-surface shadow-[var(--rm-shadow-1)]"
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
            )}
            <AddField
              ref={fieldRef}
              label="Add a resource"
              placeholder={ADD_RESOURCE_PLACEHOLDER}
              onAdd={onAdd}
            />
          </div>
        </div>
      </div>
    </StepSection>
  );
}
