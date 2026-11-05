/**
 * closed-days.readers.test.ts - Tier C 0114: each staff reader honours a dated
 * clinic closure, behaviourally (the census test proves each one CALLS the
 * reader; this proves what each does with the answer).
 *
 *   - checkClinicClosure: refuses inside a dated closure (whole and partial
 *     day, a visit running into a closed day), with the closure's kind and
 *     label; the lunch closure still wins on its own hour; with the table
 *     absent (the reader answers []) nothing changes;
 *   - buildDay: a closed day leaves no free time and reads "closed", a partial
 *     one cuts only its hours, and the closure is listed beside the lunch one;
 *   - the agenda's week list and phone week: a dated band only on its own
 *     date, clipped to the drawn window;
 *   - the refusal sentence: a dated closure gets its own sentence, never the
 *     lunch closure's "todos os dias".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./closed-days", () => ({ readClosedDays: vi.fn(async () => []) }));

import { readClosedDays } from "./closed-days";
import { checkClinicClosure } from "./clinic-closure-enforcement";
import { buildDay, noFreeReason } from "./day-availability-core";
import { buildWeekListDays } from "./agenda-week-list-core";
import { buildCompactWeek } from "./agenda-compact-core";
import { clinicClosedMessage } from "./clinic-closed-message";
import type { ClosedDayRule } from "./closed-days-core";
import type { AvailabilityTemplate } from "./availability";
import { lisbonDateTimeToUtc } from "./time";

const mockRead = vi.mocked(readClosedDays);

const rule = (r: Partial<ClosedDayRule> & Pick<ClosedDayRule, "startsOn" | "endsOn">): ClosedDayRule => ({
  id: "c1",
  closedFrom: null,
  closedTo: null,
  kind: "feriado_nacional",
  label: null,
  ...r,
});

/** A tx that answers readClinic's one select with this clinic. */
function clinicTx(clinic: Record<string, unknown> | null) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => (clinic ? [clinic] : []) }),
      }),
    }),
    execute: async () => [],
  } as never;
}

const CB = {
  name: "Clinica CB",
  opensAt: "08:00:00",
  closesAt: "20:00:00",
  middayClosedFrom: "13:00:00",
  middayClosedTo: "14:00:00",
};

const at = (date: string, hhmm: string) => lisbonDateTimeToUtc(date, hhmm);

describe("checkClinicClosure reads the dated closures through the one reader", () => {
  beforeEach(() => {
    mockRead.mockReset();
    mockRead.mockResolvedValue([]);
  });

  it("refuses inside a whole-day closure, naming the clinic, the kind and the label", async () => {
    mockRead.mockResolvedValue([rule({ startsOn: "2026-12-25", endsOn: "2026-12-25", label: "Natal" })]);
    const v = await checkClinicClosure(clinicTx(CB), {
      locationId: "loc-cb",
      startsAt: at("2026-12-25", "10:00"),
      endsAt: at("2026-12-25", "11:00"),
    });
    expect(v).toEqual({
      ok: false,
      locationName: "Clinica CB",
      from: "",
      to: "",
      closedDay: { kind: "feriado_nacional", label: "Natal", wholeDay: true },
    });
  });

  it("asks for the clinic and EVERY Lisbon date the window touches", async () => {
    await checkClinicClosure(clinicTx(CB), {
      locationId: "loc-cb",
      startsAt: at("2026-12-31", "23:30"),
      endsAt: at("2027-01-01", "00:30"),
    });
    expect(mockRead.mock.calls[0]![1]).toEqual({ locationId: "loc-cb", fromDate: "2026-12-31", toDate: "2027-01-01" });
  });

  it("a partial closure refuses only its hours; a visit ending at closed_from is allowed", async () => {
    mockRead.mockResolvedValue([
      rule({ startsOn: "2026-12-24", endsOn: "2026-12-24", closedFrom: "15:00:00", closedTo: "20:00:00", kind: "encerramento" }),
    ]);
    const before = await checkClinicClosure(clinicTx(CB), {
      locationId: "loc-cb",
      startsAt: at("2026-12-24", "14:00"),
      endsAt: at("2026-12-24", "15:00"),
    });
    expect(before).toEqual({ ok: true });
    const inside = await checkClinicClosure(clinicTx(CB), {
      locationId: "loc-cb",
      startsAt: at("2026-12-24", "14:30"),
      endsAt: at("2026-12-24", "15:30"),
    });
    expect(inside).toMatchObject({ ok: false, from: "15:00", to: "20:00", closedDay: { wholeDay: false } });
  });

  it("the lunch closure still refuses its own hour, before any dated read", async () => {
    const v = await checkClinicClosure(clinicTx(CB), {
      locationId: "loc-cb",
      startsAt: at("2027-01-05", "13:00"),
      endsAt: at("2027-01-05", "13:30"),
    });
    expect(v).toEqual({ ok: false, locationName: "Clinica CB", from: "13:00", to: "14:00" });
  });

  it("with the table absent (the reader answers nothing), an ordinary hour is allowed exactly as before", async () => {
    const v = await checkClinicClosure(clinicTx(CB), {
      locationId: "loc-cb",
      startsAt: at("2026-12-25", "10:00"),
      endsAt: at("2026-12-25", "11:00"),
    });
    expect(v).toEqual({ ok: true });
  });

  it("a location this tenant does not have is not this check's refusal", async () => {
    mockRead.mockResolvedValue([rule({ startsOn: "2026-12-25", endsOn: "2026-12-25" })]);
    const v = await checkClinicClosure(clinicTx(null), {
      locationId: "nope",
      startsAt: at("2026-12-25", "10:00"),
      endsAt: at("2026-12-25", "11:00"),
    });
    expect(v).toEqual({ ok: true });
  });
});

describe("buildDay subtracts dated closures like the lunch closure", () => {
  const tpl = (weekday: number): AvailabilityTemplate => ({
    weekday,
    startTime: "09:00",
    endTime: "17:00",
    validFrom: null,
    validUntil: null,
    isActive: true,
  });

  it("a whole closed day leaves no free time, and the reason is the clinic", () => {
    // 2026-12-25 is a Friday (weekday 5).
    const day = buildDay("2026-12-25", [tpl(5)], [], [], null, [rule({ startsOn: "2026-12-25", endsOn: "2026-12-25" })]);
    expect(day.free).toEqual([]);
    expect(day.closures).toHaveLength(1);
    expect(noFreeReason(day)).toBe("closed");
  });

  it("a partial closure cuts only its hours, beside the lunch closure", () => {
    const day = buildDay(
      "2026-12-24",
      [tpl(4)],
      [],
      [],
      { opensAt: "08:00", closesAt: "20:00", middayClosedFrom: "13:00", middayClosedTo: "14:00" },
      [rule({ startsOn: "2026-12-24", endsOn: "2026-12-24", closedFrom: "15:00", closedTo: "20:00" })],
    );
    expect(day.closures).toHaveLength(2);
    expect(day.free.map((f) => [f.start, f.end])).toEqual([
      [at("2026-12-24", "09:00").toISOString(), at("2026-12-24", "13:00").toISOString()],
      [at("2026-12-24", "14:00").toISOString(), at("2026-12-24", "15:00").toISOString()],
    ]);
  });

  it("a closure on another date changes nothing (the default is no closure at all)", () => {
    const day = buildDay("2026-12-23", [tpl(3)], [], [], null, [rule({ startsOn: "2026-12-25", endsOn: "2026-12-25" })]);
    expect(day.closures).toEqual([]);
    expect(day.free).toHaveLength(1);
    expect(buildDay("2026-12-23", [tpl(3)], [], []).free).toEqual(day.free);
  });
});

describe("the agenda's list and phone views draw a dated closure on its own date only", () => {
  const closedDays = {
    "2027-01-05": [{ startMin: 0, endMin: 1440, locationName: "Clinica CB", reason: "Natal" }],
  };

  it("week list: one closure row on that date, clipped to the drawn window, none on the others", () => {
    const days = buildWeekListDays({
      view: "week",
      anchor: "2027-01-04",
      appointments: [],
      closedDays,
      dayWindow: { startMin: 8 * 60, endMin: 20 * 60 },
    });
    const tue = days.find((d) => d.date === "2027-01-05")!;
    expect(tue.rows).toEqual([{ kind: "closure", startMin: 480, endMin: 1200, locationName: "Clinica CB" }]);
    for (const d of days.filter((x) => x.date !== "2027-01-05")) expect(d.rows).toEqual([]);
  });

  it("phone week: one closure band on that date, none on the others", () => {
    const week = buildCompactWeek({ anchor: "2027-01-04", appointments: [], closedDays });
    for (const d of week.days) {
      const bands = d.bands.filter((b) => b.kind === "closure");
      expect(bands.length, d.date).toBe(d.date === "2027-01-05" ? 1 : 0);
    }
  });
});

describe("the refusal sentence for a dated closure", () => {
  it("whole day: says this day and the reason, never 'todos os dias'", () => {
    const text = clinicClosedMessage({
      locationName: "Clinica CB",
      from: "",
      to: "",
      closedDay: { kind: "feriado_nacional", label: null, wholeDay: true },
    });
    expect(text).toContain("Clinica CB");
    expect(text).toContain("Feriado nacional");
    expect(text).not.toContain("todos os dias");
    expect(text).not.toMatch(/\{(clinica|motivo|de|ate)\}/);
  });

  it("partial: the hours and the label", () => {
    const text = clinicClosedMessage({
      locationName: "Clinica CB",
      from: "13:00",
      to: "20:00",
      closedDay: { kind: "outro", label: "Natal", wholeDay: false },
    });
    expect(text).toContain("13:00");
    expect(text).toContain("20:00");
    expect(text).toContain("Natal");
    expect(text).not.toMatch(/\{(clinica|motivo|de|ate)\}/);
  });

  it("the lunch closure keeps its own sentence", () => {
    const text = clinicClosedMessage({ locationName: "Clinica CB", from: "13:00", to: "14:00" });
    expect(text).toContain("todos os dias");
  });
});
