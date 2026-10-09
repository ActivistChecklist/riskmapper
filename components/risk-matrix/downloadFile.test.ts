import { describe, expect, it } from "vitest";
import { exportFilename } from "./downloadFile";

describe("exportFilename", () => {
  it("prefixes and keeps an ordinary title", () => {
    expect(exportFilename("Spring march", "csv")).toBe("RiskMapper.app - Spring march.csv");
  });

  it("strips bidi overrides so the name cannot display a fake extension", () => {
    expect(exportFilename("invoice‮fdp.exe", "json")).toBe(
      "RiskMapper.app - invoicefdp.exe.json",
    );
  });

  it("strips controls and zero-width characters, and replaces path characters", () => {
    expect(exportFilename("a\u0000b​c/d:e\nf", "pdf")).toBe("RiskMapper.app - abc-d-e f.pdf");
  });

  it("never splits an emoji when shortening", () => {
    const name = exportFilename("😀".repeat(100), "csv");
    expect(name).toBe(`RiskMapper.app - ${"😀".repeat(80)}.csv`);
    expect(name.isWellFormed()).toBe(true);
  });

  it("falls back to Untitled", () => {
    expect(exportFilename(" ‮ ", "csv")).toBe("RiskMapper.app - Untitled.csv");
  });
});
