"use client";

import React, { useCallback, useRef, useState } from "react";
import { ChevronDown, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { trackEvent } from "@/lib/analytics/events";
import { downloadBlob, exportFilename } from "./downloadFile";
import MatrixFileDownloadDialog from "./MatrixFileDownloadDialog";
import { buildMatrixCsv, buildWorksheetCsv } from "./matrixCsv";
import { buildMatrixFile, serializeMatrixFile } from "./matrixFile";
import type { RiskMatrixSnapshot } from "./matrixTypes";

export type MatrixExportMenuProps = {
  title: string;
  /** Read at click time so the export matches what is on screen. */
  getSnapshot: () => RiskMatrixSnapshot;
  /** Disable every item when there's nothing to export. */
  hasContent: boolean;
  /** Plain-text (Markdown) full worksheet to the clipboard. */
  onCopyPlain: () => void;
  /** Rich-text (HTML) full worksheet to the clipboard. */
  onCopyRich: () => void;
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

function downloadCsv(csv: string, filename: string) {
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
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

/** Every way to take a matrix out of the app: downloads and clipboard copies. */
export default function MatrixExportMenu({
  title,
  getSnapshot,
  hasContent,
  onCopyPlain,
  onCopyRich,
}: MatrixExportMenuProps) {
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

  const handleWorksheetCsv = useCallback(() => {
    downloadCsv(
      buildWorksheetCsv({ title, ...getSnapshot() }),
      exportFilename(title, "csv", "worksheet"),
    );
    trackEvent("download_csv", { layout: "worksheet" });
  }, [title, getSnapshot]);

  const handleTableCsv = useCallback(() => {
    downloadCsv(
      buildMatrixCsv(getSnapshot()),
      exportFilename(title, "csv", "table"),
    );
    trackEvent("download_csv", { layout: "table" });
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
      aria-label="Export"
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
        Export
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
          Export
        </TooltipContent>
      </Tooltip>
      {/* Scrolls only when it would run off the screen (a short phone in
          landscape); collisionPadding keeps it off the screen edges. */}
      <DropdownMenuContent align="end" collisionPadding={8} className="w-80">
        <DropdownMenuLabel>Download</DropdownMenuLabel>
        <DropdownMenuItem
          disabled={!hasContent || pdfBusy}
          onSelect={() => {
            void handlePdf();
          }}
        >
          <ItemText label="PDF" hint="To print or read" />
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!hasContent} onSelect={handleWorksheetCsv}>
          <ItemText
            label="Spreadsheet, page layout (CSV)"
            hint="The matrix, mitigations and actions laid out like this page"
          />
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!hasContent} onSelect={handleTableCsv}>
          <ItemText
            label="Spreadsheet, one row per item (CSV)"
            hint="For sorting and filtering"
          />
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!hasContent}
          onSelect={() => setMatrixFileOpen(true)}
        >
          <ItemText
            label="RiskMapper.app export format (JSON)"
            hint="To re-import, or send to someone to import. Not encrypted."
          />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Copy to clipboard</DropdownMenuLabel>
        <DropdownMenuItem disabled={!hasContent} onSelect={onCopyPlain}>
          <ItemText
            label="Plain text (Markdown)"
            hint="For chat apps and notes"
          />
          {/* Keyboard shortcuts mean nothing on a phone. */}
          <DropdownMenuShortcut className="max-md:hidden">⌘⇧C</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!hasContent} onSelect={onCopyRich}>
          <ItemText
            label="Rich text"
            hint="For email, Google Docs or Word, with tables and colors"
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
