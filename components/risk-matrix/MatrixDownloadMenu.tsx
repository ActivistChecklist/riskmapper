"use client";

import React, { useCallback, useRef, useState } from "react";
import { ChevronDown, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { trackEvent } from "@/lib/analytics/events";
import { downloadBlob, exportFilename } from "./downloadFile";
import MatrixFileDownloadDialog from "./MatrixFileDownloadDialog";
import { buildMatrixCsv } from "./matrixCsv";
import { buildMatrixFile, serializeMatrixFile } from "./matrixFile";
import type { RiskMatrixSnapshot } from "./matrixTypes";

export type MatrixDownloadMenuProps = {
  title: string;
  /** Read at click time so the download matches what is on screen. */
  getSnapshot: () => RiskMatrixSnapshot;
  /** Disable every item when there's nothing to export. */
  hasContent: boolean;
};

async function downloadPdf(title: string, snapshot: RiskMatrixSnapshot) {
  const [{ pdf }, { MatrixPdfDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./pdf/MatrixPdfDocument"),
  ]);
  const blob = await pdf(
    <MatrixPdfDocument title={title} snapshot={snapshot} />,
  ).toBlob();
  downloadBlob(blob, exportFilename(title, "pdf"));
}

function downloadCsv(title: string, snapshot: RiskMatrixSnapshot) {
  const csv = buildMatrixCsv(snapshot);
  downloadBlob(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
    exportFilename(title, "csv"),
  );
}

function downloadMatrixFile(title: string, snapshot: RiskMatrixSnapshot) {
  const json = serializeMatrixFile(buildMatrixFile({ title, snapshot }));
  downloadBlob(
    new Blob([json], { type: "application/json" }),
    exportFilename(title, "json"),
  );
}

function ItemText({ label, hint }: { label: string; hint: string }) {
  return (
    <span className="flex flex-col">
      <span>{label}</span>
      <span className="text-xs text-rm-muted">{hint}</span>
    </span>
  );
}

export default function MatrixDownloadMenu({
  title,
  getSnapshot,
  hasContent,
}: MatrixDownloadMenuProps) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const [matrixFileOpen, setMatrixFileOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const handlePdf = useCallback(async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      await downloadPdf(title, getSnapshot());
      trackEvent("download_pdf");
    } catch (err) {
      console.error("PDF generation failed", err);
      toast.error("Could not create the PDF.");
    } finally {
      setPdfBusy(false);
    }
  }, [pdfBusy, title, getSnapshot]);

  const handleCsv = useCallback(() => {
    downloadCsv(title, getSnapshot());
    trackEvent("download_csv");
  }, [title, getSnapshot]);

  const handleMatrixFile = useCallback(() => {
    setMatrixFileOpen(false);
    downloadMatrixFile(title, getSnapshot());
    trackEvent("download_matrix_file");
  }, [title, getSnapshot]);

  const trigger = (
    <Button
      ref={triggerRef}
      type="button"
      variant="outline"
      size="default"
      className="gap-2 px-3 text-[15px] sm:px-4"
      aria-label="Download"
      aria-haspopup="menu"
      aria-busy={pdfBusy || undefined}
    >
      {pdfBusy ? (
        <Loader2
          size={18}
          strokeWidth={2}
          aria-hidden
          className="animate-spin"
        />
      ) : (
        <Download size={18} strokeWidth={2} aria-hidden />
      )}
      <span className="hidden md:inline-flex md:items-center md:gap-1">
        Download
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
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="md:hidden">
          Download
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuItem
          disabled={!hasContent || pdfBusy}
          onSelect={() => {
            void handlePdf();
          }}
        >
          <ItemText label="PDF" hint="To print or read" />
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!hasContent} onSelect={handleCsv}>
          <ItemText
            label="Spreadsheet (CSV)"
            hint="Risks, mitigations and actions, one per row"
          />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!hasContent}
          onSelect={() => setMatrixFileOpen(true)}
        >
          <ItemText
            label="Matrix file (JSON)"
            hint="To import elsewhere, no upload needed. Not encrypted."
          />
        </DropdownMenuItem>
      </DropdownMenuContent>
      <MatrixFileDownloadDialog
        open={matrixFileOpen}
        onOpenChange={setMatrixFileOpen}
        filename={exportFilename(title, "json")}
        onDownload={handleMatrixFile}
        returnFocusTo={triggerRef}
      />
    </DropdownMenu>
  );
}
