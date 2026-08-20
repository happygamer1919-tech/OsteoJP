import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { checkAvailability, describeWindows } from "./availability-enforcement";

/**
 * RB-03 — availability is ENFORCED at write time, and the two ways that could
 * go wrong are opposite.
 *
 * TOO LOOSE is the reported defect: Catarina ends at 13:00 and a manual entry
 * books 17:00. TOO STRICT is worse and is the one nobody reports until the
 * clinic cannot use its own diary: a therapist with NO configured hours must
 * still be bookable, because availability is opt-in per (therapist, location)
 * and a clinic that never set hours has not opted in.
 *
 * Both are asserted here, against a query stub that records the predicate it was
 * given rather than a database — what is on trial is the VERDICT, and the SQL
 * is `findScheduleConflicts`'s own, reused deliberately so the enforced answer
 * and the advisory panel cannot disagree.
 */

/** A tx stand-in returning the given templates from the one select this makes. */
function txWith(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => Promise.resolve(rows),
  };
  return { select: () => chain } as never;
}

const tpl = (over: Record<string, unknown> = {}) => ({
  // 2026-08-24 is a MONDAY. weekday 1 under lisbonWeekday's Mon=1 convention.
  weekday: 1,
  startTime: "08:00:00",
  endTime: "13:00:00",
  validFrom: null,
  validUntil: null,
  isActive: true,
  ...over,
});

/** Lisbon is UTC+1 in August (WEST), so 09:00 local is 08:00Z. */
const at = (hhmmZ: string) => new Date(`2026-08-24T${hhmmZ}:00.000Z`);

const ARGS = { practitionerId: "p-1", locationId: "l-1" };

describe("checkAvailability", () => {
  it("ALLOWS a window inside the therapist's hours", async () => {
    // 10:00-11:00 Lisbon, inside 08:00-13:00.
    const v = await checkAvailability(txWith([tpl()]), {
      ...ARGS,
      startsAt: at("09:00"),
      endsAt: at("10:00"),
    });
    expect(v).toEqual({ ok: true, reason: "covered" });
  });

  it("REFUSES the reported defect: a 17:00 entry against a day ending at 13:00", async () => {
    // 17:00-18:00 Lisbon = 16:00-17:00Z.
    const v = await checkAvailability(txWith([tpl()]), {
      ...ARGS,
      startsAt: at("16:00"),
      endsAt: at("17:00"),
    });
    expect(v.ok).toBe(false);
    // AND IT NAMES THE WINDOW. A refusal that does not is a refusal that sends
    // the reader to another screen.
    expect(v.ok === false && v.windows).toEqual([{ startTime: "08:00", endTime: "13:00" }]);
  });

  it("REFUSES a window that only PARTLY overlaps - 12:30 to 13:30", async () => {
    // The boundary case a naive "is the start inside?" check would allow, and
    // the appointment would then run half an hour past the therapist's day.
    const v = await checkAvailability(txWith([tpl()]), {
      ...ARGS,
      startsAt: at("11:30"),
      endsAt: at("12:30"),
    });
    expect(v.ok).toBe(false);
  });

  it("ALLOWS anything when the therapist has NO configured hours - opt-in, and this is load-bearing", async () => {
    // THE FAILURE MODE THIS PREVENTS IS TOTAL. A clinic that never set hours
    // would be unable to book at all, which is a worse outage than the defect
    // being fixed.
    const v = await checkAvailability(txWith([]), {
      ...ARGS,
      startsAt: at("16:00"),
      endsAt: at("17:00"),
    });
    expect(v).toEqual({ ok: true, reason: "unconfigured" });
  });

  it("ALLOWS anything when every template is INACTIVE - same rule", async () => {
    const v = await checkAvailability(txWith([tpl({ isActive: false })]), {
      ...ARGS,
      startsAt: at("16:00"),
      endsAt: at("17:00"),
    });
    expect(v).toEqual({ ok: true, reason: "unconfigured" });
  });

  it("REFUSES with an EMPTY window list when the therapist works elsewhere that week but not that day", async () => {
    // A different sentence, not a missing value: "does not work that day" rather
    // than "works 08:00-13:00". The type keeps them apart and the caller renders
    // them differently.
    const v = await checkAvailability(txWith([tpl({ weekday: 3 })]), {
      ...ARGS,
      startsAt: at("09:00"),
      endsAt: at("10:00"),
    });
    expect(v).toEqual({ ok: false, windows: [] });
  });

  it("names BOTH periods of a split shift", async () => {
    // W13-A. A message naming only the first period would be confidently wrong
    // about the afternoon, which is the shape this project keeps finding.
    const v = await checkAvailability(
      txWith([tpl(), tpl({ startTime: "14:00:00", endTime: "19:00:00" })]),
      { ...ARGS, startsAt: at("19:00"), endsAt: at("20:00") },
    );
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.windows).toEqual([
      { startTime: "08:00", endTime: "13:00" },
      { startTime: "14:00", endTime: "19:00" },
    ]);
  });

  it("ALLOWS the afternoon period of a split shift", async () => {
    // The negative arm of the test above: the second window is real, not just
    // named. Without this, a rule that refused everything would pass every
    // refusal assertion in this file.
    const v = await checkAvailability(
      txWith([tpl(), tpl({ startTime: "14:00:00", endTime: "19:00:00" })]),
      { ...ARGS, startsAt: at("14:00"), endsAt: at("15:00") },
    );
    expect(v).toEqual({ ok: true, reason: "covered" });
  });

  it("REFUSES the gap BETWEEN two split-shift periods", async () => {
    // 13:00-14:00 Lisbon is inside neither window, and W13-A's whole point is
    // that the gap behaves as outside working hours.
    const v = await checkAvailability(
      txWith([tpl(), tpl({ startTime: "14:00:00", endTime: "19:00:00" })]),
      { ...ARGS, startsAt: at("12:00"), endsAt: at("12:45") },
    );
    expect(v.ok).toBe(false);
  });

  it("ignores a template whose validity window has expired", async () => {
    const v = await checkAvailability(
      txWith([tpl({ validUntil: "2026-01-01" })]),
      { ...ARGS, startsAt: at("09:00"), endsAt: at("10:00") },
    );
    // The only template is out of validity, so nothing applies that day.
    expect(v).toEqual({ ok: false, windows: [] });
  });
});

describe("describeWindows", () => {
  it("joins the periods a refusal names", () => {
    expect(
      describeWindows([
        { startTime: "08:00", endTime: "13:00" },
        { startTime: "14:00", endTime: "19:00" },
      ]),
    ).toBe("08:00-13:00, 14:00-19:00");
  });

  it("is empty for no windows, so a caller cannot print a stray separator", () => {
    expect(describeWindows([])).toBe("");
  });
});
