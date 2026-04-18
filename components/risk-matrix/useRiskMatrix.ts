"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  COLOR_GROUPS,
  INITIAL_CATEGORIZED_REVEAL_HIDDEN,
  INITIAL_COLLAPSED,
  cellKeyToBgClass,
} from "./constants";
import type { RiskMatrixSnapshot } from "./matrixTypes";
import type {
  CategorizedRevealHiddenState,
  CellKey,
  CollapsedState,
  ColorGroupKey,
  DragState,
  GridLine,
  LineLocation,
  OtherAction,
  PoolLine,
  StarredAction,
  SubLine,
} from "./types";
import {
  handleListVerticalArrows,
  isArrowWithSelectionOrOsShortcut,
} from "./listTextareaNav";
import {
  categorizedRiskRowKey,
  mergeHydratedGrid,
  normalizePoolLines,
  parseRiskCellShortcut,
} from "./riskMatrixUtils";

/** Stable across SSR and client — not derived from `useId()`. */
const DEFAULT_EMPTY_POOL_LINE_ID = "rm-ln-i-0";

export type UseRiskMatrixOptions = {
  initialSnapshot?: RiskMatrixSnapshot | null;
  onSnapshotChange?: (snapshot: RiskMatrixSnapshot) => void;
};

export function useRiskMatrix(options: UseRiskMatrixOptions = {}) {
  const { initialSnapshot, onSnapshotChange } = options;
  const onSnapshotChangeRef = useRef(onSnapshotChange);
  useLayoutEffect(() => {
    onSnapshotChangeRef.current = onSnapshotChange;
  }, [onSnapshotChange]);

  const lineSeq = useRef(0);
  const subSeq = useRef(0);
  const newLineId = useCallback(() => {
    lineSeq.current += 1;
    return `rm-ln-i-${lineSeq.current}`;
  }, []);
  const newSubLineId = useCallback(() => {
    subSeq.current += 1;
    return `rm-sub-s-${subSeq.current}`;
  }, []);
  const otherSeq = useRef(0);
  const newOtherId = useCallback(() => {
    otherSeq.current += 1;
    return `rm-other-o-${otherSeq.current}`;
  }, []);

  const [pool, setPool] = useState<PoolLine[]>(() =>
    initialSnapshot?.pool?.length
      ? initialSnapshot.pool
      : [{ id: DEFAULT_EMPTY_POOL_LINE_ID, text: "" }],
  );
  const [grid, setGrid] = useState<Record<CellKey, GridLine[]>>(
    () => mergeHydratedGrid(initialSnapshot?.grid),
  );

  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<CollapsedState>(
    () => initialSnapshot?.collapsed ?? INITIAL_COLLAPSED,
  );
  const [hasCompletedFirstDragToMatrix, setHasCompletedFirstDragToMatrix] =
    useState(() => initialSnapshot?.hasCompletedFirstDragToMatrix ?? false);
  const [otherActions, setOtherActions] = useState<OtherAction[]>(
    () => initialSnapshot?.otherActions ?? [],
  );
  const [hiddenCategorizedRiskKeys, setHiddenCategorizedRiskKeys] = useState<
    string[]
  >(() => initialSnapshot?.hiddenCategorizedRiskKeys ?? []);
  const [categorizedRevealHidden, setCategorizedRevealHidden] =
    useState<CategorizedRevealHiddenState>(() => ({
      ...INITIAL_CATEGORIZED_REVEAL_HIDDEN,
      ...(initialSnapshot?.categorizedRevealHidden ?? {}),
    }));
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const pendingDeleteActionRef = useRef<null | (() => void)>(null);

  const newSubLineIdRef = useRef(newSubLineId);
  useLayoutEffect(() => {
    newSubLineIdRef.current = newSubLineId;
  }, [newSubLineId]);

  const hydratedSnapshotRef = useRef(initialSnapshot ?? null);
  useLayoutEffect(() => {
    const snap = hydratedSnapshotRef.current;
    if (!snap) return;
    let maxI = 0;
    let maxS = 0;
    let maxO = 0;
    const scanIds = (ids: string[]) => {
      for (const id of ids) {
        const mi = /-i-(\d+)$/.exec(id);
        if (mi) maxI = Math.max(maxI, Number(mi[1]));
        const ms = /-s-(\d+)$/.exec(id);
        if (ms) maxS = Math.max(maxS, Number(ms[1]));
        const mo = /-o-(\d+)$/.exec(id);
        if (mo) maxO = Math.max(maxO, Number(mo[1]));
      }
    };
    for (const p of snap.pool) scanIds([p.id]);
    for (const lines of Object.values(snap.grid)) {
      for (const line of lines) {
        scanIds([line.id]);
        for (const s of [...(line.reduce || []), ...(line.prepare || [])]) {
          scanIds([s.id]);
        }
      }
    }
    for (const o of snap.otherActions ?? []) scanIds([o.id]);
    lineSeq.current = maxI;
    subSeq.current = maxS;
    otherSeq.current = maxO;
  }, []);

  // Seed one empty unstarred reduce/prepare row when a risk has none yet
  // (so there is a box to type in). Extra rows are added only via Enter
  // (splitSubLine), not when the current line gains text.
  useEffect(() => {
    setGrid((prev) => {
      let changed = false;
      const next: Record<CellKey, GridLine[]> = {};
      const mkSubId = () => newSubLineIdRef.current();
      for (const k of Object.keys(prev)) {
        const lines = prev[k];
        const mapped = lines.map((l) => {
          if (!l.text) return l;
          const reduceArr = l.reduce || [];
          const prepareArr = l.prepare || [];
          const reduceUnstarred = reduceArr.filter((s) => !s.starred);
          const prepareUnstarred = prepareArr.filter((s) => !s.starred);
          const needsReduceEmpty = reduceUnstarred.length === 0;
          const needsPrepareEmpty = prepareUnstarred.length === 0;
          let newReduce = reduceArr;
          let newPrepare = prepareArr;
          if (needsReduceEmpty) {
            newReduce = [
              ...reduceArr,
              { id: mkSubId(), text: "", starred: false },
            ];
            changed = true;
          }
          if (needsPrepareEmpty) {
            newPrepare = [
              ...prepareArr,
              { id: mkSubId(), text: "", starred: false },
            ];
            changed = true;
          }
          if (newReduce !== reduceArr || newPrepare !== prepareArr) {
            return { ...l, reduce: newReduce, prepare: newPrepare };
          }
          return l;
        });
        next[k] = mapped;
      }
      return changed ? next : prev;
    });
  }, [grid]);

  const setLinesAt = useCallback(
    (loc: LineLocation, updater: GridLine[] | PoolLine[] | ((prev: PoolLine[] | GridLine[]) => PoolLine[] | GridLine[])) => {
      if (loc === "pool") {
        setPool((prev) =>
          typeof updater === "function"
            ? (updater as (p: PoolLine[]) => PoolLine[])(prev)
            : (updater as PoolLine[]),
        );
      } else {
        setGrid((prev) => ({
          ...prev,
          [loc]:
            typeof updater === "function"
              ? (updater as (g: GridLine[]) => GridLine[])(prev[loc] || [])
              : (updater as GridLine[]),
        }));
      }
    },
    [],
  );

  const hasMitigationOrPreparation = useCallback((line: GridLine) => {
    const reduce = line.reduce || [];
    const prepare = line.prepare || [];
    return [...reduce, ...prepare].some((item) => item.text.trim().length > 0);
  }, []);

  const requestDeleteConfirmation = useCallback((onConfirm: () => void) => {
    pendingDeleteActionRef.current = onConfirm;
    setIsDeleteConfirmOpen(true);
  }, []);

  const closeDeleteConfirmation = useCallback(() => {
    pendingDeleteActionRef.current = null;
    setIsDeleteConfirmOpen(false);
  }, []);

  const confirmDelete = useCallback(() => {
    const action = pendingDeleteActionRef.current;
    pendingDeleteActionRef.current = null;
    setIsDeleteConfirmOpen(false);
    action?.();
  }, []);

  const focusByAttr = useCallback((attr: string, id: string, caret?: number) => {
    const tryFocus = () => {
      const el = document.querySelector<HTMLTextAreaElement>(
        `[${attr}="${CSS.escape(id)}"]`,
      );
      if (el) {
        el.focus();
        if (caret != null) {
          const pos = Math.min(caret, el.value.length);
          el.setSelectionRange(pos, pos);
        }
        return true;
      }
      return false;
    };
    if (tryFocus()) return;
    requestAnimationFrame(() => {
      if (!tryFocus()) requestAnimationFrame(tryFocus);
    });
  }, []);

  const focusLine = useCallback(
    (id: string, caret?: number) => focusByAttr("data-line-id", id, caret),
    [focusByAttr],
  );
  const focusRiskLine = useCallback(
    (id: string, caret?: number) => focusByAttr("data-risk-line-id", id, caret),
    [focusByAttr],
  );
  const focusSubLine = useCallback(
    (id: string, caret?: number) => focusByAttr("data-sub-line-id", id, caret),
    [focusByAttr],
  );

  const updateText = useCallback(
    (loc: LineLocation, id: string, text: string) => {
      if (loc === "pool") {
        setPool((prev) => {
          const shortcut = parseRiskCellShortcut(text);
          const next = normalizePoolLines(
            prev.map((l) =>
              l.id === id
                ? { ...l, text: shortcut ? shortcut.cleanedText : text }
                : l,
            ),
          );
          if (shortcut) {
            const moved = next.find((line) => line.id === id);
            if (moved && moved.text.trim().length > 0) {
              const gridLine: GridLine = {
                ...(moved as GridLine),
                id: newLineId(),
              };
              setGrid((gridPrev) => ({
                ...gridPrev,
                [shortcut.targetCell]: [
                  ...(gridPrev[shortcut.targetCell] || []),
                  gridLine,
                ],
              }));
              const withoutMoved = normalizePoolLines(
                next.filter((line) => line.id !== id),
              );
              const last = withoutMoved[withoutMoved.length - 1];
              if (withoutMoved.length === 0 || (last && last.text !== "")) {
                withoutMoved.push({ id: newLineId(), text: "" });
              }
              return normalizePoolLines(withoutMoved);
            }
          }
          const last = next[next.length - 1];
          if (!last || last.text !== "") next.push({ id: newLineId(), text: "" });
          return normalizePoolLines(next);
        });
      } else {
        setGrid((prev) => ({
          ...prev,
          [loc]: (prev[loc] || []).map((l) =>
            l.id === id ? { ...l, text } : l,
          ),
        }));
      }
    },
    [newLineId],
  );

  const splitLine = useCallback(
    (loc: LineLocation, id: string, caret: number) => {
      const nid = newLineId();
      setLinesAt(loc, (lines) => {
        const list = lines as PoolLine[] | GridLine[];
        const idx = list.findIndex((l) => l.id === id);
        if (idx < 0) return list;
        const orig = list[idx] as PoolLine & GridLine;
        return [
          ...list.slice(0, idx),
          { ...orig, text: orig.text.slice(0, caret) },
          { id: nid, text: orig.text.slice(caret) },
          ...list.slice(idx + 1),
        ] as PoolLine[] | GridLine[];
      });
      return nid;
    },
    [newLineId, setLinesAt],
  );

  const mergeWithPrevious = useCallback(
    (loc: LineLocation, id: string) => {
      setLinesAt(loc, (lines) => {
        const list = lines as PoolLine[] | GridLine[];
        const idx = list.findIndex((l) => l.id === id);
        if (idx <= 0) return list;
        const prevLine = list[idx - 1] as PoolLine & GridLine;
        const curr = list[idx] as PoolLine & GridLine;
        return [
          ...list.slice(0, idx - 1),
          { ...prevLine, text: prevLine.text + curr.text },
          ...list.slice(idx + 1),
        ] as PoolLine[] | GridLine[];
      });
    },
    [setLinesAt],
  );

  const handleLineBlur = useCallback(
    (_e: React.FocusEvent<HTMLTextAreaElement>, loc: LineLocation, line: PoolLine | GridLine) => {
      if (line.text.length > 0) return;
      if (loc === "pool") {
        setPool((prev) => {
          const idx = prev.findIndex((l) => l.id === line.id);
          if (idx < 0) return prev;
          if (idx !== prev.length - 1) return prev;
          if (prev.length <= 1) return prev;
          const without = prev.filter((l) => l.id !== line.id);
          const last = without[without.length - 1];
          if (without.length === 0 || (last && last.text !== "")) {
            without.push({ id: newLineId(), text: "" });
          }
          return normalizePoolLines(without);
        });
        return;
      }
      setGrid((prev) => {
        const cellKey = loc as CellKey;
        const lines = prev[cellKey] || [];
        const idx = lines.findIndex((l) => l.id === line.id);
        if (idx < 0) return prev;
        if (idx !== lines.length - 1) return prev;
        if (lines.length <= 1) return prev;
        return {
          ...prev,
          [cellKey]: lines.filter((l) => l.id !== line.id),
        };
      });
    },
    [newLineId],
  );

  const handleKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLTextAreaElement>,
      loc: LineLocation,
      line: PoolLine | GridLine,
    ) => {
      const el = e.target as HTMLTextAreaElement;
      const caret = el.selectionStart ?? 0;
      const linesNow =
        loc === "pool" ? pool : grid[loc as CellKey] || [];

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const nid = splitLine(loc, line.id, caret);
        focusLine(nid, 0);
        return;
      }
      if (e.key === "Backspace" && caret === 0 && el.selectionEnd === 0) {
        const idx = linesNow.findIndex((l) => l.id === line.id);
        if (idx > 0) {
          e.preventDefault();
          const prevLine = linesNow[idx - 1];
          const targetCaret = prevLine.text.length;
          const runMerge = () => {
            const prevEl = document.querySelector<HTMLTextAreaElement>(
              `[data-line-id="${CSS.escape(prevLine.id)}"]`,
            );
            if (prevEl) {
              prevEl.focus();
              prevEl.setSelectionRange(targetCaret, targetCaret);
            }
            mergeWithPrevious(loc, line.id);
            focusLine(prevLine.id, targetCaret);
          };
          if (
            loc !== "pool" &&
            hasMitigationOrPreparation(line as GridLine)
          ) {
            requestDeleteConfirmation(runMerge);
          } else {
            runMerge();
          }
        }
        return;
      }

      const neighbor = (direction: string) => {
        if (loc === "pool") {
          if (direction === "down") return { loc: "0-0" as CellKey, placeAtEnd: false };
          return null;
        }
        const [r, c] = (loc as string).split("-").map(Number);
        if (direction === "up") {
          if (r > 0) return { loc: `${r - 1}-${c}` as CellKey, placeAtEnd: true };
          return { loc: "pool" as const, placeAtEnd: true };
        }
        if (direction === "down") {
          if (r < 2) return { loc: `${r + 1}-${c}` as CellKey, placeAtEnd: false };
          return null;
        }
        if (direction === "left") {
          if (c > 0) return { loc: `${r}-${c - 1}` as CellKey, placeAtEnd: true };
          return null;
        }
        if (direction === "right") {
          if (c < 2) return { loc: `${r}-${c + 1}` as CellKey, placeAtEnd: false };
          return null;
        }
        return null;
      };

      const focusInSurface = (
        targetLoc: LineLocation,
        placeAtEnd: boolean,
      ) => {
        const targetLines =
          targetLoc === "pool" ? pool : grid[targetLoc as CellKey] || [];
        if (targetLines.length === 0) {
          const nid = newLineId();
          setGrid((prev) => ({
            ...prev,
            [targetLoc as CellKey]: [{ id: nid, text: "" }],
          }));
          focusLine(nid, 0);
          return;
        }
        const target = placeAtEnd
          ? targetLines[targetLines.length - 1]
          : targetLines[0];
        focusLine(target.id, placeAtEnd ? target.text.length : 0);
      };

      if (e.key === "ArrowUp") {
        const linesRef = linesNow.map((l) => ({ id: l.id, text: l.text }));
        if (handleListVerticalArrows(e, linesRef, line.id, focusLine)) return;
        if (isArrowWithSelectionOrOsShortcut(e)) return;
        const before = el.value.substring(0, caret);
        if (!before.includes("\n")) {
          const nb = neighbor("up");
          if (nb) {
            e.preventDefault();
            focusInSurface(nb.loc, nb.placeAtEnd);
          }
        }
        return;
      }
      if (e.key === "ArrowDown") {
        const linesRef = linesNow.map((l) => ({ id: l.id, text: l.text }));
        if (handleListVerticalArrows(e, linesRef, line.id, focusLine)) return;
        if (isArrowWithSelectionOrOsShortcut(e)) return;
        const after = el.value.substring(caret);
        if (!after.includes("\n")) {
          const nb = neighbor("down");
          if (nb) {
            e.preventDefault();
            focusInSurface(nb.loc, nb.placeAtEnd);
          }
        }
        return;
      }
      if (e.key === "ArrowLeft") {
        if (isArrowWithSelectionOrOsShortcut(e)) return;
        if (caret === 0 && el.selectionEnd === 0) {
          const idx = linesNow.findIndex((l) => l.id === line.id);
          if (idx > 0) {
            e.preventDefault();
            const target = linesNow[idx - 1];
            focusLine(target.id, target.text.length);
            return;
          }
          const nb = neighbor("left");
          if (nb) {
            e.preventDefault();
            focusInSurface(nb.loc, nb.placeAtEnd);
          }
        }
        return;
      }
      if (e.key === "ArrowRight") {
        if (isArrowWithSelectionOrOsShortcut(e)) return;
        if (caret === el.value.length && el.selectionEnd === el.value.length) {
          const idx = linesNow.findIndex((l) => l.id === line.id);
          if (idx < linesNow.length - 1) {
            e.preventDefault();
            const target = linesNow[idx + 1];
            focusLine(target.id, 0);
            return;
          }
          const nb = neighbor("right");
          if (nb) {
            e.preventDefault();
            focusInSurface(nb.loc, nb.placeAtEnd);
          }
        }
        return;
      }
    },
    [
      pool,
      grid,
      splitLine,
      mergeWithPrevious,
      focusLine,
      newLineId,
      hasMitigationOrPreparation,
      requestDeleteConfirmation,
    ],
  );

  const handleRiskKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLTextAreaElement>,
      cellKey: CellKey,
      line: GridLine,
    ) => {
      const el = e.target as HTMLTextAreaElement;
      const caret = el.selectionStart ?? 0;
      const linesNow = grid[cellKey] || [];

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const nid = splitLine(cellKey, line.id, caret);
        focusRiskLine(nid, 0);
        return;
      }
      if (e.key === "Backspace" && caret === 0 && el.selectionEnd === 0) {
        const idx = linesNow.findIndex((l) => l.id === line.id);
        if (idx > 0) {
          e.preventDefault();
          const prevLine = linesNow[idx - 1];
          const targetCaret = prevLine.text.length;
          const runMerge = () => {
            mergeWithPrevious(cellKey, line.id);
            focusRiskLine(prevLine.id, targetCaret);
          };
          if (hasMitigationOrPreparation(line)) {
            requestDeleteConfirmation(runMerge);
          } else {
            runMerge();
          }
        }
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const linesRef = linesNow.map((l) => ({ id: l.id, text: l.text }));
        if (handleListVerticalArrows(e, linesRef, line.id, focusRiskLine)) return;
      }
    },
    [
      grid,
      splitLine,
      mergeWithPrevious,
      focusRiskLine,
      hasMitigationOrPreparation,
      requestDeleteConfirmation,
    ],
  );

  const updateSubText = useCallback(
    (
      cellKey: CellKey,
      parentLineId: string,
      subType: "reduce" | "prepare",
      subId: string,
      text: string,
    ) => {
      setGrid((prev) => ({
        ...prev,
        [cellKey]: (prev[cellKey] || []).map((l) =>
          l.id !== parentLineId
            ? l
            : {
                ...l,
                [subType]: (l[subType] || []).map((s) =>
                  s.id === subId ? { ...s, text } : s,
                ),
              },
        ),
      }));
    },
    [],
  );

  const splitSubLine = useCallback(
    (
      cellKey: CellKey,
      parentLineId: string,
      subType: "reduce" | "prepare",
      subId: string,
      caret: number,
    ) => {
      const nid = newSubLineId();
      setGrid((prev) => ({
        ...prev,
        [cellKey]: (prev[cellKey] || []).map((l) => {
          if (l.id !== parentLineId) return l;
          const arr = l[subType] || [];
          const idx = arr.findIndex((s) => s.id === subId);
          if (idx < 0) return l;
          const orig = arr[idx];
          return {
            ...l,
            [subType]: [
              ...arr.slice(0, idx),
              { ...orig, text: orig.text.slice(0, caret) },
              { id: nid, text: orig.text.slice(caret), starred: false },
              ...arr.slice(idx + 1),
            ],
          };
        }),
      }));
      return nid;
    },
    [newSubLineId],
  );

  const mergeSubWithPrevious = useCallback(
    (
      cellKey: CellKey,
      parentLineId: string,
      subType: "reduce" | "prepare",
      subId: string,
    ) => {
      setGrid((prev) => ({
        ...prev,
        [cellKey]: (prev[cellKey] || []).map((l) => {
          if (l.id !== parentLineId) return l;
          const arr = l[subType] || [];
          const idx = arr.findIndex((s) => s.id === subId);
          if (idx <= 0) return l;
          const prevItem = arr[idx - 1];
          const curr = arr[idx];
          if (!curr) return l;
          const mergedText = prevItem.text + curr.text;
          const newArr = arr
            .filter((s) => s.id !== subId)
            .map((s) => (s.id === prevItem.id ? { ...s, text: mergedText } : s));
          return { ...l, [subType]: newArr };
        }),
      }));
    },
    [],
  );

  const toggleStar = useCallback(
    (cellKey: CellKey, parentLineId: string, subType: "reduce" | "prepare", subId: string) => {
      setGrid((prev) => ({
        ...prev,
        [cellKey]: (prev[cellKey] || []).map((l) =>
          l.id !== parentLineId
            ? l
            : {
                ...l,
                [subType]: (l[subType] || []).map((s) =>
                  s.id === subId ? { ...s, starred: !s.starred } : s,
                ),
              },
        ),
      }));
    },
    [],
  );

  const handleSubKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLTextAreaElement>,
      cellKey: CellKey,
      parentLineId: string,
      subType: "reduce" | "prepare",
      subLine: SubLine,
    ) => {
      const el = e.target as HTMLTextAreaElement;
      const caret = el.selectionStart ?? 0;
      const line = (grid[cellKey] || []).find((l) => l.id === parentLineId);
      if (!line) return;
      const arr = line[subType] || [];

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const nid = splitSubLine(
          cellKey,
          parentLineId,
          subType,
          subLine.id,
          caret,
        );
        focusSubLine(nid, 0);
        return;
      }
      if (e.key === "Backspace" && caret === 0 && el.selectionEnd === 0) {
        const idx = arr.findIndex((s) => s.id === subLine.id);
        if (idx > 0) {
          e.preventDefault();
          const prevItem = arr[idx - 1];
          const targetCaret = prevItem.text.length;
          mergeSubWithPrevious(cellKey, parentLineId, subType, subLine.id);
          focusSubLine(prevItem.id, targetCaret);
        }
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const linesRef = arr.map((s) => ({ id: s.id, text: s.text }));
        if (handleListVerticalArrows(e, linesRef, subLine.id, focusSubLine)) return;
      }
    },
    [grid, splitSubLine, mergeSubWithPrevious, focusSubLine],
  );

  const findLine = useCallback(
    (id: string) => {
      const pi = pool.findIndex((l) => l.id === id);
      if (pi >= 0) return { loc: "pool" as const, index: pi };
      for (const key of Object.keys(grid)) {
        const gi = grid[key].findIndex((l) => l.id === id);
        if (gi >= 0) return { loc: key as CellKey, index: gi };
      }
      return null;
    },
    [pool, grid],
  );

  const moveLineTo = useCallback(
    (id: string, destLoc: LineLocation) => {
      const found = findLine(id);
      if (!found) return;
      const { loc: srcLoc } = found;
      if (srcLoc === destLoc) return;

      const srcLines = srcLoc === "pool" ? pool : grid[srcLoc] || [];
      const line = srcLines.find((l) => l.id === id);
      if (!line || !line.text) return;

      if (srcLoc === "pool") {
        setPool((prev) => {
          const next = prev.filter((l) => l.id !== id);
          if (next.length === 0 || next[next.length - 1].text !== "") {
            next.push({ id: newLineId(), text: "" });
          }
          return next;
        });
      } else {
        setGrid((prev) => ({
          ...prev,
          [srcLoc]: prev[srcLoc].filter((l) => l.id !== id),
        }));
      }

      if (destLoc === "pool") {
        setPool((prev) => {
          const next = [...prev];
          let insertAt = next.length;
          if (next.length > 0 && next[next.length - 1].text === "")
            insertAt = next.length - 1;
          next.splice(insertAt, 0, line as PoolLine);
          return next;
        });
      } else {
        setGrid((prev) => ({
          ...prev,
          [destLoc]: [...(prev[destLoc as CellKey] || []), line as GridLine],
        }));
        if (srcLoc === "pool") {
          setHasCompletedFirstDragToMatrix(true);
        }
      }
    },
    [findLine, pool, grid, newLineId],
  );

  const hitTestTarget = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const dropEl = el.closest("[data-drop-target]");
    return dropEl ? dropEl.getAttribute("data-drop-target") : null;
  };

  const onGripPointerDown = useCallback(
    (e: React.PointerEvent, id: string) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      const found = findLine(id);
      if (!found) return;
      const line =
        found.loc === "pool" ? pool[found.index] : grid[found.loc][found.index];
      if (!line || !line.text) return;
      const row = document.querySelector(`[data-row-id="${CSS.escape(id)}"]`);
      const rect = row
        ? row.getBoundingClientRect()
        : {
            left: e.clientX - 90,
            top: e.clientY - 22,
            width: 180,
            height: 44,
          };
      const variant = found.loc === "pool" ? "pool" : "cell";
      setDragState({
        id,
        text: line.text,
        x: e.clientX,
        y: e.clientY,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        width: rect.width,
        height: rect.height,
        variant,
        cellBgClass: variant === "cell" ? cellKeyToBgClass(found.loc) : null,
      });
      if (document.activeElement && "blur" in document.activeElement) {
        (document.activeElement as HTMLElement).blur();
      }
    },
    [pool, grid, findLine],
  );

  useEffect(() => {
    if (!dragState) return;
    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      const x = e.clientX;
      const y = e.clientY;
      setDragState((prev) => (prev ? { ...prev, x, y } : prev));
      const target = hitTestTarget(x, y);
      setDragOverTarget(target);
    };
    const onUp = (e: PointerEvent) => {
      const x = e.clientX;
      const y = e.clientY;
      const target = hitTestTarget(x, y);
      if (target && dragState) {
        moveLineTo(dragState.id, target as LineLocation);
      }
      setDragState(null);
      setDragOverTarget(null);
    };
    const onCancel = () => {
      setDragState(null);
      setDragOverTarget(null);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [dragState, moveLineTo]);

  const onCellClick = useCallback(
    (e: React.MouseEvent, key: CellKey) => {
      if (e.target !== e.currentTarget) return;
      const lines = grid[key] || [];
      if (lines.length === 0) {
        const id = newLineId();
        setGrid((prev) => ({ ...prev, [key]: [{ id, text: "" }] }));
        focusLine(id);
      } else {
        const last = lines[lines.length - 1];
        focusLine(last.id, last.text.length);
      }
    },
    [grid, focusLine, newLineId],
  );

  const onPoolClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target !== e.currentTarget) return;
      const last = pool[pool.length - 1];
      if (last) focusLine(last.id, last.text.length);
    },
    [pool, focusLine],
  );

  const risksByColor = useMemo(() => {
    const result: Record<string, { line: GridLine; cellKey: CellKey }[]> = {};
    for (const group of COLOR_GROUPS) {
      const risks: { line: GridLine; cellKey: CellKey }[] = [];
      for (const cellKey of group.cells) {
        const lines = grid[cellKey] || [];
        for (const line of lines) {
          if (line.text.trim().length > 0) {
            risks.push({ line, cellKey });
          }
        }
      }
      result[group.key] = risks;
    }
    return result;
  }, [grid]);

  const allActions = useMemo(() => {
    const actions: StarredAction[] = [];
    for (const group of COLOR_GROUPS) {
      for (const cellKey of group.cells) {
        const lines = grid[cellKey] || [];
        for (const line of lines) {
          const reduce = line.reduce || [];
          const prepare = line.prepare || [];
          for (const s of reduce) {
            if (s.starred) {
              actions.push({
                subLine: s,
                cellKey,
                parentLineId: line.id,
                subType: "reduce",
                parentText: line.text,
                groupTone: group.key,
              });
            }
          }
          for (const s of prepare) {
            if (s.starred) {
              actions.push({
                subLine: s,
                cellKey,
                parentLineId: line.id,
                subType: "prepare",
                parentText: line.text,
                groupTone: group.key,
              });
            }
          }
        }
      }
    }
    return actions;
  }, [grid]);

  const addOtherAction = useCallback(() => {
    setOtherActions((prev) => [...prev, { id: newOtherId(), text: "" }]);
  }, [newOtherId]);

  const updateOtherAction = useCallback((id: string, text: string) => {
    setOtherActions((prev) =>
      prev.map((o) => (o.id === id ? { ...o, text } : o)),
    );
  }, []);

  const removeOtherAction = useCallback((id: string) => {
    setOtherActions((prev) => prev.filter((o) => o.id !== id));
  }, []);

  const splitOtherAction = useCallback(
    (id: string, caret: number) => {
      const nid = newOtherId();
      setOtherActions((prev) => {
        const idx = prev.findIndex((o) => o.id === id);
        if (idx < 0) return prev;
        const orig = prev[idx];
        return [
          ...prev.slice(0, idx),
          { ...orig, text: orig.text.slice(0, caret) },
          { id: nid, text: orig.text.slice(caret) },
          ...prev.slice(idx + 1),
        ];
      });
      return nid;
    },
    [newOtherId],
  );

  const mergeOtherWithPrevious = useCallback((id: string) => {
    setOtherActions((prev) => {
      const idx = prev.findIndex((o) => o.id === id);
      if (idx <= 0) return prev;
      const prevItem = prev[idx - 1];
      const curr = prev[idx];
      return [
        ...prev.slice(0, idx - 1),
        { ...prevItem, text: prevItem.text + curr.text },
        ...prev.slice(idx + 1),
      ];
    });
  }, []);

  const handleOtherKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>, action: OtherAction) => {
      const el = e.target as HTMLTextAreaElement;
      const caret = el.selectionStart ?? 0;
      const list = otherActions;

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const nid = splitOtherAction(action.id, caret);
        focusLine(nid, 0);
        return;
      }
      if (e.key === "Backspace" && caret === 0 && el.selectionEnd === 0) {
        const idx = list.findIndex((o) => o.id === action.id);
        if (idx > 0) {
          e.preventDefault();
          const prevLine = list[idx - 1];
          const targetCaret = prevLine.text.length;
          mergeOtherWithPrevious(action.id);
          focusLine(prevLine.id, targetCaret);
        }
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const linesRef = list.map((o) => ({ id: o.id, text: o.text }));
        if (handleListVerticalArrows(e, linesRef, action.id, focusLine)) return;
      }
    },
    [otherActions, splitOtherAction, mergeOtherWithPrevious, focusLine],
  );

  const handleOtherBlur = useCallback(
    (_e: React.FocusEvent<HTMLTextAreaElement>, action: OtherAction) => {
      if (action.text.length > 0) return;
      setOtherActions((prev) => {
        const idx = prev.findIndex((o) => o.id === action.id);
        if (idx < 0) return prev;
        if (idx !== prev.length - 1) return prev;
        if (prev.length <= 1) return prev;
        const without = prev.filter((o) => o.id !== action.id);
        const last = without[without.length - 1];
        if (without.length === 0 || (last && last.text !== "")) {
          without.push({ id: newOtherId(), text: "" });
        }
        return without;
      });
    },
    [newOtherId],
  );

  const toggleCategorizedRiskHidden = useCallback(
    (cellKey: CellKey, lineId: string) => {
      const k = categorizedRiskRowKey(cellKey, lineId);
      setHiddenCategorizedRiskKeys((prev) =>
        prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
      );
    },
    [],
  );

  const toggleCategorizedRevealHidden = useCallback(
    (groupKey: ColorGroupKey) => {
      setCategorizedRevealHidden((prev) => ({
        ...prev,
        [groupKey]: !prev[groupKey],
      }));
    },
    [],
  );

  const anyRisks = COLOR_GROUPS.some(
    (g) => (risksByColor[g.key] || []).length > 0,
  );

  const deleteDialogOnOpenChange = useCallback((open: boolean) => {
    if (!open) {
      closeDeleteConfirmation();
      return;
    }
    setIsDeleteConfirmOpen(true);
  }, [closeDeleteConfirmation]);

  const getSnapshot = useCallback((): RiskMatrixSnapshot => {
    return {
      pool,
      grid,
      collapsed,
      hasCompletedFirstDragToMatrix,
      otherActions,
      hiddenCategorizedRiskKeys,
      categorizedRevealHidden,
    };
  }, [
    pool,
    grid,
    collapsed,
    hasCompletedFirstDragToMatrix,
    otherActions,
    hiddenCategorizedRiskKeys,
    categorizedRevealHidden,
  ]);

  useEffect(() => {
    onSnapshotChangeRef.current?.(getSnapshot());
  }, [getSnapshot]);

  return {
    pool,
    grid,
    dragState,
    dragOverTarget,
    collapsed,
    setCollapsed,
    hasCompletedFirstDragToMatrix,
    isDeleteConfirmOpen,
    deleteDialogOnOpenChange,
    closeDeleteConfirmation,
    confirmDelete,
    risksByColor,
    allActions,
    otherActions,
    addOtherAction,
    updateOtherAction,
    removeOtherAction,
    handleOtherKeyDown,
    handleOtherBlur,
    hiddenCategorizedRiskKeys,
    categorizedRevealHidden,
    toggleCategorizedRiskHidden,
    toggleCategorizedRevealHidden,
    anyRisks,
    updateText,
    handleKeyDown,
    handleLineBlur,
    onGripPointerDown,
    onPoolClick,
    onCellClick,
    handleRiskKeyDown,
    updateSubText,
    handleSubKeyDown,
    toggleStar,
    getSnapshot,
  };
}
