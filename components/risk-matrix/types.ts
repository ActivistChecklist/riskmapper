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

export type DragState = {
  id: string;
  text: string;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width: number;
};

export type StarredAction = {
  subLine: SubLine;
  cellKey: CellKey;
  parentLineId: string;
  subType: "reduce" | "prepare";
  parentText: string;
  groupTone: ColorGroupKey;
};
