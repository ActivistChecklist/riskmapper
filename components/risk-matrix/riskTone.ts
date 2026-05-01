import type { CellKey, ColorGroupKey } from "./types";

const TONE_CIRCLE: Record<ColorGroupKey, string> = {
  red: "🔴",
  orange: "🟠",
  yellow: "🟡",
  green: "🟢",
};

const CELL_TONE: Record<CellKey, ColorGroupKey> = {
  "0-0": "yellow",
  "0-1": "orange",
  "0-2": "red",
  "1-0": "green",
  "1-1": "yellow",
  "1-2": "orange",
  "2-0": "green",
  "2-1": "green",
  "2-2": "yellow",
};

export function toneToCircle(tone: ColorGroupKey): string {
  return TONE_CIRCLE[tone];
}

export function cellKeyToTone(cellKey: CellKey): ColorGroupKey {
  return CELL_TONE[cellKey];
}

export function prependToneCircle(text: string, tone: ColorGroupKey): string {
  return `${toneToCircle(tone)} ${text}`;
}
