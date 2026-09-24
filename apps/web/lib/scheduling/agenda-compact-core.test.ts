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

  it("the limit, pinned: where a row that started EARLIER still holds a lane, the twin's person row takes the free lane and its machine row goes behind the chip", () => {
    // Only one lane is free at 10:00. Keeping the pair would mean hiding
    // 'early', which is already drawn from 09:30.
    const { placed, more } = layoutLanes([
      lane("early", H(9, 30), H(10, 30), false, "Eva", "e"),
      lane("twin-person", H(10), H(10, 45), false, "Ana", "a"),
      lane("twin-machine", H(10), H(10, 45), true, "Ana NESA", "a"),
    ]);
    expect(Object.fromEntries(placed.map((p) => [p.id, p.lane]))).toEqual({ early: 0, "twin-person": 1 });
    expect(more.flatMap((m) => m.hiddenIds)).toEqual(["twin-machine"]);
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

    function randomDay(rand: () => number): LaneItem[] {
      const n = 1 + Math.floor(rand() * 14);
      const rows = Array.from({ length: n }, (_, k) => {
        const start = H(8) + 15 * Math.floor(rand() * 48);
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

    /** Returns how many twin minutes it checked where a THIRD row started
     *  with the pair: the case the round 6 order got wrong. */
    function check(items: LaneItem[], out: LaneLayout): number {
      let twinCrowds = 0;
      const byId = new Map(items.map((it) => [it.id, it]));
      const span = (id: string) => ({ s: byId.get(id)!.startMin, e: drawnEnd(byId.get(id)!) });
      const runningAt = (t: number) => items.filter((it) => it.startMin <= t && t < drawnEnd(it)).length;
      const hidden = out.more.flatMap((m) => m.hiddenIds);

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

      // (2b) THE CARD'S DEFAULT, TWO BLOCKS PLUS A CHIP: where a hidden row
      //      starts, two blocks are drawn, one in each lane, and the chip that
      //      holds it starts there too or earlier.
      for (const id of hidden) {
        const at = drawnAt(span(id).s);
        expect(at.map((p) => p.lane).sort(), `${id}: two blocks beside its chip`).toEqual([0, 1]);
        const chip = out.more.find((m) => m.hiddenIds.includes(id))!;
        expect(chip.startMin).toBeLessThanOrEqual(span(id).s);
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

      // (5) THE TWIN RULE: where a twin pair starts and no drawn row that
      //     started earlier still runs (both lanes are free), a twin pair
      //     starting then is drawn side by side, person left, machine right,
      //     however many other rows start with it.
      const placedById = new Map(out.placed.map((p) => [p.id, p]));
      for (const t of new Set(items.map((it) => it.startMin))) {
        const startingNow = items.filter((it) => it.startMin === t);
        const twinPatients = new Set(
          startingNow
            .filter((it) => !it.machine && it.patient != null)
            .map((it) => it.patient)
            .filter((pt) => startingNow.some((o) => o.machine && o.patient === pt)),
        );
        if (twinPatients.size === 0) continue;
        const earlierHolds = out.placed.some((p) => span(p.id).s < t && t < span(p.id).e);
        if (earlierHolds) continue;
        const drawnPair = [...twinPatients].some((pt) => {
          const left = startingNow.find((o) => placedById.get(o.id)?.lane === 0);
          const right = startingNow.find((o) => placedById.get(o.id)?.lane === 1);
          return (
            left !== undefined &&
            right !== undefined &&
            !left.machine &&
            right.machine &&
            left.patient === pt &&
            right.patient === pt
          );
        });
        expect(drawnPair, `minute ${t}: a twin pair side by side`).toBe(true);
        if (startingNow.length >= 3) twinCrowds += 1;
      }
      return twinCrowds;
    }

    it("hold for 400 seeded random days", () => {
      const rand = rng(20260923);
      let chips = 0;
      let drawnRightLane = 0;
      let twinCrowds = 0;
      for (let k = 0; k < 400; k++) {
        const items = randomDay(rand);
        const out = layoutLanes(items);
        twinCrowds += check(items, out);
        chips += out.more.length;
        drawnRightLane += out.placed.filter((p) => p.lane === 1).length;
      }
      // CONTROL: the sample is not trivially easy. It crowds often, still
      // draws many rows in the right lane, and holds twin pairs with a third
      // row starting beside them.
      expect(chips).toBeGreaterThan(100);
      expect(drawnRightLane).toBeGreaterThan(100);
      expect(twinCrowds).toBeGreaterThan(5);
    });
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
});
