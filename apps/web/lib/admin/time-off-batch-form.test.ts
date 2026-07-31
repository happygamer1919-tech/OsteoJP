import { describe, expect, it } from "vitest";
import { parseTimeOffBatchForm } from "./time-off-batch-form";

// PL-22. The bloquear lote form is a plain HTML form posting to a server
// action, so the contract between the two is a FormData shape. These tests
// pin that shape: they are what stops a renamed input from silently becoming
// "block every day forever" or "block nothing".

function form(entries: [string, string][]): FormData {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

const base: [string, string][] = [
  ["userId", "user-1"],
  ["startDate", "2026-08-03"],
  ["startTime", "09:00"],
  ["endTime", "10:00"],
];

describe("parseTimeOffBatchForm", () => {
  it("collects every ticked weekday", () => {
    const v = parseTimeOffBatchForm(
      form([...base, ["weekdays", "1"], ["weekdays", "4"], ["everyWeeks", "2"], ["count", "6"]]),
    );
    expect(v.weekdays).toEqual([1, 4]);
    expect(v.everyWeeks).toBe(2);
    expect(v.end).toEqual({ kind: "count", count: 6 });
    expect(v.startTime).toBe("09:00");
    expect(v.endTime).toBe("10:00");
  });

  it("returns no weekdays when none are ticked, so the generator's own fallback applies", () => {
    // An unticked checkbox group posts nothing at all. That must mean "the start
    // date's weekday", never "every day".
    expect(parseTimeOffBatchForm(form(base)).weekdays).toEqual([]);
  });

  it("ignores a weekday value outside 0..6 instead of passing it through", () => {
    const v = parseTimeOffBatchForm(form([...base, ["weekdays", "9"], ["weekdays", "3"], ["weekdays", "x"]]));
    expect(v.weekdays).toEqual([3]);
  });

  it("reads the end date when the end mode is a date", () => {
    const v = parseTimeOffBatchForm(
      form([...base, ["endMode", "until"], ["until", "2026-09-30"], ["count", "4"]]),
    );
    // The stale count must NOT leak through: the picked mode decides.
    expect(v.end).toEqual({ kind: "until", date: "2026-09-30" });
  });

  it("defaults to a count when the end mode is missing or unrecognised", () => {
    expect(parseTimeOffBatchForm(form(base)).end).toEqual({ kind: "count", count: 4 });
    expect(parseTimeOffBatchForm(form([...base, ["endMode", "nonsense"], ["count", "7"]])).end).toEqual({
      kind: "count",
      count: 7,
    });
  });

  it("falls back to weekly rather than zero when the interval is unparseable", () => {
    // everyWeeks: 0 would be an infinite loop if it ever reached the generator.
    expect(parseTimeOffBatchForm(form([...base, ["everyWeeks", ""]])).everyWeeks).toBe(1);
    expect(parseTimeOffBatchForm(form([...base, ["everyWeeks", "abc"]])).everyWeeks).toBe(1);
  });

  it("falls back to one block rather than zero when the count is unparseable", () => {
    expect(parseTimeOffBatchForm(form([...base, ["count", "abc"]])).end).toEqual({
      kind: "count",
      count: 1,
    });
  });
});
