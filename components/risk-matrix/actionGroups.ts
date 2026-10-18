import { ACTION_GROUP_LABEL, COLOR_GROUPS } from "./constants";
import type { CellKey, ColorGroupKey, GridLine, StarredAction } from "./types";

/**
 * Every starred mitigation, in Actions panel order: tier, then cell, then
 * risk, then reduce before prepare, then line order. The single source for
 * the panel and every export.
 */
export function starredActionsFromGrid(
  grid: Record<CellKey, GridLine[]>,
): StarredAction[] {
  const actions: StarredAction[] = [];
  for (const group of COLOR_GROUPS) {
    for (const cellKey of group.cells) {
      for (const line of grid[cellKey] || []) {
        for (const subType of ["reduce", "prepare"] as const) {
          for (const s of line[subType] || []) {
            if (!s.starred) continue;
            actions.push({
              subLine: s,
              cellKey,
              parentLineId: line.id,
              subType,
              parentText: line.text,
              groupTone: group.key,
            });
          }
        }
      }
    }
  }
  return actions;
}

export type ActionTierGroup = {
  tone: ColorGroupKey;
  /** "For highest risks" and so on, as the Actions panel shows it. */
  label: string;
  actions: StarredAction[];
};

/**
 * Starred actions grouped by risk tier, highest first, keeping their
 * order within each tier. The tier is the only context an action keeps:
 * the Actions panel and every export list it without the source risk.
 */
export function groupActionsByTier(starred: StarredAction[]): ActionTierGroup[] {
  return COLOR_GROUPS.flatMap((group) => {
    const actions = starred.filter((a) => a.groupTone === group.key);
    return actions.length > 0
      ? [{ tone: group.key, label: ACTION_GROUP_LABEL[group.key], actions }]
      : [];
  });
}

/** Heading for the other-actions group, shown only alongside starred ones. */
export const OTHER_ACTIONS_LABEL = "Other";
