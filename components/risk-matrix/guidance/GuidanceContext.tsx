"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import ExamplePlanDialog from "./ExamplePlanDialog";

/**
 * Whether this browser shows the safety planning guidance. It is a
 * preference of the person, not of the matrix, so it lives in localStorage
 * and never travels with a shared or exported matrix. Absent means on.
 */
export const GUIDANCE_STORAGE_KEY = "rm-guidance";

export function readGuidancePreference(): boolean {
  try {
    return window.localStorage.getItem(GUIDANCE_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeGuidancePreference(enabled: boolean): void {
  try {
    if (enabled) window.localStorage.removeItem(GUIDANCE_STORAGE_KEY);
    else window.localStorage.setItem(GUIDANCE_STORAGE_KEY, "off");
  } catch {
    // Private windows and blocked storage: the switch still works for
    // this visit, it just isn't remembered.
  }
}

/** The places that show an inline example, each with its own link. */
export type ExampleStep = "risks" | "matrix" | "resources" | "plan" | "actions";

export type GuidanceApi = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  showExamplePlan: () => void;
  /** Steps whose examples someone showed (true) or hid (false) by hand. */
  exampleChoices: Partial<Record<ExampleStep, boolean>>;
  setExampleChoice: (step: ExampleStep, shown: boolean) => void;
};

const GuidanceContext = createContext<GuidanceApi>({
  enabled: true,
  setEnabled: () => {},
  showExamplePlan: () => {},
  exampleChoices: {},
  setExampleChoice: () => {},
});

export function useGuidance(): GuidanceApi {
  return useContext(GuidanceContext);
}

export type StepExample = { shown: boolean; toggle: () => void };

/**
 * Whether a step's example shows. On its own it shows while the step is
 * empty (`whenEmpty`) and leaves once the step has your entries; the step's
 * "Show examples" / "Hide examples" link overrides that until the page is
 * reloaded. Always hidden while guidance is off.
 */
export function useStepExample(step: ExampleStep, whenEmpty: boolean): StepExample {
  const { enabled, exampleChoices, setExampleChoice } = useGuidance();
  const shown = enabled && (exampleChoices[step] ?? whenEmpty);
  return { shown, toggle: () => setExampleChoice(step, !shown) };
}

/** Holds the Guidance switch and the one example plan dialog every step opens. */
export function GuidanceProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = useState(readGuidancePreference);
  const [exampleOpen, setExampleOpen] = useState(false);
  const [exampleChoices, setExampleChoices] = useState<
    Partial<Record<ExampleStep, boolean>>
  >({});

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    writeGuidancePreference(next);
  }, []);
  const showExamplePlan = useCallback(() => setExampleOpen(true), []);
  const setExampleChoice = useCallback((step: ExampleStep, shown: boolean) => {
    setExampleChoices((prev) => ({ ...prev, [step]: shown }));
  }, []);

  const api = useMemo(
    () => ({ enabled, setEnabled, showExamplePlan, exampleChoices, setExampleChoice }),
    [enabled, setEnabled, showExamplePlan, exampleChoices, setExampleChoice],
  );

  return (
    <GuidanceContext.Provider value={api}>
      {children}
      <ExamplePlanDialog open={exampleOpen} onOpenChange={setExampleOpen} />
    </GuidanceContext.Provider>
  );
}
