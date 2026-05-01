import type { GridLine, OtherAction, PoolLine, SubLine } from "./types";
import type { RiskMatrixSnapshot } from "./matrixTypes";

/**
 * Structural deep-equal for the **synced** subset of a snapshot —
 * everything that flows through the Y.Doc. Per-viewer flags
 * (`collapsed`, `categorizedRevealHidden`) are intentionally NOT
 * compared here.
 *
 * Replaces a previous `JSON.stringify(a) === JSON.stringify(b)` check
 * that gave false negatives because `row.snapshot` and `view.snapshot`
 * are constructed with different key insertion orders.
 */
export function sharedSnapshotFieldsEqual(
  a: Pick<RiskMatrixSnapshot, "pool" | "grid" | "otherActions" | "hiddenCategorizedRiskKeys">,
  b: Pick<RiskMatrixSnapshot, "pool" | "grid" | "otherActions" | "hiddenCategorizedRiskKeys">,
): boolean {
  if (!poolListsEqual(a.pool, b.pool)) return false;
  if (!gridsEqual(a.grid, b.grid)) return false;
  if (!otherActionsEqual(a.otherActions, b.otherActions)) return false;
  if (!stringSetsEqual(a.hiddenCategorizedRiskKeys, b.hiddenCategorizedRiskKeys)) {
    return false;
  }
  return true;
}

function poolListsEqual(a: PoolLine[], b: PoolLine[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
    if (a[i].text !== b[i].text) return false;
  }
  return true;
}

function gridsEqual(
  a: Record<string, GridLine[]>,
  b: Record<string, GridLine[]>,
): boolean {
  // Cell keys with empty arrays are equivalent to missing keys for
  // rendering purposes; both shapes appear in real snapshots.
  const aKeys = Object.keys(a).filter((k) => (a[k]?.length ?? 0) > 0);
  const bKeys = Object.keys(b).filter((k) => (b[k]?.length ?? 0) > 0);
  if (aKeys.length !== bKeys.length) return false;
  const bKeySet = new Set(bKeys);
  for (const k of aKeys) {
    if (!bKeySet.has(k)) return false;
    if (!gridLinesEqual(a[k] ?? [], b[k] ?? [])) return false;
  }
  return true;
}

function gridLinesEqual(a: GridLine[], b: GridLine[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
    if (a[i].text !== b[i].text) return false;
    if (!subListsEqual(a[i].reduce, b[i].reduce)) return false;
    if (!subListsEqual(a[i].prepare, b[i].prepare)) return false;
  }
  return true;
}

function subListsEqual(
  a: SubLine[] | undefined,
  b: SubLine[] | undefined,
): boolean {
  const al = a ?? [];
  const bl = b ?? [];
  if (al.length !== bl.length) return false;
  for (let i = 0; i < al.length; i++) {
    if (al[i].id !== bl[i].id) return false;
    if (al[i].text !== bl[i].text) return false;
    if (al[i].starred !== bl[i].starred) return false;
  }
  return true;
}

function otherActionsEqual(a: OtherAction[], b: OtherAction[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
    if (a[i].text !== b[i].text) return false;
  }
  return true;
}

function stringSetsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const aSorted = [...a].sort();
  const bSorted = [...b].sort();
  for (let i = 0; i < aSorted.length; i++) {
    if (aSorted[i] !== bSorted[i]) return false;
  }
  return true;
}
