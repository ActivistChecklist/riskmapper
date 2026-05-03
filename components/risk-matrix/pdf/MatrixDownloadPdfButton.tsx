"use client";

import React, { useCallback, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { RiskMatrixSnapshot } from "../matrixTypes";

export type MatrixDownloadPdfButtonProps = {
  title: string;
  snapshot: RiskMatrixSnapshot;
  /** Disable when there's nothing to export (e.g. completely empty matrix). */
  disabled?: boolean;
  className?: string;
};

function safeFilename(title: string): string {
  const cleanedTitle = (title.trim() || "Untitled")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return `RiskMapper.app - ${cleanedTitle}.pdf`;
}

export default function MatrixDownloadPdfButton({
  title,
  snapshot,
  disabled = false,
  className,
}: MatrixDownloadPdfButtonProps) {
  const [busy, setBusy] = useState(false);

  const handleClick = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const [{ pdf }, { MatrixPdfDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./MatrixPdfDocument"),
      ]);
      const blob = await pdf(
        <MatrixPdfDocument title={title} snapshot={snapshot} />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = safeFilename(title);
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Defer revoke so browsers reliably initiate the download first.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error("PDF generation failed", err);
    } finally {
      setBusy(false);
    }
  }, [busy, title, snapshot]);

  const trigger = (
    <Button
      type="button"
      variant="outline"
      size="default"
      className={cn("gap-2 px-3 text-[15px] sm:px-4", className)}
      onClick={handleClick}
      disabled={disabled || busy}
      aria-label="Download as PDF"
    >
      {busy ? (
        <Loader2
          size={18}
          strokeWidth={2}
          aria-hidden
          className="animate-spin"
        />
      ) : (
        <Download size={18} strokeWidth={2} aria-hidden />
      )}
      <span className="hidden md:inline">PDF</span>
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side="bottom">Download as PDF</TooltipContent>
    </Tooltip>
  );
}
