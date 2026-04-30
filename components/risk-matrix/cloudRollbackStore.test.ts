import { afterEach, describe, expect, it } from "vitest";
import {
  __resetRollbackStoreForTests,
  forgetRecord,
  getHighestSeenVersion,
  recordObservedVersion,
} from "./cloudRollbackStore";

afterEach(() => {
  __resetRollbackStoreForTests();
});

describe("cloudRollbackStore", () => {
  it("starts at 0 for unknown records", () => {
    expect(getHighestSeenVersion("rec-1")).toBe(0);
  });

  it("records and reads back a version", () => {
    expect(recordObservedVersion("rec-1", 5)).toBe("ok");
    expect(getHighestSeenVersion("rec-1")).toBe(5);
  });

  it("monotonically increases on higher versions", () => {
    recordObservedVersion("rec-1", 3);
    expect(recordObservedVersion("rec-1", 4)).toBe("ok");
    expect(getHighestSeenVersion("rec-1")).toBe(4);
  });

  it("accepts equal versions but does not lower the bar", () => {
    recordObservedVersion("rec-1", 5);
    expect(recordObservedVersion("rec-1", 5)).toBe("ok");
    expect(getHighestSeenVersion("rec-1")).toBe(5);
  });

  it("flags rollback when a strictly lower version arrives", () => {
    recordObservedVersion("rec-1", 7);
    expect(recordObservedVersion("rec-1", 6)).toBe("rollback");
    expect(getHighestSeenVersion("rec-1")).toBe(7);
  });

  it("forgetRecord drops the entry", () => {
    recordObservedVersion("rec-1", 7);
    forgetRecord("rec-1");
    expect(getHighestSeenVersion("rec-1")).toBe(0);
  });

  it("rejects negative or NaN versions", () => {
    expect(recordObservedVersion("rec-1", -1)).toBe("rollback");
    expect(recordObservedVersion("rec-1", Number.NaN)).toBe("rollback");
  });

  it("isolates records by id", () => {
    recordObservedVersion("rec-1", 10);
    recordObservedVersion("rec-2", 2);
    expect(getHighestSeenVersion("rec-1")).toBe(10);
    expect(getHighestSeenVersion("rec-2")).toBe(2);
  });
});
