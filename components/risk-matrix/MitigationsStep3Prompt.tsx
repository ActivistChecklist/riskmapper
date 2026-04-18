"use client";

import React from "react";
import StepHeadingRow from "./StepHeadingRow";

/** Same heading row pattern as steps 1–2; sits above the bordered mitigations card. */
export default function MitigationsStep3Prompt() {
  return (
    <StepHeadingRow step={3} className="mb-3">
      Brainstorm ways you can mitigate and prepare for these risks.
    </StepHeadingRow>
  );
}
