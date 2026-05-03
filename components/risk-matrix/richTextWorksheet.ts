import { escapeHtml } from "./actionsClipboard";
import { CELL_BG_CLASSES, COLOR_GROUPS, COL_LABELS, ROW_LABELS } from "./constants";
import { parseNotesMarkdown, type NotesBlock, type NotesInline } from "./notesMarkdown";
import type {
  CellKey,
  GridLine,
  OtherAction,
  PoolLine,
  StarredAction,
} from "./types";

const HEX = {
  red: "#eebcbc",
  orange: "#f2d2b6",
  yellow: "#f1e6b8",
  green: "#d4ebd4",
  redSat: "#e0a3a3",
  orangeSat: "#e6bb98",
  yellowSat: "#e4d398",
  greenSat: "#b8d8b8",
  primary: "#0f7669",
  primaryFg: "#fafaf7",
  ink: "#1a1a1a",
  border: "#dadad6",
};

const TONE_TO_HEX: Record<"red" | "orange" | "yellow" | "green", string> = {
  red: HEX.red,
  orange: HEX.orange,
  yellow: HEX.yellow,
  green: HEX.green,
};

const TONE_TO_GROUP_HEX: Record<"red" | "orange" | "yellow" | "green", string> =
  {
    red: HEX.redSat,
    orange: HEX.orangeSat,
    yellow: HEX.yellowSat,
    green: HEX.greenSat,
  };

const CLASS_TO_HEX: Record<string, string> = {
  "bg-rm-red": HEX.red,
  "bg-rm-orange": HEX.orange,
  "bg-rm-yellow": HEX.yellow,
  "bg-rm-green": HEX.green,
};

function renderInlinesHtml(inlines: NotesInline[]): string {
  return inlines
    .map((seg) => {
      if (seg.kind === "link") {
        return `<a href="${escapeHtml(seg.href)}" style="color:${HEX.primary};text-decoration:underline;">${escapeHtml(seg.text)}</a>`;
      }
      let html = escapeHtml(seg.text);
      if (seg.code) {
        html = `<code style="font-family:monospace;background:#f3f3f0;padding:0 3px;border-radius:3px;">${html}</code>`;
      }
      if (seg.italic) html = `<em>${html}</em>`;
      if (seg.bold) html = `<strong>${html}</strong>`;
      return html;
    })
    .join("");
}

function renderNotesHtml(markdown: string): string {
  const blocks = parseNotesMarkdown(markdown);
  if (blocks.length === 0) return "";
  return blocks.map(renderBlockHtml).join("");
}

function renderBlockHtml(b: NotesBlock): string {
  if (b.kind === "h1") {
    return `<h2 style="margin:0.7em 0 0.3em 0;font-size:18px;">${renderInlinesHtml(b.inlines)}</h2>`;
  }
  if (b.kind === "h2") {
    return `<h3 style="margin:0.6em 0 0.3em 0;font-size:15px;">${renderInlinesHtml(b.inlines)}</h3>`;
  }
  if (b.kind === "h3") {
    return `<h4 style="margin:0.55em 0 0.25em 0;font-size:13px;">${renderInlinesHtml(b.inlines)}</h4>`;
  }
  if (b.kind === "ul") {
    const items = b.items
      .map(
        (item) =>
          `<li style="margin:0 0 0.25em 0;">${renderInlinesHtml(item)}</li>`,
      )
      .join("");
    return `<ul style="margin:0.4em 0;padding-left:1.4em;">${items}</ul>`;
  }
  if (b.kind === "ol") {
    const items = b.items
      .map(
        (item) =>
          `<li style="margin:0 0 0.25em 0;">${renderInlinesHtml(item)}</li>`,
      )
      .join("");
    return `<ol style="margin:0.4em 0;padding-left:1.4em;">${items}</ol>`;
  }
  if (b.kind === "p") {
    return `<p style="margin:0.4em 0;line-height:1.45;">${renderInlinesHtml(b.inlines)}</p>`;
  }
  return "";
}

function poolHtml(pool: PoolLine[]): string {
  const items = pool.filter((p) => p.text.trim().length > 0);
  if (items.length === 0) {
    return `<p style="margin:0.4em 0;color:#777;font-style:italic;">No risks left in the pool.</p>`;
  }
  const lis = items
    .map(
      (p) =>
        `<li style="margin:0 0 0.25em 0;">${escapeHtml(p.text)}</li>`,
    )
    .join("");
  return `<ul style="margin:0.4em 0;padding-left:1.4em;">${lis}</ul>`;
}

function matrixHtml(grid: Record<CellKey, GridLine[]>): string {
  const headerRow =
    `<tr><th></th>` +
    COL_LABELS.map(
      (l) =>
        `<th style="padding:6px 8px;border:1px solid ${HEX.border};font-weight:500;background:#fafaf7;">${escapeHtml(l)}</th>`,
    ).join("") +
    `</tr>`;

  const rows = [0, 1, 2]
    .map((row) => {
      const cells = [0, 1, 2]
        .map((col) => {
          const key = `${row}-${col}` as CellKey;
          const lines = (grid[key] || []).filter(
            (l) => l.text.trim().length > 0,
          );
          const bg = CLASS_TO_HEX[CELL_BG_CLASSES[row][col]] ?? "#ffffff";
          const inner =
            lines.length === 0
              ? "&nbsp;"
              : lines
                  .map(
                    (l) =>
                      `<div style="background:rgba(255,255,255,0.55);border:1px solid ${HEX.border};border-radius:3px;padding:2px 6px;margin:2px 0;font-size:12px;">${escapeHtml(l.text)}</div>`,
                  )
                  .join("");
          return `<td bgcolor="${bg}" style="background-color:${bg};border:1px solid ${HEX.border};vertical-align:top;padding:5px;min-width:140px;">${inner}</td>`;
        })
        .join("");
      return (
        `<tr>` +
        `<th style="padding:6px 8px;border:1px solid ${HEX.border};background:#fafaf7;font-weight:500;text-align:right;white-space:nowrap;">${escapeHtml(ROW_LABELS[row])}</th>` +
        cells +
        `</tr>`
      );
    })
    .join("");

  return (
    `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid ${HEX.border};margin:0.5em 0;">` +
    `<thead>${headerRow}</thead><tbody>${rows}</tbody></table>`
  );
}

function mitigationsHtml(grid: Record<CellKey, GridLine[]>): string {
  const sections = COLOR_GROUPS.map((group) => {
    const rows: { line: GridLine; cellKey: CellKey }[] = [];
    for (const cellKey of group.cells) {
      for (const line of grid[cellKey] || []) {
        if (line.text.trim().length > 0) rows.push({ line, cellKey });
      }
    }
    return { group, rows };
  }).filter((s) => s.rows.length > 0);

  if (sections.length === 0) {
    return `<p style="margin:0.4em 0;color:#777;font-style:italic;">No risks placed in the matrix yet.</p>`;
  }

  const head =
    `<thead><tr>` +
    [
      "Risk",
      "How can we reduce the likelihood of this happening?",
      "How can we limit the harm if it happens?",
    ]
      .map(
        (h) =>
          `<th style="padding:6px 8px;border:1px solid ${HEX.border};background:#fafaf7;font-weight:500;text-align:left;font-size:12px;">${escapeHtml(h)}</th>`,
      )
      .join("") +
    `</tr></thead>`;

  const renderSubs = (subs: { id: string; text: string; starred: boolean }[]) => {
    const nonEmpty = subs.filter((s) => s.text.trim().length > 0);
    if (nonEmpty.length === 0) return "&nbsp;";
    const items = nonEmpty
      .map(
        (s) =>
          `<li style="margin:0 0 2px 0;list-style:none;">${
            s.starred ? "★ " : "• "
          }${escapeHtml(s.text)}</li>`,
      )
      .join("");
    return `<ul style="margin:0;padding:0;">${items}</ul>`;
  };

  const body = sections
    .map(({ group, rows }) => {
      const headerRow =
        `<tr><td colspan="3" bgcolor="${TONE_TO_GROUP_HEX[group.key]}" style="background-color:${TONE_TO_GROUP_HEX[group.key]};border:1px solid ${HEX.border};padding:5px 8px;font-weight:700;text-transform:uppercase;font-size:11px;letter-spacing:0.04em;">${escapeHtml(group.label)} (${rows.length})</td></tr>`;
      const rowsHtml = rows
        .map(({ line }) => {
          const bg = TONE_TO_HEX[group.key];
          const reduce = line.reduce ?? [];
          const prepare = line.prepare ?? [];
          return (
            `<tr bgcolor="${bg}">` +
            `<td bgcolor="${bg}" style="background-color:${bg};border:1px solid ${HEX.border};padding:5px;vertical-align:top;width:33%;">` +
            `<div style="background:rgba(255,255,255,0.55);border:1px solid ${HEX.border};border-radius:3px;padding:3px 6px;font-size:12px;">${escapeHtml(line.text)}</div>` +
            `</td>` +
            `<td bgcolor="${bg}" style="background-color:${bg};border:1px solid ${HEX.border};padding:5px;vertical-align:top;font-size:12px;">${renderSubs(reduce)}</td>` +
            `<td bgcolor="${bg}" style="background-color:${bg};border:1px solid ${HEX.border};padding:5px;vertical-align:top;font-size:12px;">${renderSubs(prepare)}</td>` +
            `</tr>`
          );
        })
        .join("");
      return headerRow + rowsHtml;
    })
    .join("");

  return (
    `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid ${HEX.border};margin:0.5em 0;width:100%;">` +
    head +
    `<tbody>${body}</tbody></table>`
  );
}

function actionsHtml(
  starred: StarredAction[],
  otherActions: OtherAction[],
): string {
  const others = otherActions.filter((o) => o.text.trim().length > 0);
  if (starred.length === 0 && others.length === 0) {
    return `<p style="margin:0.4em 0;color:#777;font-style:italic;">No starred actions yet.</p>`;
  }
  const starredItems = starred
    .map((a) => {
      const kind = a.subType === "reduce" ? "Reduce" : "Prepare";
      const risk = a.parentText.trim() || "Untitled risk";
      return (
        `<li style="margin:0 0 0.4em 0;list-style:none;">` +
        `<span>★ </span>` +
        `<strong>${escapeHtml(a.subLine.text)}</strong>` +
        ` <span style="color:#555;font-size:0.9em;">— ${escapeHtml(kind)} · ${escapeHtml(risk)}</span>` +
        `</li>`
      );
    })
    .join("");
  const otherItems = others
    .map(
      (o) =>
        `<li style="margin:0 0 0.3em 0;list-style:none;">• ${escapeHtml(o.text)}</li>`,
    )
    .join("");
  const list = starredItems + otherItems;
  return `<ul style="margin:0.4em 0;padding-left:0;">${list}</ul>`;
}

export type RichWorksheetArgs = {
  title: string;
  pool: PoolLine[];
  grid: Record<CellKey, GridLine[]>;
  allActions: StarredAction[];
  otherActions: OtherAction[];
  notes: string;
};

export function buildRichWorksheetHtml(args: RichWorksheetArgs): string {
  const t = args.title.trim() || "Untitled risk matrix";
  const inner = [
    `<div style="font-family:Helvetica,Arial,sans-serif;color:${HEX.ink};font-size:13px;">`,
    `<h1 style="margin:0 0 4px 0;font-size:22px;">${escapeHtml(t)}</h1>`,
    `<p style="margin:0 0 14px 0;font-size:11px;color:${HEX.primary};"><a href="https://riskmapper.app" style="color:${HEX.primary};text-decoration:none;">riskmapper.app</a></p>`,
    `<h2 style="margin:0.7em 0 0.3em 0;font-size:16px;">Risks not yet placed</h2>`,
    poolHtml(args.pool),
    `<h2 style="margin:0.7em 0 0.3em 0;font-size:16px;">Risk matrix</h2>`,
    matrixHtml(args.grid),
    `<h2 style="margin:0.7em 0 0.3em 0;font-size:16px;">Mitigations &amp; preparations</h2>`,
    mitigationsHtml(args.grid),
    `<h2 style="margin:0.7em 0 0.3em 0;font-size:16px;">Actions</h2>`,
    actionsHtml(args.allActions, args.otherActions),
  ];
  const notesHtml = renderNotesHtml(args.notes);
  if (notesHtml) {
    inner.push(
      `<h2 style="margin:0.7em 0 0.3em 0;font-size:16px;">Notes</h2>`,
      notesHtml,
    );
  }
  inner.push(`</div>`);
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body>` +
    inner.join("") +
    `</body></html>`
  );
}
