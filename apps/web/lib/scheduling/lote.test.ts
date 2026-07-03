import { describe, expect, it } from "vitest";
import { buildLoteSlots, generateLoteDates } from "./lote";

describe("generateLoteDates (W2-10)", () => {
  it("generates `count` dates stepping every-X weeks, same weekday", () => {
    // 2026-08-06 is a Thursday.
    expect(generateLoteDates("2026-08-06", 1, 4)).toEqual([
      "2026-08-06",
      "2026-08-13",
      "2026-08-20",
      "2026-08-27",
    ]);
  });

  it("honours a multi-week interval (every 2 weeks)", () => {
    expect(generateLoteDates("2026-08-06", 2, 3)).toEqual([
      "2026-08-06",
      "2026-08-20",
      "2026-09-03",
    ]);
  });

  it("clamps count and interval to >= 1", () => {
    expect(generateLoteDates("2026-08-06", 0, 0)).toEqual(["2026-08-06"]);
  });
});

describe("buildLoteSlots (W2-10)", () => {
  it("builds one explicit slot per row, honouring each row's OWN time and the duration", () => {
    const slots = buildLoteSlots(
      [
        { date: "2026-08-06", time: "09:00" },
        { date: "2026-08-13", time: "14:30" },
      ],
      60,
    );
    expect(slots).toHaveLength(2);
    // 60-minute windows; per-date times preserved (Lisbon in, UTC stored).
    expect(slots.map((s) => (new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 60_000)).toEqual([
      60, 60,
    ]);
    // Distinct start instants (the whole point: per-date times).
    expect(new Set(slots.map((s) => s.startsAt)).size).toBe(2);
  });
});
