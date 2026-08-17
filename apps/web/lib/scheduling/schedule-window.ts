import { addDays } from "./time";
import type { CoverageRow } from "./schedule-coverage";

/**
 * SCHED-04 / SCHED-05 - the shared seam between the two DATE-SPECIFIC schedule
 * entry modes.
 *
 * Layer 1 is the ordinary weekly schedule: recurring, unbounded, the default.
 * Layer 2 is date-specific work, written into the SAME table as rows carrying
 * valid_from / valid_until. Two modes produce layer-2 rows:
 *
 *   MODE 2, alternating weeks (SCHED-01): a GENERATOR produces the dates.
 *   MODE 3, the day-by-day grid (SCHED-04): a human produces the dates.
 *
 * Everything that is not the dates themselves is identical between them - how
 * layer 1 is carved to make room, what happens when the window already has
 * dated work in it, and what may never be written. That common part lives here,
 * so the two modes cannot drift about it.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS AT ALL: THE RE-RUN INVERTED ITS OWN ROWS (SCHED-05)
 * ============================================================================
 * The shipped mode-2 carve bounded EVERY existing row on a pattern weekday to
 * the day before the window. On a first run the only such rows are layer-1
 * weekly rows, and that is correct. On a SECOND run over the same window the
 * existing rows include the DATED rows the first run wrote, whose valid_from is
 * a date INSIDE the window - so bounding them to the day before produced
 * valid_from > valid_until. An inverted row is dead: isWithinValidity refuses
 * every date, so it offers no slot and blocks none.
 *
 * IT WAS INVISIBLE IN BOTH DIRECTIONS, WHICH IS THE PART WORTH REMEMBERING.
 * Nothing on a screen changed, because an inert row renders as nothing. And the
 * write-time invariant did not see it either: validityIntersects computes
 * aFrom <= bTo && bFrom <= aTo, which is false for an inverted range against
 * anything at all, so coverageViolations silently EXCLUDED the rows nobody
 * could reason about and reported no violation.
 *
 * That is PORTAL-REHYDRATE 1.3 exactly - an unhandled case mapped onto the
 * harmless-looking one, and the system carried on reporting something
 * reasonable. So this file's rule is stated as a prohibition rather than as a
 * behaviour: A BOUND IS NEVER WRITTEN BACKWARDS. Where the old code would have
 * inverted a row, it now REFUSES and names the dates, and the only way past the
 * refusal is an explicit second action that DEACTIVATES the row instead.
 */

/** A row that occupies exactly one day - the shape both layer-2 modes write. */
export function isSingleDayRow(row: CoverageRow): boolean {
  return row.validFrom !== null && row.validFrom === row.validUntil;
}

/**
 * An existing row that stands in the way of a window, with the date that puts
 * it there so a refusal can NAME it rather than saying "something conflicts".
 */
export type WindowCollision = {
  id: string;
  /** The day that collides: the row's own day, or the day it starts. */
  date: string;
  locationId: string;
  weekday: number;
  kind:
    | "dated" // a single-day layer-2 row already inside the window
    | "starts_inside"; // a multi-day row beginning inside it, so it has no head to keep
};

/** How an existing layer-1 row is bounded so a window can occupy its dates. */
export type WindowCarve = {
  id: string;
  /** Its new valid_until: the day before the window. NEVER before valid_from. */
  validUntil: string;
  /** The identical row resuming after the window, or null when it had no tail. */
  resume: CoverageRow | null;
};

/**
 * A row the window supersedes: retired with is_active = false, and - if it
 * reached past the window's end - REPLACED by an identical row covering only
 * that surviving tail.
 *
 * THE TAIL IS THE WHOLE REASON THIS IS NOT JUST A LIST OF IDS. A row that begins
 * inside the window cannot be bounded (there is no head to keep) so it must be
 * retired, but it may still have been serving dates AFTER the window. Retiring
 * it without putting the tail back would silently delete the therapist's
 * schedule from the end of the window onwards, and nothing would report it -
 * the agenda would simply be empty, which is what "no schedule" looks like.
 */
export type SupersededRow = {
  id: string;
  /** The tail, or null when the row ended inside the window. */
  resume: CoverageRow | null;
  /** The row's dedupe key, so an identical re-write can be recognised and
   *  skipped rather than colliding with the unique constraint. */
  key: string;
};

/**
 * The complete set of writes a layer-2 mode wants to make, plus what it found in
 * the way. One type for both modes: they differ only in how `created` is
 * produced.
 */
export type SchedulePlan = {
  /** New dated rows, one per date. */
  created: CoverageRow[];
  /** Layer-1 rows bounded to make room. */
  carved: WindowCarve[];
  /** Rows to retire. Only ever non-empty with `replace`. */
  deactivate: SupersededRow[];
  /** What was in the way. Non-empty means REFUSE, unless `replace` was given. */
  collisions: WindowCollision[];
};

export type ScheduleWindow = {
  startDate: string;
  endDate: string;
  /**
   * The weekdays this window GOVERNS - the ones whose layer-1 rows are carved
   * and whose dated rows count as collisions. Mode 2 passes its pattern
   * weekdays, so a therapist's Saturday row survives a Mon-Fri pattern. Mode 3
   * passes all seven, because its grid shows every date in the window and a day
   * left unset there is a stated "not working", not an omission.
   */
  weekdays: readonly number[];
};

/**
 * The columns `availability_templates_dedupe_uq` is built on (migration 0006),
 * minus the tenant and user, which are fixed for one call.
 *
 * NULLS NOT DISTINCT, so two rows with the same nulls collide rather than both
 * being allowed - which is what makes the reconciliation below necessary rather
 * than tidy.
 */
const dedupeKey = (r: CoverageRow): string =>
  [r.locationId, r.weekday, r.startTime, r.endTime, r.validFrom, r.validUntil].join("|");

/**
 * Everything a window does to the rows that already exist: what it carves, what
 * it cannot carve, and what it would supersede.
 *
 * PURE, AND DELIBERATELY DECIDES NOTHING. It reports collisions; the caller
 * refuses. That split is what lets the same function serve the refusal path and
 * the confirmed-replace path without a flag changing what it computes.
 */
export function planWindow(
  window: ScheduleWindow,
  existing: readonly CoverageRow[],
  opts: { replace?: boolean } = {},
): { carved: WindowCarve[]; deactivate: SupersededRow[]; collisions: WindowCollision[] } {
  const { startDate, endDate, weekdays } = window;
  const dayBefore = addDays(startDate, -1);
  const dayAfter = addDays(endDate, 1);

  const carved: WindowCarve[] = [];
  const collisions: WindowCollision[] = [];
  /** Keyed so a supersede can put back the tail of the row it retires. */
  const byId = new Map<string, CoverageRow>();

  for (const row of existing) {
    if (!weekdays.includes(row.weekday)) continue;
    if (!row.id) continue;
    // Ranges that cannot reach the window are not this window's business.
    if (row.validUntil && row.validUntil < startDate) continue;
    if (row.validFrom && row.validFrom > endDate) continue;

    // DATED WORK SOMEBODY ENTERED. Carving it is what used to invert it, and
    // silently rewriting one person's dated schedule from another mode is not a
    // thing this system does. It is reported, and superseded only on request.
    if (isSingleDayRow(row)) {
      byId.set(row.id, row);
      collisions.push({
        id: row.id,
        date: row.validFrom!,
        locationId: row.locationId,
        weekday: row.weekday,
        kind: "dated",
      });
      continue;
    }

    // A multi-day row that BEGINS inside the window has no head to keep, so
    // there is no bound that leaves it valid. Same treatment, same reason: the
    // alternative is writing valid_until before valid_from.
    if (row.validFrom && row.validFrom >= startDate) {
      byId.set(row.id, row);
      collisions.push({
        id: row.id,
        date: row.validFrom,
        locationId: row.locationId,
        weekday: row.weekday,
        kind: "starts_inside",
      });
      continue;
    }

    // The ordinary case, unchanged from SCHED-01: bound the row to the day
    // before, and resume an identical row after the window if it had a tail.
    // valid_from is null or strictly before startDate here - the branch above
    // took every other case - so dayBefore can never precede it.
    carved.push({
      id: row.id,
      validUntil: dayBefore,
      resume:
        row.validUntil && row.validUntil <= endDate
          ? null
          : {
              locationId: row.locationId,
              weekday: row.weekday,
              startTime: row.startTime,
              endTime: row.endTime,
              validFrom: dayAfter,
              validUntil: row.validUntil,
            },
    });
  }

  // COLLISIONS ARE STILL REPORTED WHEN REPLACING. The caller needs to know what
  // it superseded, for the audit trail and for the sentence it shows afterwards.
  const deactivate: SupersededRow[] = opts.replace
    ? collisions.map((c) => {
        const row = byId.get(c.id)!;
        // A row that outlived the window keeps its tail. A single-day row inside
        // the window has none by definition, so this is null for every "dated"
        // collision and only ever fires for "starts_inside".
        const hasTail = row.validUntil === null || row.validUntil > endDate;
        return {
          id: c.id,
          key: dedupeKey(row),
          resume: hasTail
            ? {
                locationId: row.locationId,
                weekday: row.weekday,
                startTime: row.startTime,
                endTime: row.endTime,
                validFrom: dayAfter,
                validUntil: row.validUntil,
              }
            : null,
        };
      })
    : [];

  return { carved, deactivate, collisions };
}

/**
 * The rows that WILL exist once a plan is applied: the untouched ones, the
 * carved ones with their new bound, the resumed ones and the new dated ones,
 * minus anything the plan deactivates.
 *
 * EXISTS SO THE INVARIANT CAN BE CHECKED BEFORE ANYTHING IS WRITTEN. Checking
 * afterwards would mean discovering a double-booked therapist inside a
 * transaction that has already half-run.
 */
export function projectedRows(
  existing: readonly CoverageRow[],
  plan: Pick<SchedulePlan, "created" | "carved" | "deactivate">,
): CoverageRow[] {
  const carveById = new Map(plan.carved.map((c) => [c.id, c]));
  const droppedById = new Map(plan.deactivate.map((d) => [d.id, d]));
  const out: CoverageRow[] = [];
  for (const row of existing) {
    const dropped = row.id ? droppedById.get(row.id) : undefined;
    if (dropped) {
      // Superseded: is_active = false, and its surviving tail put back.
      if (dropped.resume) out.push(dropped.resume);
      continue;
    }
    const carve = row.id ? carveById.get(row.id) : undefined;
    if (!carve) {
      out.push(row);
      continue;
    }
    out.push({ ...row, validUntil: carve.validUntil });
    if (carve.resume) out.push(carve.resume);
  }
  out.push(...plan.created);
  return out;
}


/**
 * Drop the churn: a row the plan would retire and then write back IDENTICALLY is
 * simply left alone.
 *
 * WITHOUT THIS, "SUBSTITUIR ESTA JANELA" WOULD FAIL ON ALMOST EVERY REAL USE,
 * and the reason is a constraint rather than anything visible in the feature.
 * `availability_templates_dedupe_uq` is UNIQUE on
 * (tenant, user, location, weekday, start_time, end_time, valid_from, valid_until)
 * and it does NOT include is_active. A retired row still occupies its key. So
 * deactivating a day and inserting the same day back would violate the
 * constraint and abort the whole save - and the ordinary use of replace is
 * correcting ONE day in a window while every other day is re-submitted exactly
 * as it was.
 *
 * IT IS ALSO THE RIGHT ANSWER INDEPENDENTLY OF THE CONSTRAINT. A day whose
 * schedule did not change should not be retired and re-created: that is two
 * writes, an audit trail implying a change nobody made, and a new row id for
 * something that never moved.
 */
function reconcileUnchanged(plan: SchedulePlan): SchedulePlan {
  if (plan.deactivate.length === 0 || plan.created.length === 0) return plan;
  const createdByKey = new Map(plan.created.map((r) => [dedupeKey(r), r]));
  const unchangedKeys = new Set<string>();
  const deactivate = plan.deactivate.filter((d) => {
    // Only a supersede with no tail can be an exact re-write: a row with a tail
    // is being genuinely restructured, so it is never "unchanged".
    if (d.resume !== null) return true;
    const key = d.key;
    if (key === undefined || !createdByKey.has(key)) return true;
    unchangedKeys.add(key);
    return false;
  });
  if (unchangedKeys.size === 0) return plan;
  return {
    ...plan,
    deactivate,
    created: plan.created.filter((r) => !unchangedKeys.has(dedupeKey(r))),
  };
}

/**
 * Apply the reconciliation to a finished plan. Both entry modes call this as
 * their last step, so neither can forget it.
 */
export function settlePlan(plan: SchedulePlan): SchedulePlan {
  return reconcileUnchanged(plan);
}

/**
 * Rows whose validity range runs backwards. Should always be empty.
 *
 * THIS IS A VERDICT-PATH GUARD, NOT A HELPER (1.3). The coverage invariant
 * cannot see an inverted row - validityIntersects is false for one against
 * everything - so a checker that returns "no violations" over a set containing
 * one is answering a question about rows it silently dropped. The server calls
 * this immediately before writing and THROWS on a non-empty result, so the class
 * of bug SCHED-05 was cannot come back quietly through a different door.
 */
export function invertedRows(rows: readonly CoverageRow[]): CoverageRow[] {
  return rows.filter((r) => r.validFrom !== null && r.validUntil !== null && r.validFrom > r.validUntil);
}
