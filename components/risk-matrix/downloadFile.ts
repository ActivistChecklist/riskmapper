/**
 * Save a Blob the browser built locally. Nothing here touches the network:
 * the object URL points at memory in this tab.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revoke so browsers reliably initiate the download first.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Invisible or reordering characters that let a name display differently
 * from what it is: controls, zero-width characters, and the bidi embedding,
 * override and isolate controls behind "invoice\u202Efdp.exe"-style spoofs.
 */
const FILENAME_STRIPPED =
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

/**
 * `RiskMapper.app - <title>.<ext>`, or `... - <title> (<variant>).<ext>` when
 * one matrix has two exports of the same type. Characters filesystems reject
 * are replaced.
 */
export function exportFilename(
  title: string,
  ext: string,
  variant?: string,
): string {
  const cleaned = title
    .replace(/[\t\n\r]/g, " ")
    .replace(FILENAME_STRIPPED, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  // Slice by code point so a cut never leaves half an emoji (a lone surrogate).
  const short = Array.from(cleaned || "Untitled").slice(0, 80).join("").trim();
  return `RiskMapper.app - ${short}${variant ? ` (${variant})` : ""}.${ext}`;
}
