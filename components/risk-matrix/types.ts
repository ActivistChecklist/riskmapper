export type SubLine = {
  id: string;
  text: string;
  starred: boolean;
};

export type GridLine = {
  id: string;
  text: string;
  reduce?: SubLine[];
  prepare?: SubLine[];
};

export type PoolLine = {
  id: string;
  text: string;
};

export type CellKey = string;

export type LineLocation = "pool" | CellKey;

export type ColorGroupKey = "red" | "orange" | "yellow" | "green";

export type CollapsedState = Record<ColorGroupKey, boolean>;

/** When true, mitigations rows marked hidden are shown in that color section. */
export type CategorizedRevealHiddenState = Record<ColorGroupKey, boolean>;

export type DragState = {
  id: string;
  text: string;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  /** Matches `LineRow` pool vs matrix styling */
  variant: "pool" | "cell";
  /** Matrix cell background (only when `variant` is `"cell"`) */
  cellBgClass: string | null;
};

export type StarredAction = {
  subLine: SubLine;
  cellKey: CellKey;
  parentLineId: string;
  subType: "reduce" | "prepare";
  parentText: string;
  groupTone: ColorGroupKey;
};

/** Free-form action lines in the Actions panel (not tied to matrix mitigations). */
export type OtherAction = {
  id: string;
  text: string;
};
