// AGMOB-01 - the phone's week, as a LIST, decided here and rendered elsewhere.
//
// WRITTEN BEFORE THE MODULE IT IMPORTS. Every arm below carries its own control
// IN THE SAME RUN, because the failure this file exists to prevent is not "the
// list is empty" - it is "the list is plausible and wrong". A stub that returns
// six constant sections passes an arm asserting "six sections" and fails the
// control asserting the day view returns one; a stub returning [] fails both.
//
// WHY A PURE CORE AND NOT A COMPONENT TEST. No CI job on this repository runs
// WebKit (`git grep -ic webkit -- .github/` exits 1; the control, `chromium`,
// is `.github/workflows/e2e.yml:14`), so an assertion about the phone that is
// worth anything has to be an assertion about a VALUE, not about a rendering.
// The component is a projection of what this file returns.

import { describe, expect, it } from "vitest";

import { buildWeekListDays, type WeekListRow } from "./agenda-week-list-core";
import type { AgendaAppointment } from "./types";
import type { BlockSpan } from "./blocked-time-core";

/* ------------------------------------------------------------------ */
/* Fixtures. Lisbon wall-clock is the unit; every instant is built     */
/* from a Lisbon time so a reader can check the expectation by eye.    */
/* ------------------------------------------------------------------ */

const MON = "2026-09-21"; // a Monday
const WED = "2026-09-23";
const SUN = "2026-09-27"; // never rendered: WEEK_DAYS = 6, Mon-Sat (W3-08)

/** Lisbon wall-clock -> the UTC ISO string the row would really carry.
 *  September is WEST (UTC+1), so 09:00 Lisbon is 08:00Z. Written out rather
 *  than computed, so this helper cannot agree with a bug in `time.ts`. */
function lisbon(date: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${date}T${String(h - 1).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;
}

const VIEWER = "therapist-a";
const OTHER = "therapist-b";

function appt(
  over: Partial<AgendaAppointment> & { id: string; date: string; from: string; to: string },
): AgendaAppointment {
  const { date, from, to, id, ...rest } = over;
  return {
    id,
    patientId: `p-${id}`,
    patientName: `Paciente ${id}`,
    practitionerId: VIEWER,
    practitionerName: "A",
    colorKey: null,
    patientTwoId: null,
    patientTwoName: null,
    practitionerTwoId: null,
    practitionerTwoName: null,
    locationId: "loc-1",
    locationName: "Linda-a-Velha",
    serviceId: null,
    serviceName: null,
    room: null,
    startsAt: lisbon(date, from),
    endsAt: lisbon(date, to),
    status: "scheduled",
    notes: null,
    recurrenceRule: null,
    recurrenceParentId: null,
    confirmationState: "pending",
    confirmationReceivedAt: null,
    confirmationChannel: null,
    hasNote: false,
    createdBy: null,
    createdByName: null,
    createdAt: lisbon(date, "00:00"),
    ...rest,
  } as AgendaAppointment;
}

function block(over: { id: string; date: string; from: string; to: string; note?: string | null }): BlockSpan {
  return {
    id: over.id,
    startsAt: lisbon(over.date, over.from),
    endsAt: lisbon(over.date, over.to),
    reason: "ferias",
    note: over.note ?? null,
  };
}

const NO_CLOSURE = null;
const CLOSURE = { startMin: 13 * 60, endMin: 14 * 60, locationName: "Linda-a-Velha" };

function base(over: Partial<Parameters<typeof buildWeekListDays>[0]> = {}) {
  return {
    view: "week" as const,
    anchor: WED,
    appointments: [] as AgendaAppointment[],
    blocks: [] as BlockSpan[],
    closure: NO_CLOSURE as typeof CLOSURE | null,
    // No `practitionerId` here, deliberately. W9-04's "a band only when the
    // agenda is scoped to one therapist" is enforced at the SERVER: page.tsx
    // fetches `blocks` at all only when `practitionerId` is set, and hands back
    // [] otherwise. A second copy of that rule in this module would be free to
    // drift from the query that actually decides it.
    ...over,
  };
}

const kinds = (rows: WeekListRow[]) => rows.map((r) => r.kind);
const ids = (rows: WeekListRow[]) =>
  rows.map((r) => (r.kind === "appointment" || r.kind === "block" ? r.id : r.kind));

describe("buildWeekListDays", () => {
  it("returns the six Mon-Sat days in order for a week, and exactly one for a day", () => {
    const week = buildWeekListDays(base());
    expect(week.map((d) => d.date)).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
    ]);
    // Sunday is never a section. W3-08 / WEEK_DAYS = 6, and the desktop grid
    // is pinned to the same six by e2e/agenda-week-6day.spec.ts.
    expect(week.map((d) => d.date)).not.toContain(SUN);

    // CONTROL, SAME RUN. A stub returning a constant six-element array passes
    // the arm above and fails this one.
    const day = buildWeekListDays(base({ view: "day" }));
    expect(day.map((d) => d.date)).toEqual([WED]);
  });

  it("puts each appointment under its own Lisbon day and sorts a shuffled input chronologically", () => {
    const week = buildWeekListDays(
      base({
        appointments: [
          appt({ id: "c", date: WED, from: "16:00", to: "17:00" }),
          appt({ id: "a", date: WED, from: "09:00", to: "10:00" }),
          appt({ id: "mon", date: MON, from: "11:00", to: "12:00" }),
          appt({ id: "b", date: WED, from: "11:30", to: "12:00" }),
        ],
      }),
    );
    const wed = week.find((d) => d.date === WED)!;
    expect(ids(wed.rows)).toEqual(["a", "b", "c"]);

    // CONTROL: the Monday row did NOT land on Wednesday, and Monday is not
    // empty. A build that dropped every row but the anchor's passes the sort
    // assertion above and fails this pair.
    expect(week.find((d) => d.date === MON)!.rows.map((r) => r.kind)).toEqual(["appointment"]);
    expect(week.find((d) => d.date === "2026-09-22")!.rows).toEqual([]);
  });

  it("marks a day empty only when it really holds nothing", () => {
    const empty = buildWeekListDays(base());
    expect(empty.every((d) => d.rows.length === 0)).toBe(true);
    expect(empty).toHaveLength(6); // not vacuous: there ARE six days to be empty

    // CONTROL: one appointment makes exactly one of the six non-empty.
    const one = buildWeekListDays(base({ appointments: [appt({ id: "x", date: MON, from: "09:00", to: "10:00" })] }));
    expect(one.filter((d) => d.rows.length > 0).map((d) => d.date)).toEqual([MON]);
  });

  it("renders a block as its own row, interleaved chronologically with appointments", () => {
    const week = buildWeekListDays(
      base({
        appointments: [
          appt({ id: "early", date: WED, from: "09:00", to: "10:00" }),
          appt({ id: "late", date: WED, from: "15:00", to: "16:00" }),
        ],
        blocks: [block({ id: "blk", date: WED, from: "11:00", to: "12:30", note: "Formacao" })],
      }),
    );
    const wed = week.find((d) => d.date === WED)!;
    expect(ids(wed.rows)).toEqual(["early", "blk", "late"]);
    expect(kinds(wed.rows)).toEqual(["appointment", "block", "appointment"]);

    // CONTROL: remove the block and the same input yields two rows, so the
    // interleave above measured the block and not the ordering alone.
    const without = buildWeekListDays(
      base({
        appointments: [
          appt({ id: "early", date: WED, from: "09:00", to: "10:00" }),
          appt({ id: "late", date: WED, from: "15:00", to: "16:00" }),
        ],
      }),
    );
    expect(ids(without.find((d) => d.date === WED)!.rows)).toEqual(["early", "late"]);
  });

  it("clips a multi-day block to each day it covers, and says which end is clipped", () => {
    const week = buildWeekListDays(
      base({ blocks: [block({ id: "long", date: MON, from: "14:00", to: "14:00" })] }),
    );
    // A zero-length block carries no time and is dropped - the control for the
    // real case below, and the reason `mergeIntervals`' rule is restated here.
    expect(week.every((d) => d.rows.length === 0)).toBe(true);

    const multi = buildWeekListDays(
      base({
        blocks: [
          { id: "long", startsAt: lisbon(MON, "14:00"), endsAt: lisbon(WED, "11:00"), reason: "ferias", note: null },
        ],
      }),
    );
    const covered = multi.filter((d) => d.rows.length > 0).map((d) => d.date);
    expect(covered).toEqual([MON, "2026-09-22", WED]);
    const [mon, tue, wed] = covered.map((d) => multi.find((x) => x.date === d)!.rows[0]);
    expect(mon.kind === "block" && mon.clippedStart).toBe(false);
    expect(mon.kind === "block" && mon.clippedEnd).toBe(true);
    expect(tue.kind === "block" && tue.clippedStart && tue.clippedEnd).toBe(true);
    expect(wed.kind === "block" && wed.clippedStart).toBe(true);
    expect(wed.kind === "block" && wed.clippedEnd).toBe(false);
  });

  it("renders the clinic closure once per day, and only when there is one", () => {
    const withClosure = buildWeekListDays(base({ closure: CLOSURE }));
    expect(withClosure.every((d) => kinds(d.rows).filter((k) => k === "closure").length === 1)).toBe(true);

    // CONTROL, SAME RUN: null closure yields none, so the arm above measured
    // the closure rather than counting a row every day happens to have.
    expect(buildWeekListDays(base()).every((d) => kinds(d.rows).includes("closure"))).toBe(false);

    // And it sorts by its own start: an 09:00 appointment precedes a 13:00
    // closure, a 15:00 one follows it.
    const mixed = buildWeekListDays(
      base({
        closure: CLOSURE,
        appointments: [
          appt({ id: "am", date: WED, from: "09:00", to: "10:00" }),
          appt({ id: "pm", date: WED, from: "15:00", to: "16:00" }),
        ],
      }),
    );
    expect(kinds(mixed.find((d) => d.date === WED)!.rows)).toEqual(["appointment", "closure", "appointment"]);
  });

  it("keeps a cancelled appointment on the list and says so, rather than hiding it", () => {
    const week = buildWeekListDays(
      base({
        appointments: [
          appt({ id: "canc", date: WED, from: "09:00", to: "10:00", status: "cancelled" }),
          appt({ id: "live", date: WED, from: "11:00", to: "12:00" }),
        ],
      }),
    );
    const wed = week.find((d) => d.date === WED)!;
    // Both rows are present - the desktop grid does not hide a cancellation
    // either, and a phone that silently dropped it would read as a free hour.
    expect(ids(wed.rows)).toEqual(["canc", "live"]);
    const canc = wed.rows[0];
    const live = wed.rows[1];
    expect(canc.kind === "appointment" && canc.status).toBe("cancelled");
    expect(live.kind === "appointment" && live.status).toBe("scheduled"); // control
  });

  it("folds status and confirmation into ONE estado, exactly as the grid does", () => {
    const week = buildWeekListDays(
      base({
        appointments: [
          // Same lifecycle status, different confirmation axis. A build that
          // read `status` alone gives both "agendada" and fails this arm.
          appt({ id: "pend", date: WED, from: "09:00", to: "10:00" }),
          appt({ id: "conf", date: WED, from: "10:00", to: "11:00", confirmationState: "confirmed" }),
          // Same confirmation axis, different lifecycle status - the control in
          // the other direction. A build that read `confirmationState` alone
          // gives both "agendada" and fails here.
          appt({ id: "noshow", date: WED, from: "11:00", to: "12:00", status: "no_show" }),
        ],
      }),
    );
    const rows = week.find((d) => d.date === WED)!.rows;
    expect(rows.map((r) => (r.kind === "appointment" ? r.estado : null))).toEqual([
      "agendada",
      "confirmada",
      "falta",
    ]);
  });

  it("carries the name as NULL when it is withheld, and never substitutes a label", () => {
    const week = buildWeekListDays(
      base({
        appointments: [
          appt({ id: "hidden", date: WED, from: "09:00", to: "10:00", patientName: null }),
          appt({ id: "shown", date: WED, from: "11:00", to: "12:00" }), // control
        ],
      }),
    );
    const rows = week.find((d) => d.date === WED)!.rows;
    expect(rows[0].kind === "appointment" && rows[0].patientName).toBeNull();
    expect(rows[1].kind === "appointment" && rows[1].patientName).toBe("Paciente shown");
  });

  it("carries the practitioner on EVERY appointment row (W9-05: colour is never the only cue)", () => {
    const week = buildWeekListDays(
      base({
        appointments: [
          appt({ id: "mine", date: WED, from: "09:00", to: "10:00" }),
          appt({ id: "theirs", date: WED, from: "11:00", to: "12:00", practitionerId: OTHER, practitionerName: "B" }),
        ],
      }),
    );
    const rows = week.find((d) => d.date === WED)!.rows;
    expect(rows.map((r) => (r.kind === "appointment" ? r.practitionerName : null))).toEqual(["A", "B"]);
    expect(rows.map((r) => (r.kind === "appointment" ? r.practitionerId : null))).toEqual([VIEWER, OTHER]);
  });

  it("reports each day's appointment count WITHOUT counting blocks or the closure", () => {
    const week = buildWeekListDays(
      base({
        closure: CLOSURE,
        appointments: [
          appt({ id: "a1", date: WED, from: "09:00", to: "10:00" }),
          appt({ id: "a2", date: WED, from: "11:00", to: "12:00" }),
        ],
        blocks: [block({ id: "b1", date: WED, from: "16:00", to: "17:00" })],
      }),
    );
    const wed = week.find((d) => d.date === WED)!;
    expect(wed.rows).toHaveLength(4); // 2 appointments + 1 block + 1 closure
    expect(wed.appointmentCount).toBe(2); // the heading's number is the READABLE one
    // CONTROL: a day with only a block and a closure counts zero.
    const other = buildWeekListDays(
      base({ closure: CLOSURE, blocks: [block({ id: "b", date: MON, from: "09:00", to: "10:00" })] }),
    ).find((d) => d.date === MON)!;
    expect(other.rows.length).toBeGreaterThan(0);
    expect(other.appointmentCount).toBe(0);
  });

  it("reads each instant in Lisbon, so a late-evening UTC instant is not pushed to the next day", () => {
    // 23:30 Lisbon on Wednesday is 22:30Z the SAME day in September, but a
    // build that used the UTC date would still agree. So use a time where they
    // genuinely differ: 00:30 Lisbon on Thursday is 23:30Z on WEDNESDAY.
    const late: AgendaAppointment = {
      ...appt({ id: "late", date: WED, from: "09:00", to: "10:00" }),
      startsAt: "2026-09-23T23:30:00.000Z",
      endsAt: "2026-09-24T00:30:00.000Z",
    };
    const week = buildWeekListDays(base({ appointments: [late] }));
    // Lisbon reads it as Thursday 00:30.
    expect(week.find((d) => d.date === "2026-09-24")!.rows.map((r) => r.kind)).toEqual(["appointment"]);
    // CONTROL: it is NOT on the UTC day.
    expect(week.find((d) => d.date === WED)!.rows).toEqual([]);
  });

  it("is not disturbed by an appointment outside the six days in view", () => {
    const week = buildWeekListDays(
      base({
        appointments: [
          appt({ id: "sunday", date: SUN, from: "09:00", to: "10:00" }),
          appt({ id: "inside", date: MON, from: "09:00", to: "10:00" }), // control
        ],
      }),
    );
    expect(week).toHaveLength(6);
    expect(week.flatMap((d) => ids(d.rows))).toEqual(["inside"]);
  });
});
