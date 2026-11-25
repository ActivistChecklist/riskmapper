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

export type GuidanceApi = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  showExamplePlan: () => void;
};

const GuidanceContext = createContext<GuidanceApi>({
  enabled: true,
  setEnabled: () => {},
  showExamplePlan: () => {},
});

export function useGuidance(): GuidanceApi {
  return useContext(GuidanceContext);
}

/** Holds the Guidance switch and the one example plan dialog every step opens. */
export function GuidanceProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = useState(readGuidancePreference);
  const [exampleOpen, setExampleOpen] = useState(false);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    writeGuidancePreference(next);
  }, []);
  const showExamplePlan = useCallback(() => setExampleOpen(true), []);

  const api = useMemo(
    () => ({ enabled, setEnabled, showExamplePlan }),
    [enabled, setEnabled, showExamplePlan],
  );

  return (
    <GuidanceContext.Provider value={api}>
      {children}
      <ExamplePlanDialog open={exampleOpen} onOpenChange={setExampleOpen} />
    </GuidanceContext.Provider>
  );
}
