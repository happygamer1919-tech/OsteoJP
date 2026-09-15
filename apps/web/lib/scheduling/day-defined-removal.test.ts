import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { assertPiiFreeAuditMetadata, AuditMetadataError } from "@/lib/audit/metadata-contract";
import { planAlternatingWeeks } from "./alternating-weeks";
import { scheduleRuleFor } from "./availability";
import { buildDay } from "./day-availability-core";
import { planDayByDay, type DayByDayPlan } from "./day-by-day";
import {
  carveShape,
  dayDefinedRemovalAuditMetadata,
  planDayDefinedRemoval,
  projectRemoval,
  type DayDefinedRemovalPlan,
  type StoredRow,
} from "./day-defined-removal";
import { dayEditPlan } from "./inspector-edit";
import { coverageViolations, type CoverageRow } from "./schedule-coverage";
import { isSingleDayRow, projectedRows, type SchedulePlan } from "./schedule-window";

/**
 * SR-62 PU-3 - Eliminar on a Dia definido, driven through the REAL planners.
 *
 * NO SHAPE HERE IS HAND-DRAWN WHERE THE PLANNER CAN DRAW IT. Each scenario saves
 * dated days through `planDayByDay` / `planAlternatingWeeks` exactly as the
 * inspector, the dia a dia grid and the alternating panel do, applies the plan
 * the way `writeSchedulePlan` does (including its revive-on-key insert), then
 * removes a day and resolves the result through `buildDay` - the agenda's own
 * resolver. The assertion is about what the AGENDA would say, not about the
 * rows the test happened to expect.
 *
 * 2026-09-07, -14, -21 and -28 are Mondays. LV is the Base clinic throughout.
 */

const LV = "loc-lv";
const CB = "loc-cb";

let seq = 0;
const nextId = () => `row-${++seq}`;

const keyOf = (r: CoverageRow) =>
  [r.locationId, r.weekday, r.startTime, r.endTime, r.validFrom, r.validUntil].join("|");

/** `availability_templates_dedupe_uq`, NULLS NOT DISTINCT, is_active excluded. */
function assertDedupeKeyHolds(rows: readonly StoredRow[]): void {
  const keys = rows.map(keyOf);
  expect(new Set(keys).size, `duplicate dedupe key in ${JSON.stringify(rows)}`).toBe(keys.length);
}

const base = (o: Partial<StoredRow> = {}): StoredRow => ({
  id: nextId(),
  locationId: LV,
  weekday: 1,
  startTime: "09:00",
  endTime: "17:00",
  validFrom: null,
  validUntil: null,
  isActive: true,
  ...o,
});

const active = (rows: readonly StoredRow[]) => rows.filter((r) => r.isActive);

/** `writeSchedulePlan`, in memory: carve, resume, supersede, insert-or-revive. */
function applyWindowPlan(rows: readonly StoredRow[], plan: SchedulePlan): StoredRow[] {
  // The server's gate first: no plan that double-covers or inverts is written.
  expect(coverageViolations(projectedRows(active(rows), plan))).toEqual([]);
  const out = rows.map((r) => ({ ...r }));
  const insert = (c: CoverageRow) => {
    const holder = out.find((r) => keyOf(r) === keyOf(c));
    if (holder) holder.isActive = true;
    else out.push({ ...c, id: nextId(), isActive: true });
  };
  for (const carve of plan.carved) {
    out.find((r) => r.id === carve.id)!.validUntil = carve.validUntil;
    if (carve.resume) insert(carve.resume);
  }
  for (const d of plan.deactivate) {
    out.find((r) => r.id === d.id)!.isActive = false;
    if (d.resume) insert(d.resume);
  }
  for (const c of plan.created) insert(c);
  assertDedupeKeyHolds(out);
  return out;
}

function saveDays(rows: readonly StoredRow[], plan: DayByDayPlan, replace = false): StoredRow[] {
  const write = planDayByDay(plan, active(rows), { replace });
  expect(write.collisions.length === 0 || replace).toBe(true);
  return applyWindowPlan(rows, write);
}

const editDay = (rows: readonly StoredRow[], date: string, locationId: string, replace = false) =>
  saveDays(rows, dayEditPlan(date, { locationId, startTime: "10:00", endTime: "14:00" }), replace);

/** The removal writer, in memory, in its own order, with the key constraint. */
function applyRemoval(rows: readonly StoredRow[], plan: Extract<DayDefinedRemovalPlan, { ok: true }>): StoredRow[] {
  const out = rows.map((r) => ({ ...r }));
  const row = (id: string) => {
    const r = out.find((x) => x.id === id);
    expect(r, `the plan names a row that does not exist: ${id}`).toBeDefined();
    return r!;
  };
  row(plan.archiveId).isActive = false;
  for (const id of plan.deactivate) row(id).isActive = false;
  for (const id of plan.activate) row(id).isActive = true;
  for (const b of plan.bounds) Object.assign(row(b.id), { validFrom: b.validFrom, validUntil: b.validUntil });
  assertDedupeKeyHolds(out);
  // What the writer applied is exactly what the planner projected.
  expect(active(out).map(keyOf).sort()).toEqual(projectRemoval(rows, plan).map(keyOf).sort());
  return out;
}

const datedOn = (rows: readonly StoredRow[], date: string, locationId?: string) =>
  active(rows).find(
    (r) => isSingleDayRow(r) && r.validFrom === date && (locationId === undefined || r.locationId === locationId),
  )!;

function remove(rows: readonly StoredRow[], date: string, locationId?: string) {
  const target = datedOn(rows, date, locationId);
  expect(target, `no Dia definido on ${date}`).toBeDefined();
  const plan = planDayDefinedRemoval(target.id, rows);
  return { plan, target };
}

function removeOk(rows: readonly StoredRow[], date: string, locationId?: string) {
  const { plan } = remove(rows, date, locationId);
  if (!plan.ok) throw new Error(`expected a removal plan for ${date}, got ${plan.reason}`);
  return { plan, rows: applyRemoval(rows, plan) };
}

/** What the agenda resolves for one date: [rule, clinic] per window. */
const resolved = (rows: readonly StoredRow[], date: string) =>
  buildDay(
    date,
    active(rows).map((r) => ({ ...r, isActive: true })),
    [],
  ).sources.map((s) => [s.rule, s.locationId]);

/** The two outcomes the ruling allows, and nothing else. */
function expectBaseOrNaoTrabalha(rows: readonly StoredRow[], date: string): void {
  const rules = resolved(rows, date).map(([rule]) => rule);
  for (const rule of rules) expect(rule).toBe("base");
  // And no active row anywhere is a label the ruling does not have.
  for (const r of active(rows)) expect(["base", "dia_definido"]).toContain(scheduleRuleFor(r));
}

/** Active coverage as a set of keys, ignoring ids, for "back to where it was". */
const coverage = (rows: readonly StoredRow[]) => active(rows).map(keyOf).sort();

describe("carveShape - the five answers, enumerated", () => {
  const D = "2026-09-14";
  it("rejoin: both edges, nothing of D's weekday between either edge and D", () => {
    expect(carveShape(D, { validUntil: "2026-09-13" }, { validFrom: "2026-09-15" })).toBe("rejoin");
    // Weekday-adjacent, not day-adjacent: a Sat-Fri window around one Monday.
    expect(carveShape(D, { validUntil: "2026-09-07" }, { validFrom: "2026-09-21" })).toBe("rejoin");
  });
  it("extend_head / extend_tail: D is the first / last date of its weekday in the gap", () => {
    expect(carveShape(D, { validUntil: "2026-09-13" }, { validFrom: "2026-09-22" })).toBe("extend_head");
    expect(carveShape(D, { validUntil: "2026-09-06" }, { validFrom: "2026-09-15" })).toBe("extend_tail");
  });
  it("inside_window: dates of D's weekday on both sides - the refusal", () => {
    expect(carveShape(D, { validUntil: "2026-09-06" }, { validFrom: "2026-09-22" })).toBe("inside_window");
  });
  it("one-sided edges count only when EXACT, because only S = D or E = D proves D was covered", () => {
    expect(carveShape(D, { validUntil: "2026-09-13" }, null)).toBe("extend_head");
    expect(carveShape(D, null, { validFrom: "2026-09-15" })).toBe("extend_tail");
    expect(carveShape(D, { validUntil: "2026-09-10" }, null)).toBe("no_evidence");
    expect(carveShape(D, null, { validFrom: "2026-09-17" })).toBe("no_evidence");
    expect(carveShape(D, null, null)).toBe("no_evidence");
  });
});

describe("PU-3 GATE - removing a Dia definido gives the day back to Base, where Base exists", () => {
  it("SINGLE DAY IN THE MIDDLE OF A BASE ROW: the carve is rejoined and the week is what it was", () => {
    const start = [base({ id: "base-mon" })];
    const saved = editDay(start, "2026-09-14", CB);
    expect(resolved(saved, "2026-09-14")).toEqual([["dia_definido", CB]]);

    const { plan, rows } = removeOk(saved, "2026-09-14");
    expect(plan.userShapes).toEqual(["rejoin"]);
    expect(plan.outcome).toBe("base_restored");
    // The ORIGINAL row id carries Base again; the resume row is retired.
    expect(plan.bounds).toEqual([{ id: "base-mon", validFrom: null, validUntil: null }]);

    expect(resolved(rows, "2026-09-14")).toEqual([["base", LV]]);
    expect(resolved(rows, "2026-09-07")).toEqual([["base", LV]]);
    expect(resolved(rows, "2026-09-21")).toEqual([["base", LV]]);
    expect(coverage(rows)).toEqual(coverage(start));
    expectBaseOrNaoTrabalha(rows, "2026-09-14");
  });

  it("the round trip repeats: define, remove, define the same day again, remove again", () => {
    // The second save re-inserts keys the first removal retired, so this is the
    // revive-on-key path meeting the removal's retirements.
    let rows = [base({ id: "base-mon" })];
    for (let i = 0; i < 2; i++) {
      rows = editDay(rows, "2026-09-14", CB);
      expect(resolved(rows, "2026-09-14")).toEqual([["dia_definido", CB]]);
      rows = removeOk(rows, "2026-09-14").rows;
      expect(resolved(rows, "2026-09-14")).toEqual([["base", LV]]);
    }
    expect(coverage(rows)).toEqual(coverage([base()]));
  });

  it("BASE STARTING ON THE DATE: Substituir retired the row, and the removal revives it", () => {
    // A Base that begins on the Monday itself (a resume row begins like this).
    const start = [base({ id: "base-from-14", validFrom: "2026-09-14" })];
    // The one-day edit collides (`starts_inside`) and is saved with Substituir,
    // which retires the row and puts back only its tail from the 15th.
    expect(planDayByDay(dayEditPlan("2026-09-14", { locationId: CB, startTime: "10:00", endTime: "14:00" }), start).collisions)
      .toHaveLength(1);
    const saved = editDay(start, "2026-09-14", CB, true);
    expect(active(saved).find((r) => r.id === "base-from-14")).toBeUndefined();

    const { plan, rows } = removeOk(saved, "2026-09-14");
    expect(plan.userShapes).toEqual(["extend_tail"]);
    // The tail cannot simply be pulled back to the 14th: the retired original
    // holds that key. It is revived and the tail retired instead.
    expect(plan.activate).toEqual(["base-from-14"]);
    expect(plan.bounds).toEqual([]);

    expect(resolved(rows, "2026-09-14")).toEqual([["base", LV]]);
    expect(resolved(rows, "2026-09-07")).toEqual([]); // before the Base began: unchanged
    expect(coverage(rows)).toEqual(coverage(start));
  });

  it("BASE ENDING ON THE DATE: the carve had no tail to write, and the head is extended back", () => {
    const start = [base({ id: "base-to-14", validUntil: "2026-09-14" })];
    const saved = editDay(start, "2026-09-14", CB);
    expect(active(saved).find((r) => r.id === "base-to-14")?.validUntil).toBe("2026-09-13");

    const { plan, rows } = removeOk(saved, "2026-09-14");
    expect(plan.userShapes).toEqual(["extend_head"]);
    expect(plan.bounds).toEqual([{ id: "base-to-14", validFrom: null, validUntil: "2026-09-14" }]);
    expect(resolved(rows, "2026-09-14")).toEqual([["base", LV]]);
    expect(resolved(rows, "2026-09-21")).toEqual([]); // after the Base ended: unchanged
    expect(coverage(rows)).toEqual(coverage(start));
  });

  it("NO BASE AT ALL: the row is archived and the day reads Não trabalha", () => {
    const saved = editDay([], "2026-09-14", CB);
    const { plan, rows } = removeOk(saved, "2026-09-14");
    expect(plan.outcome).toBe("no_base");
    expect(plan).toMatchObject({ bounds: [], activate: [], deactivate: [] });
    expect(resolved(rows, "2026-09-14")).toEqual([]);
    expect(active(rows)).toEqual([]);
  });

  it("TWO CLINICS, DIFFERENT DATES: each removal gives back only its own day, in either order", () => {
    const start = [base({ id: "base-mon" })];
    const saved = editDay(editDay(start, "2026-09-07", CB), "2026-09-14", LV);
    expect(resolved(saved, "2026-09-07")).toEqual([["dia_definido", CB]]);
    expect(resolved(saved, "2026-09-14")).toEqual([["dia_definido", LV]]);

    const cbFirst = removeOk(saved, "2026-09-07");
    expect(resolved(cbFirst.rows, "2026-09-07")).toEqual([["base", LV]]);
    expect(resolved(cbFirst.rows, "2026-09-14")).toEqual([["dia_definido", LV]]);
    const both = removeOk(cbFirst.rows, "2026-09-14");
    expect(resolved(both.rows, "2026-09-14")).toEqual([["base", LV]]);
    expect(coverage(both.rows)).toEqual(coverage(start));

    const lvFirst = removeOk(saved, "2026-09-14");
    expect(resolved(lvFirst.rows, "2026-09-14")).toEqual([["base", LV]]);
    expect(resolved(lvFirst.rows, "2026-09-07")).toEqual([["dia_definido", CB]]);
    expect(coverage(removeOk(lvFirst.rows, "2026-09-07").rows)).toEqual(coverage(start));
  });

  it("a one-Monday dia a dia window that does not start or end on the Monday still rejoins", () => {
    // Sat 5 - Fri 11 with only Monday 7 set: head ends the 4th, tail resumes the
    // 12th. Neither edge is day-adjacent; both are weekday-adjacent.
    const start = [base({ id: "base-mon" })];
    const saved = saveDays(start, {
      startDate: "2026-09-05",
      endDate: "2026-09-11",
      entries: [{ date: "2026-09-07", locationId: CB, startTime: "10:00", endTime: "14:00" }],
    });
    const { plan, rows } = removeOk(saved, "2026-09-07");
    expect(plan.userShapes).toEqual(["rejoin"]);
    expect(resolved(rows, "2026-09-07")).toEqual([["base", LV]]);
    expect(coverage(rows)).toEqual(coverage(start));
  });

  it("a split-shift Base (two periods) comes back as both periods", () => {
    const start = [
      base({ id: "am", startTime: "08:00", endTime: "13:00" }),
      base({ id: "pm", startTime: "14:00", endTime: "19:00" }),
    ];
    const { plan, rows } = removeOk(editDay(start, "2026-09-14", CB), "2026-09-14");
    expect(plan.userShapes).toEqual(["rejoin", "rejoin"]);
    expect(resolved(rows, "2026-09-14")).toEqual([["base", LV], ["base", LV]]);
    expect(coverage(rows)).toEqual(coverage(start));
  });

  it("a day still defined by another dated row stays defined; Base returns with the LAST one", () => {
    const start = [base({ id: "base-mon" })];
    const saved = saveDays(start, {
      startDate: "2026-09-14",
      endDate: "2026-09-14",
      entries: [
        { date: "2026-09-14", locationId: CB, startTime: "08:00", endTime: "13:00" },
        { date: "2026-09-14", locationId: CB, startTime: "14:00", endTime: "19:00" },
      ],
    });
    const morning = active(saved).find((r) => isSingleDayRow(r) && r.startTime === "08:00")!;
    const first = planDayDefinedRemoval(morning.id, saved);
    if (!first.ok) throw new Error(first.reason);
    expect(first.outcome).toBe("still_defined");
    expect(first).toMatchObject({ bounds: [], activate: [], deactivate: [] });
    const afterFirst = applyRemoval(saved, first);
    // Restoring Base beside the afternoon would put LV and CB on one date.
    expect(resolved(afterFirst, "2026-09-14")).toEqual([["dia_definido", CB]]);

    const { plan, rows } = removeOk(afterFirst, "2026-09-14");
    expect(plan.outcome).toBe("base_restored");
    expect(resolved(rows, "2026-09-14")).toEqual([["base", LV]]);
    expect(coverage(rows)).toEqual(coverage(start));
  });

  it("leaves every other weekday exactly as the window left it", () => {
    const start = [base({ id: "base-mon" }), base({ id: "base-tue", weekday: 2 })];
    const saved = editDay(start, "2026-09-14", CB);
    const tuesdaysBefore = active(saved).filter((r) => r.weekday === 2).map(keyOf).sort();
    const { rows } = removeOk(saved, "2026-09-14");
    expect(active(rows).filter((r) => r.weekday === 2).map(keyOf).sort()).toEqual(tuesdaysBefore);
  });
});

describe("PU-3 - where Base cannot come back without a one-day row, NOTHING is written", () => {
  // Mon 7 - Sun 27, three Mondays at CB, Base LV Monday and Base LV Tuesday.
  const threeMondays = () =>
    saveDays([base({ id: "base-mon" }), base({ id: "base-tue", weekday: 2 })], {
      startDate: "2026-09-07",
      endDate: "2026-09-27",
      entries: ["2026-09-07", "2026-09-14", "2026-09-21"].map((date) => ({
        date,
        locationId: CB,
        startTime: "10:00",
        endTime: "14:00",
      })),
    });

  it("the MIDDLE Monday of a multi-day dia a dia window is refused, with its date", () => {
    const saved = threeMondays();
    const { plan } = remove(saved, "2026-09-14");
    expect(plan).toEqual({ ok: false, reason: "restore_needs_single_day", date: "2026-09-14" });
    // A refusal has no ops to apply, by type: the writer has nothing to write.
    expect("archiveId" in plan).toBe(false);
    expect(resolved(saved, "2026-09-14")).toEqual([["dia_definido", CB]]);
  });

  it("the edges of the same window are NOT refused, and removing them makes the middle removable", () => {
    let rows = threeMondays();
    const first = removeOk(rows, "2026-09-07");
    expect(first.plan.userShapes).toEqual(["extend_head"]);
    rows = first.rows;
    expect(resolved(rows, "2026-09-07")).toEqual([["base", LV]]);

    const last = removeOk(rows, "2026-09-21");
    expect(last.plan.userShapes).toEqual(["extend_tail"]);
    rows = last.rows;
    expect(resolved(rows, "2026-09-21")).toEqual([["base", LV]]);

    const middle = removeOk(rows, "2026-09-14");
    expect(middle.plan.userShapes).toEqual(["rejoin"]);
    rows = middle.rows;
    for (const d of ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]) {
      expect(resolved(rows, d)).toEqual([["base", LV]]);
    }
    // The Tuesdays of the window stay NOT WORKING: the window said so, and
    // removing Monday rows is not a statement about Tuesday.
    expect(resolved(rows, "2026-09-15")).toEqual([]);
    expect(resolved(rows, "2026-09-29")).toEqual([["base", LV]]);
  });

  it("semanas alternadas WITH a Base: a middle Monday is refused", () => {
    const start = [base({ id: "base-mon" })];
    const write = planAlternatingWeeks(
      {
        weekdays: [1],
        startDate: "2026-09-07",
        endDate: "2026-10-26",
        locationAId: CB,
        locationBId: LV,
        startTime: "10:00",
        endTime: "14:00",
      },
      active(start),
    );
    const saved = applyWindowPlan(start, write);
    expect(remove(saved, "2026-09-21").plan).toEqual({
      ok: false,
      reason: "restore_needs_single_day",
      date: "2026-09-21",
    });
  });

  it("semanas alternadas WITHOUT a Base (the JP shape): any Monday is removable and reads Não trabalha", () => {
    const write = planAlternatingWeeks(
      {
        weekdays: [1],
        startDate: "2026-09-07",
        endDate: "2026-10-26",
        locationAId: CB,
        locationBId: LV,
        startTime: "10:00",
        endTime: "14:00",
      },
      [],
    );
    const saved = applyWindowPlan([], write);
    const { plan, rows } = removeOk(saved, "2026-09-21");
    expect(plan.outcome).toBe("no_base");
    expect(resolved(rows, "2026-09-21")).toEqual([]);
    // Neither clinic is assigned the day - the owner's words for JP's case.
    expect(resolved(rows, "2026-09-14")).toEqual([["dia_definido", LV]]);
    expect(resolved(rows, "2026-09-28")).toEqual([["dia_definido", LV]]);
    expectBaseOrNaoTrabalha(rows, "2026-09-21");
  });

  it("a Base that would collide with another row on the date is refused as a double cover", () => {
    const saved = editDay([base({ id: "base-mon" })], "2026-09-14", CB);
    // A second Base series at CB that serves only the week of the 14th, hours
    // that overlap nothing at CB. Restoring LV beside it puts two clinics on one date.
    const withCb = [
      ...saved,
      base({ id: "cb-week", locationId: CB, startTime: "18:00", endTime: "20:00", validFrom: "2026-09-14", validUntil: "2026-09-20" }),
    ];
    const target = datedOn(withCb, "2026-09-14", CB);
    expect(planDayDefinedRemoval(target.id, withCb)).toEqual({
      ok: false,
      reason: "would_double_cover",
      date: "2026-09-14",
    });
  });
});

describe("PU-3 - no evidence of a carve means Base is empty for the date", () => {
  it("a Base head ending days before the date (not the day before) is not stretched over it", () => {
    const rows = [
      base({ id: "head", validUntil: "2026-09-10" }),
      base({ id: "dd", locationId: CB, validFrom: "2026-09-14", validUntil: "2026-09-14" }),
    ];
    const plan = planDayDefinedRemoval("dd", rows);
    expect(plan).toMatchObject({ ok: true, outcome: "no_base", bounds: [], activate: [], deactivate: [] });
    if (!plan.ok) return;
    expect(resolved(applyRemoval(rows, plan), "2026-09-14")).toEqual([]);
  });

  it("a Base tail starting days after the date is not pulled back over it", () => {
    const rows = [
      base({ id: "tail", validFrom: "2026-09-17" }),
      base({ id: "dd", locationId: CB, validFrom: "2026-09-14", validUntil: "2026-09-14" }),
    ];
    expect(planDayDefinedRemoval("dd", rows)).toMatchObject({ ok: true, outcome: "no_base", bounds: [] });
  });
});

describe("PU-3 - the planner refuses what is not a live Dia definido", () => {
  const rows = [
    base({ id: "base-mon" }),
    base({ id: "retired-dd", locationId: CB, validFrom: "2026-09-14", validUntil: "2026-09-14", isActive: false }),
  ];
  it("a Base row is not removable here", () => {
    expect(planDayDefinedRemoval("base-mon", rows)).toEqual({ ok: false, reason: "not_day_defined", date: null });
  });
  it("an unknown id and an already-retired row are both not found", () => {
    expect(planDayDefinedRemoval("nope", rows)).toMatchObject({ ok: false, reason: "not_found" });
    expect(planDayDefinedRemoval("retired-dd", rows)).toMatchObject({ ok: false, reason: "not_found" });
  });
});

describe("PU-3 - NO FOURTH LABEL after any removal", () => {
  it("every restored row is multi-day, so the resolver can only call the day Base", () => {
    const scenarios: StoredRow[][] = [
      editDay([base()], "2026-09-14", CB),
      editDay([base({ validFrom: "2026-09-14" })], "2026-09-14", CB, true),
      editDay([base({ validUntil: "2026-09-14" })], "2026-09-14", CB),
      editDay([], "2026-09-14", CB),
    ];
    for (const saved of scenarios) {
      const { rows } = removeOk(saved, "2026-09-14");
      expectBaseOrNaoTrabalha(rows, "2026-09-14");
      expect(active(rows).filter(isSingleDayRow)).toEqual([]);
    }
  });
});

describe("PU-3 - the audit metadata is ids, enums, counts and a date", () => {
  it("passes the enforced contract", () => {
    const { plan } = removeOk(editDay([base({ id: "base-mon" })], "2026-09-14", CB), "2026-09-14");
    const metadata = dayDefinedRemovalAuditMetadata(plan, "00000000-0000-4000-8000-000000000001");
    expect(() => assertPiiFreeAuditMetadata(metadata, "test")).not.toThrow();
    expect(metadata).toEqual({
      therapistId: "00000000-0000-4000-8000-000000000001",
      date: "2026-09-14",
      outcome: "base_restored",
      restoredIds: ["base-mon"],
      restoredCount: 1,
      retiredIds: plan.deactivate,
    });
  });

  it("NEGATIVE ARM: the same contract refuses a clinic name, so passing above means something", () => {
    expect(() => assertPiiFreeAuditMetadata({ location: "Linda-a-Velha centro" }, "test")).toThrow(
      AuditMetadataError,
    );
  });
});
