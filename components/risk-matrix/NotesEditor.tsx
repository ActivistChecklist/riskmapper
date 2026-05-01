"use client";

import React, { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Link } from "@tiptap/extension-link";
import { Markdown } from "tiptap-markdown";
import {
  Bold,
  Heading1,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * WYSIWYG Markdown notes editor.
 *
 * - Wire format: Markdown. The `value` prop and the `onChange` payload
 *   are both raw Markdown strings; the editor parses and serialises
 *   on either side via the `tiptap-markdown` extension.
 * - Toolbar: minimal — bold, italic, two heading levels, two list
 *   types, link.
 * - Concurrency: shares the same LWW + 300 ms outbox debounce as the
 *   rest of the app's text fields. Two devices typing into the
 *   notes editor in the SAME ~300 ms window will clobber on the
 *   whole-field set; otherwise edits made "near each other" survive
 *   because each commit is debounced and the doc state vector
 *   advances monotonically.
 *
 * The editor is uncontrolled internally — we only push `value` in via
 * `commands.setContent` when it changes from outside (catch-up after
 * a remount, or initial hydrate). User typing flows out via
 * `onChange`; we do not push that same string back in.
 */

export type NotesEditorProps = {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  className?: string;
};

export default function NotesEditor({
  value,
  onChange,
  placeholder = "Add free-form notes here…",
  className,
}: NotesEditorProps) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // The Markdown extension stamps the editor's content from a Markdown
  // string at init and exposes editor.storage.markdown.getMarkdown()
  // for the reverse direction.
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // We don't want code blocks / horizontal rules / blockquotes in
        // the simple toolbar; keep the schema lean.
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        heading: { levels: [1, 2] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
          class: "underline underline-offset-2 text-rm-primary",
        },
      }),
      Markdown.configure({
        html: false,
        breaks: true,
        transformPastedText: true,
      }),
    ],
    content: value,
    immediatelyRender: false,
    onUpdate({ editor }) {
      // Pull markdown via the storage helper exposed by tiptap-markdown.
      // The cast is needed because @types/tiptap doesn't know about the
      // third-party extension's storage shape.
      const md = (
        editor.storage as { markdown?: { getMarkdown: () => string } }
      ).markdown?.getMarkdown();
      if (md !== undefined) onChangeRef.current(md);
    },
    editorProps: {
      attributes: {
        class:
          "min-h-[6rem] outline-none prose prose-sm max-w-none text-rm-ink " +
          "[&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-0 [&_h1]:mb-2 " +
          "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5 " +
          "[&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 " +
          "[&_a]:text-rm-primary [&_a]:underline [&_a]:underline-offset-2",
      },
    },
  });

  // Sync external value changes (e.g., remote update on a shared
  // matrix) into the editor without bouncing back to onChange. A
  // simple round-trip equality check avoids resetting the editor on
  // every parent render.
  useEffect(() => {
    if (!editor) return;
    const current = (
      editor.storage as { markdown?: { getMarkdown: () => string } }
    ).markdown?.getMarkdown();
    if (current === value) return;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return null;

  const toolbarButton = (
    icon: React.ReactNode,
    label: string,
    isActive: boolean,
    onClick: () => void,
  ) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={label}
      title={label}
      aria-pressed={isActive}
      onClick={onClick}
      className={cn(
        "h-8 w-8 p-0",
        isActive
          ? "bg-rm-primary/10 text-rm-primary hover:bg-rm-primary/15"
          : "text-rm-ink/70 hover:bg-black/5 hover:text-rm-ink",
      )}
    >
      {icon}
    </Button>
  );

  return (
    <div
      className={cn(
        "rounded-md border border-black/10 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        className,
      )}
    >
      <div
        className="flex flex-wrap items-center gap-0.5 border-b border-black/10 bg-zinc-50/80 px-1.5 py-1"
        role="toolbar"
        aria-label="Notes formatting"
      >
        {toolbarButton(
          <Bold size={14} strokeWidth={2.25} aria-hidden />,
          "Bold (⌘B)",
          editor.isActive("bold"),
          () => editor.chain().focus().toggleBold().run(),
        )}
        {toolbarButton(
          <Italic size={14} strokeWidth={2.25} aria-hidden />,
          "Italic (⌘I)",
          editor.isActive("italic"),
          () => editor.chain().focus().toggleItalic().run(),
        )}
        <span className="mx-0.5 inline-block h-5 w-px bg-black/10" aria-hidden />
        {toolbarButton(
          <Heading1 size={14} strokeWidth={2} aria-hidden />,
          "Heading 1",
          editor.isActive("heading", { level: 1 }),
          () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
        )}
        {toolbarButton(
          <Heading2 size={14} strokeWidth={2} aria-hidden />,
          "Heading 2",
          editor.isActive("heading", { level: 2 }),
          () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        )}
        <span className="mx-0.5 inline-block h-5 w-px bg-black/10" aria-hidden />
        {toolbarButton(
          <List size={14} strokeWidth={2} aria-hidden />,
          "Bulleted list",
          editor.isActive("bulletList"),
          () => editor.chain().focus().toggleBulletList().run(),
        )}
        {toolbarButton(
          <ListOrdered size={14} strokeWidth={2} aria-hidden />,
          "Numbered list",
          editor.isActive("orderedList"),
          () => editor.chain().focus().toggleOrderedList().run(),
        )}
        <span className="mx-0.5 inline-block h-5 w-px bg-black/10" aria-hidden />
        {toolbarButton(
          <LinkIcon size={14} strokeWidth={2} aria-hidden />,
          "Link",
          editor.isActive("link"),
          () => {
            const prev = (editor.getAttributes("link").href as string) || "";
            // Browser prompt() is intentional — the toolbar is meant
            // to stay simple, and a custom inline popover would carry
            // its own focus / keyboard / a11y burden that doesn't pay
            // for itself in a notes-side affordance.
            const url = typeof window !== "undefined" ? window.prompt("URL", prev) : prev;
            if (url === null) return;
            if (url === "") {
              editor.chain().focus().unsetLink().run();
              return;
            }
            editor
              .chain()
              .focus()
              .extendMarkRange("link")
              .setLink({ href: url })
              .run();
          },
        )}
      </div>
      <div className="px-3 py-2.5">
        <EditorContent
          editor={editor}
          // The placeholder shows when the document is empty — we use
          // a small CSS trick instead of @tiptap/extension-placeholder
          // to keep the dependency list short.
          data-empty-placeholder={
            editor.isEmpty ? placeholder : undefined
          }
          className="[&_.ProseMirror]:min-h-[6rem] [&_.ProseMirror]:outline-none [&_.ProseMirror.is-empty:first-child::before]:pointer-events-none"
        />
        {editor.isEmpty ? (
          <p className="pointer-events-none -mt-[6rem] select-none px-0 text-sm text-rm-ink/40 sm:text-[15px]">
            {placeholder}
          </p>
        ) : null}
      </div>
    </div>
  );
}
