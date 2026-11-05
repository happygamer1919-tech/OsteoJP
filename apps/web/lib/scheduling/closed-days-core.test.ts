/**
 * closed-days-core.test.ts - Tier C 0114: the staff arithmetic of a dated
 * clinic closure, and the STAFF half of the staff/portal parity.
 *
 * THE PARITY TABLE is apps/api/lib/appointments/closed-day-parity-cases.json.
 * This file runs every case through `closedDayOverlap`, the function
 * checkClinicClosure refuses with; closed-days-portal.db.test.ts runs the SAME
 * cases through the portal's SQL fragment against Postgres. Both are held to
 * the `closed` the table states, so the two sides cannot drift apart without
 * one of the two going red.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  agendaClosuresOn,
  closedBandOn,
  closedDayBandsByDate,
  closedDayInputError,
  closedDayIntervals,
  closedDayOverlap,
  closedDayPayload,
  closedIntervalOn,
  closureHoursFromForm,
  daysBetween,
  lisbonDatesTouched,
  type ClosedDayInput,
  type ClosedDayRule,
} from "./closed-days-core";

const rule = (r: Partial<ClosedDayRule> & Pick<ClosedDayRule, "startsOn" | "endsOn">): ClosedDayRule => ({
  id: r.id ?? `${r.startsOn}-${r.endsOn}-${r.closedFrom ?? "all"}`,
  closedFrom: null,
  closedTo: null,
  kind: "feriado_nacional",
  label: null,
  ...r,
});

type Parity = {
  closures: { key: string; startsOn: string; endsOn: string; closedFrom: string | null; closedTo: string | null }[];
  cases: { name: string; startsAt: string; endsAt: string; closed: boolean }[];
};
const PARITY: Parity = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "..", "api", "lib", "appointments", "closed-day-parity-cases.json"), "utf8"),
);

describe("staff/portal parity: the shared case table, staff side", () => {
  const rules = PARITY.closures.map((c) => rule({ id: c.key, ...c }));

  it("the table is not vacuous: both verdicts appear, and every closure is exercised", () => {
    expect(PARITY.cases.filter((c) => c.closed).length).toBeGreaterThanOrEqual(8);
    expect(PARITY.cases.filter((c) => !c.closed).length).toBeGreaterThanOrEqual(8);
    const hit = new Set(
      PARITY.cases
        .map((c) => closedDayOverlap(rules, new Date(c.startsAt), new Date(c.endsAt))?.id)
        .filter(Boolean),
    );
    expect([...hit].sort()).toEqual(PARITY.closures.map((c) => c.key).sort());
  });

  for (const c of PARITY.cases) {
    it(c.name, () => {
      expect(closedDayOverlap(rules, new Date(c.startsAt), new Date(c.endsAt)) !== null).toBe(c.closed);
    });
  }
});

describe("closedIntervalOn", () => {
  it("a whole day is Lisbon midnight to the next Lisbon midnight: 24 h in winter", () => {
    const i = closedIntervalOn(rule({ startsOn: "2026-12-25", endsOn: "2026-12-25" }), "2026-12-25")!;
    expect(i.start.toISOString()).toBe("2026-12-25T00:00:00.000Z");
    expect(i.end.toISOString()).toBe("2026-12-26T00:00:00.000Z");
  });

  it("23 h on the spring clock-change Sunday, 25 h on the autumn one", () => {
    const spring = closedIntervalOn(rule({ startsOn: "2027-03-28", endsOn: "2027-03-28" }), "2027-03-28")!;
    expect((spring.end.getTime() - spring.start.getTime()) / 3_600_000).toBe(23);
    const autumn = closedIntervalOn(rule({ startsOn: "2027-10-31", endsOn: "2027-10-31" }), "2027-10-31")!;
    expect((autumn.end.getTime() - autumn.start.getTime()) / 3_600_000).toBe(25);
  });

  it("a partial closure is its wall-clock hours on that date, in summer and in winter", () => {
    const r = rule({ startsOn: "2027-07-01", endsOn: "2027-12-01", closedFrom: "13:00:00", closedTo: "14:00:00" });
    expect(closedIntervalOn(r, "2027-07-15")!.start.toISOString()).toBe("2027-07-15T12:00:00.000Z");
    expect(closedIntervalOn(r, "2027-11-15")!.start.toISOString()).toBe("2027-11-15T13:00:00.000Z");
  });

  it("outside the range, null: both ends are inclusive and nothing past them", () => {
    const r = rule({ startsOn: "2027-01-01", endsOn: "2027-01-02" });
    expect(closedIntervalOn(r, "2026-12-31")).toBeNull();
    expect(closedIntervalOn(r, "2027-01-01")).not.toBeNull();
    expect(closedIntervalOn(r, "2027-01-02")).not.toBeNull();
    expect(closedIntervalOn(r, "2027-01-03")).toBeNull();
  });

  it("closedDayIntervals gathers every closure on the date (they add up, none is lost)", () => {
    const rules = [
      rule({ startsOn: "2027-01-05", endsOn: "2027-01-05", closedFrom: "09:00", closedTo: "10:00" }),
      rule({ startsOn: "2027-01-05", endsOn: "2027-01-05", closedFrom: "15:00", closedTo: "16:00" }),
      rule({ startsOn: "2027-01-06", endsOn: "2027-01-06" }),
    ];
    expect(closedDayIntervals(rules, "2027-01-05")).toHaveLength(2);
    expect(closedDayIntervals(rules, "2027-01-04")).toHaveLength(0);
  });
});

describe("lisbonDatesTouched", () => {
  it("a window inside one date touches one date; one past midnight touches two", () => {
    expect(lisbonDatesTouched(new Date("2027-01-05T09:00:00Z"), new Date("2027-01-05T10:00:00Z"))).toEqual(["2027-01-05"]);
    expect(lisbonDatesTouched(new Date("2027-01-05T23:30:00Z"), new Date("2027-01-06T00:30:00Z"))).toEqual([
      "2027-01-05",
      "2027-01-06",
    ]);
  });
});

describe("closedDayPayload: the refusal says what closed and whether it is the whole day", () => {
  it("whole day: no hours", () => {
    expect(closedDayPayload("Clinica A", rule({ startsOn: "2026-12-25", endsOn: "2026-12-25", label: "Natal" }))).toEqual({
      locationName: "Clinica A",
      from: "",
      to: "",
      closedDay: { kind: "feriado_nacional", label: "Natal", wholeDay: true },
    });
  });

  it("partial: the hours, HH:MM", () => {
    const p = closedDayPayload(
      "Clinica A",
      rule({ startsOn: "2026-12-24", endsOn: "2026-12-24", closedFrom: "13:00:00", closedTo: "20:00:00", kind: "encerramento" }),
    );
    expect(p).toMatchObject({ from: "13:00", to: "20:00", closedDay: { wholeDay: false, kind: "encerramento" } });
  });
});

describe("the agenda bands", () => {
  const rules = [
    rule({ id: "a", startsOn: "2027-01-04", endsOn: "2027-01-05", label: "Obras" }),
    rule({ id: "b", startsOn: "2027-01-06", endsOn: "2027-01-06", closedFrom: "13:00", closedTo: "20:00" }),
  ];

  it("closedBandOn: 0 to 1440 for a whole day, the hours for a partial one, null off the range", () => {
    expect(closedBandOn(rules[0]!, "2027-01-04")).toEqual({ startMin: 0, endMin: 1440 });
    expect(closedBandOn(rules[1]!, "2027-01-06")).toEqual({ startMin: 780, endMin: 1200 });
    expect(closedBandOn(rules[1]!, "2027-01-07")).toBeNull();
  });

  it("closedDayBandsByDate keys each band by its own date, never by today", () => {
    const out = closedDayBandsByDate(rules, ["2027-01-04", "2027-01-05", "2027-01-06", "2027-01-07"]);
    expect(Object.keys(out).sort()).toEqual(["2027-01-04", "2027-01-05", "2027-01-06"]);
    expect(out["2027-01-04"]).toEqual([{ startMin: 0, endMin: 1440, kind: "feriado_nacional", label: "Obras" }]);
    expect(out["2027-01-07"]).toBeUndefined();
  });

  it("agendaClosuresOn: the lunch closure on every date, the dated one on its own date only", () => {
    const lunch = { startMin: 780, endMin: 840, locationName: "CB" };
    const days = { "2027-01-04": [{ startMin: 0, endMin: 1440, locationName: "CB", reason: "Obras" }] };
    expect(agendaClosuresOn("2027-01-04", lunch, days)).toHaveLength(2);
    expect(agendaClosuresOn("2027-01-05", lunch, days)).toEqual([lunch]);
    expect(agendaClosuresOn("2027-01-05", null, days)).toEqual([]);
    expect(agendaClosuresOn("2027-01-04", null, undefined)).toEqual([]);
  });
});

describe("closedDayInputError: the form refuses what the table's CHECKs refuse, by name", () => {
  const ok: ClosedDayInput = {
    locationId: "loc-1",
    startsOn: "2026-12-24",
    endsOn: "2026-12-26",
    closedFrom: "",
    closedTo: "",
    kind: "feriado_nacional",
    label: "Natal",
  };
  const today = "2026-11-05";

  it("accepts a whole-day range, a partial day, today, and the 92-day limit", () => {
    expect(closedDayInputError(ok, today)).toBeNull();
    expect(closedDayInputError({ ...ok, closedFrom: "13:00", closedTo: "20:00" }, today)).toBeNull();
    expect(closedDayInputError({ ...ok, startsOn: today, endsOn: today }, today)).toBeNull();
    expect(closedDayInputError({ ...ok, startsOn: "2027-01-01", endsOn: "2027-04-03" }, today)).toBeNull();
    expect(closedDayInputError({ ...ok, locationId: "all" }, today)).toBeNull();
  });

  it("refuses each broken box with its own code", () => {
    expect(closedDayInputError({ ...ok, locationId: "" }, today)).toBe("location");
    expect(closedDayInputError({ ...ok, startsOn: "2026-02-30" }, today)).toBe("dates");
    expect(closedDayInputError({ ...ok, startsOn: "2026-12-27" }, today)).toBe("range_order");
    expect(closedDayInputError({ ...ok, startsOn: "2027-01-01", endsOn: "2027-04-04" }, today)).toBe("range_length");
    expect(closedDayInputError({ ...ok, startsOn: "2026-11-04", endsOn: "2026-11-04" }, today)).toBe("past");
    expect(closedDayInputError({ ...ok, closedFrom: "13:00" }, today)).toBe("hours_pair");
    expect(closedDayInputError({ ...ok, closedFrom: "13:00", closedTo: "24:00" }, today)).toBe("hours");
    expect(closedDayInputError({ ...ok, closedFrom: "14:00", closedTo: "13:00" }, today)).toBe("hours_order");
    expect(closedDayInputError({ ...ok, closedFrom: "13:00", closedTo: "13:00" }, today)).toBe("hours_order");
    expect(closedDayInputError({ ...ok, kind: "feriado" }, today)).toBe("kind");
    expect(closedDayInputError({ ...ok, label: "x".repeat(81) }, today)).toBe("label");
    expect(closedDayInputError({ ...ok, label: "x".repeat(80) }, today)).toBeNull();
  });

  it("daysBetween counts calendar days, unaffected by the clock change", () => {
    expect(daysBetween("2027-03-27", "2027-03-29")).toBe(2);
    expect(daysBetween("2027-10-30", "2027-11-01")).toBe(2);
    expect(daysBetween("2027-01-01", "2027-04-03")).toBe(92);
  });
});

describe("closureHoursFromForm: Dia inteiro and the hours", () => {
  it("ticked: the hours are ignored, whatever was typed", () => {
    expect(closureHoursFromForm(true, "13:00", "20:00")).toEqual({ closedFrom: "", closedTo: "" });
    expect(closureHoursFromForm(true, "", "")).toEqual({ closedFrom: "", closedTo: "" });
  });

  it("unticked: both hours are required, an empty one is refused (never saved as a whole day)", () => {
    expect(closureHoursFromForm(false, "", "")).toEqual({ error: "hours_required" });
    expect(closureHoursFromForm(false, "13:00", "")).toEqual({ error: "hours_required" });
    expect(closureHoursFromForm(false, " ", "20:00")).toEqual({ error: "hours_required" });
    expect(closureHoursFromForm(false, "13:00", "20:00")).toEqual({ closedFrom: "13:00", closedTo: "20:00" });
  });
});
