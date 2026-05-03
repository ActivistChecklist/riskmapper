import React from "react";
import {
  Document,
  Link,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import {
  CELL_BG_CLASSES,
  COLOR_GROUPS,
  COL_LABELS,
  ROW_LABELS,
  type ColorGroup,
} from "../constants";
import type { CellKey, GridLine, OtherAction, StarredAction } from "../types";
import type { RiskMatrixSnapshot } from "../matrixTypes";
import {
  parseNotesMarkdown,
  type NotesBlock,
  type NotesInline,
} from "../notesMarkdown";
import { ensurePdfFontsRegistered } from "./fonts";

ensurePdfFontsRegistered();

/** SVG star — Roboto's Latin subset doesn't include U+2605, so we draw it. */
function StarIcon({
  size = 10,
  color = "#1a1a1a",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2.5 L14.94 8.96 L22 9.74 L16.7 14.43 L18.18 21.5 L12 17.77 L5.82 21.5 L7.3 14.43 L2 9.74 L9.06 8.96 Z"
        fill={color}
      />
    </Svg>
  );
}

const COLORS = {
  ink: "#1a1a1a",
  primary: "#0f7669",
  primaryFg: "#fafaf7",
  canvas: "#fafaf7",
  // Solid light grays mirroring the site's `border-black/8`-ish opacities.
  // rgba alpha can render heavier than expected in PDF viewers, so we use
  // explicit hex values that match the visual weight of the on-screen
  // borders.
  border: "#dadad6",
  borderSoft: "#e7e7e3",
  borderFaint: "#efefec",
  helpBg: "#f4f4f0",
  cellTextBg: "rgba(255,255,255,0.55)",
  zebra: "#f7f7f5",
  red: "#eebcbc",
  orange: "#f2d2b6",
  yellow: "#f1e6b8",
  green: "#d4ebd4",
  redSat: "#e0a3a3",
  orangeSat: "#e6bb98",
  yellowSat: "#e4d398",
  greenSat: "#b8d8b8",
};

const CELL_BG_HEX: Record<string, string> = {
  "bg-rm-red": COLORS.red,
  "bg-rm-orange": COLORS.orange,
  "bg-rm-yellow": COLORS.yellow,
  "bg-rm-green": COLORS.green,
};

const GROUP_BG: Record<ColorGroup["key"], string> = {
  red: COLORS.red,
  orange: COLORS.orange,
  yellow: COLORS.yellow,
  green: COLORS.green,
};

const GROUP_HEADER_BG: Record<ColorGroup["key"], string> = {
  red: COLORS.redSat,
  orange: COLORS.orangeSat,
  yellow: COLORS.yellowSat,
  green: COLORS.greenSat,
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Roboto",
    fontSize: 10,
    color: COLORS.ink,
    backgroundColor: COLORS.canvas,
    paddingTop: 36,
    paddingBottom: 36,
    paddingLeft: 36,
    paddingRight: 36,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 14,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    flex: 1,
  },
  brand: {
    fontSize: 10,
    color: COLORS.primary,
    fontWeight: 500,
    textDecoration: "none",
  },
  pageFooterHint: {
    position: "absolute",
    left: 36,
    right: 36,
    bottom: 28,
    textAlign: "center",
  },
  pageFooterHintText: {
    fontSize: 9,
    fontStyle: "italic",
    color: "#999",
  },
  helpCard: {
    backgroundColor: COLORS.helpBg,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: 12,
    marginBottom: 14,
  },
  helpHeading: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 6,
  },
  helpParagraph: {
    fontSize: 10,
    lineHeight: 1.45,
    marginBottom: 6,
  },
  bold: { fontWeight: 700 },
  italic: { fontStyle: "italic" },
  stepCard: {
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    marginBottom: 14,
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    color: COLORS.primaryFg,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
  },
  stepBadge: {
    backgroundColor: "rgba(255,255,255,0.14)",
    paddingVertical: 3,
    paddingHorizontal: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeLabel: {
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 1.2,
    color: COLORS.primaryFg,
    lineHeight: 1,
  },
  stepTitle: {
    fontSize: 11,
    fontWeight: 500,
    flex: 1,
    color: COLORS.primaryFg,
  },
  stepBody: {
    backgroundColor: "#ffffff",
    padding: 10,
  },
  poolItem: {
    fontSize: 10,
    paddingVertical: 3,
    flexDirection: "row",
    gap: 4,
  },
  poolBullet: {
    width: 8,
    color: COLORS.ink,
  },
  poolText: { flex: 1, lineHeight: 1.4 },
  emptyText: {
    fontSize: 9,
    fontStyle: "italic",
    color: "#777",
    paddingVertical: 4,
  },
  // Matrix
  matrixWrap: {
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  matrixGrid: {
    flexDirection: "column",
  },
  matrixRow: {
    flexDirection: "row",
  },
  axisCornerCell: {
    width: 44,
    backgroundColor: COLORS.canvas,
  },
  colHeaderCell: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
    backgroundColor: COLORS.canvas,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderColor: COLORS.borderFaint,
  },
  colHeaderText: {
    fontSize: 9,
    fontWeight: 500,
  },
  rowLabelCell: {
    width: 44,
    backgroundColor: COLORS.canvas,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderTopWidth: 1,
    borderColor: COLORS.borderFaint,
  },
  rowLabelRotator: {
    transform: "rotate(-90deg)",
    width: 110,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabelText: {
    fontSize: 9,
    fontWeight: 500,
    textAlign: "center",
  },
  cell: {
    flex: 1,
    padding: 4,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: COLORS.borderFaint,
    minHeight: 110,
  },
  cellLine: {
    fontSize: 9,
    paddingVertical: 3,
    paddingHorizontal: 7,
    marginVertical: 1.5,
    backgroundColor: "rgba(255,255,255,0.55)",
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderRadius: 3,
    lineHeight: 1.3,
  },
  // Mitigations table
  mitWrap: {
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  mitColHeader: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderColor: COLORS.borderSoft,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  mitColHeaderCell: {
    flex: 1,
    fontSize: 9,
    fontWeight: 500,
    paddingHorizontal: 4,
  },
  mitGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  mitGroupLabel: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    flex: 1,
  },
  mitGroupCount: {
    fontSize: 9,
    opacity: 0.85,
  },
  mitRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderColor: COLORS.borderFaint,
    alignItems: "flex-start",
  },
  mitRowZebra: {
    backgroundColor: COLORS.zebra,
  },
  mitRiskBox: {
    flex: 1,
    padding: 4,
    backgroundColor: "rgba(255,255,255,0.45)",
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderRadius: 3,
    marginRight: 6,
  },
  mitRiskText: { fontSize: 9, lineHeight: 1.35 },
  mitCol: {
    flex: 1,
    paddingHorizontal: 4,
  },
  mitSubItem: {
    flexDirection: "row",
    paddingVertical: 1.5,
    gap: 4,
    alignItems: "flex-start",
  },
  mitSubMarker: {
    width: 10,
    paddingTop: 2,
  },
  mitSubBullet: {
    fontSize: 9,
    width: 10,
    paddingTop: 0,
  },
  mitSubText: {
    fontSize: 9,
    flex: 1,
    lineHeight: 1.35,
  },
  // Actions panel
  actionsCard: {
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    marginTop: 14,
  },
  actionsHeader: {
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 10,
    gap: 6,
  },
  actionsHeaderText: {
    color: COLORS.primaryFg,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    flex: 1,
  },
  actionsHeaderCount: {
    color: COLORS.primaryFg,
    fontSize: 9,
    opacity: 0.95,
  },
  actionsBody: {
    backgroundColor: "#ffffff",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  actionItem: {
    flexDirection: "row",
    paddingVertical: 4,
    gap: 6,
    alignItems: "flex-start",
  },
  actionMarker: {
    width: 14,
    paddingTop: 2,
    alignItems: "center",
  },
  actionTextWrap: {
    flex: 1,
    flexDirection: "column",
  },
  actionText: {
    fontSize: 10,
    lineHeight: 1.35,
  },
  actionContext: {
    fontSize: 8,
    marginTop: 1,
    opacity: 0.7,
  },
  actionBullet: {
    fontSize: 10,
    color: COLORS.ink,
    width: 14,
    textAlign: "center",
  },
  // Notes
  notesCard: {
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    marginTop: 14,
  },
  notesHeader: {
    backgroundColor: COLORS.primary,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  notesHeaderText: {
    color: COLORS.primaryFg,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  notesBody: {
    backgroundColor: "#ffffff",
    padding: 10,
  },
  notesParagraph: {
    fontSize: 10,
    lineHeight: 1.45,
    marginBottom: 6,
  },
  notesH1: {
    fontSize: 15,
    fontWeight: 700,
    marginTop: 4,
    marginBottom: 5,
    lineHeight: 1.25,
  },
  notesH2: {
    fontSize: 13,
    fontWeight: 700,
    marginTop: 4,
    marginBottom: 4,
    lineHeight: 1.25,
  },
  notesH3: {
    fontSize: 11,
    fontWeight: 700,
    marginTop: 4,
    marginBottom: 3,
    lineHeight: 1.25,
  },
  notesListItem: {
    flexDirection: "row",
    paddingLeft: 6,
    marginBottom: 2,
  },
  notesListMarker: {
    width: 14,
    fontSize: 10,
    lineHeight: 1.45,
  },
  notesListText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 1.45,
  },
  notesLink: {
    color: COLORS.primary,
    textDecoration: "underline",
  },
  stepHeaderBrand: {
    fontSize: 10,
    color: COLORS.primaryFg,
    fontWeight: 400,
    textDecoration: "none",
  },
});

function StepHeader({
  step,
  title,
  rightSlot,
}: {
  step: 1 | 2 | 3;
  title: string;
  rightSlot?: React.ReactNode;
}) {
  return (
    <View style={styles.stepHeader} fixed={false}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepBadgeLabel}>STEP {step}</Text>
      </View>
      <Text style={styles.stepTitle}>{title}</Text>
      {rightSlot}
    </View>
  );
}

function HelpSection() {
  return (
    <View style={styles.helpCard} wrap={false}>
      <Text style={styles.helpHeading}>How to do risk mapping</Text>
      <Text style={styles.helpParagraph}>
        Good organizing means taking strategic risks. A risk assessment isn&apos;t
        about eliminating risk, it helps your group take bolder action with
        clearer eyes by naming what you&apos;re actually facing, deciding what
        matters most, and choosing what&apos;s worth preparing for. It works
        best done with a few people on your team.
      </Text>
      <Text style={styles.helpParagraph}>
        <Text style={styles.bold}>Name the risks.</Text> Be concrete:{" "}
        <Text style={styles.italic}>who</Text> could do{" "}
        <Text style={styles.italic}>what</Text>. (&quot;A counter-protester
        could try to provoke a fight.&quot; &quot;Police could arrest
        participants for trespassing.&quot; &quot;A leader could be doxxed
        because their name is on the sign-up page.&quot;) Don&apos;t try to
        list every possibility. Focus on what feels concerning for this group,
        this action, this place, this moment.
      </Text>
      <Text style={styles.helpParagraph}>
        <Text style={styles.bold}>Place each risk by impact and likelihood.</Text>{" "}
        Impact is how bad it would be if it happened. Likelihood is how likely
        it is to actually happen for a group like yours. If you&apos;re unsure
        how likely something is, ask people doing similar work in your area.
        Grounding the estimate in real experience pulls you out of reactive
        fear.
      </Text>
      <Text style={styles.helpParagraph}>
        <Text style={styles.bold}>Add mitigations.</Text> Under each
        categorized risk, brainstorm two kinds of action: ways to{" "}
        <Text style={styles.italic}>reduce the likelihood</Text> it happens
        (vet new members, use Signal, secure your accounts) and ways to{" "}
        <Text style={styles.italic}>prepare to respond</Text> if it does
        (know-your-rights training, exit routes, legal hotline saved). Star the
        most important ones to surface them in the Actions panel as your
        shortlist of what to actually go do.
      </Text>
    </View>
  );
}

function PoolList({ pool }: { pool: RiskMatrixSnapshot["pool"] }) {
  const items = pool.filter((p) => p.text.trim().length > 0);
  if (items.length === 0) {
    return (
      <Text style={styles.emptyText}>
        No risks left in the pool — everything has been placed in the matrix.
      </Text>
    );
  }
  return (
    <View>
      {items.map((line) => (
        <View key={line.id} style={styles.poolItem}>
          <Text style={styles.poolBullet}>•</Text>
          <Text style={styles.poolText}>{line.text}</Text>
        </View>
      ))}
    </View>
  );
}

function MatrixGrid({ grid }: { grid: RiskMatrixSnapshot["grid"] }) {
  return (
    <View style={styles.matrixWrap}>
      <View style={styles.matrixGrid}>
        {/* Column-headers row */}
        <View style={styles.matrixRow}>
          <View style={styles.axisCornerCell} />
          {COL_LABELS.map((label) => (
            <View key={label} style={styles.colHeaderCell}>
              <Text style={styles.colHeaderText}>{label}</Text>
            </View>
          ))}
        </View>
        {/* Matrix body */}
        {[0, 1, 2].map((row) => (
          <View key={row} style={styles.matrixRow}>
            <View style={styles.rowLabelCell}>
              <View style={styles.rowLabelRotator}>
                <Text style={styles.rowLabelText}>{ROW_LABELS[row]}</Text>
              </View>
            </View>
            {[0, 1, 2].map((col) => {
              const key = `${row}-${col}` as CellKey;
              const cellLines = (grid[key] || []).filter(
                (l) => l.text.trim().length > 0,
              );
              const bg = CELL_BG_HEX[CELL_BG_CLASSES[row][col]];
              return (
                <View
                  key={col}
                  style={[styles.cell, { backgroundColor: bg }]}
                >
                  {cellLines.map((line) => (
                    <Text key={line.id} style={styles.cellLine}>
                      {line.text}
                    </Text>
                  ))}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

type RiskRow = { line: GridLine; cellKey: CellKey };

function computeRisksByColor(
  grid: RiskMatrixSnapshot["grid"],
): Record<ColorGroup["key"], RiskRow[]> {
  const out = {
    red: [] as RiskRow[],
    orange: [] as RiskRow[],
    yellow: [] as RiskRow[],
    green: [] as RiskRow[],
  };
  for (const group of COLOR_GROUPS) {
    for (const cellKey of group.cells) {
      for (const line of grid[cellKey] || []) {
        if (line.text.trim().length > 0) {
          out[group.key].push({ line, cellKey });
        }
      }
    }
  }
  return out;
}

function computeStarredActions(
  grid: RiskMatrixSnapshot["grid"],
): StarredAction[] {
  const actions: StarredAction[] = [];
  for (const group of COLOR_GROUPS) {
    for (const cellKey of group.cells) {
      for (const line of grid[cellKey] || []) {
        for (const s of line.reduce || []) {
          if (s.starred && s.text.trim().length > 0) {
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
        for (const s of line.prepare || []) {
          if (s.starred && s.text.trim().length > 0) {
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
}

function MitigationsTable({ grid }: { grid: RiskMatrixSnapshot["grid"] }) {
  const risksByColor = computeRisksByColor(grid);
  const sections = COLOR_GROUPS.flatMap((group) => {
    const rows = risksByColor[group.key];
    if (!rows.length) return [];
    return [{ group, rows }];
  });

  if (sections.length === 0) {
    return (
      <Text style={styles.emptyText}>
        No risks placed in the matrix yet — drag from the pool to start
        brainstorming mitigations.
      </Text>
    );
  }

  return (
    <View style={styles.mitWrap}>
      <View style={styles.mitColHeader}>
        <Text style={styles.mitColHeaderCell}>Risk</Text>
        <Text style={styles.mitColHeaderCell}>
          How can we reduce the likelihood of this happening?
        </Text>
        <Text style={styles.mitColHeaderCell}>
          How can we limit the harm if it happens?
        </Text>
      </View>
      {sections.map(({ group, rows }) => (
        <View key={group.key} wrap={false}>
          <View
            style={[
              styles.mitGroupHeader,
              { backgroundColor: GROUP_HEADER_BG[group.key] },
            ]}
          >
            <Text style={styles.mitGroupLabel}>{group.label}</Text>
            <Text style={styles.mitGroupCount}>({rows.length})</Text>
          </View>
          {rows.map(({ line, cellKey }) => {
            const reduce = (line.reduce || []).filter(
              (s) => s.text.trim().length > 0,
            );
            const prepare = (line.prepare || []).filter(
              (s) => s.text.trim().length > 0,
            );
            return (
              <View
                key={`${cellKey}:${line.id}`}
                style={[
                  styles.mitRow,
                  { backgroundColor: GROUP_BG[group.key] },
                ]}
                wrap={false}
              >
                <View style={styles.mitRiskBox}>
                  <Text style={styles.mitRiskText}>{line.text}</Text>
                </View>
                <View style={styles.mitCol}>
                  {reduce.length === 0 ? (
                    <Text style={styles.emptyText}> </Text>
                  ) : (
                    reduce.map((s) => (
                      <View key={s.id} style={styles.mitSubItem}>
                        <View style={styles.mitSubMarker}>
                          {s.starred ? (
                            <StarIcon size={9} />
                          ) : (
                            <Text style={styles.mitSubBullet}>•</Text>
                          )}
                        </View>
                        <Text style={styles.mitSubText}>{s.text}</Text>
                      </View>
                    ))
                  )}
                </View>
                <View style={styles.mitCol}>
                  {prepare.length === 0 ? (
                    <Text style={styles.emptyText}> </Text>
                  ) : (
                    prepare.map((s) => (
                      <View key={s.id} style={styles.mitSubItem}>
                        <View style={styles.mitSubMarker}>
                          {s.starred ? (
                            <StarIcon size={9} />
                          ) : (
                            <Text style={styles.mitSubBullet}>•</Text>
                          )}
                        </View>
                        <Text style={styles.mitSubText}>{s.text}</Text>
                      </View>
                    ))
                  )}
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function ActionsPanel({
  starred,
  otherActions,
}: {
  starred: StarredAction[];
  otherActions: OtherAction[];
}) {
  const others = otherActions.filter((o) => o.text.trim().length > 0);
  const hasContent = starred.length > 0 || others.length > 0;
  const total = starred.length + others.length;

  return (
    <View style={styles.actionsCard} wrap={false}>
      <View style={styles.actionsHeader}>
        <View style={styles.actionMarker}>
          <StarIcon size={11} color={COLORS.primaryFg} />
        </View>
        <Text style={styles.actionsHeaderText}>Actions</Text>
        <Text style={styles.actionsHeaderCount}>({total})</Text>
      </View>
      <View style={styles.actionsBody}>
        {!hasContent ? (
          <Text style={styles.emptyText}>
            Star a mitigation or preparation to surface it here as a
            prioritized action.
          </Text>
        ) : (
          <>
            {starred.map((a) => (
              <View
                key={`${a.cellKey}-${a.parentLineId}-${a.subType}-${a.subLine.id}`}
                style={styles.actionItem}
              >
                <View style={styles.actionMarker}>
                  <StarIcon size={11} />
                </View>
                <View style={styles.actionTextWrap}>
                  <Text style={styles.actionText}>{a.subLine.text}</Text>
                  <Text style={styles.actionContext}>
                    {a.subType === "reduce" ? "Reduce" : "Prepare"} ·{" "}
                    {a.parentText.trim() || "(no risk text)"}
                  </Text>
                </View>
              </View>
            ))}
            {others.map((o) => (
              <View key={o.id} style={styles.actionItem}>
                <Text style={styles.actionBullet}>•</Text>
                <View style={styles.actionTextWrap}>
                  <Text style={styles.actionText}>{o.text}</Text>
                </View>
              </View>
            ))}
          </>
        )}
      </View>
    </View>
  );
}

// Notes use the shared markdown parser (also used by the rich-text
// clipboard exporter so both surfaces interpret the same syntax).

function renderInlines(inlines: NotesInline[]) {
  return inlines.map((seg, idx) => {
    if (seg.kind === "link") {
      return (
        <Link key={idx} src={seg.href} style={styles.notesLink}>
          {seg.text}
        </Link>
      );
    }
    const style: { fontWeight?: number; fontStyle?: "italic"; fontFamily?: string } = {};
    if (seg.bold) style.fontWeight = 700;
    if (seg.italic) style.fontStyle = "italic";
    if (seg.code) style.fontFamily = "Courier";
    return (
      <Text key={idx} style={style}>
        {seg.text}
      </Text>
    );
  });
}

function NotesPanel({ markdown }: { markdown: string }) {
  const blocks = parseNotesMarkdown(markdown);
  if (blocks.length === 0) return null;

  return (
    <View style={styles.notesCard}>
      <View style={styles.notesHeader}>
        <Text style={styles.notesHeaderText}>Notes</Text>
      </View>
      <View style={styles.notesBody}>
        {blocks.map((b, i) => {
          if (b.kind === "h1") {
            return (
              <Text key={i} style={styles.notesH1}>
                {renderInlines(b.inlines)}
              </Text>
            );
          }
          if (b.kind === "h2") {
            return (
              <Text key={i} style={styles.notesH2}>
                {renderInlines(b.inlines)}
              </Text>
            );
          }
          if (b.kind === "h3") {
            return (
              <Text key={i} style={styles.notesH3}>
                {renderInlines(b.inlines)}
              </Text>
            );
          }
          if (b.kind === "ul" || b.kind === "ol") {
            return (
              <View key={i} style={{ marginBottom: 6 }}>
                {b.items.map((item, j) => (
                  <View key={j} style={styles.notesListItem}>
                    <Text style={styles.notesListMarker}>
                      {b.kind === "ul" ? "•" : `${j + 1}.`}
                    </Text>
                    <Text style={styles.notesListText}>
                      {renderInlines(item)}
                    </Text>
                  </View>
                ))}
              </View>
            );
          }
          if (b.kind === "p") {
            return (
              <Text key={i} style={styles.notesParagraph}>
                {renderInlines(b.inlines)}
              </Text>
            );
          }
          return null;
        })}
      </View>
    </View>
  );
}

export type MatrixPdfDocumentProps = {
  title: string;
  snapshot: RiskMatrixSnapshot;
};

export function MatrixPdfDocument({ title, snapshot }: MatrixPdfDocumentProps) {
  const starred = computeStarredActions(snapshot.grid);

  return (
    <Document title={title || "Risk matrix"}>
      {/* Page 1 — portrait — title, help, step 1 (risk pool) */}
      <Page size="LETTER" orientation="portrait" style={styles.page}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title || "Untitled risk matrix"}</Text>
          <Link src="https://riskmapper.app" style={styles.brand}>
            Created by RiskMapper.app
          </Link>
        </View>
        <HelpSection />
        <View style={styles.stepCard} wrap={false}>
          <StepHeader
            step={1}
            title="What risks concern you the most right now?"
          />
          <View style={styles.stepBody}>
            <PoolList pool={snapshot.pool} />
          </View>
        </View>
        <View style={styles.pageFooterHint}>
          <Text style={styles.pageFooterHintText}>
            The risk matrix continues on the next page.
          </Text>
        </View>
      </Page>

      {/* Page 2 — landscape — step 2 matrix */}
      <Page size="LETTER" orientation="landscape" style={styles.page}>
        <View style={styles.stepCard}>
          <StepHeader
            step={2}
            title="Drag the risks into the matrix"
            rightSlot={
              <Link
                src="https://riskmapper.app"
                style={styles.stepHeaderBrand}
              >
                Created by RiskMapper.app
              </Link>
            }
          />
          <View style={[styles.stepBody, { padding: 0 }]}>
            <MatrixGrid grid={snapshot.grid} />
          </View>
        </View>
      </Page>

      {/* Page 3+ — portrait — step 3 mitigations, actions, notes */}
      <Page size="LETTER" orientation="portrait" style={styles.page}>
        <View style={styles.stepCard}>
          <StepHeader
            step={3}
            title="Brainstorm ways you can prepare for these risks. Star the items you intend to act on."
          />
          <View style={[styles.stepBody, { padding: 0 }]}>
            <MitigationsTable grid={snapshot.grid} />
          </View>
        </View>
        <ActionsPanel
          starred={starred}
          otherActions={snapshot.otherActions}
        />
        <NotesPanel markdown={snapshot.notes} />
      </Page>
    </Document>
  );
}
