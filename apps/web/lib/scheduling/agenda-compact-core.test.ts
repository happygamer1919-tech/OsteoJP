// AGENDA-MOBILE-WEEK - the phone's Semana grid, decided here, rendered elsewhere.
//
// EVERY RULE BELOW HAS A CONTROL IN THE SAME FILE that fails when the rule is
// removed or weakened, because the failure worth preventing is not "the grid is
// empty" but "the grid is plausible and wrong": a lane layout that stacks a twin
// pair, a window that clamps a 07:30 booking, a Sunday that appears for a row
// from the week before.
//
// WHY A PURE CORE. No CI job on this repository runs WebKit and the clinic is on
// iPhones; an assertion about the phone that is worth anything is an assertion
// about a VALUE. agenda-week-compact.tsx is a projection of what this returns.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  COMPACT_BASE_WINDOW,
  COMPACT_CHIP,
  COMPACT_FACE,
  COMPACT_FACE_PX,
  COMPACT_LANE_GAP_PX,
  COMPACT_MAX_LANES,
  COMPACT_MIN_DRAWN_MINUTES,
  COMPACT_MIN_TARGET_PX,
  autoScrollDecision,
  buildCompactWeek,
  compactDates,
  compactChipWidthPx,
  compactDayLabel,
  compactLaneBox,
  compactLaneWidthPx,
  compactWindow,
  COMPACT_ROW_PX,
  faceName,
  layoutLanes,
  type AutoScrollInput,
  type LaneItem,
  type LaneLayout,
} from "./agenda-compact-core";
import type { BlockSpan } from "./blocked-time-core";
import { s } from "../i18n";
import type { AgendaAppointment } from "./types";

const MON = "2026-09-21"; // a Monday
const WED = "2026-09-23";
const FRI = "2026-09-25";
const SAT = "2026-09-26";
const SUN = "2026-09-27"; // the Sunday AFTER this Saturday
const PREV_SUN = "2026-09-20"; // the Sunday BEFORE this Monday
const NEXT_MON = "2026-09-28";

/** Lisbon wall-clock -> the UTC ISO string a row carries. September is WEST
 *  (UTC+1). Written out, not computed, so it cannot agree with a bug in time.ts.
 *  Valid for 01:00 and later, which is every time this file uses. */
function lisbon(date: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${date}T${String(h! - 1).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;
}

const PERSON = "therapist-1";
const MACHINE = "nesa-1";
const MACHINES = new Set([MACHINE]);

function appt(
  over: Partial<AgendaAppointment> & { id: string; date: string; from: string; to: string },
): AgendaAppointment {
  const { date, from, to, id, ...rest } = over;
  return {
    id,
    patientId: `p-${id}`,
    patientName: `Paciente${id} Teste`,
    practitionerId: PERSON,
    practitionerName: "Terapeuta Um",
    colorKey: null,
    patientTwoId: null,
    patientTwoName: null,
    practitionerTwoId: null,
    practitionerTwoName: null,
    locationId: "loc-1",
    locationName: "Clinica",
    serviceId: "svc-osteo",
    serviceName: "Osteopatia",
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
    createdAt: lisbon(date, "01:00"),
    ...rest,
  } as AgendaAppointment;
}

function lane(
  id: string,
  startMin: number,
  endMin: number,
  machine = false,
  label = id,
  patient: string | null = null,
): LaneItem {
  return { id, startMin, endMin, machine, label, patient };
}

const H = (hh: number, mm = 0) => hh * 60 + mm;

/** Minutes to px on the grid's scale (the window's top is irrelevant: only
 *  differences are compared). */
const PX = (min: number) => (min * COMPACT_ROW_PX) / 30;

/** The chip's box, top and bottom in px, on the scale of PX. */
function chipBand(anchorMin: number): { top: number; bottom: number } {
  const top = PX(anchorMin) + COMPACT_CHIP.topPx;
  return { top, bottom: top + COMPACT_CHIP.heightPx };
}

/** A half-lane block's time and name lines, top and bottom in px: the part of
 *  its face that spans the whole lane (the glyph line holds only the glyph,
 *  left of where a chip starts). */
function textBand(startMin: number): { top: number; bottom: number } {
  const top = PX(startMin) + COMPACT_FACE.padPx;
  return { top, bottom: top + COMPACT_FACE.timeLinePx + COMPACT_FACE.nameLinePx };
}

const bandsHit = (a: { top: number; bottom: number }, b: { top: number; bottom: number }) =>
  a.top < b.bottom && b.top < a.bottom;

/* ------------------------------------------------------------------ */
/* Days: Mon-Sat, plus Dom only when it holds a booking.               */
/* ------------------------------------------------------------------ */
describe("compactDates", () => {
  it("is Mon-Sat when the week's Sunday holds nothing", () => {
    expect(compactDates(WED, [])).toEqual([MON, "2026-09-22", WED, "2026-09-24", FRI, SAT]);
  });

  it("adds THIS week's Sunday when a row starts on it", () => {
    const days = compactDates(WED, [appt({ id: "s", date: SUN, from: "10:00", to: "10:45" })]);
    expect(days).toHaveLength(7);
    expect(days[6]).toBe(SUN);
  });

  it("CONTROL: a row on the Sunday BEFORE this Monday, or on the next Monday, adds nothing", () => {
    // A rule that added Dom for ANY Sunday row, or for any row outside
    // Mon-Sat, would pass the arm above and fail here.
    expect(compactDates(WED, [appt({ id: "p", date: PREV_SUN, from: "10:00", to: "10:45" })])).toHaveLength(6);
    expect(compactDates(WED, [appt({ id: "n", date: NEXT_MON, from: "10:00", to: "10:45" })])).toHaveLength(6);
  });

  it("Q-B6-9: a Sunday holding only a CANCELLED row still shows Dom", () => {
    const days = compactDates(WED, [
      appt({ id: "c", date: SUN, from: "10:00", to: "10:45", status: "cancelled" }),
    ]);
    expect(days[6]).toBe(SUN);
  });

  it("on a Sunday anchor, the week shown is the one just ended, and that Sunday is its Dom", () => {
    // viewDates("week", sunday) is the PRECEDING Mon-Sat; the Dom column must
    // be the anchor itself, not the Sunday a week later.
    const days = compactDates(SUN, [appt({ id: "s", date: SUN, from: "10:00", to: "10:45" })]);
    expect(days[0]).toBe(MON);
    expect(days[6]).toBe(SUN);
  });
});

/* ------------------------------------------------------------------ */
/* Window: 08:00-21:00, widened to every drawn booking, never clamped.  */
/* ------------------------------------------------------------------ */
describe("compactWindow", () => {
  it("is the ruling's 08:00 to 21:00 when nothing lies outside it", () => {
    expect(compactWindow([])).toEqual(COMPACT_BASE_WINDOW);
    expect(compactWindow([{ startMin: H(9), endMin: H(20, 45) }])).toEqual({ startMin: H(8), endMin: H(21) });
  });

  it("widens to a 07:30 start and a 21:30 start, rounded OUTWARD to whole hours", () => {
    expect(compactWindow([{ startMin: H(7, 30), endMin: H(8, 15) }]).startMin).toBe(H(7));
    // 21:30 to 22:15 needs the 22:00 row, so the window ends at 23:00.
    expect(compactWindow([{ startMin: H(21, 30), endMin: H(22, 15) }]).endMin).toBe(H(23));
  });

  it("CONTROL: an end exactly on the hour adds no extra row", () => {
    // A floor-plus-one rule would give 23:00 here; ceil gives 22:00.
    expect(compactWindow([{ startMin: H(21), endMin: H(22) }]).endMin).toBe(H(22));
  });

  it("a very short booking at 20:50 still gets a whole drawn row inside the window", () => {
    // Drawn at least 30 minutes tall, so its drawn end is 21:20 and the 21:00
    // row must exist, or the block would hang below the grid.
    expect(compactWindow([{ startMin: H(20, 50), endMin: H(21) }]).endMin).toBe(H(22));
  });
});

/* ------------------------------------------------------------------ */
/* Lanes: side by side, at most two, and a +N chip for the rest.        */
/* ------------------------------------------------------------------ */
describe("layoutLanes", () => {
  it("a lone block takes the whole column", () => {
    expect(layoutLanes([lane("a", H(10), H(10, 45))]).placed).toEqual([
      { id: "a", lane: 0, lanes: 1, drawnEndMin: H(10, 45) },
    ]);
  });

  it("THE TWIN PAIR: same patient, same start, a person row and a machine row, render SIDE BY SIDE", () => {
    const person = lane("p", H(10), H(10, 45), false, "Ana");
    const machine = lane("m", H(10), H(10, 45), true, "Ana");
    const { placed, more } = layoutLanes([machine, person]); // machine given FIRST on purpose
    expect(more).toEqual([]);
    expect(placed).toHaveLength(2);
    expect(placed.every((p) => p.lanes === 2)).toBe(true);
    // Person left, machine right, whatever order the rows arrived in.
    expect(placed.find((p) => p.id === "p")!.lane).toBe(0);
    expect(placed.find((p) => p.id === "m")!.lane).toBe(1);
    expect(layoutLanes([person, machine]).placed).toEqual(placed);
  });

  it("CONTROL: two rows that do NOT overlap stay full width, one after the other", () => {
    // A layout that split every pair side by side would pass the twin arm and
    // fail here.
    const { placed } = layoutLanes([lane("a", H(10), H(10, 45)), lane("b", H(11), H(11, 45))]);
    expect(placed.map((p) => p.lanes)).toEqual([1, 1]);
  });

  it("lanes are computed on the DRAWN span: a 10-minute visit and one 15 minutes later do not paint over each other", () => {
    // Booked spans 10:00-10:10 and 10:15-11:00 do not overlap, but the first is
    // DRAWN 30 minutes tall (to 10:30), so they must take two lanes.
    const { placed } = layoutLanes([lane("short", H(10), H(10, 10)), lane("next", H(10, 15), H(11))]);
    expect(placed.map((p) => p.lanes)).toEqual([2, 2]);
    expect(new Set(placed.map((p) => p.lane))).toEqual(new Set([0, 1]));
    // CONTROL: with a real gap after the drawn end, they share one lane.
    expect(
      layoutLanes([lane("short", H(10), H(10, 10)), lane("later", H(10, 30), H(11))]).placed.map((p) => p.lanes),
    ).toEqual([1, 1]);
  });

  it("a chain reuses a freed lane instead of opening a third", () => {
    // A 09:00-10:00, B 09:30-10:30, C 10:00-10:45: C fits after A in lane 0.
    const { placed, more } = layoutLanes([
      lane("A", H(9), H(10)),
      lane("B", H(9, 30), H(10, 30)),
      lane("C", H(10), H(10, 45)),
    ]);
    expect(more).toEqual([]);
    expect(Object.fromEntries(placed.map((p) => [p.id, p.lane]))).toEqual({ A: 0, B: 1, C: 0 });
    expect(placed.every((p) => p.lanes === 2)).toBe(true);
  });

  it("Q-B6-1, THE CARD'S DEFAULT: THREE concurrent rows draw TWO blocks side by side and a +1 chip", () => {
    const { placed, more } = layoutLanes([
      lane("a", H(15), H(15, 45), false, "a"),
      lane("b", H(15), H(15, 45), true, "b"),
      lane("c", H(15), H(15, 45), true, "c"),
    ]);
    expect(placed).toEqual([
      { id: "a", lane: 0, lanes: 2, drawnEndMin: H(15, 45) },
      { id: "b", lane: 1, lanes: 2, drawnEndMin: H(15, 45) },
    ]);
    expect(more).toHaveLength(1);
    expect(more[0]).toMatchObject({ startMin: H(15), drawnEndMin: H(15, 45), count: 1 });
    expect(more[0]!.hiddenIds).toEqual(["c"]);
  });

  it("Q-B6-1: FOUR at once (two people, two machine rows) reads 'two | two | +2'", () => {
    const four = [
      lane("own", H(16), H(16, 45), false, "Ana"),
      lane("own-falta", H(16), H(16, 45), false, "Bruno"),
      lane("n1", H(16), H(16, 45), true, "Carla"),
      lane("n2", H(16), H(16, 45), true, "Duarte"),
    ];
    const capped = layoutLanes(four);
    expect(capped.placed.map((p) => [p.id, p.lane])).toEqual([
      ["own", 0],
      ["own-falta", 1],
    ]);
    expect(capped.more.map((m) => m.count)).toEqual([2]);
    // Nothing is lost: drawn + hidden is every row.
    expect(capped.placed.length + capped.more[0]!.count).toBe(4);

    // CONTROL: the CAP is what makes the chip. Uncapped, the same four rows
    // take four distinct lanes and no chip - so the arm above is measuring
    // COMPACT_MAX_LANES and not an accident of the input.
    const uncapped = layoutLanes(four, Number.POSITIVE_INFINITY);
    expect(uncapped.more).toEqual([]);
    expect(new Set(uncapped.placed.map((p) => p.lane)).size).toBeGreaterThanOrEqual(2);
    expect(COMPACT_MAX_LANES).toBe(2);
  });

  it("a cluster ends where its latest drawn end does: 17:00 after a 16:00-16:45 peak is a new cluster", () => {
    const { placed, more } = layoutLanes([
      lane("a", H(16), H(16, 45)),
      lane("b", H(16), H(16, 45)),
      lane("c", H(16), H(16, 45)),
      lane("late", H(17), H(17, 45)),
    ]);
    expect(more).toHaveLength(1);
    expect(placed.find((p) => p.id === "late")).toEqual({ id: "late", lane: 0, lanes: 1, drawnEndMin: H(17, 45) });
  });

  it("Q-B6-1 IS PER MOMENT: a chain that never runs three at once keeps its lanes; only the crowded moment is capped", () => {
    // A 09:00-09:45, B 09:30-10:15, C 10:00-10:45 and D 10:30-11:15 never run
    // more than two at a time. E and F at 11:00 make three (D, E, F) until
    // 11:15. It is ONE transitive cluster, and a cap applied to the whole
    // cluster hid B and D behind one chip from 09:00 to 11:45.
    const { placed, more } = layoutLanes([
      lane("A", H(9), H(9, 45)),
      lane("B", H(9, 30), H(10, 15)),
      lane("C", H(10), H(10, 45)),
      lane("D", H(10, 30), H(11, 15)),
      lane("E", H(11), H(11, 45)),
      lane("F", H(11), H(11, 45)),
    ]);
    // B sits in the right lane and is DRAWN: it never runs with two others.
    // At 11:00 the two lanes hold D and E, both drawn, and F is behind "+1".
    expect(Object.fromEntries(placed.map((p) => [p.id, p.lane]))).toEqual({ A: 0, B: 1, C: 0, D: 1, E: 0 });
    expect(placed.every((p) => p.lanes === 2)).toBe(true);
    // The chip stands for the rows of the crowded moment beyond the two drawn
    // lanes, and spans only them.
    expect(more).toHaveLength(1);
    expect(more[0]).toMatchObject({ startMin: H(11), drawnEndMin: H(11, 45), count: 1 });
    expect(more[0]!.hiddenIds).toEqual(["F"]);
  });

  it("Q-B6-1: a twin pair in a cluster that is crowded ELSEWHERE still renders side by side", () => {
    // The machine half ends at 10:30 and the person half at 10:45; a 10:30 row
    // overlaps only the person half and chains the twin into a crowded 11:00
    // (bridge, x, y). The twin itself never runs with two others, so neither
    // half may be hidden. Under a whole-cluster cap the machine half was.
    const { placed, more } = layoutLanes([
      lane("twin-person", H(10), H(10, 45), false, "Ana"),
      lane("twin-machine", H(10), H(10, 30), true, "Ana"),
      lane("bridge", H(10, 30), H(11, 15), false, "Bia"),
      lane("x", H(11), H(11, 45), false, "Caio"),
      lane("y", H(11), H(11, 45), true, "Dora"),
    ]);
    const byId = Object.fromEntries(placed.map((p) => [p.id, p]));
    expect(byId["twin-person"]).toMatchObject({ lane: 0, lanes: 2 });
    expect(byId["twin-machine"]).toMatchObject({ lane: 1, lanes: 2 });
    expect(more.flatMap((m) => m.hiddenIds)).not.toContain("twin-machine");
    expect(more.flatMap((m) => m.hiddenIds)).not.toContain("twin-person");
    // CONTROL: the cluster IS crowded, so the cap did fire somewhere.
    expect(more.reduce((n, m) => n + m.count, 0)).toBe(1);
  });

  it("Q-B6-1, THE TWIN CASE: a twin pair with a third PERSON row at the same moment stays side by side, and the third row goes behind '+1'", () => {
    // Round 6: the sort put person rows before machine rows, so a third
    // person row took the right lane and the twin's machine half was hidden.
    // The acceptance says a twin pair renders side by side, and two lanes plus
    // a chip can keep it: the twin rule puts the pair first at its minute.
    const person = lane("twin-person", H(15), H(15, 45), false, "Ana Terapeuta", "patient-x");
    const machine = lane("twin-machine", H(15), H(15, 45), true, "Ana Nesa", "patient-x");
    const third = lane("third", H(15), H(15, 45), false, "Bia Terapeuta", "patient-y");
    for (const order of [
      [machine, third, person],
      [third, person, machine],
      [person, machine, third],
    ]) {
      const { placed, more } = layoutLanes(order);
      expect(placed).toEqual([
        { id: "twin-person", lane: 0, lanes: 2, drawnEndMin: H(15, 45) },
        { id: "twin-machine", lane: 1, lanes: 2, drawnEndMin: H(15, 45) },
      ]);
      expect(more).toHaveLength(1);
      expect(more[0]).toMatchObject({ startMin: H(15), drawnEndMin: H(15, 45), count: 1 });
      expect(more[0]!.hiddenIds).toEqual(["third"]);
    }

    // CONTROL: the PATIENT is what makes them twins. The same three rows with
    // the machine row on ANOTHER patient are no twin, so the order is the
    // plain one again: the two person rows are drawn and the machine row is
    // the one behind the chip.
    const other = lane("machine-z", H(15), H(15, 45), true, "Ana Nesa", "patient-z");
    const plain = layoutLanes([other, third, person]);
    expect(plain.placed.map((p) => [p.id, p.lane])).toEqual([
      ["twin-person", 0],
      ["third", 1],
    ]);
    expect(plain.more[0]!.hiddenIds).toEqual(["machine-z"]);
  });

  it("THE MACHINE THE PAGE DOES NOT KNOW: the same patient's two rows at one minute still stay side by side (the e2e's case), in name order, and the flag puts the person left", () => {
    // The machine flag comes from the machines OFFERED to the viewer, which an
    // unassigned admin, or a viewer at another clinic, does not hold. Round 7's
    // first twin rule keyed on the flag, and the e2e's twin (a machine with no
    // clinic) came apart on the stack: measured, ARM 4 found no machine block.
    // Labelled as buildCompactWeek labels them. The e2e's machine name sorts
    // before its therapist's (round 8 review: with the old name the person was
    // left by name alone, so the e2e's "person left" never tested the flag).
    const person = lane("g-person", H(15), H(15, 45), false, "Gemeo Sintetico E2E Therapist", "g");
    const machine = lane("g-machine", H(15), H(15, 45), false, "Gemeo Sintetico Aparelho NESA Gemeo (E2E)", "g");
    const third = lane("third", H(15), H(15, 45), false, "Ana Costa E2E Therapist", "a");
    const flagged = { ...machine, machine: true };
    for (const order of [
      [third, machine, person],
      [machine, person, third],
      [person, third, machine],
    ]) {
      // Every flag false (the admin's page): side by side, the halves by name.
      const plain = layoutLanes(order);
      expect(Object.fromEntries(plain.placed.map((p) => [p.id, [p.lane, p.lanes]]))).toEqual({
        "g-machine": [0, 2],
        "g-person": [1, 2],
      });
      expect(plain.more.flatMap((m) => m.hiddenIds)).toEqual(["third"]);
      // The machine flagged (the owner's page): person left, machine right.
      const known = layoutLanes(order.map((r) => (r === machine ? flagged : r)));
      expect(Object.fromEntries(known.placed.map((p) => [p.id, [p.lane, p.lanes]]))).toEqual({
        "g-person": [0, 2],
        "g-machine": [1, 2],
      });
      expect(known.more.flatMap((m) => m.hiddenIds)).toEqual(["third"]);
    }
  });

  it("with the flag known, the person row goes left even when its machine row is LONGER, and a person-and-machine pair outranks a same-patient double booking", () => {
    const { placed, more } = layoutLanes([
      lane("x-machine", H(9), H(10), true, "Xavier NESA", "x"), // 60 minutes: sorts first on length
      lane("x-person", H(9), H(9, 45), false, "Xavier", "x"),
      lane("d-one", H(9), H(9, 45), false, "Dora A", "d"),
      lane("d-two", H(9), H(9, 45), false, "Dora B", "d"),
    ]);
    expect(Object.fromEntries(placed.map((p) => [p.id, p.lane]))).toEqual({ "x-person": 0, "x-machine": 1 });
    expect([...more.flatMap((m) => m.hiddenIds)].sort()).toEqual(["d-one", "d-two"]);
    // CONTROL: without the machine pair, the double booking is the pair kept.
    const alone = layoutLanes([
      lane("d-one", H(9), H(9, 45), false, "Dora A", "d"),
      lane("other", H(9), H(9, 45), false, "Alda", "a"),
      lane("d-two", H(9), H(9, 45), false, "Dora B", "d"),
    ]);
    expect(Object.fromEntries(alone.placed.map((p) => [p.id, p.lane]))).toEqual({ "d-one": 0, "d-two": 1 });
    expect(alone.more.flatMap((m) => m.hiddenIds)).toEqual(["other"]);
  });

  it("THE REVIEWER'S 'TODOS' CASE: therapist A with X, NESA with X and therapist B with Y, all at 10:00, draw X twice side by side and Y behind '+1'", () => {
    // Rows labelled as buildCompactWeek labels them ("<patient> <practitioner>").
    // Y sorts before X by label, so without the twin rule Y took a lane too.
    const xA = lane("x-a", H(10), H(10, 45), false, "Xavier Teste Terapeuta A", "x");
    const xN = lane("x-n", H(10), H(10, 45), true, "Xavier Teste NESA", "x");
    const yB = lane("y-b", H(10), H(10, 45), false, "Alda Teste Terapeuta B", "y");
    const { placed, more } = layoutLanes([yB, xN, xA]);
    expect(Object.fromEntries(placed.map((p) => [p.id, [p.lane, p.lanes]]))).toEqual({ "x-a": [0, 2], "x-n": [1, 2] });
    expect(more.map((m) => [m.startMin, m.count, m.hiddenIds])).toEqual([[H(10), 1, ["y-b"]]]);
  });

  it("the twin outranks a LONGER row at its minute, and a second twin pair at the same minute goes behind the chip whole", () => {
    // A 60-minute third row sorts before the 45-minute twins on length; the
    // twin rule still puts the pair first.
    const { placed, more } = layoutLanes([
      lane("long", H(11), H(12), false, "Bia", "b"),
      lane("t1-n", H(11), H(11, 45), true, "Caio NESA", "c"),
      lane("t1-p", H(11), H(11, 45), false, "Caio", "c"),
      lane("t2-n", H(11), H(11, 45), true, "Dora NESA", "d"),
      lane("t2-p", H(11), H(11, 45), false, "Dora", "d"),
    ]);
    expect(Object.fromEntries(placed.map((p) => [p.id, p.lane]))).toEqual({ "t1-p": 0, "t1-n": 1 });
    expect(more).toHaveLength(1);
    expect([...more[0]!.hiddenIds].sort()).toEqual(["long", "t2-n", "t2-p"]);
  });

  it("THE EARLIER ROW (round 7 review): a row that started earlier and still runs when a twin pair starts goes behind the chip, and the twin is side by side, person left", () => {
    // The reviewer's "Todos" case: therapist B has Z from 14:30 to 15:15, and
    // Y has a twin pair at 15:00 (therapist A and NESA). Round 7 kept Z in
    // lane 0, gave Y's person row lane 1 and hid Y's machine row: the twin
    // came apart. The acceptance says a twin pair renders side by side.
    const z = lane("z-b", H(14, 30), H(15, 15), false, "Zulmira Teste Terapeuta B", "z");
    const yA = lane("y-a", H(15), H(15, 45), false, "Yara Teste Terapeuta A", "y");
    const yN = lane("y-n", H(15), H(15, 45), true, "Yara Teste NESA", "y");
    for (const order of [
      [z, yA, yN],
      [yN, z, yA],
      [yA, yN, z],
    ]) {
      const { placed, more } = layoutLanes(order);
      expect(placed).toEqual([
        { id: "y-a", lane: 0, lanes: 2, drawnEndMin: H(15, 45) },
        { id: "y-n", lane: 1, lanes: 2, drawnEndMin: H(15, 45) },
      ]);
      // Z is behind a "+1" chip at its own start. No left block starts in the
      // row after 14:30 (Y starts a whole row later), so the chip stays on
      // 14:30's line, clear of Y's time and name.
      expect(more).toEqual([
        { key: "more-z-b", startMin: H(14, 30), drawnEndMin: H(15, 15), anchorMin: H(14, 30), count: 1, hiddenIds: ["z-b"] },
      ]);
      expect(bandsHit(chipBand(more[0]!.anchorMin), textBand(H(15)))).toBe(false);
    }
    // The same with every machine flag false (a viewer whose page does not
    // list that machine): the pair is the patient and the start.
    const unknown = layoutLanes([z, { ...yA }, { ...yN, machine: false }]);
    expect(new Set(unknown.placed.map((p) => p.id))).toEqual(new Set(["y-a", "y-n"]));
    expect(unknown.more.flatMap((m) => m.hiddenIds)).toEqual(["z-b"]);

    // An earlier row starting LESS than a row before the pair: the chip moves
    // down onto the pair's person row (the left block starting within a row
    // of it), on its glyph line, clear of its time and name.
    const late = layoutLanes([lane("z-b", H(14, 45), H(15, 30), false, "Zulmira", "z"), yA, yN]);
    expect(late.placed.map((p) => [p.id, p.lane])).toEqual([
      ["y-a", 0],
      ["y-n", 1],
    ]);
    expect(late.more).toHaveLength(1);
    expect(late.more[0]).toMatchObject({ startMin: H(14, 45), anchorMin: H(15), hiddenIds: ["z-b"] });
    expect(bandsHit(chipBand(late.more[0]!.anchorMin), textBand(H(15)))).toBe(false);

    // The lane the earlier row would have held is free BEFORE the pair: a
    // row that ends by 15:00 is drawn there, not hidden with it.
    const before = layoutLanes([
      lane("long", H(14), H(15, 15), false, "Zulmira", "z"),
      lane("short", H(14), H(14, 30), false, "Bia", "b"),
      lane("mid", H(14, 10), H(14, 55), false, "Caio", "c"),
      yA,
      yN,
    ]);
    expect(Object.fromEntries(before.placed.map((p) => [p.id, p.lane]))).toEqual({ short: 0, mid: 1, "y-a": 0, "y-n": 1 });
    expect(before.more.flatMap((m) => m.hiddenIds)).toEqual(["long"]);

    // CONTROL: the TWIN is what moves the earlier row. At 15:00 two rows of
    // two patients are no pair, so Z keeps its lane from 14:30 and the
    // plain first-fit hides the 15:00 row that finds no lane.
    const plain = layoutLanes([
      z,
      lane("r-a", H(15), H(15, 45), false, "Rita Teste Terapeuta A", "r"),
      lane("s-n", H(15), H(15, 45), true, "Sara Teste NESA", "s"),
    ]);
    expect(plain.placed.map((p) => [p.id, p.lane])).toEqual([
      ["z-b", 0],
      ["r-a", 1],
    ]);
    expect(plain.more.flatMap((m) => m.hiddenIds)).toEqual(["s-n"]);
  });

  it("THE EARLIER ROW in a therapist's own view: a machine-only row still running when the therapist's twin pair starts goes behind the chip", () => {
    const { placed, more } = layoutLanes([
      lane("nesa-only", H(9, 30), H(10, 15), true, "Wilson NESA", "w"),
      lane("twin-person", H(10), H(10, 45), false, "Ana", "a"),
      lane("twin-machine", H(10), H(10, 45), true, "Ana NESA", "a"),
    ]);
    expect(Object.fromEntries(placed.map((p) => [p.id, [p.lane, p.lanes]]))).toEqual({
      "twin-person": [0, 2],
      "twin-machine": [1, 2],
    });
    expect(more.map((m) => [m.startMin, m.count, m.hiddenIds])).toEqual([[H(9, 30), 1, ["nesa-only"]]]);
  });

  it("TWO PAIRS THAT OVERLAP: the pair that started first keeps both lanes, and the later pair is behind the chip WHOLE, never split", () => {
    // Two lanes hold one pair at a time. Hiding the first pair instead would
    // hide a pair already drawn from its start; the later pair is not split
    // to fill the lane the first pair's shorter half frees.
    const { placed, more } = layoutLanes([
      lane("p1-person", H(10), H(10, 45), false, "Ana", "a"),
      lane("p1-machine", H(10), H(10, 30), true, "Ana NESA", "a"),
      lane("p2-person", H(10, 30), H(11, 15), false, "Bia", "b"),
      lane("p2-machine", H(10, 30), H(11, 15), true, "Bia NESA", "b"),
    ]);
    expect(Object.fromEntries(placed.map((p) => [p.id, p.lane]))).toEqual({ "p1-person": 0, "p1-machine": 1 });
    expect(more.map((m) => [m.startMin, m.count, [...m.hiddenIds].sort()])).toEqual([
      [H(10, 30), 2, ["p2-machine", "p2-person"]],
    ]);
    // CONTROL: where the first pair has ended by the second's start, the
    // second is side by side too.
    const apart = layoutLanes([
      lane("p1-person", H(10), H(10, 30), false, "Ana", "a"),
      lane("p1-machine", H(10), H(10, 30), true, "Ana NESA", "a"),
      lane("p2-person", H(10, 30), H(11, 15), false, "Bia", "b"),
      lane("p2-machine", H(10, 30), H(11, 15), true, "Bia NESA", "b"),
    ]);
    expect(apart.more).toEqual([]);
    expect(Object.fromEntries(apart.placed.map((p) => [p.id, p.lane]))).toEqual({
      "p1-person": 0,
      "p1-machine": 1,
      "p2-person": 0,
      "p2-machine": 1,
    });
  });

  it("THE CHIP MOVES OFF A LEFT BLOCK THAT STARTS WITHIN A ROW OF THE HIDDEN ROWS: the reviewer's 09:30, 09:45, 10:00, 10:15", () => {
    // 10:00 needs lane 2 and is hidden. 10:15 takes lane 0 when 09:30-10:15
    // ends. Round 6 drew the chip at 10:00 plus 22px, which is 10:15's time
    // line (10:15 is 17px below 10:00): it painted over "10:15".
    const { placed, more } = layoutLanes([
      lane("a", H(9, 30), H(10, 15)),
      lane("b", H(9, 45), H(10, 30)),
      lane("c", H(10), H(10, 30)),
      lane("d", H(10, 15), H(10, 45)),
    ]);
    expect(Object.fromEntries(placed.map((p) => [p.id, p.lane]))).toEqual({ a: 0, b: 1, d: 0 });
    expect(more).toHaveLength(1);
    expect(more[0]).toMatchObject({ startMin: H(10), anchorMin: H(10, 15), count: 1, hiddenIds: ["c"] });
    // The chip lies on d's glyph line, clear of d's time and name.
    expect(bandsHit(chipBand(more[0]!.anchorMin), textBand(H(10, 15)))).toBe(false);
    expect(chipBand(more[0]!.anchorMin).top).toBe(PX(H(10, 15)) + COMPACT_CHIP.topPx);
    // CONTROL: where round 6 put it, the chip crosses d's time line.
    expect(bandsHit(chipBand(H(10)), textBand(H(10, 15)))).toBe(true);
  });

  it("CONTROL: with no left block starting within a row, the chip stays on the hidden rows' own line", () => {
    // Same shape, but the next left block starts a whole row after the hidden
    // one (10:30), which is under the chip, not across it.
    const { more } = layoutLanes([
      lane("a", H(9, 30), H(10, 15)),
      lane("b", H(9, 45), H(10, 45)),
      lane("c", H(10), H(10, 30)),
      lane("d", H(10, 30), H(11)),
    ]);
    expect(more).toHaveLength(1);
    expect(more[0]).toMatchObject({ startMin: H(10), anchorMin: H(10), hiddenIds: ["c"] });
    expect(bandsHit(chipBand(H(10)), textBand(H(10, 30)))).toBe(false);
  });

  it("two chips whose lines would overlap are ONE chip: the counts add up and it keeps the first place", () => {
    // c (10:00) is hidden and d, a left block at 10:25, moves its chip down to
    // 10:25. e (10:30) is hidden again, at a moment whose own line is only
    // 5 minutes (about 6px) lower: two 10px chips there would overlap.
    const { placed, more } = layoutLanes([
      lane("a", H(9, 30), H(10, 2)),
      lane("b", H(9, 40), H(11)),
      lane("c", H(10), H(10, 30)),
      lane("d", H(10, 25), H(10, 55)),
      lane("e", H(10, 30), H(11)),
    ]);
    expect(Object.fromEntries(placed.map((p) => [p.id, p.lane]))).toEqual({ a: 0, b: 1, d: 0 });
    expect(more).toHaveLength(1);
    expect(more[0]).toMatchObject({ startMin: H(10), drawnEndMin: H(11), anchorMin: H(10, 25), count: 2 });
    expect(more[0]!.hiddenIds).toEqual(["c", "e"]);
  });

  it("two separate crowded moments in one cluster make two chips, and the drawn row between them keeps its lane", () => {
    const { placed, more } = layoutLanes([
      lane("a1", H(9), H(9, 45)),
      lane("a2", H(9), H(9, 45)),
      lane("a3", H(9), H(9, 45)),
      lane("long", H(9), H(13)), // chains everything into one cluster
      lane("mid", H(10, 30), H(11, 15)),
      lane("b1", H(12), H(12, 45)),
      lane("b2", H(12), H(12, 45)),
    ]);
    // 09:00: "long" and a1 are drawn, a2 and a3 behind "+2". 12:00: "long" and
    // b1 are drawn, b2 behind "+1".
    expect(more.map((m) => [m.startMin, m.drawnEndMin, m.count])).toEqual([
      [H(9), H(9, 45), 2],
      [H(12), H(12, 45), 1],
    ]);
    expect(placed.find((p) => p.id === "mid")).toMatchObject({ lane: 1, lanes: 2 });
    expect(placed.find((p) => p.id === "long")).toMatchObject({ lane: 0 });
  });

  /* A seeded property test. The examples above are the shapes someone
     thought of; this is every shape a busy day can take, checked against the
     rule as the card states it. */
  describe("invariants over random days", () => {
    function rng(seed: number): () => number {
      let x = seed >>> 0;
      return () => {
        x = (Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
        x ^= x >>> 12;
        return (x >>> 0) / 0x100000000;
      };
    }
    const DURATIONS = [10, 15, 30, 45, 45, 45, 60, 90];

    function randomDay(rand: () => number, gridMin = 15): LaneItem[] {
      const n = 1 + Math.floor(rand() * 14);
      const rows = Array.from({ length: n }, (_, k) => {
        const start = H(8) + gridMin * Math.floor((rand() * 720) / gridMin);
        const dur = DURATIONS[Math.floor(rand() * DURATIONS.length)]!;
        return lane(`r${k}`, start, start + dur, rand() < 0.3, `L${Math.floor(rand() * 5)}`, `P${Math.floor(rand() * 6)}`);
      });
      // A twin pair on some days: the machine half of a random person row.
      if (rand() < 0.5) {
        const person = rows.find((r) => !r.machine);
        if (person) {
          rows.push(lane(`r${n}`, person.startMin, person.startMin + 45, true, `L${Math.floor(rand() * 5)}`, person.patient));
        }
      }
      return rows;
    }

    const drawnEnd = (it: LaneItem) => Math.max(it.endMin, it.startMin + COMPACT_MIN_DRAWN_MINUTES);
    const overlaps = (a: { s: number; e: number }, b: { s: number; e: number }) => a.s < b.e && b.s < a.e;

    type Reached = {
      /** Twin minutes where a THIRD row started with the pair: the case the
       *  round 6 order got wrong. */
      twinCrowds: number;
      /** Twin minutes where a row that started EARLIER still ran: the case
       *  round 7's first-fit got wrong (it split the pair). */
      twinUnderEarlier: number;
      /** Rows hidden because a twin pair started while they ran. */
      displaced: number;
    };

    /** Checks every invariant; returns how often it reached the twin cases. */
    function check(items: LaneItem[], out: LaneLayout): Reached {
      const reached: Reached = { twinCrowds: 0, twinUnderEarlier: 0, displaced: 0 };
      const byId = new Map(items.map((it) => [it.id, it]));
      const span = (id: string) => ({ s: byId.get(id)!.startMin, e: drawnEnd(byId.get(id)!) });
      const runs = (id: string, t: number) => span(id).s <= t && t < span(id).e;
      const runningAt = (t: number) => items.filter((it) => it.startMin <= t && t < drawnEnd(it)).length;
      const hidden = out.more.flatMap((m) => m.hiddenIds);
      // The pairs drawn: two drawn rows of one patient starting together, one
      // in each lane.
      const drawnPairs: { t: number; ids: [string, string] }[] = [];
      for (const a of out.placed) {
        for (const b of out.placed) {
          const pa = byId.get(a.id)!;
          const pb = byId.get(b.id)!;
          if (a.lane === 0 && b.lane === 1 && a.lanes === 2 && pa.patient != null && pa.patient === pb.patient && pa.startMin === pb.startMin) {
            drawnPairs.push({ t: pa.startMin, ids: [a.id, b.id] });
          }
        }
      }

      // (1) Nothing lost, nothing twice.
      expect([...out.placed.map((p) => p.id), ...hidden].sort()).toEqual(items.map((i) => i.id).sort());
      for (const m of out.more) expect(m.count).toBe(m.hiddenIds.length);

      // (2) No block paints over another: drawn rows in one lane never overlap,
      //     so at most two drawn rows run at any minute.
      for (const a of out.placed) {
        for (const b of out.placed) {
          if (a.id < b.id && a.lane === b.lane && a.lanes === 2 && b.lanes === 2) {
            expect(overlaps(span(a.id), span(b.id)), `${a.id}/${b.id} share lane ${a.lane}`).toBe(false);
          }
        }
      }
      const drawnAt = (t: number) => out.placed.filter((p) => span(p.id).s <= t && t < span(p.id).e);
      for (let t = H(8); t < H(24); t++) expect(drawnAt(t).length, `minute ${t}`).toBeLessThanOrEqual(2);

      // (2b) EVERY HIDDEN ROW HAS A REASON ONE CAN POINT AT, and the chip
      //      that holds it starts there too or earlier:
      //      - THE CARD'S DEFAULT: two blocks are drawn at its start, one in
      //        each lane; or
      //      - THE TWIN RULE: a drawn twin pair starts while it runs; or
      //      - it is half of a pair, its other half is hidden too, and a
      //        drawn pair that started earlier holds a lane at its start.
      for (const id of hidden) {
        const { s, e } = span(id);
        const twoAtStart = drawnAt(s).map((p) => p.lane).sort().join() === "0,1";
        const twinStartsInside = drawnPairs.some((pr) => s < pr.t && pr.t < e);
        const keptOut =
          items.some((o) => o.id !== id && o.startMin === s && o.patient != null && o.patient === byId.get(id)!.patient && hidden.includes(o.id)) &&
          drawnPairs.some((pr) => pr.t < s && pr.ids.some((pid) => runs(pid, s)));
        expect(twoAtStart || twinStartsInside || keptOut, `${id}: hidden for a reason`).toBe(true);
        if (!twoAtStart && twinStartsInside) reached.displaced += 1;
        const chip = out.more.find((m) => m.hiddenIds.includes(id))!;
        expect(chip.startMin).toBeLessThanOrEqual(s);
      }
      for (const m of out.more) {
        for (const n of out.more) {
          if (m.key < n.key) {
            expect(overlaps({ s: m.startMin, e: m.drawnEndMin }, { s: n.startMin, e: n.drawnEndMin })).toBe(false);
          }
        }
      }
      // A full-width row overlaps nothing at all.
      for (const a of out.placed.filter((p) => p.lanes === 1)) {
        for (const other of items) {
          if (other.id !== a.id) expect(overlaps(span(a.id), span(other.id)), `${a.id} is alone`).toBe(false);
        }
      }

      // (2c) NO CHIP PAINTS OVER A FACE, in px: a chip reaches across the left
      //      lane after the glyph, so its line must miss the time and name
      //      lines of every left-lane block, miss every full-width block
      //      whole, and miss every other chip. Its anchor is the hidden rows'
      //      start or a left start less than one row after it.
      for (const m of out.more) {
        const chip = chipBand(m.anchorMin);
        expect(m.anchorMin, `${m.key}: anchored at or after its start`).toBeGreaterThanOrEqual(m.startMin);
        expect(m.anchorMin, `${m.key}: anchored within a row of its start`).toBeLessThan(m.startMin + 30);
        for (const p of out.placed) {
          const s = span(p.id).s;
          if (p.lanes === 2 && p.lane === 0) {
            expect(bandsHit(chip, textBand(s)), `${m.key} over ${p.id}'s time or name`).toBe(false);
          }
          if (p.lanes === 1) {
            expect(bandsHit(chip, { top: PX(s), bottom: PX(span(p.id).e) - 1 }), `${m.key} over ${p.id}`).toBe(false);
          }
        }
        for (const n of out.more) {
          if (m.key < n.key) expect(bandsHit(chip, chipBand(n.anchorMin)), `${m.key} over ${n.key}`).toBe(false);
        }
      }

      // (3) THE CAP APPLIES ONLY AT THREE OR MORE AT ONCE: every hidden row
      //     runs at some minute when at least three rows run.
      for (const id of hidden) {
        const { s, e } = span(id);
        let crowded = false;
        for (let t = s; t < e && !crowded; t++) crowded = runningAt(t) >= 3;
        expect(crowded, `${id} hidden though never three at once`).toBe(true);
      }

      // (4) Every crowded minute is covered by a chip, so the reader always
      //     sees that something is behind it.
      for (let t = H(8); t < H(24); t++) {
        if (runningAt(t) >= 3) {
          expect(out.more.some((m) => m.startMin <= t && t < m.drawnEndMin), `minute ${t} has a chip`).toBe(true);
        }
      }

      // (5) THE TWIN RULE: "a twin pair renders side by side". Where two
      //     rows of one patient start together, the two blocks drawn from
      //     that minute are one patient's pair, however many other rows
      //     start with it and WHATEVER STARTED EARLIER AND STILL RUNS, unless
      //     a pair drawn from an earlier minute holds a lane (two lanes hold
      //     one pair at a time). Where a person row and its machine row start
      //     then, they are the pair, person left. And a pair is never split:
      //     of a patient's two rows at one minute, both are drawn or neither.
      const placedById = new Map(out.placed.map((p) => [p.id, p]));
      for (const t of new Set(items.map((it) => it.startMin))) {
        const startingNow = items.filter((it) => it.startMin === t);
        const byPatient = new Map<string, LaneItem[]>();
        for (const it of startingNow) {
          if (it.patient != null) byPatient.set(it.patient, [...(byPatient.get(it.patient) ?? []), it]);
        }
        for (const [patient, rows] of byPatient) {
          if (rows.length !== 2) continue;
          const drawnHere = rows.filter((r) => placedById.has(r.id)).length;
          expect(drawnHere === 0 || drawnHere === 2, `minute ${t}: ${patient}'s pair is not split`).toBe(true);
        }
        if (![...byPatient.values()].some((rows) => rows.length >= 2)) continue;
        if (drawnPairs.some((pr) => pr.t < t && pr.ids.some((pid) => runs(pid, t)))) continue;
        const left = startingNow.find((o) => placedById.get(o.id)?.lane === 0);
        const right = startingNow.find((o) => placedById.get(o.id)?.lane === 1);
        expect(left !== undefined && right !== undefined && left.patient === right.patient, `minute ${t}: a pair side by side`).toBe(true);
        const personMachine = startingNow.some(
          (a) => !a.machine && a.patient != null && startingNow.some((b) => b.machine && b.patient === a.patient),
        );
        if (personMachine) {
          expect([left!.machine, right!.machine], `minute ${t}: person left, machine right`).toEqual([false, true]);
        }
        if (startingNow.length >= 3) reached.twinCrowds += 1;
        if (items.some((o) => o.startMin < t && t < drawnEnd(o))) reached.twinUnderEarlier += 1;
      }
      return reached;
    }

    it("hold for 400 seeded random days", () => {
      const rand = rng(20260923);
      let chips = 0;
      let drawnRightLane = 0;
      const reached: Reached = { twinCrowds: 0, twinUnderEarlier: 0, displaced: 0 };
      let movedChips = 0;
      for (let k = 0; k < 400; k++) {
        const items = randomDay(rand);
        const out = layoutLanes(items);
        const r = check(items, out);
        reached.twinCrowds += r.twinCrowds;
        reached.twinUnderEarlier += r.twinUnderEarlier;
        reached.displaced += r.displaced;
        chips += out.more.length;
        movedChips += out.more.filter((m) => m.anchorMin !== m.startMin).length;
        drawnRightLane += out.placed.filter((p) => p.lane === 1).length;
      }
      // CONTROL: the sample is not trivially easy. It crowds often, still
      // draws many rows in the right lane, holds twin pairs with a third row
      // starting beside them, twin pairs starting under a row that started
      // earlier, and rows hidden because a twin started while they ran.
      expect(chips).toBeGreaterThan(100);
      expect(drawnRightLane).toBeGreaterThan(100);
      expect(reached.twinCrowds).toBeGreaterThan(5);
      expect(reached.twinUnderEarlier).toBeGreaterThan(20);
      expect(reached.displaced).toBeGreaterThan(20);
      // ...and chips that had to move off a left block's time and name.
      expect(movedChips).toBeGreaterThan(5);
    }, 30_000);

    it("hold on a 1-minute grid too, where two chips can merge into one", () => {
      // Bookings on odd minutes are what make an anchor move down almost a
      // whole row with the next hidden rows right after it (the merge case).
      // A merge is rare (about one day in a few thousand), so every day is
      // laid out, and every day where a chip moved or merged, plus every
      // twentieth, is checked in full.
      const rand = rng(20260924);
      let merged = 0;
      let moved = 0;
      let checked = 0;
      for (let k = 0; k < 3000; k++) {
        const items = randomDay(rand, 1);
        const out = layoutLanes(items);
        const movedHere = out.more.filter((m) => m.anchorMin !== m.startMin).length;
        const byId = new Map(items.map((it) => [it.id, it]));
        let mergedHere = 0;
        for (const m of out.more) {
          // A chip's hidden rows that do not all chain in time were two groups.
          const spans = m.hiddenIds
            .map((id) => byId.get(id)!)
            .map((it) => ({ s: it.startMin, e: Math.max(it.endMin, it.startMin + COMPACT_MIN_DRAWN_MINUTES) }))
            .sort((a, b) => a.s - b.s);
          let end = spans[0]!.e;
          for (const sp of spans.slice(1)) {
            if (sp.s >= end) mergedHere += 1;
            end = Math.max(end, sp.e);
          }
        }
        if (movedHere > 0 || mergedHere > 0 || k % 20 === 0) {
          check(items, out);
          checked += 1;
        }
        moved += movedHere;
        merged += mergedHere;
      }
      // CONTROL: the sample reaches both the moved anchor and the merge, and
      // the full check ran on every such day.
      expect(moved).toBeGreaterThan(100);
      expect(merged).toBeGreaterThan(0);
      expect(checked).toBeGreaterThan(200);
    }, 60_000);
  });

  it("is independent of input order", () => {
    const rows = [
      lane("a", H(9), H(9, 45), false, "Ana"),
      lane("b", H(9, 15), H(10), true, "Bia"),
      lane("c", H(9, 30), H(10, 15), false, "Caio"),
      lane("d", H(11), H(11, 30), false, "Dora"),
    ];
    const forward = layoutLanes(rows);
    const backward = layoutLanes([...rows].reverse());
    expect(backward).toEqual(forward);
  });
});

describe("compactDayLabel", () => {
  it("cuts the weekday to three letters and keeps the day number", () => {
    // Node's ICU gives "Segunda 21" for pt-PT short; a browser may give "Seg 21".
    // Both must render the same three letters.
    expect(compactDayLabel("Segunda 21")).toBe("Seg 21");
    expect(compactDayLabel("Seg 21")).toBe("Seg 21");
    expect(compactDayLabel("S\u00e1bado 26")).toBe("S\u00e1b 26");
    expect(compactDayLabel("Domingo 27")).toBe("Dom 27");
  });
});

/* ------------------------------------------------------------------ */
/* The face: first name, withheld, strike.                              */
/* ------------------------------------------------------------------ */
describe("faceName", () => {
  it("is the first word of the patient's name", () => {
    expect(faceName("Bartolomeu Teste Sintetico")).toBe("Bartolomeu");
    expect(faceName("  Ana   Costa ")).toBe("Ana");
  });

  it("a withheld patient reads the withheld label, whole, never an empty face", () => {
    expect(faceName(null)).toBe(s["agenda.patientWithheld"]);
    expect(s["agenda.patientWithheld"].length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* The whole week, end to end, on a dense SYNTHETIC day.                */
/* ------------------------------------------------------------------ */
describe("buildCompactWeek", () => {
  /** An invented dense Thursday, one therapist plus the shared machine (N):
   *  08:30 own; 09:00 own; 10:00 N + own; 11:00 N x2 + own; 12:30 own;
   *  14:00 N x2 + own + own (falta); 15:30 own + N; 17:00 own;
   *  18:00 own + own (falta). 17 rows, every width of overlap from one to four. */
  const THU = "2026-09-24";
  function denseDay(): AgendaAppointment[] {
    const rows: AgendaAppointment[] = [];
    let n = 0;
    const add = (from: string, machine: boolean, extra: Partial<AgendaAppointment> = {}) => {
      n += 1;
      const [hh, mm] = from.split(":").map(Number);
      const endMin = hh! * 60 + mm! + 45;
      rows.push(
        appt({
          id: `d${String(n).padStart(2, "0")}`,
          date: THU,
          from,
          to: `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`,
          ...(machine
            ? { practitionerId: MACHINE, practitionerName: "NESA", serviceId: "svc-nesa", serviceName: "NESA" }
            : {}),
          ...extra,
        }),
      );
    };
    add("08:30", false);
    add("09:00", false);
    add("10:00", true); add("10:00", false);
    add("11:00", true); add("11:00", true); add("11:00", false);
    add("12:30", false);
    add("14:00", true); add("14:00", true); add("14:00", false); add("14:00", false, { status: "no_show" });
    add("15:30", false); add("15:30", true);
    add("17:00", false);
    add("18:00", false); add("18:00", false, { status: "no_show" });
    return rows;
  }

  it("the dense day: 17 rows, every one either drawn or counted in a chip", () => {
    const week = buildCompactWeek({ anchor: WED, appointments: denseDay(), sharedResourceIds: MACHINES });
    const thu = week.days.find((d) => d.date === THU)!;
    expect(thu.appointmentCount).toBe(17);
    const hidden = thu.more.reduce((sum, m) => sum + m.count, 0);
    expect(thu.appointments.length + hidden).toBe(17);
    // 11:00 (three) and 14:00 (four) are the two chips, each beside two
    // drawn blocks; 08:30/09:00, 10:00, 15:30 and 18:00 split in two.
    expect(thu.more.map((m) => [m.startMin, m.count])).toEqual([
      [H(11), 1],
      [H(14), 2],
    ]);
    const lanesAt = (hh: number, mm = 0) =>
      thu.appointments.filter((a) => a.startMin === H(hh, mm)).map((a) => a.lanes);
    expect(lanesAt(11)).toEqual([2, 2]);
    expect(lanesAt(14)).toEqual([2, 2]);
    expect(lanesAt(8, 30)).toEqual([2]);
    expect(lanesAt(9)).toEqual([2]);
    expect(lanesAt(10)).toEqual([2, 2]);
    expect(lanesAt(15, 30)).toEqual([2, 2]);
    expect(lanesAt(18)).toEqual([2, 2]);
    expect(lanesAt(12, 30)).toEqual([1]);
    expect(lanesAt(17)).toEqual([1]);
    // At 10:00 and 15:30 the person is on the left and the machine on the right.
    for (const at of [H(10), H(15, 30)]) {
      const pair = thu.appointments.filter((a) => a.startMin === at);
      expect(pair.find((a) => a.lane === 0)!.practitionerId).toBe(PERSON);
      expect(pair.find((a) => a.lane === 1)!.practitionerId).toBe(MACHINE);
    }
  });

  it("the twin rule matches patients by ID, never by name: two namesakes are not a twin", () => {
    // Round 9 review: a namesake pair (two different patients, one person row
    // and one machine row) at the same minute as a real twin. Paired by name,
    // the namesakes (sorting first) would take both lanes and hide the twin.
    const twinPatient = { patientId: "p-twin", patientName: "Xavier Sintetico Teste" };
    const week = buildCompactWeek({
      anchor: WED,
      appointments: [
        appt({ id: "nm-person", date: THU, from: "10:00", to: "10:45", patientId: "p-a", patientName: "Ana Homonima Teste" }),
        appt({
          id: "nm-machine",
          date: THU,
          from: "10:00",
          to: "10:45",
          practitionerId: MACHINE,
          practitionerName: "NESA",
          patientId: "p-b",
          patientName: "Ana Homonima Teste",
        }),
        appt({ id: "tw-person", date: THU, from: "10:00", to: "10:45", ...twinPatient }),
        appt({
          id: "tw-machine",
          date: THU,
          from: "10:00",
          to: "10:45",
          practitionerId: MACHINE,
          practitionerName: "NESA",
          ...twinPatient,
        }),
      ],
      sharedResourceIds: MACHINES,
    });
    const thu = week.days.find((d) => d.date === THU)!;
    expect(thu.appointments.map((a) => a.id).sort()).toEqual(["tw-machine", "tw-person"]);
    expect(thu.more.flatMap((m) => m.hiddenIds).sort()).toEqual(["nm-machine", "nm-person"]);
  });

  it("the twin rule reads the PATIENT off the appointment: a twin with a third row at its minute is drawn side by side", () => {
    // The layout test above feeds `patient` by hand; this one proves
    // buildCompactWeek passes it. The third row's patient sorts first by name,
    // so without the patient the plain order would draw it and hide the
    // machine half.
    const twinPatient = { patientId: "p-twin", patientName: "Xavier Sintetico Teste" };
    const week = buildCompactWeek({
      anchor: WED,
      appointments: [
        appt({ id: "tw-person", date: THU, from: "10:00", to: "10:45", ...twinPatient }),
        appt({
          id: "tw-machine",
          date: THU,
          from: "10:00",
          to: "10:45",
          practitionerId: MACHINE,
          practitionerName: "NESA",
          ...twinPatient,
        }),
        appt({ id: "third", date: THU, from: "10:00", to: "10:45", patientId: "p-other", patientName: "Alda Teste" }),
      ],
      sharedResourceIds: MACHINES,
    });
    const thu = week.days.find((d) => d.date === THU)!;
    expect(thu.appointments.map((a) => [a.id, a.lane, a.lanes])).toEqual([
      ["tw-person", 0, 2],
      ["tw-machine", 1, 2],
    ]);
    expect(thu.more.flatMap((m) => m.hiddenIds)).toEqual(["third"]);

    // And with NO list of machines (a viewer offered none), the pair still
    // holds: it is recognised by the patient and the start.
    const unknown = buildCompactWeek({
      anchor: WED,
      appointments: [
        appt({ id: "tw-person", date: THU, from: "10:00", to: "10:45", ...twinPatient }),
        appt({ id: "tw-machine", date: THU, from: "10:00", to: "10:45", practitionerId: MACHINE, practitionerName: "NESA", ...twinPatient }),
        appt({ id: "third", date: THU, from: "10:00", to: "10:45", patientId: "p-other", patientName: "Alda Teste" }),
      ],
    });
    const thu2 = unknown.days.find((d) => d.date === THU)!;
    expect(new Set(thu2.appointments.map((a) => a.id))).toEqual(new Set(["tw-person", "tw-machine"]));
    expect(thu2.more.flatMap((m) => m.hiddenIds)).toEqual(["third"]);
  });

  it("the face data: time, first name, service colour, the estado derived from BOTH axes", () => {
    const week = buildCompactWeek({
      anchor: WED,
      appointments: [
        appt({
          id: "x",
          date: WED,
          from: "10:00",
          to: "10:45",
          patientName: "Conceicao Teste",
          // Confirmada expressed on the confirmation axis, as the synthetic
          // week expresses it (0061 refuses two overlapping status=confirmed).
          confirmationState: "confirmed",
        }),
        appt({ id: "w", date: WED, from: "12:00", to: "12:45", patientName: null }),
        appt({ id: "f", date: WED, from: "14:00", to: "14:45", status: "no_show" }),
      ],
    });
    const wed = week.days.find((d) => d.date === WED)!;
    const x = wed.appointments.find((a) => a.id === "x")!;
    expect(x.timeLabel).toBe("10:00");
    expect(x.firstName).toBe("Conceicao");
    expect(x.patientLabel).toBe("Conceicao Teste");
    expect(x.estado).toBe("confirmada");
    expect(x.struck).toBe(false);
    const w = wed.appointments.find((a) => a.id === "w")!;
    expect(w.withheld).toBe(true);
    expect(w.firstName).toBe(s["agenda.patientWithheld"]);
    const f = wed.appointments.find((a) => a.id === "f")!;
    expect(f.estado).toBe("falta");
    expect(f.struck).toBe(true);
  });

  it("the window follows the DRAWN days only, and Sunday appears only with a booking", () => {
    const week = buildCompactWeek({
      anchor: WED,
      appointments: [
        appt({ id: "early", date: MON, from: "07:30", to: "08:15" }),
        // The Sunday BEFORE: not drawn, so it must not widen anything.
        appt({ id: "prev", date: PREV_SUN, from: "22:00", to: "22:45" }),
      ],
    });
    expect(week.days).toHaveLength(6);
    expect(week.window).toEqual({ startMin: H(7), endMin: H(21) });

    const withSunday = buildCompactWeek({
      anchor: WED,
      appointments: [appt({ id: "sun", date: SUN, from: "10:00", to: "10:45" })],
    });
    expect(withSunday.days.map((d) => d.date)).toContain(SUN);
    expect(withSunday.days.find((d) => d.date === SUN)!.appointments.map((a) => a.id)).toEqual(["sun"]);
  });

  it("legend: each service once, sorted by name, a row with no service last", () => {
    const week = buildCompactWeek({
      anchor: WED,
      appointments: [
        appt({ id: "1", date: MON, from: "09:00", to: "09:45", serviceId: "svc-osteo", serviceName: "Osteopatia" }),
        appt({ id: "2", date: WED, from: "09:00", to: "09:45", serviceId: "svc-osteo", serviceName: "Osteopatia" }),
        appt({ id: "3", date: WED, from: "11:00", to: "11:45", serviceId: "svc-dren", serviceName: "Drenagem Linfatica" }),
        appt({ id: "4", date: FRI, from: "11:00", to: "11:45", serviceId: null, serviceName: null }),
      ],
    });
    expect(week.legend.map((e) => e.serviceName)).toEqual(["Drenagem Linfatica", "Osteopatia", null]);
    // The legend's colour is the colour the block carries.
    const wed = week.days.find((d) => d.date === WED)!;
    const dren = wed.appointments.find((a) => a.id === "3")!;
    expect(week.legend[0]!.colorKey).toBe(dren.colorKey);
    expect(week.legend[2]!.colorKey).toBe("none");
  });

  it("Q-B6-8: blocked time and the closure become bands on the day, clipped to the window", () => {
    const blocks: BlockSpan[] = [
      { id: "b1", startsAt: lisbon(WED, "14:00"), endsAt: lisbon(WED, "16:00"), reason: "x", note: "Formacao" },
    ];
    const week = buildCompactWeek({
      anchor: WED,
      appointments: [],
      blocks,
      closure: { startMin: H(13), endMin: H(14), locationName: "Clinica" },
    });
    const wed = week.days.find((d) => d.date === WED)!;
    expect(wed.bands).toEqual([
      { kind: "block", id: "b1", startMin: H(14), endMin: H(16), note: "Formacao" },
      { kind: "closure", startMin: H(13), endMin: H(14), locationName: "Clinica" },
    ]);
    // CONTROL: the block is on Wednesday only; the closure is on every day.
    const mon = week.days.find((d) => d.date === MON)!;
    expect(mon.bands.map((b) => b.kind)).toEqual(["closure"]);
  });
});

/* ------------------------------------------------------------------ */
/* Geometry: a lane is a tap target.                                    */
/* ------------------------------------------------------------------ */
describe("compactLaneWidthPx / compactLaneBox", () => {
  it("at 390px a two-lane block is at least 24px wide with six columns AND with seven (Dom shown)", () => {
    expect(compactLaneWidthPx(390, 6)).toBeGreaterThanOrEqual(COMPACT_MIN_TARGET_PX);
    expect(compactLaneWidthPx(390, 7)).toBeGreaterThanOrEqual(COMPACT_MIN_TARGET_PX);
    // Six columns hold it down to 334px.
    expect(compactLaneWidthPx(334, 6)).toBeGreaterThanOrEqual(COMPACT_MIN_TARGET_PX);
  });

  it("the limit is stated, not hidden: with Dom shown it holds from 384px up and not below", () => {
    // Pinned both ways so the DECISIONS text (Q-B6-1) cannot drift from the
    // arithmetic: 384 holds, 383 does not, and neither do 375 or 360.
    expect(compactLaneWidthPx(384, 7)).toBeGreaterThanOrEqual(COMPACT_MIN_TARGET_PX);
    expect(compactLaneWidthPx(383, 7)).toBeLessThan(COMPACT_MIN_TARGET_PX);
    expect(compactLaneWidthPx(375, 7)).toBeLessThan(COMPACT_MIN_TARGET_PX);
    expect(compactLaneWidthPx(360, 7)).toBeLessThan(COMPACT_MIN_TARGET_PX);
  });

  it("a row holds the half-lane face whole: the shortest block (one row, less its 1px gap) is the face's height", () => {
    // Round 5: a 30-minute half-lane block was 25px, so it put the glyph
    // before the name and left the name none to two letters. Now every
    // half-lane block gives the name a line of its own.
    expect(COMPACT_FACE_PX).toBe(1 + 11 + 10 + 10 + 1);
    expect(COMPACT_ROW_PX - 1).toBeGreaterThanOrEqual(COMPACT_FACE_PX);
    // The shortest DRAWN span is one row.
    expect(COMPACT_MIN_DRAWN_MINUTES).toBe(30);
  });

  it("the chip sits on the glyph line, between the left glyph and the right block's text, at every width from 360 up", () => {
    // Its top is under the time and name lines, and it is one glyph tall, so
    // it ends where the shortest block's face ends.
    expect(COMPACT_CHIP.topPx).toBe(COMPACT_FACE.padPx + COMPACT_FACE.timeLinePx + COMPACT_FACE.nameLinePx);
    expect(COMPACT_CHIP.topPx + COMPACT_CHIP.heightPx).toBeLessThanOrEqual(COMPACT_ROW_PX - 1 - COMPACT_FACE.padPx);
    // Left: 1px after the left block's stripe, inset and glyph.
    expect(COMPACT_CHIP.leftPx).toBe(COMPACT_FACE.stripePx + COMPACT_FACE.insetPx + COMPACT_FACE.glyphPx + 1);
    // Right: where the right lane's text starts (lane 1 is at 50% + half the gap).
    expect(COMPACT_CHIP.right).toBe(
      `calc(50% - ${COMPACT_LANE_GAP_PX / 2 + COMPACT_FACE.stripePx + COMPACT_FACE.insetPx}px)`,
    );
    // Its width from the arithmetic: 18.7px at 390 without Dom, 12.3px at 360
    // with Dom, the narrowest. "+N" at 8px bold is about 10px (the e2e
    // measures it painted whole at 390 and at 360).
    expect(compactChipWidthPx(390, 6)).toBeCloseTo(18.67, 1);
    expect(compactChipWidthPx(390, 7)).toBeCloseTo(14.43, 1);
    expect(compactChipWidthPx(360, 7)).toBeCloseTo(12.29, 1);
    for (const vp of [360, 375, 390, 414, 639]) {
      for (const cols of [6, 7]) expect(compactChipWidthPx(vp, cols), `${vp}/${cols}`).toBeGreaterThanOrEqual(12);
    }
    // It is the lane less the left glyph: the same arithmetic as compactLaneWidthPx.
    expect(compactChipWidthPx(360, 7)).toBeCloseTo(compactLaneWidthPx(360, 7) - 10, 5);
  });

  it("the CSS boxes are the arithmetic: no outer gutter, one gap in the middle", () => {
    expect(compactLaneBox(0, 1)).toEqual({ left: "0px", width: "100%" });
    expect(compactLaneBox(0, 2)).toEqual({ left: "0px", width: "calc(50% - 0.5px)" });
    expect(compactLaneBox(1, 2)).toEqual({ left: "calc(50% + 0.5px)", width: "calc(50% - 0.5px)" });
  });
});

/* ------------------------------------------------------------------ */
/* The one-time scroll to now.                                          */
/* ------------------------------------------------------------------ */
describe("autoScrollDecision", () => {
  const DATES = [MON, "2026-09-22", WED, "2026-09-24", FRI, SAT];
  const base: AutoScrollInput = {
    weekKey: MON,
    decidedFor: null,
    now: null,
    dates: DATES,
    window: { startMin: H(8), endMin: H(21) },
    displayed: true,
  };

  /** Feeds the minute ticks through the decider the way the component's
   *  effect does, carrying `decidedFor` forward. Returns the ticks that scrolled. */
  function run(ticks: { date: string; min: number }[], over: Partial<AutoScrollInput> = {}): number[] {
    let decidedFor: string | null = null;
    const scrolled: number[] = [];
    // The first render, before the clock is read.
    ({ decidedFor } = autoScrollDecision({ ...base, ...over, decidedFor, now: null }));
    ticks.forEach((now, k) => {
      const d = autoScrollDecision({ ...base, ...over, decidedFor, now });
      decidedFor = d.decidedFor;
      if (d.scroll) scrolled.push(k);
    });
    return scrolled;
  }

  it("scrolls ONCE when the phone opens inside the hours on today's week", () => {
    expect(run([{ date: WED, min: H(16, 10) }, { date: WED, min: H(16, 11) }, { date: WED, min: H(16, 12) }])).toEqual([0]);
  });

  it("opened at 07:50, it does NOT scroll when the clock reaches 08:00: the reader is left where they are", () => {
    const ticks = Array.from({ length: 15 }, (_, k) => ({ date: WED, min: H(7, 50) + k }));
    expect(ticks.some((t) => t.min === H(8))).toBe(true);
    expect(run(ticks)).toEqual([]);
  });

  it("never scrolls while the compact tree is not the one on screen (a desktop)", () => {
    expect(run([{ date: WED, min: H(16, 10) }], { displayed: false })).toEqual([]);
  });

  it("never scrolls on a week that does not hold today", () => {
    expect(run([{ date: "2026-10-01", min: H(16, 10) }])).toEqual([]);
  });

  it("a new week shown decides again, as a fresh arrival", () => {
    const first = autoScrollDecision({ ...base, now: { date: WED, min: H(16, 10) } });
    expect(first).toEqual({ scroll: true, decidedFor: MON });
    const next = autoScrollDecision({
      ...base,
      weekKey: NEXT_MON,
      dates: [NEXT_MON],
      decidedFor: first.decidedFor,
      now: { date: WED, min: H(16, 11) },
    });
    expect(next).toEqual({ scroll: false, decidedFor: NEXT_MON });
    const back = autoScrollDecision({ ...base, decidedFor: next.decidedFor, now: { date: WED, min: H(16, 12) } });
    expect(back).toEqual({ scroll: true, decidedFor: MON });
  });

  it("before the clock is read nothing is decided", () => {
    expect(autoScrollDecision(base)).toEqual({ scroll: false, decidedFor: null });
  });
});

/* ------------------------------------------------------------------ */
/* Q-B6-1 as docs/DECISIONS.md states it is what layoutLanes draws.     */
/* ------------------------------------------------------------------ */
describe("DECISIONS Q-B6-1 states the face layoutLanes draws", () => {
  // Round 4 found DECISIONS describing the shipped chip without saying that
  // it departs from the card's default (two lanes plus a chip) or what that
  // costs a twin pair. The owner reads DECISIONS, not this file, so the text
  // is pinned to the code BOTH ways: change the layout and the entry must
  // change with it; drop the entry's words and this goes red.
  const md = readFileSync(new URL("../../../../docs/DECISIONS.md", import.meta.url), "utf8");
  const from = md.indexOf("**Q-B6-1**");
  const to = md.indexOf("**Q-B6-2**", from);
  const entry = md.slice(from, to).replace(/\s+/g, " ");
  const words = ["no", "one", "two", "three", "four"];

  it("VACUOUS GUARD: the Q-B6-1 entry is found, and it is the lane entry", () => {
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    expect(entry).toContain("at most two lanes");
  });

  it("three rows at once: the entry names the face the code draws, and calls anything but two blocks a departure", () => {
    const { placed, more } = layoutLanes([
      lane("a", H(15), H(15, 45)),
      lane("b", H(15), H(15, 45)),
      lane("c", H(15), H(15, 45)),
    ]);
    expect(more).toHaveLength(1);
    const blocks = `${words[placed.length]} block${placed.length === 1 ? "" : "s"}`;
    expect(entry).toContain(`three rows at once read ${blocks} and "+${more[0]!.count}"`);
    // The card's default reads as two blocks drawn with a chip beside them.
    expect(/departs from the card's default/i.test(entry)).toBe(placed.length !== 2);
  });

  it("the twin case: the entry says what a third row at the same moment does to a twin pair", () => {
    const { more } = layoutLanes([
      lane("twin-person", H(15), H(15, 45), false, "Ana Terapeuta", "patient-x"),
      lane("twin-machine", H(15), H(15, 45), true, "Ana Nesa", "patient-x"),
      lane("third", H(15), H(15, 45), false, "Bia Terapeuta", "patient-y"),
    ]);
    const machineHidden = more.some((m) => m.hiddenIds.includes("twin-machine"));
    expect(entry).toContain(
      machineHidden ? "the machine row goes behind the chip" : "the twin stays side by side",
    );
  });

  it("the earlier row: the entry says what a row still running when a twin pair starts does, and no longer says the other thing", () => {
    // Round 7's review: the entry described the pair as split under an
    // earlier row. Pinned both ways, so the stale sentence cannot stay beside
    // the new one.
    const { more } = layoutLanes([
      lane("early", H(14, 30), H(15, 15), false, "Zulmira", "z"),
      lane("twin-person", H(15), H(15, 45), false, "Yara", "y"),
      lane("twin-machine", H(15), H(15, 45), true, "Yara NESA", "y"),
    ]);
    const earlyHidden = more.some((m) => m.hiddenIds.includes("early"));
    const hides = "a row that started earlier and still runs when the pair starts goes behind the chip";
    const splits = "the pair's first row takes it and the other goes behind the chip";
    expect(entry).toContain(earlyHidden ? hides : splits);
    expect(entry).not.toContain(earlyHidden ? splits : hides);
  });
});

/* ------------------------------------------------------------------ */
/* Every Q-B6 default is in the owner's question queue.                 */
/* ------------------------------------------------------------------ */
describe("docs/QUESTIONS.md holds every Q-B6 default DECISIONS ships behind", () => {
  // Round 6: Q-B6-1 to Q-B6-11 were called open owner questions but were
  // written only in DECISIONS.md, and the owner answers from QUESTIONS.md
  // ("Open questions for the owner. Append-only."). So every Q-B6 id the
  // DECISIONS entry names must have its own QUESTIONS entry, carrying the
  // default shipped and the alternative.
  const decisions = readFileSync(new URL("../../../../docs/DECISIONS.md", import.meta.url), "utf8");
  const questions = readFileSync(new URL("../../../../docs/QUESTIONS.md", import.meta.url), "utf8");
  const ids = [...new Set([...decisions.matchAll(/\*\*(Q-B6-\d+)\*\*/g)].map((m) => m[1]!))];

  it("VACUOUS GUARD: DECISIONS names the twelve defaults, Q-B6-1 to Q-B6-12", () => {
    expect(ids).toEqual(Array.from({ length: 12 }, (_, i) => `Q-B6-${i + 1}`));
  });

  it("every sentence of the card's DECISIONS entry that calls something a question names its Q-B6 id", () => {
    // Round 7's review: the axis bullet said "If the ruling meant a frozen
    // axis, that is a question" with no id, so the owner's queue never held
    // it. A question with no id cannot reach QUESTIONS.md; the test above then
    // checks that every id does.
    const from = decisions.indexOf("## 2026-09-23 - AGENDA-MOBILE-WEEK:");
    const next = decisions.indexOf("\n## ", from + 1);
    const entry = decisions.slice(from, next === -1 ? decisions.length : next).replace(/\s+/g, " ");
    const asks = entry.split(/(?<=[.:;])\s+/).filter((s) => /\b(?:is|are) (?:an? )?(?:open )?(?:owner )?question/i.test(s));
    // VACUOUS GUARD: the entry is found and holds at least the axis sentence.
    expect(from).toBeGreaterThan(-1);
    expect(asks.length).toBeGreaterThanOrEqual(1);
    for (const s of asks) expect(s, "a question without its id").toMatch(/Q-B6-\d+/);
  });

  it("each has a QUESTIONS entry of its own, with the default shipped and the alternative", () => {
    const headings = [...questions.matchAll(/^## .*$/gm)];
    for (const id of ids) {
      const at = headings.findIndex((h) => new RegExp(`^## .* - ${id}: `).test(h[0]));
      expect(at, `${id} has a heading in QUESTIONS.md`).toBeGreaterThan(-1);
      const from = headings[at]!.index!;
      const to = headings[at + 1]?.index ?? questions.length;
      const body = questions.slice(from, to);
      expect(body, `${id}: the default shipped`).toContain("**Default shipped.**");
      expect(body, `${id}: the alternative`).toMatch(/\*\*Alternatives?\.\*\*/);
      expect(body, `${id}: it is for the owner`).toContain("**OWNER.");
    }
  });
});

/* ------------------------------------------------------------------ */
/* The owner-facing text keeps up with the code and with DECISIONS.     */
/* ------------------------------------------------------------------ */
const repoText = (rel: string) => readFileSync(new URL(`../../../../${rel}`, import.meta.url), "utf8");

/** The card's DECISIONS entry, the Q-B6 QUESTIONS entries and the SPEC
 *  amendment, each as one line of text. */
function cardDocs(): { decisions: string; questions: string; spec: string } {
  const flat = (t: string) => t.replace(/\s+/g, " ");
  const d = repoText("docs/DECISIONS.md");
  const dFrom = d.indexOf("## 2026-09-23 - AGENDA-MOBILE-WEEK:");
  const dNext = d.indexOf("\n## ", dFrom + 1);
  const q = repoText("docs/QUESTIONS.md");
  const qHeadings = [...q.matchAll(/^## .*$/gm)];
  const qBodies = qHeadings
    .map((h, i) => ({ h, to: qHeadings[i + 1]?.index ?? q.length }))
    .filter(({ h }) => / - Q-B6-\d+: /.test(h[0]))
    .map(({ h, to }) => q.slice(h.index!, to));
  const sp = repoText("docs/design/SPEC-v2-agenda.md");
  const sFrom = sp.indexOf("**AMENDED BELOW 640px, AGENDA-MOBILE-WEEK.**");
  const sTo = sp.indexOf("\n---", sFrom);
  return {
    decisions: dFrom === -1 ? "" : flat(d.slice(dFrom, dNext === -1 ? d.length : dNext)),
    questions: flat(qBodies.join("\n")),
    spec: sFrom === -1 || sTo === -1 ? "" : flat(sp.slice(sFrom, sTo)),
  };
}

describe("the SPEC amendment says what DECISIONS and the code say", () => {
  // Round 8's review: after round 8 the SPEC still named "Q-B6-1 to Q-B6-11"
  // while DECISIONS listed twelve, never mentioned the axis question Q-B6-12,
  // and said only that a twin pair keeps both lanes: nothing on a row that
  // started earlier (hidden for its whole span) or on a later pair (hidden
  // whole). The guards above read DECISIONS only.
  const { decisions, spec } = cardDocs();
  const lower = spec.toLowerCase();
  const ids = [...new Set([...decisions.matchAll(/\*\*(Q-B6-\d+)\*\*/g)].map((m) => m[1]!))];

  it("VACUOUS GUARD: the amendment and the DECISIONS ids are found", () => {
    expect(spec).toContain("Semana renders a separate compact grid");
    expect(ids.length).toBeGreaterThanOrEqual(12);
  });

  it("the range of defaults it names is the one DECISIONS lists", () => {
    const range = [...spec.matchAll(/\(Q-B6-1 to Q-B6-(\d+)\)/g)];
    expect(range, "one range statement").toHaveLength(1);
    expect(`Q-B6-${range[0]![1]}`).toBe(ids[ids.length - 1]);
    for (const m of spec.matchAll(/Q-B6-(\d+)/g)) expect(ids, `${m[0]} is a DECISIONS id`).toContain(m[0]);
  });

  it("the time axis clause names the question DECISIONS files the axis reading under", () => {
    const axisId = /\*\*(Q-B6-\d+)\*\* "sticky time axis/.exec(decisions)?.[1];
    expect(axisId, "DECISIONS names the axis question").toBeDefined();
    const from = spec.indexOf("a time axis");
    const to = spec.indexOf("a now line", from);
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    expect(spec.slice(from, to)).toContain(axisId!);
  });

  it("the twin sentences say what layoutLanes does with a row that started earlier and with a later pair", () => {
    const early = layoutLanes([
      lane("early", H(14, 30), H(15, 15), false, "Zulmira", "z"),
      lane("twin-person", H(15), H(15, 45), false, "Yara", "y"),
      lane("twin-machine", H(15), H(15, 45), true, "Yara NESA", "y"),
    ]);
    const earlyHidden = early.more.some((m) => m.hiddenIds.includes("early"));
    expect(lower.includes("a row that started earlier and still runs when the pair starts goes behind the chip")).toBe(
      earlyHidden,
    );
    const pairs = layoutLanes([
      lane("a-person", H(15), H(15, 45), false, "Alda", "a"),
      lane("a-machine", H(15), H(15, 45), true, "Alda NESA", "a"),
      lane("b-person", H(15, 15), H(16), false, "Bia", "b"),
      lane("b-machine", H(15, 15), H(16), true, "Bia NESA", "b"),
    ]);
    const hidden = pairs.more.flatMap((m) => m.hiddenIds);
    const laterHiddenWhole = hidden.includes("b-person") && hidden.includes("b-machine");
    expect(lower.includes("the later pair is behind the chip whole")).toBe(laterHiddenWhole);
  });
});

describe("the owner-facing text claims person left only where the page knows the machine", () => {
  // Round 8's review found the e2e's "person left" passing by name order,
  // with the machine never flagged. Where the page does not know the machine
  // the halves go by name, so an unqualified "person left" is false for that
  // viewer. Pinned to the code: while an unflagged machine row can go left,
  // every such sentence must say where the person is left.
  const { decisions, questions, spec } = cardDocs();
  const sentences = [decisions, questions, spec]
    .flatMap((t) => t.split(/(?<=[.;!?])\s+/))
    .filter((s) => /person left|person row is on the left/i.test(s));

  it("VACUOUS GUARD: the three documents make the claim", () => {
    expect(sentences.length).toBeGreaterThanOrEqual(4);
  });

  it("each claim names its condition, while an unflagged machine row can be the left half", () => {
    const { placed } = layoutLanes([
      lane("p", H(15), H(15, 45), false, "Gemeo Sintetico E2E Therapist", "g"),
      lane("m", H(15), H(15, 45), false, "Gemeo Sintetico Aparelho NESA Gemeo (E2E)", "g"),
    ]);
    const machineLeftUnflagged = placed.find((x) => x.id === "m")?.lane === 0;
    for (const s of sentences) {
      expect(/knows the machine|flag is known|among the viewer's known shared resources/.test(s) || !machineLeftUnflagged, s).toBe(
        true,
      );
    }
  });
});

describe("the card's own text paraphrases the ruling and never quotes it", () => {
  // Round 8's review: readRangeForView's comment quoted a phrase and credited
  // it to the ruling, and agenda-view-preference.ts did the same with a
  // two-word phrase. This is a PUBLIC repository and the ruling may appear here
  // paraphrased only. Every sentence of this card's own text that names the
  // ruling must hold no quotation. The fixtures below are invented phrases.
  const comments = (src: string) =>
    [...src.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g)]
      .map((m) => m[0].replace(/^\/\*\*?|\*\/$/g, "").replace(/^\s*\*\s?/gm, "").replace(/^\/\/\s?/, ""))
      .join("\n");
  const timeTs = repoText("apps/web/lib/scheduling/time.ts");
  const rangeFrom = timeTs.indexOf("AGENDA-MOBILE-WEEK - the range the agenda page READS");
  const rangeTo = timeTs.indexOf("export function readRangeForView", rangeFrom);
  const { decisions, questions, spec } = cardDocs();
  const texts: [string, string][] = [
    ...[
      "apps/web/lib/scheduling/agenda-compact-core.ts",
      "apps/web/app/agenda/agenda-week-compact.tsx",
      "apps/web/lib/scheduling/agenda-view-preference.ts",
      "apps/web/lib/scheduling/service-color.ts",
    ].map((f): [string, string] => [f, comments(repoText(f))]),
    ["time.ts readRangeForView", rangeFrom === -1 || rangeTo === -1 ? "" : comments(`/*${timeTs.slice(rangeFrom, rangeTo)}`)],
    ["docs/DECISIONS.md (the card's entry)", decisions],
    ["docs/QUESTIONS.md (Q-B6)", questions],
    ["docs/design/SPEC-v2-agenda.md (the amendment)", spec],
    ["docs/design/agenda-mobile-week/README.md", repoText("docs/design/agenda-mobile-week/README.md")],
  ];
  const namesTheRuling = (s: string) => /\bruling|\bruled\b/i.test(s);
  const quotes = (s: string) => /"[^"]+"|\u201c[^\u201d]+\u201d|\u00ab[^\u00bb]+\u00bb/.test(s);
  const offending = (t: string) =>
    t
      .replace(/\s+/g, " ")
      .split(/(?<=[.;!?])\s+/)
      .filter((s) => namesTheRuling(s) && quotes(s));

  it("SELF-TEST: the check flags a quotation credited to the ruling, and passes a paraphrase and a quotation credited to the card", () => {
    expect(offending('Foo shows (the ruling: "foo only when bar"). Then more.')).toHaveLength(1);
    expect(offending('"Per widget" is the ruling\'s unit.')).toHaveLength(1);
    expect(offending("The ruling remembers the choice for each device.")).toEqual([]);
    expect(offending('The card reads "sticky time axis" as below.')).toEqual([]);
  });

  it("VACUOUS GUARD: every text is found, and together they name the ruling in several sentences", () => {
    for (const [name, t] of texts) expect(t.length, `${name} is read`).toBeGreaterThan(200);
    const named = texts.flatMap(([, t]) => t.replace(/\s+/g, " ").split(/(?<=[.;!?])\s+/)).filter(namesTheRuling);
    expect(named.length).toBeGreaterThanOrEqual(8);
  });

  it("no sentence that names the ruling holds a quotation", () => {
    for (const [name, t] of texts) expect(offending(t), name).toEqual([]);
  });
});
