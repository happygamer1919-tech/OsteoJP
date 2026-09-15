import { isWithinValidity } from "./availability";
import { coverageViolations, type CoverageRow } from "./schedule-coverage";
import { invertedRows, isSingleDayRow } from "./schedule-window";
import { addDays } from "./time";

/**
 * SR-62 PU-3 - Eliminar on a "Dia definido", as pure functions.
 *
 * ==========================================================================
 * THE RULING, AND THE ONE THING THAT MAKES IT MORE THAN AN ARCHIVE
 * ==========================================================================
 * Owner, final: Eliminar removes the day's override, so the day falls back to
 * Base; where there is no Base the day reads "Não trabalha". NO FOURTH STATE.
 *
 * THERE IS NO READ-TIME PRECEDENCE (schedule-coverage.ts, option B). Base
 * "gives way" to a dated row only because the WRITE that saved the dated row
 * CARVED the weekly row around it (schedule-window.ts `planWindow`). So
 * archiving the dated row alone leaves the carve behind, and a day that had a
 * Base reads "Não trabalha" - the ruling's second outcome on a day that is owed
 * its first. This file plans the inverse of the carve for ONE date.
 *
 * ==========================================================================
 * THE CARVE SHAPES, ENUMERATED FROM THE PLANNER RATHER THAN IMAGINED
 * ==========================================================================
 * Every bounded Base edge in this table comes from `planWindow`: the weekly
 * editor's create writes NO validity and its update never changes it
 * (admin/availability.ts), and no other writer sets valid_from/valid_until. For
 * a window [S, E] the planner writes exactly two kinds of edge on a Base series
 * (same clinic, weekday and hours):
 *
 *   a HEAD, bounded to end on S - 1   (the carved row, id kept)
 *   a TAIL, resuming on E + 1         (a resume row, or the tail of a row that
 *                                      started inside the window and was retired)
 *
 * and the day being removed, D, lies inside [S, E]. Around D, per series:
 *
 *   rejoin        head AND tail, and no other date of D's weekday between
 *                 either edge and D. The inspector's one-day edit (S = E = D)
 *                 is the plain case; a Mon-Sun dia a dia window with one Monday
 *                 is the same thing for a Monday row. RESTORE: the head takes
 *                 the tail's end, the tail is retired.
 *   extend_head   D is the FIRST date of its weekday in the gap. With a tail
 *                 present, or with the head ending exactly on D - 1 ("Base
 *                 ending on the date": the carve had no tail to write).
 *                 RESTORE: the head ends on D.
 *   extend_tail   D is the LAST date of its weekday in the gap. With a head
 *                 present, or with the tail starting exactly on D + 1 ("Base
 *                 starting on the date": the original row began on D, was
 *                 retired by Substituir, and only its tail was put back).
 *                 RESTORE: the tail starts on D.
 *   inside_window dates of D's weekday on BOTH sides of D in the gap - a middle
 *                 Monday of a three-Monday dia a dia or alternating window.
 *                 Base could come back for D only as a row covering D alone,
 *                 which `scheduleRuleFor` labels Dia definido: the fourth state
 *                 in disguise. REFUSED, nothing written, Q-SR62-PU3-1.
 *   no_evidence   no series edge that the planner could have written around D.
 *                 Base is empty for D, so the ruling's second outcome applies:
 *                 archive only, the day reads "Não trabalha".
 *
 * WHY ONE-SIDED EDGES MUST BE EXACT. A head ending on S - 1 proves the original
 * row reached S, not that it reached D; a tail starting on E + 1 proves it
 * reached E, not that it began by D. Only S = D (head on D - 1) or E = D (tail
 * on D + 1) proves D itself was covered. With BOTH edges of one series present
 * the original spanned the whole gap, so adjacency by weekday is enough.
 *
 * A DAY STILL DEFINED BY ANOTHER ROW IS NOT GIVEN BACK TO BASE. A split-shift
 * Dia definido is two single-day rows; removing one leaves the day overridden by
 * the other, and restoring Base beside it would double-cover the date. Base
 * returns when the LAST dated row on the day goes.
 *
 * NOTHING HERE WRITES A ONE-DAY ROW, AND THAT IS CHECKED, NOT ASSUMED: every
 * restored row passes `isSingleDayRow === false` before the plan is returned.
 */

/** One availability_templates row, active or retired, as the planner reads it. */
export type StoredRow = CoverageRow & { id: string; isActive: boolean };

export type CarveShape = "rejoin" | "extend_head" | "extend_tail" | "inside_window" | "no_evidence";

export type RemovalOutcome =
  /** Base came back for the date. */
  | "base_restored"
  /** Nothing to restore: the day now reads "Não trabalha". */
  | "no_base"
  /** Another dated row still defines the day; only this one was archived. */
  | "still_defined";

export type DayDefinedRemovalRefusal =
  | "not_found"
  | "not_day_defined"
  /** Base could only return as a one-day row. Q-SR62-PU3-1. */
  | "restore_needs_single_day"
  /** The restored Base would collide with another row on the date. */
  | "would_double_cover";

/**
 * The literal writes, in the order the writer applies them. Every id is a row
 * that already exists: this path INSERTS nothing, so it can neither create a
 * one-day row nor collide with the dedupe key on insert.
 */
export type DayDefinedRemovalOps = {
  /** The Dia definido row itself: is_active = false. Never a hard delete. */
  archiveId: string;
  /** Rows whose validity bounds change (a head extended, a tail pulled back). */
  bounds: { id: string; validFrom: string | null; validUntil: string | null }[];
  /** Retired rows that already hold the restored key, revived instead. */
  activate: string[];
  /** Rows the restore makes redundant (a rejoined tail, a superseded edge). */
  deactivate: string[];
};

export type DayDefinedRemovalPlan =
  | ({ ok: true; date: string; outcome: RemovalOutcome; userShapes: CarveShape[] } & DayDefinedRemovalOps)
  | { ok: false; reason: DayDefinedRemovalRefusal; date: string | null };

const seriesKey = (r: CoverageRow): string =>
  [r.locationId, r.weekday, r.startTime, r.endTime].join("|");

/** `availability_templates_dedupe_uq` minus tenant and user (fixed per call). */
const dedupeKey = (r: CoverageRow): string =>
  [seriesKey(r), r.validFrom, r.validUntil].join("|");

/**
 * Which carve shape surrounds `date` for one Base series. `head` is the series
 * row ending latest before the date, `tail` the one starting earliest after it.
 * See the header for what each answer means and why one-sided edges must be
 * exact.
 */
export function carveShape(
  date: string,
  head: { validUntil: string | null } | null,
  tail: { validFrom: string | null } | null,
): CarveShape {
  // "No date of this weekday strictly between the edge and D": a weekday row
  // only ever serves every seventh day, so anything within six days is adjacent.
  const headTouches = head?.validUntil != null && head.validUntil >= addDays(date, -7);
  const tailTouches = tail?.validFrom != null && tail.validFrom <= addDays(date, 7);
  if (head && tail) {
    if (headTouches && tailTouches) return "rejoin";
    if (headTouches) return "extend_head";
    if (tailTouches) return "extend_tail";
    // THE REFUSAL. Both edges exist, so Base did cover D, and D has dates of its
    // weekday on both sides inside the gap: any restore is a row for D alone.
    return "inside_window";
  }
  if (head?.validUntil === addDays(date, -1)) return "extend_head";
  if (tail?.validFrom === addDays(date, 1)) return "extend_tail";
  return "no_evidence";
}

/**
 * Plan the removal of ONE Dia definido row.
 *
 * `rows` is EVERY row for the therapist, retired ones included: a restored row
 * whose key a retired row already holds must revive that row, because the
 * unique key does not include is_active and an update onto it would abort.
 *
 * PURE, and it decides: a refusal carries no ops, so the caller has nothing to
 * write by construction.
 */
export function planDayDefinedRemoval(
  targetId: string,
  rows: readonly StoredRow[],
): DayDefinedRemovalPlan {
  const target = rows.find((r) => r.id === targetId && r.isActive);
  if (!target) return { ok: false, reason: "not_found", date: null };
  if (!isSingleDayRow(target)) return { ok: false, reason: "not_day_defined", date: null };
  const date = target.validFrom!;
  const others = rows.filter((r) => r.isActive && r.id !== targetId);

  const stillDefined = others.some(
    (r) => isSingleDayRow(r) && r.weekday === target.weekday && r.validFrom === date,
  );
  if (stillDefined) {
    return {
      ok: true,
      date,
      outcome: "still_defined",
      userShapes: [],
      archiveId: targetId,
      bounds: [],
      activate: [],
      deactivate: [],
    };
  }

  const series = new Map<string, StoredRow[]>();
  for (const r of others) {
    if (r.weekday !== target.weekday || isSingleDayRow(r)) continue;
    const k = seriesKey(r);
    series.set(k, [...(series.get(k) ?? []), r]);
  }

  const bounds: DayDefinedRemovalOps["bounds"] = [];
  const activate: string[] = [];
  const deactivate: string[] = [];
  const shapes: CarveShape[] = [];

  for (const members of series.values()) {
    // Base already serves the date for this series: nothing was carved here.
    if (members.some((r) => isWithinValidity(date, r.validFrom, r.validUntil))) continue;
    const head =
      members
        .filter((r) => r.validUntil !== null && r.validUntil < date)
        .sort((a, b) => (a.validUntil! < b.validUntil! ? 1 : -1))[0] ?? null;
    const tail =
      members
        .filter((r) => r.validFrom !== null && r.validFrom > date)
        .sort((a, b) => (a.validFrom! < b.validFrom! ? -1 : 1))[0] ?? null;

    const shape = carveShape(date, head, tail);
    shapes.push(shape);
    if (shape === "no_evidence") continue;
    if (shape === "inside_window") return { ok: false, reason: "restore_needs_single_day", date };

    // The row that carries Base back over the date, and the rows it replaces.
    let source: StoredRow;
    let restored: CoverageRow;
    const replaced: string[] = [];
    if (shape === "rejoin") {
      source = head!;
      restored = { ...head!, validUntil: tail!.validUntil };
      replaced.push(tail!.id);
    } else if (shape === "extend_head") {
      source = head!;
      restored = { ...head!, validUntil: date };
    } else {
      source = tail!;
      restored = { ...tail!, validFrom: date };
    }

    // THE FOURTH-STATE GUARD. Unreachable by the shapes above (a head starts
    // before it ends before D; a tail ends after it starts after D), which is
    // exactly why it is checked: a future shape that reaches it must refuse
    // rather than write a Base that the inspector labels Dia definido.
    if (isSingleDayRow(restored)) return { ok: false, reason: "restore_needs_single_day", date };

    const holder = rows.find((r) => r.id !== source.id && dedupeKey(r) === dedupeKey(restored));
    if (holder?.isActive) return { ok: false, reason: "would_double_cover", date };
    if (holder) {
      // A retired row already IS the restored row, down to every key column -
      // typically the original a Substituir retired. Revive it, retire the edge.
      activate.push(holder.id);
      deactivate.push(source.id, ...replaced);
    } else {
      bounds.push({ id: source.id, validFrom: restored.validFrom, validUntil: restored.validUntil });
      deactivate.push(...replaced);
    }
  }

  const ops: DayDefinedRemovalOps = { archiveId: targetId, bounds, activate, deactivate };
  const projected = projectRemoval(rows, ops);
  if (invertedRows(projected).length > 0) return { ok: false, reason: "restore_needs_single_day", date };
  // THE COVERAGE INVARIANT, ON THE ONE DATE THIS CAN CHANGE. Every shape above
  // is "touching" by construction, so the only date of this weekday a restore
  // newly covers is `date` itself; checking the rows that serve it is exact, and
  // it does not refuse a removal over some unrelated, older overlap elsewhere.
  const onDate = projected.filter(
    (r) => r.weekday === target.weekday && isWithinValidity(date, r.validFrom, r.validUntil),
  );
  if (coverageViolations(onDate).length > 0) return { ok: false, reason: "would_double_cover", date };

  const restoredAny = bounds.length > 0 || activate.length > 0;
  return {
    ok: true,
    date,
    outcome: restoredAny ? "base_restored" : "no_base",
    userShapes: shapes,
    ...ops,
  };
}

/**
 * The ACTIVE rows once `ops` are applied, in the shape every reader filters:
 * is_active and validity. Used for the invariant check above and by the tests,
 * which resolve days from it through `buildDay` - the agenda's own function.
 */
export function projectRemoval(rows: readonly StoredRow[], ops: DayDefinedRemovalOps): StoredRow[] {
  const bounds = new Map(ops.bounds.map((b) => [b.id, b]));
  const off = new Set([ops.archiveId, ...ops.deactivate]);
  const on = new Set(ops.activate);
  return rows
    .map((r) => {
      const b = bounds.get(r.id);
      const isActive = on.has(r.id) ? true : off.has(r.id) ? false : r.isActive;
      return b ? { ...r, validFrom: b.validFrom, validUntil: b.validUntil, isActive } : { ...r, isActive };
    })
    .filter((r) => r.isActive);
}

/**
 * The audit row's metadata. IDS, ENUMS, COUNTS AND AN ISO DATE ONLY, which is
 * the contract `assertPiiFreeAuditMetadata` enforces on every admin audit write.
 * No clinic name, no hours: the ids name the rows, and the rows hold the rest.
 */
export function dayDefinedRemovalAuditMetadata(
  plan: Extract<DayDefinedRemovalPlan, { ok: true }>,
  therapistId: string,
): Record<string, unknown> {
  const restoredIds = [...plan.bounds.map((b) => b.id), ...plan.activate];
  return {
    therapistId,
    date: plan.date,
    outcome: plan.outcome,
    restoredIds,
    restoredCount: restoredIds.length,
    retiredIds: plan.deactivate,
  };
}
