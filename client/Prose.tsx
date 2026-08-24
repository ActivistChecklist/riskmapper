import { Children, Fragment, type ReactNode } from "react";
import {
  parseNotesMarkdown,
  type NotesBlock,
  type NotesInline,
} from "@/components/risk-matrix/notesMarkdown";

/**
 * Renders the static documents (Privacy, Security) from Markdown.
 *
 * Those pages are prose that changes far more often than it changes shape,
 * and hand-maintaining a wall of `<p className="mt-4 leading-relaxed">` made
 * every copy edit a JSX edit. Authors write Markdown; anything Markdown
 * cannot express (the analytics event table, say) is passed through as a
 * child element and rendered as-is:
 *
 *   <Prose>
 *     {`## What we do collect ...`}
 *     <TrackedEvents />
 *     {`Events carry the name only ...`}
 *   </Prose>
 *
 * The parser is the same tiny CommonMark subset the notes editor uses
 * (`components/risk-matrix/notesMarkdown.ts`) rather than a second one, and
 * rather than a Markdown dependency: headings, paragraphs, lists, bold,
 * italic, inline code and links cover these pages completely. Note there is
 * no HTML pass-through and no `dangerouslySetInnerHTML` anywhere in it —
 * the parser emits an AST and this file turns that into React elements.
 */

const LINK_CLASS =
  "font-medium underline underline-offset-2 hover:text-rm-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rm-ring";

const CODE_CLASS =
  "rounded bg-rm-surface-2 px-1.5 py-0.5 font-mono text-[0.85em] text-rm-ink";

const HEADING_CLASS = {
  h1: "mt-10 text-2xl font-semibold tracking-tight",
  h2: "mt-10 text-xl font-semibold",
  h3: "mt-6 text-base font-semibold",
} as const;

/**
 * Emoji that stand in for the list bullet, as on activistchecklist.org: a
 * list whose every item opens with one of these renders unbulleted, with the
 * emoji as the marker. Mixed lists keep ordinary bullets, so a stray ✅ in
 * one item cannot silently restyle the rest.
 */
const MARKERS = ["✅", "❌"] as const;
const MARKER_RE = new RegExp(`^(${MARKERS.join("|")})\\s+`);

function renderInline(node: NotesInline, key: number): ReactNode {
  if (node.kind === "link") {
    // Off-site links open in a new tab; in-app ones (/privacy/) do not.
    const external = /^https?:\/\//.test(node.href);
    return (
      <a
        key={key}
        href={node.href}
        className={LINK_CLASS}
        {...(external
          ? { target: "_blank", rel: "noopener noreferrer" }
          : null)}
      >
        {node.text}
      </a>
    );
  }
  if (node.code) {
    return (
      <code key={key} className={CODE_CLASS}>
        {node.text}
      </code>
    );
  }
  if (node.bold) {
    return (
      <strong key={key} className="font-semibold">
        {node.text}
      </strong>
    );
  }
  if (node.italic) {
    return <em key={key}>{node.text}</em>;
  }
  return <Fragment key={key}>{node.text}</Fragment>;
}

function renderInlines(nodes: NotesInline[]): ReactNode[] {
  return nodes.map(renderInline);
}

/** Splits a leading ✅/❌ off an item, or reports that there isn't one. */
function splitMarker(
  inlines: NotesInline[],
): { marker: string; rest: NotesInline[] } | null {
  const first = inlines[0];
  if (!first || first.kind !== "text") return null;
  const match = MARKER_RE.exec(first.text);
  if (!match) return null;
  return {
    marker: match[1],
    rest: [
      { ...first, text: first.text.slice(match[0].length) },
      ...inlines.slice(1),
    ],
  };
}

function renderList(block: Extract<NotesBlock, { kind: "ul" | "ol" }>, key: number) {
  const markers = block.items.map(splitMarker);
  const allMarked = block.kind === "ul" && markers.every((m) => m !== null);

  if (allMarked) {
    return (
      <ul key={key} className="mt-3 space-y-2 leading-relaxed">
        {markers.map((m, i) => (
          <li key={i}>
            {/* Decorative: the surrounding heading already carries the
                "what we do not collect" sense, so reading "cross mark"
                aloud before every item would only add noise. */}
            <span aria-hidden>{m!.marker}</span> {renderInlines(m!.rest)}
          </li>
        ))}
      </ul>
    );
  }

  const Tag = block.kind;
  return (
    <Tag
      key={key}
      className={`mt-3 space-y-2 pl-5 leading-relaxed marker:text-rm-muted-2 ${
        block.kind === "ol" ? "list-decimal" : "list-disc"
      }`}
    >
      {block.items.map((item, i) => (
        <li key={i}>{renderInlines(item)}</li>
      ))}
    </Tag>
  );
}

function renderBlock(block: NotesBlock, key: number): ReactNode {
  if (block.kind === "ul" || block.kind === "ol") return renderList(block, key);
  if (block.kind === "p") {
    return (
      <p key={key} className="mt-4 leading-relaxed">
        {renderInlines(block.inlines)}
      </p>
    );
  }
  const Heading = block.kind;
  return (
    <Heading key={key} className={HEADING_CLASS[block.kind]}>
      {renderInlines(block.inlines)}
    </Heading>
  );
}

/** Markdown source to React elements. Exported for tests. */
export function renderMarkdown(markdown: string): ReactNode[] {
  return parseNotesMarkdown(markdown).map(renderBlock);
}

export function Prose({ children }: { children: ReactNode }) {
  return (
    // The first block sits directly under the page header, which already
    // supplies the gap; every block after it brings its own top margin.
    <div className="[&>*:first-child]:mt-0">
      {Children.map(children, (child) =>
        typeof child === "string" ? <>{renderMarkdown(child)}</> : child,
      )}
    </div>
  );
}
