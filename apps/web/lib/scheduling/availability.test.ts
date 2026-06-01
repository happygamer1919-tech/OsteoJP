import { describe, expect, it } from "vitest";
import {
  absencesOverlapping,
  evaluateAvailability,
  isRangeCovered,
  isWithinValidity,
  lisbonWeekday,
  timeToMinutes,
  type AvailabilityTemplate,
} from "./availability";
import { lisbonDateTimeToUtc } from "./time";

// Helpers to build candidate windows from Lisbon wall-clock, mirroring how the
// modal builds them in production.
function window(date: string, time: string, durationMin: number) {
  const startsAt = lisbonDateTimeToUtc(date, time);
  const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
  return { startsAt, endsAt };
}

const WED = "2026-06-10"; // weekday 3
const THU = "2026-06-11"; // weekday 4
const WED_JULY = "2026-07-08"; // weekday 3, four weeks later

function tpl(over: Partial<AvailabilityTemplate> = {}): AvailabilityTemplate {
  return {
    weekday: 3,
    startTime: "09:00:00",
    endTime: "17:00:00",
    validFrom: null,
    validUntil: null,
    isActive: true,
    ...over,
  };
}

describe("pure helpers", () => {
  it("maps Lisbon dates to Sunday-based weekdays", () => {
    expect(lisbonWeekday(WED)).toBe(3);
    expect(lisbonWeekday(THU)).toBe(4);
  });

  it("parses HH:MM(:SS) to minutes", () => {
    expect(timeToMinutes("09:00")).toBe(540);
    expect(timeToMinutes("17:30:00")).toBe(1050);
  });

  it("treats validity bounds as inclusive, nulls as open-ended", () => {
    expect(isWithinValidity(WED, null, null)).toBe(true);
    expect(isWithinValidity(WED, "2026-06-10", "2026-06-10")).toBe(true);
    expect(isWithinValidity(WED, "2026-06-11", null)).toBe(false);
    expect(isWithinValidity(WED, null, "2026-06-09")).toBe(false);
  });

  it("covers a range only when the union of windows contains it", () => {
    expect(isRangeCovered(600, 660, [[540, 1020]])).toBe(true);
    expect(isRangeCovered(540, 1020, [[540, 1020]])).toBe(true); // exact edges
    expect(isRangeCovered(1080, 1140, [[540, 1020]])).toBe(false);
    // split shift: 09–12 + 14–18, gap 12–14
    const split: [number, number][] = [[540, 720], [840, 1080]];
    expect(isRangeCovered(690, 720, split)).toBe(true); // 11:30–12:00
    expect(isRangeCovered(750, 780, split)).toBe(false); // 12:30–13:00 (gap)
    expect(isRangeCovered(690, 870, split)).toBe(false); // spans the gap
  });
});

describe("evaluateAvailability", () => {
  it("allows a booking inside the working window", () => {
    const w = window(WED, "10:00", 60);
    const r = evaluateAvailability(w.startsAt, w.endsAt, [tpl()]);
    expect(r).toEqual({ configured: true, covered: true });
  });

  it("flags a booking outside the working window (same weekday)", () => {
    const w = window(WED, "18:00", 60);
    const r = evaluateAvailability(w.startsAt, w.endsAt, [tpl()]);
    expect(r.configured).toBe(true);
    expect(r.covered).toBe(false);
  });

  it("flags a booking that straddles the end of the window", () => {
    const w = window(WED, "16:30", 60); // 16:30–17:30, window ends 17:00
    const r = evaluateAvailability(w.startsAt, w.endsAt, [tpl()]);
    expect(r.covered).toBe(false);
  });

  it("flags a weekday with no matching template while availability is configured", () => {
    const w = window(THU, "10:00", 60); // Thursday, only a Wednesday template exists
    const r = evaluateAvailability(w.startsAt, w.endsAt, [tpl({ weekday: 3 })]);
    expect(r).toEqual({ configured: true, covered: false });
  });

  it("does NOT enforce when the therapist has no active availability", () => {
    const w = window(WED, "23:00", 60);
    expect(evaluateAvailability(w.startsAt, w.endsAt, [])).toEqual({
      configured: false,
      covered: true,
    });
    // all-inactive == not configured
    expect(
      evaluateAvailability(w.startsAt, w.endsAt, [tpl({ isActive: false })]),
    ).toEqual({ configured: false, covered: true });
  });

  describe("respects is_active", () => {
    const templates = [
      tpl({ startTime: "09:00", endTime: "12:00", isActive: true }), // morning, active
      tpl({ startTime: "13:00", endTime: "18:00", isActive: false }), // afternoon, INACTIVE
    ];
    it("allows a slot the active template covers", () => {
      const w = window(WED, "10:00", 60);
      expect(evaluateAvailability(w.startsAt, w.endsAt, templates).covered).toBe(true);
    });
    it("flags a slot only the inactive template would cover", () => {
      const w = window(WED, "14:00", 60);
      const r = evaluateAvailability(w.startsAt, w.endsAt, templates);
      expect(r).toEqual({ configured: true, covered: false });
    });
  });

  describe("respects valid_from / valid_until", () => {
    it("flags a date before valid_from even if hours match", () => {
      const w = window(WED, "10:00", 60); // 2026-06-10, before July validity
      const r = evaluateAvailability(w.startsAt, w.endsAt, [
        tpl({ validFrom: "2026-07-01" }),
      ]);
      expect(r).toEqual({ configured: true, covered: false });
    });
    it("allows a date inside the validity window", () => {
      const w = window(WED_JULY, "10:00", 60); // 2026-07-08, weekday 3
      const r = evaluateAvailability(w.startsAt, w.endsAt, [
        tpl({ validFrom: "2026-07-01", validUntil: "2026-07-31" }),
      ]);
      expect(r.covered).toBe(true);
    });
    it("flags a date after valid_until", () => {
      const w = window(WED_JULY, "10:00", 60);
      const r = evaluateAvailability(w.startsAt, w.endsAt, [
        tpl({ validUntil: "2026-06-30" }),
      ]);
      expect(r).toEqual({ configured: true, covered: false });
    });
  });
});

describe("absencesOverlapping (time off)", () => {
  const block = (date: string, time: string, durationMin: number) => {
    const w = window(date, time, durationMin);
    return { id: `block-${time}`, startsAt: w.startsAt, endsAt: w.endsAt, reason: "vacation" };
  };

  it("flags a booking overlapping an absence block", () => {
    const appt = window(WED, "10:00", 60);
    const blocks = [block(WED, "09:00", 240)]; // 09:00–13:00
    const hits = absencesOverlapping(appt.startsAt, appt.endsAt, blocks);
    expect(hits).toHaveLength(1);
    expect(hits[0].reason).toBe("vacation");
  });

  it("does not flag a booking outside every absence block", () => {
    const appt = window(WED, "15:00", 60);
    const blocks = [block(WED, "09:00", 240)]; // 09:00–13:00
    expect(absencesOverlapping(appt.startsAt, appt.endsAt, blocks)).toHaveLength(0);
  });

  it("treats a block ending exactly at the booking start as non-overlapping", () => {
    const appt = window(WED, "13:00", 60); // 13:00–14:00
    const blocks = [block(WED, "09:00", 240)]; // ends 13:00 (exclusive)
    expect(absencesOverlapping(appt.startsAt, appt.endsAt, blocks)).toHaveLength(0);
  });
});
