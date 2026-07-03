import { describe, expect, it } from "vitest";
import type { BatchFailure } from "./batch-core";
import { applyRebook, editRow, initFailureRows } from "./batch-failure-core";

const failure = (startsAt: string, date: string, hhmm: string, alt?: BatchFailure["nearestAlternative"]): BatchFailure => ({
  startsAt,
  date,
  hhmm,
  reason: "busy",
  nearestAlternative: alt ?? null,
});

const F1 = failure("2026-08-06T14:00:00.000Z", "2026-08-06", "14:00", {
  startsAt: "2026-08-06T15:00:00.000Z",
  date: "2026-08-06",
  hhmm: "15:00",
});
const F2 = failure("2026-08-13T14:00:00.000Z", "2026-08-13", "14:00");

describe("batch-failure-core (W2-05)", () => {
  it("all-success: no failures → no rows (dialog would not open)", () => {
    expect(initFailureRows([])).toEqual([]);
  });

  it("mixed: builds one editable row per failure, defaulting to the failed slot", () => {
    const rows = initFailureRows([F1, F2]);
    expect(rows.map((r) => r.key)).toEqual([F1.startsAt, F2.startsAt]);
    expect(rows[0]).toMatchObject({ date: "2026-08-06", hhmm: "14:00", failure: F1 });
    expect(rows[1]).toMatchObject({ date: "2026-08-13", hhmm: "14:00", failure: F2 });
  });

  it("editRow updates only the keyed row's date/time", () => {
    const rows = editRow(initFailureRows([F1, F2]), F1.startsAt, { hhmm: "15:00" });
    expect(rows[0]).toMatchObject({ hhmm: "15:00" });
    expect(rows[1]).toMatchObject({ hhmm: "14:00" }); // untouched
  });

  it("rebook-from-dialog: a booked outcome drops the row", () => {
    const rows = applyRebook(initFailureRows([F1, F2]), F1.startsAt, { booked: true, failure: null });
    expect(rows.map((r) => r.key)).toEqual([F2.startsAt]);
  });

  it("rebook-from-dialog: a still-busy outcome keeps the row and replaces its failure", () => {
    const retried = failure("2026-08-06T16:00:00.000Z", "2026-08-06", "16:00");
    const rows = applyRebook(initFailureRows([F1]), F1.startsAt, { booked: false, failure: retried });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.key).toBe(F1.startsAt); // identity preserved
    expect(rows[0]!.failure).toBe(retried); // failure info updated
  });
});
