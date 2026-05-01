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
  // `toolbar` is unused for the variant now but kept on the API for
  // compatibility with existing callers.
  void toolbar;
  const iconBtn = iconOnly ? "gap-0 px-2" : "";

  const triggerButton = (
    <Button
      type="button"
      variant="outline"
      size="default"
      className={cn(
        "gap-2 px-4 text-[15px]",
        iconBtn,
      )}
      aria-label={iconOnly ? "Copy worksheet" : undefined}
      aria-haspopup="menu"
    >
      <Copy size={18} strokeWidth={2} aria-hidden />
      {!iconOnly ? (
        <>
          Copy
          <ChevronDown
            size={14}
            strokeWidth={2}
            aria-hidden
            className="opacity-70"
          />
        </>
      ) : null}
    </Button>
  );

  return (
    <DropdownMenu>
      {iconOnly ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Copy worksheet</TooltipContent>
        </Tooltip>
      ) : (
        <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
      )}
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
