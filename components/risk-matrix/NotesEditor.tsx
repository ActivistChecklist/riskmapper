"use client";

import React, { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Link } from "@tiptap/extension-link";
import { Markdown } from "tiptap-markdown";
import {
  Bold,
  FileText,
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
 * WYSIWYG notes editor for the right-hand sidebar.
 *
 * Wire format: HTML, not Markdown. The original implementation tried
 * to keep `value` as Markdown (per the user-stated preference) but
 * Markdown can't faithfully represent the editor's structure: two
 * consecutive empty paragraphs serialize to two `\n\n` runs, which
 * any CommonMark parser collapses back to a single paragraph
 * separator. Pressing Enter on an empty line then either failed to
 * sync (unchanged Markdown output) or got dropped on the receiving
 * client (collapse on parse). HTML preserves `<p></p><p></p>`
 * verbatim through the editor's round-trip, so multi-newline edits
 * survive sync and render the same on every device.
 *
 * tiptap-markdown stays loaded so existing data stored as Markdown
 * (during the brief window before this switch) is still parsed
 * correctly on first hydrate; new writes always emit HTML.
 *
 * Concurrency: shares the same LWW + 300 ms outbox debounce as the
 * rest of the app's text fields. Two devices typing into the notes
 * editor in the SAME ~300 ms window will clobber on the whole-field
 * set; otherwise edits made "near each other" survive.
 */

export type NotesEditorProps = {
  value: string;
  onChange: (html: string) => void;
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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
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
      // Loaded so legacy Markdown content can hydrate cleanly. Not
      // used on the write path — onUpdate emits HTML.
      Markdown.configure({
        html: false,
        breaks: true,
        transformPastedText: true,
      }),
    ],
    content: value,
    immediatelyRender: false,
    onUpdate({ editor }) {
      onChangeRef.current(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          // min-h sized to feel like a textarea you'd actually write
          // a paragraph or two into. The editor still grows past
          // this as you type.
          "min-h-[12rem] outline-none prose prose-sm max-w-none text-rm-ink " +
          "[&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-0 [&_h1]:mb-2 " +
          "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5 " +
          "[&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 " +
          "[&_a]:text-rm-primary [&_a]:underline [&_a]:underline-offset-2",
      },
    },
  });

  // Sync external value changes (catch-up after a remount, initial
  // hydrate, or remote update on a shared matrix) into the editor
  // without bouncing back to onChange. setContent accepts either
  // HTML or Markdown — tiptap-markdown's parser handles strings that
  // don't start with a tag, so legacy Markdown payloads still hydrate.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
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
        "flex flex-col overflow-hidden rounded-md border border-black/10 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        className,
      )}
    >
      {/* Step-style header bar — same shape ActionsAside uses, so the
          two siblings in the right column read as a pair. */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-white/25 bg-rm-primary px-2 py-2 text-rm-primary-fg sm:px-3">
        <FileText size={13} strokeWidth={2} aria-hidden />
        <span className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide sm:text-sm">
          Notes
        </span>
      </div>
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
            const url =
              typeof window !== "undefined" ? window.prompt("URL", prev) : prev;
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
          data-empty-placeholder={editor.isEmpty ? placeholder : undefined}
          className="[&_.ProseMirror]:min-h-[12rem] [&_.ProseMirror]:outline-none"
        />
        {/* Empty-state placeholder — overlaid via negative margin so
            it sits inside the editor's min-height area without taking
            extra space. We do it this way (instead of pulling in
            @tiptap/extension-placeholder) to keep the dep list short. */}
        {editor.isEmpty ? (
          <p className="pointer-events-none -mt-[12rem] select-none px-0 text-sm text-rm-ink/40 sm:text-[15px]">
            {placeholder}
          </p>
        ) : null}
      </div>
    </div>
  );
}
