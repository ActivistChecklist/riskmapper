"use client";

import React from "react";
import { ChevronDown, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type MatrixCopyDropdownProps = {
  /** Disable both items when there's nothing meaningful to copy. */
  hasContent: boolean;
  /** Plain-text full worksheet (current Markdown-y format). */
  onCopyAll: () => void | Promise<void>;
  /** HTML rich-text export with real colored tables. */
  onCopyRich: () => void | Promise<void>;
};

export default function MatrixCopyDropdown({
  hasContent,
  onCopyAll,
  onCopyRich,
}: MatrixCopyDropdownProps) {
  const triggerButton = (
    <Button
      type="button"
      variant="outline"
      size="default"
      className={cn("gap-2 px-3 text-[15px] sm:px-4")}
      aria-label="Copy worksheet"
      aria-haspopup="menu"
    >
      <Copy size={18} strokeWidth={2} aria-hidden />
      <span className="hidden md:inline-flex md:items-center md:gap-1">
        Copy
        <ChevronDown
          size={14}
          strokeWidth={2}
          aria-hidden
          className="opacity-70"
        />
      </span>
    </Button>
  );

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="md:hidden">
          Copy worksheet
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        <DropdownMenuItem
          disabled={!hasContent}
          onSelect={() => {
            void onCopyAll();
          }}
        >
          Copy plain text (markdown)
          <DropdownMenuShortcut>⌘⇧C</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!hasContent}
          onSelect={() => {
            void onCopyRich();
          }}
        >
          Copy rich text
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
