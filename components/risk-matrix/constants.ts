import type {
  CategorizedRevealHiddenState,
  CellKey,
  CollapsedState,
  ColorGroupKey,
} from "./types";

/** Tailwind cell backgrounds [row][col] — static strings for the compiler. */
export const CELL_BG_CLASSES: string[][] = [
  ["bg-rm-yellow", "bg-rm-orange", "bg-rm-red"],
  ["bg-rm-green", "bg-rm-yellow", "bg-rm-orange"],
  ["bg-rm-green", "bg-rm-green", "bg-rm-yellow"],
];

export function cellKeyToBgClass(key: CellKey): string {
  const [rs, cs] = key.split("-");
  const row = Number(rs);
  const col = Number(cs);
  if (
    Number.isFinite(row) &&
    Number.isFinite(col) &&
    row >= 0 &&
    row <= 2 &&
    col >= 0 &&
    col <= 2
  ) {
    return CELL_BG_CLASSES[row][col];
  }
  return CELL_BG_CLASSES[0][0];
}

export const ROW_LABELS = [
  "High likelihood",
  "Medium likelihood",
  "Low likelihood",
] as const;

export const COL_LABELS = [
  "Low impact",
  "Medium impact",
  "High impact",
] as const;

export type ColorGroup = {
  key: ColorGroupKey;
  label: string;
  cells: string[];
};

export const GROUP_HEADER_CLASS: Record<ColorGroupKey, string> = {
  red: "bg-rm-red",
  orange: "bg-rm-orange",
  yellow: "bg-rm-yellow",
  green: "bg-rm-green",
};

// Ordered from highest to lowest risk. Cells within a group are listed
// highest severity first.
export const COLOR_GROUPS: ColorGroup[] = [
  { key: "red", label: "Highest risk", cells: ["0-2"] },
  { key: "orange", label: "High risk", cells: ["0-1", "1-2"] },
  { key: "yellow", label: "Medium risk", cells: ["0-0", "1-1", "2-2"] },
  { key: "green", label: "Lower risk", cells: ["1-0", "2-1", "2-0"] },
];

export const INITIAL_COLLAPSED: CollapsedState = {
  red: false,
  orange: false,
  yellow: false,
  green: true,
};

export const INITIAL_CATEGORIZED_REVEAL_HIDDEN: CategorizedRevealHiddenState = {
  red: false,
  orange: false,
  yellow: false,
  green: false,
};
