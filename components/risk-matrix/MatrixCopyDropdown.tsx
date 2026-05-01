"use client";

import React from "react";
import { ChevronDown, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
  iconOnly?: boolean;
  toolbar?: boolean;
  canCopyPool: boolean;
  canCopyMatrix: boolean;
  canCopyMitigations: boolean;
  canCopyActions: boolean;
  onCopyFull: () => void | Promise<void>;
  onCopySummary: () => void | Promise<void>;
  onCopyPool: () => void | Promise<void>;
  onCopyMatrix: () => void | Promise<void>;
  onCopyMitigations: () => void | Promise<void>;
  onCopyActions: () => void | Promise<void>;
};

export default function MatrixCopyDropdown({
  iconOnly = false,
  toolbar = false,
  canCopyPool,
  canCopyMatrix,
  canCopyMitigations,
  canCopyActions,
  onCopyFull,
  onCopySummary,
  onCopyPool,
  onCopyMatrix,
  onCopyMitigations,
  onCopyActions,
}: MatrixCopyDropdownProps) {
  // The dropdown trigger lives in the title row alongside Share — keep
  // it neutral (outline) so Share remains the visual primary CTA.
  // `iconOnly` and `toolbar` are kept on the API for compatibility, but
  // label visibility is now driven by Tailwind responsive classes
  // matching the title-row collapse sequence (label hidden below md).
  void toolbar;
  void iconOnly;

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
      <DropdownMenuContent align="end" className="min-w-[13.5rem]">
        <DropdownMenuLabel>Copy as text</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={() => {
            void onCopyFull();
          }}
        >
          Full worksheet
          <DropdownMenuShortcut>⌘⇧C</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            void onCopySummary();
          }}
        >
          Summary
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!canCopyPool}
          onSelect={() => {
            void onCopyPool();
          }}
        >
          Risk pool only
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canCopyMatrix}
          onSelect={() => {
            void onCopyMatrix();
          }}
        >
          Matrix only
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canCopyMitigations}
          onSelect={() => {
            void onCopyMitigations();
          }}
        >
          All mitigations (Markdown)
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canCopyActions}
          onSelect={() => {
            void onCopyActions();
          }}
        >
          Actions only
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
