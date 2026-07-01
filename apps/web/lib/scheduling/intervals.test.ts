import { describe, expect, it } from "vitest";
import { mergeIntervals, subtractIntervals, type TimeInterval } from "./intervals";

const at = (iso: string) => new Date(iso);
const iv = (s: string, e: string): TimeInterval => ({ start: at(s), end: at(e) });

// Compact ISO pairs for readable assertions.
const shape = (xs: TimeInterval[]) =>
  xs.map((x) => [x.start.toISOString(), x.end.toISOString()]);

const D = "2026-06-19"; // one Lisbon working day, expressed in UTC below
const t = (hhmm: string) => `${D}T${hhmm}:00.000Z`;

describe("mergeIntervals", () => {
  it("returns [] for no intervals", () => {
    expect(mergeIntervals([])).toEqual([]);
  });

  it("drops zero-length and inverted intervals", () => {
    expect(mergeIntervals([iv(t("09:00"), t("09:00")), iv(t("11:00"), t("10:00"))])).toEqual([]);
  });

  it("merges overlapping intervals", () => {
    expect(shape(mergeIntervals([iv(t("09:00"), t("10:30")), iv(t("10:00"), t("11:00"))]))).toEqual([
      [t("09:00"), t("11:00")],
    ]);
  });

  it("merges adjacent (touching) intervals into one span", () => {
    expect(shape(mergeIntervals([iv(t("09:00"), t("10:00")), iv(t("10:00"), t("11:00"))]))).toEqual([
      [t("09:00"), t("11:00")],
    ]);
  });

  it("keeps a lunch gap between split shifts and sorts unordered input", () => {
    expect(
      shape(mergeIntervals([iv(t("14:00"), t("18:00")), iv(t("09:00"), t("13:00"))])),
    ).toEqual([
      [t("09:00"), t("13:00")],
      [t("14:00"), t("18:00")],
    ]);
  });
});

describe("subtractIntervals", () => {
  const day = [iv(t("09:00"), t("18:00"))]; // single 9-18 working window

  it("full-day-free: no bookings leaves the whole window free", () => {
    expect(shape(subtractIntervals(day, []))).toEqual([[t("09:00"), t("18:00")]]);
  });

  it("empty template: no working windows yields no free time", () => {
    expect(subtractIntervals([], [iv(t("10:00"), t("11:00"))])).toEqual([]);
  });

  it("fully-booked: a booking covering the window leaves nothing free", () => {
    expect(subtractIntervals(day, [iv(t("08:00"), t("19:00"))])).toEqual([]);
    expect(subtractIntervals(day, [iv(t("09:00"), t("18:00"))])).toEqual([]);
  });

  it("splits the window around a mid-day booking", () => {
    expect(shape(subtractIntervals(day, [iv(t("12:00"), t("13:00"))]))).toEqual([
      [t("09:00"), t("12:00")],
      [t("13:00"), t("18:00")],
    ]);
  });

  it("adjacency: a back-to-back booking chain leaves the untouched remainder", () => {
    // 09:00-10:00 then 10:00-11:00 (touching) removes exactly 09:00-11:00.
    expect(
      shape(subtractIntervals(day, [iv(t("09:00"), t("10:00")), iv(t("10:00"), t("11:00"))])),
    ).toEqual([[t("11:00"), t("18:00")]]);
  });

  it("clips a booking that overhangs the window start", () => {
    expect(shape(subtractIntervals(day, [iv(t("08:00"), t("10:00"))]))).toEqual([
      [t("10:00"), t("18:00")],
    ]);
  });

  it("clips a booking that overhangs the window end", () => {
    expect(shape(subtractIntervals(day, [iv(t("17:00"), t("20:00"))]))).toEqual([
      [t("09:00"), t("17:00")],
    ]);
  });

  it("ignores bookings entirely outside the working window", () => {
    expect(shape(subtractIntervals(day, [iv(t("06:00"), t("07:00")), iv(t("20:00"), t("21:00"))]))).toEqual([
      [t("09:00"), t("18:00")],
    ]);
  });

  it("subtracts across split shifts, cutting only the shift it lands in", () => {
    const split = [iv(t("09:00"), t("13:00")), iv(t("14:00"), t("18:00"))];
    // A 12:00-15:00 booking spans the lunch gap; only the worked parts are removed.
    expect(shape(subtractIntervals(split, [iv(t("12:00"), t("15:00"))]))).toEqual([
      [t("09:00"), t("12:00")],
      [t("15:00"), t("18:00")],
    ]);
  });

  it("handles multiple bookings inside one window", () => {
    expect(
      shape(
        subtractIntervals(day, [
          iv(t("10:00"), t("11:00")),
          iv(t("14:00"), t("15:00")),
        ]),
      ),
    ).toEqual([
      [t("09:00"), t("10:00")],
      [t("11:00"), t("14:00")],
      [t("15:00"), t("18:00")],
    ]);
  });

  it("treats overlapping bookings as their union before subtracting", () => {
    expect(
      shape(
        subtractIntervals(day, [
          iv(t("10:00"), t("11:30")),
          iv(t("11:00"), t("12:00")),
        ]),
      ),
    ).toEqual([
      [t("09:00"), t("10:00")],
      [t("12:00"), t("18:00")],
    ]);
  });
});
