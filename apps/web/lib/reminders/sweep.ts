import "server-only";
import { and, count, eq, gt, inArray, lt, lte, not, notExists, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { appointments, reminderClaims, reminderSweepPasses, type DbTx } from "@osteojp/db";

import { lisbonDateTimeToUtc, lisbonParts } from "@/lib/scheduling/time";
import { withReminderTenantContext } from "./context";
import { REMINDER_OFFSETS, type ReminderOffset } from "./offsets";
import { REMINDER_CLAIM_KIND, REMINDER_CLAIM_RELEASE_KIND } from "./reminder-claim";
import { REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER, hasSchedulingEvent, hasSchedulingEventAfter } from "./reminder-population";

/**
 * THE REMINDER SWEEP, IN SHADOW: every 15 minutes a pass reads the database,
 * picks the reminders that are due, and WRITES DOWN what it would hand to the
 * dispatcher. It hands nothing over.
 *
 * ==========================================================================
 * IT SENDS NOTHING, AND THAT IS BUILT IN, NOT SWITCHED OFF
 * ==========================================================================
 * There is no flag here that turns sending on. This file, and everything it
 * imports, has no path to the dispatcher (./dispatch.ts), to a transport
 * (./clients.ts), to a provider SDK or to the scheduler's event API. A pass
 * writes shadow rows in `reminder_claims` and its heartbeat in
 * `reminder_sweep_passes`, and nothing else: no ledger row, no claim, no
 * release, no audit row, no event. sweep.test.ts walks the imports with the
 * compiler's own parser, and sweep.db.test.ts runs passes against a real
 * Postgres with the transports replaced by spies and reads back everything a
 * send would have left.
 *
 * The reminders patients receive are still sent by the sleeping job of today
 * (send-appointment-reminder), untouched by this file.
 *
 * ==========================================================================
 * WHAT A PASS TAKES (`sweepStartRange`, `selectDueMarks`)
 * ==========================================================================
 * Per tenant, inside the reminder job's own context (./context.ts), for each
 * offset of ./offsets.ts, a visit whose:
 *
 *   - mark is due: the start minus the offset is at or before the pass's
 *     clock. The day's last pass (21:45 Lisbon) also takes the marks that fall
 *     due before 23:00, because the next pass is at 07:00;
 *   - start is still ahead of the pass's clock;
 *   - status is scheduled or confirmed (the dispatcher's REMINDABLE_STATUSES);
 *   - row was created before its mark. A visit booked inside the lead time
 *     never had this reminder (computeDueReminders drops a mark already past);
 *   - audit trail holds a save that handed it to the reminder job, unless the
 *     switch of ./reminder-population.ts says every visit counts. THE SWITCH IS
 *     OFF AND THE QUESTION IS THE OWNER'S. The predicate and the switch are
 *     that file's, read here and decided nowhere else;
 *   - audit trail holds NO such save written after the mark (R24, below);
 *   - mark the sweep has not taken yet for the start the visit has now (next
 *     section).
 *
 * At most SWEEP_MARK_CEILING marks a pass, oldest mark first. More than that
 * is recorded on the heartbeat and logged, and the rest waits for the next
 * pass.
 *
 * NO LATE LIMIT IN THE SELECTION. A mark is taken however long ago it fell
 * due, as long as the visit is ahead, and the row records how many minutes
 * late it was taken. How late a reminder may still GO OUT is the dispatcher's
 * (the owner's late rule, ./sweep-send.ts). The first passes after the sweep
 * is switched on therefore take every mark of the next two days at once, 50 a
 * pass.
 *
 * ==========================================================================
 * NO GRACE FOR A VISIT SAVED AFTER ITS MARK (strategy's ruling R24)
 * ==========================================================================
 * R24, its intent: "S5 grace = none. GATE: a visit saved after its mark and
 * before the pass gets no shadow row and no send; a visit saved before its
 * mark is unchanged." S5 is the shadow-only label of the 10-29 compare
 * (docs/read-shadow-compare-20261029.md): the sweep took a mark the sleeping
 * job never claimed, because the save that put the visit at this start, or
 * accepted it, came after the mark, and the job it re-armed dropped the past
 * mark (computeDueReminders). R24 makes the sweep do the same.
 *
 * So a mark is NOT taken while the visit's audit trail holds a SCHEDULING SAVE
 * (the rows `hasSchedulingEvent` reads, ./reminder-population.ts) whose
 * `created_at` is STRICTLY AFTER the mark. A save written AT the mark exactly
 * counts as before it: that visit is taken as it always was. One save after
 * the mark is enough, whatever came before it: a visit booked early and moved
 * TO this start after the mark is the S5 case itself.
 *
 * Not taken means not taken at all, for that start: no shadow row, no send, by
 * this pass or any later one. It is not counted as due, and nothing records
 * it. A save that is not a scheduling save (an `appointment.update` with no
 * `toStatus` of scheduled or confirmed, and not the acceptance of a request)
 * changes nothing.
 *
 * WIDER THAN S5, AND KNOWN. The scheduling saves are wider than the saves
 * that re-arm the sleeping job (./reminder-population.ts says where): a status
 * set to Confirmada by hand, or a reschedule that keeps the start, is one too.
 * So a visit booked well before its mark and confirmed by hand, or given
 * another therapist, after the mark but before the pass that would take it
 * gets no reminder for that mark, where the sleeping job, which woke at the
 * mark itself, sent one. For a mark inside the passes' hours (07:00 to 21:45,
 * every 15 minutes) the gap is at most the 15 minutes to the next pass, longer
 * only when a pass fails or is over the ceiling.
 *
 * "Before the pass" is read as before the mark was first HANDED OVER. The
 * shadow takes a mark once (its own row), so for it the two readings are one.
 * The sending pass retries a reminder that was held back (the owner's rule):
 * there a save written after a claim of this mark was taken does not stop the
 * retry (./sweep-send.ts, `selectSendableMarks`).
 *
 * ==========================================================================
 * A MARK IS TAKEN ONCE: THE SWEEP'S OWN RECORD, NOT THE OUTCOME
 * ==========================================================================
 * A pass leaves a mark alone when THE SWEEP already has a record of it for
 * this appointment, offset, channel and START:
 *
 *   - its shadow row (today, while it sends nothing); or
 *   - a live claim it took itself (taker `sweep`, not `early`, no release
 *     naming it), which is what it will leave once it sends.
 *
 * WHATEVER HAPPENED AFTERWARDS. Sent, suppressed, refused, or nothing on
 * record: the mark is not selected again. This is NOT the list of
 * ./reminder-claim.ts that decides when a second SENDER is held
 * (BLOCKING_LEDGER_OUTCOMES, one word, `sent`). Under that list a suppressed
 * reminder is asked again by every caller; a pass that used it would select a
 * suppressed mark every 15 minutes until the visit began.
 *
 * A CLAIM OF THE SLEEPING JOB DOES NOT TAKE A MARK FROM THE SHADOW. While the
 * sweep is in shadow the sleeping job still wakes at the mark and claims it,
 * so nearly every mark has a `run` claim by the time a pass reads. A shadow
 * that stepped aside for those would record almost nothing, and the point of
 * the shadow is to compare: every mark the sleeping job claimed should have a
 * shadow row beside it, and a shadow row with no `run` claim is a reminder the
 * sleeping job never sent.
 *
 * The key carries the start, as a claim's does: a visit moved to another time
 * is a new mark.
 *
 * TWO THINGS THIS RULE DOES NOT SETTLE, both waiting for a ruling and neither
 * reachable while nothing is sent: whether a suppression is final for its
 * start (a visit put right after its mark), and what a pass does with a mark
 * the sleeping job already claimed once the sweep is the sender.
 *
 * ==========================================================================
 * WHAT A SHADOW ROW MEANS
 * ==========================================================================
 * "The sweep would have handed this reminder to the dispatcher now." NOT "a
 * message would have gone out": the dispatcher asks gates this selection does
 * not (an online request nobody accepted, a deleted patient, a channel the
 * patient turned off, a missing number).
 *
 * ==========================================================================
 * THE HEARTBEAT
 * ==========================================================================
 * Every pass writes one row per tenant in `reminder_sweep_passes`, in the same
 * transaction as that tenant's shadow rows, with the counts of the pass. The
 * table's `tenant_id` is NOT NULL, so there is no row for "the pass" as a
 * whole. A pass that could not finish for a tenant leaves no heartbeat for it,
 * which is the signal.
 *
 * ==========================================================================
 * WHERE THE ROWS ARE KEPT
 * ==========================================================================
 * In the sweep's own two tables, never in `audit_log`: 60 heartbeats a day and
 * a shadow row per reminder are operational bookkeeping, not part of the
 * record of who did what. Both tables take a row from the reminder job's own
 * session only and let nobody update or delete one. A shadow row goes with its
 * appointment; a heartbeat names no appointment and outlives them all.
 */

/**
 * Every 15 minutes from 07:00 to 21:45, Lisbon time: 60 passes a day. Declared
 * in the scheduler's own zone, like the retention cron, so the passes keep
 * their wall-clock hours across both clock changes.
 */
export const SWEEP_CRON = "TZ=Europe/Lisbon */15 7-21 * * *";

/** The day's last pass, as minutes after Lisbon midnight: 21:45. */
export const SWEEP_LAST_PASS_MINUTES = 21 * 60 + 45;

/**
 * The day's last pass also takes the marks that fall due BEFORE this Lisbon
 * time. 75 minutes ahead and no further: the next pass is at 07:00, and a
 * reminder nine hours early could tell a patient "tomorrow" on the wrong day.
 */
export const SWEEP_LAST_PASS_TAKES_MARKS_BEFORE = "23:00";

/** At most this many marks a pass, over every tenant and both offsets. */
export const SWEEP_MARK_CEILING = 50;

/** The kind of a shadow row in `reminder_claims`: one per mark a pass would have handed over. */
export const SWEEP_SHADOW_KIND = "shadow";

/**
 * The mode a heartbeat is written with. The table's list also holds `send`,
 * for the pass that will hand reminders over; nothing here can write it.
 */
export const SWEEP_PASS_MODE = "shadow";

/**
 * The statuses a reminder is still sent for: the dispatcher's
 * REMINDABLE_STATUSES (dispatch.ts), which that file does not export and this
 * one must not import. sweep.test.ts reads dispatch.ts and fails if the two
 * differ.
 */
export const SWEEP_REMINDABLE_STATUSES = ["scheduled", "confirmed"] as const;

/**
 * How long a pass may wait, in Postgres's own units: two seconds for a lock,
 * twenty for any one statement. A pass that cannot get on gives up, leaves no
 * heartbeat, and the next one starts fresh 15 minutes later.
 */
export const SWEEP_LOCK_TIMEOUT = "2s";
export const SWEEP_STATEMENT_TIMEOUT = "20s";

/* ------------------------------------------------------------------ */
/* The ranges. Pure: `now` is passed in.                               */
/* ------------------------------------------------------------------ */

/**
 * Up to which instant a pass at `now` takes marks, when it looks ahead at all.
 * Only the day's last pass does: from 21:45 Lisbon until 23:00 Lisbon it
 * answers 23:00 of that Lisbon day. Any other time answers null, and the pass
 * takes the marks at or before `now`.
 *
 * 23:00 is turned into an instant with the zone's offset AT THAT INSTANT
 * (lisbonDateTimeToUtc), so the two days a year the clocks change are right:
 * by 21:45 the change of that morning has happened, and the offset of the
 * day's midnight would be an hour out.
 */
export function sweepLookAheadLimit(now: Date): Date | null {
  const { date, hour, minute } = lisbonParts(now);
  if (hour * 60 + minute < SWEEP_LAST_PASS_MINUTES) return null;
  const limit = lisbonDateTimeToUtc(date, SWEEP_LAST_PASS_TAKES_MARKS_BEFORE);
  return limit.getTime() > now.getTime() ? limit : null;
}

/**
 * The starts one offset's due marks have, for a pass at `now`.
 *
 * A mark is the start minus the offset in ELAPSED time, the same arithmetic as
 * `reminderMark` and `computeDueReminders`: 24 hours before, not "the same
 * time yesterday". So the range is two instants and one flag:
 *
 *   after           the visit is still ahead: its start is AFTER `now`;
 *   limit           the mark is due: the start is at or before `now` plus the
 *                   offset. For the day's last pass the limit is 23:00 plus the
 *                   offset and is NOT included: a mark due at 23:00 exactly
 *                   belongs to the morning.
 */
export type SweepStartRange = { after: Date; limit: Date; limitIncluded: boolean };

export function sweepStartRange(now: Date, offset: Pick<ReminderOffset, "minutesBefore">): SweepStartRange {
  const lookAhead = sweepLookAheadLimit(now);
  const dueAt = lookAhead ?? now;
  return {
    after: now,
    limit: new Date(dueAt.getTime() + offset.minutesBefore * 60_000),
    limitIncluded: lookAhead === null,
  };
}

/* ------------------------------------------------------------------ */
/* The selection                                                       */
/* ------------------------------------------------------------------ */

/**
 * The start of the enclosing `appointments` row as a claim and a shadow row
 * store it: to the millisecond, which is all a sender's clock carries.
 * Truncated on THIS side, as in reminder-numbers.ts, so the row's own column
 * stays bare for `reminder_claims_mark_idx`.
 */
export function recordedStart(): SQL {
  return sql`date_trunc('milliseconds', ${appointments.startsAt})`;
}

/** The mark of the enclosing `appointments` row for one offset. */
function markOf(offset: ReminderOffset): SQL {
  return sql`${appointments.startsAt} - make_interval(mins => ${offset.minutesBefore}::int)`;
}

/**
 * The visits whose mark for this offset is due, before asking who is owed a
 * reminder and before asking whether the mark was taken. The tenant is stated
 * although the job's context already narrows to it (CLAUDE.md rule 3).
 */
export function dueVisits(tenantId: string, offset: ReminderOffset, now: Date): SQL | undefined {
  const range = sweepStartRange(now, offset);
  return and(
    eq(appointments.tenantId, tenantId),
    inArray(appointments.status, [...SWEEP_REMINDABLE_STATUSES]),
    gt(appointments.startsAt, range.after),
    range.limitIncluded ? lte(appointments.startsAt, range.limit) : lt(appointments.startsAt, range.limit),
    sql`${appointments.createdAt} < ${markOf(offset)}`,
  );
}

/**
 * R24: NO SCHEDULING SAVE OF THE VISIT WAS WRITTEN AFTER THIS MARK. Strictly
 * after: a save at the mark exactly does not count. See the header.
 *
 * `handedOverAtOrBefore` is the sending pass's: a save it holds for (the mark
 * was already handed over at or before that save) does not count either. The
 * shadow passes none.
 */
export function notSavedAfterMark(
  tx: DbTx,
  offset: ReminderOffset,
  handedOverAtOrBefore?: (savedAt: SQL) => SQL,
): SQL {
  return not(hasSchedulingEventAfter(tx, markOf(offset), handedOverAtOrBefore));
}

/**
 * THE SWEEP HAS NOT TAKEN THIS MARK for the start the visit has now: no shadow
 * row of its own, and no live claim of its own. See the header for why the
 * outcome is not asked, and why a claim of the sleeping job is not looked at.
 */
function notTakenBySweep(tx: DbTx, tenantId: string, offset: ReminderOffset): SQL | undefined {
  const shadow = alias(reminderClaims, "reminder_sweep_shadow");
  const claim = alias(reminderClaims, "reminder_sweep_claim");
  const release = alias(reminderClaims, "reminder_sweep_claim_release");
  const start = recordedStart();
  return and(
    notExists(
      tx
        .select({ one: sql`1` })
        .from(shadow)
        .where(
          and(
            eq(shadow.tenantId, tenantId),
            eq(shadow.appointmentId, appointments.id),
            eq(shadow.kind, SWEEP_SHADOW_KIND),
            eq(shadow.offsetId, offset.id),
            eq(shadow.channel, offset.channel),
            eq(shadow.startsAt, start),
          ),
        ),
    ),
    notExists(
      tx
        .select({ one: sql`1` })
        .from(claim)
        .where(
          and(
            eq(claim.tenantId, tenantId),
            eq(claim.appointmentId, appointments.id),
            eq(claim.kind, REMINDER_CLAIM_KIND),
            eq(claim.taker, "sweep"),
            eq(claim.offsetId, offset.id),
            eq(claim.channel, offset.channel),
            eq(claim.startsAt, start),
            sql`${claim.early} is distinct from true`,
            notExists(
              tx
                .select({ one: sql`1` })
                .from(release)
                .where(
                  and(
                    eq(release.tenantId, tenantId),
                    eq(release.appointmentId, appointments.id),
                    eq(release.kind, REMINDER_CLAIM_RELEASE_KIND),
                    eq(release.claimId, claim.id),
                  ),
                ),
            ),
          ),
        ),
    ),
  );
}

/** One mark a pass would hand to the dispatcher. Ids and instants, no person. */
export type DueMark = {
  appointmentId: string;
  offsetId: ReminderOffset["id"];
  channel: ReminderOffset["channel"];
  startsAt: Date;
  /** The start minus the offset. */
  mark: Date;
  /** Whole minutes from the mark to the pass. Negative when the day's last pass took it ahead. */
  minutesAfterMark: number;
  /**
   * The visit's row was saved after this mark (its `updated_at`). Recorded, not
   * acted on: a SCHEDULING save after the mark keeps the mark from being taken
   * at all (R24), so a mark taken with this true was saved after it by
   * something else, an edit the reminder job is not told of.
   */
  savedAfterMark: boolean;
};

export type DueMarks = {
  /** The marks this pass takes: at most `limit`, oldest mark first. */
  marks: DueMark[];
  /** Every mark that was due and not yet taken, the ones over `limit` included. */
  due: number;
  /**
   * Due marks left out because the visit never had a reminder. A count of what
   * is due NOW, so the same visit is counted again by the next pass: a level,
   * not a total. Null when the switch is on and nothing is left out.
   */
  neverRemindedLeftOut: number | null;
};

/**
 * THE SWEEP'S SELECTION for one tenant, read inside the caller's transaction.
 * It reads and decides nothing else: writing the rows is `sweepTenantInShadow`.
 *
 * `includeNeverReminded` is the switch of ./reminder-population.ts, and that
 * constant is its value everywhere but in a test.
 */
export async function selectDueMarks(
  tx: DbTx,
  args: { tenantId: string; now: Date; limit: number; includeNeverReminded?: boolean },
): Promise<DueMarks> {
  const includeNeverReminded = args.includeNeverReminded ?? REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER;
  const limit = Math.max(0, Math.floor(args.limit));
  const marks: DueMark[] = [];
  let due = 0;
  let leftOut = 0;

  for (const offset of REMINDER_OFFSETS) {
    const selectable = and(
      dueVisits(args.tenantId, offset, args.now),
      includeNeverReminded ? undefined : hasSchedulingEvent(tx),
      notSavedAfterMark(tx, offset),
      notTakenBySweep(tx, args.tenantId, offset),
    );

    const [counted] = await tx.select({ n: count() }).from(appointments).where(selectable);
    due += Number(counted?.n ?? 0);

    if (!includeNeverReminded) {
      const [out] = await tx
        .select({ n: count() })
        .from(appointments)
        .where(and(dueVisits(args.tenantId, offset, args.now), not(hasSchedulingEvent(tx))));
      leftOut += Number(out?.n ?? 0);
    }

    if (limit === 0) continue;
    // Oldest mark first. Within one offset that is the earliest start; the
    // two offsets are merged by mark below.
    const rows = await tx
      .select({ id: appointments.id, startsAt: appointments.startsAt, updatedAt: appointments.updatedAt })
      .from(appointments)
      .where(selectable)
      .orderBy(appointments.startsAt, appointments.id)
      .limit(limit);
    for (const row of rows) {
      const mark = new Date(row.startsAt.getTime() - offset.minutesBefore * 60_000);
      marks.push({
        appointmentId: row.id,
        offsetId: offset.id,
        channel: offset.channel,
        startsAt: row.startsAt,
        mark,
        minutesAfterMark: Math.floor((args.now.getTime() - mark.getTime()) / 60_000),
        savedAfterMark: row.updatedAt.getTime() > mark.getTime(),
      });
    }
  }

  marks.sort(
    (a, b) =>
      a.mark.getTime() - b.mark.getTime() ||
      a.appointmentId.localeCompare(b.appointmentId) ||
      a.offsetId.localeCompare(b.offsetId),
  );
  return {
    marks: marks.slice(0, limit),
    due,
    neverRemindedLeftOut: includeNeverReminded ? null : leftOut,
  };
}

/* ------------------------------------------------------------------ */
/* One tenant's pass                                                   */
/* ------------------------------------------------------------------ */

/** Tenant only. Never table-global. */
export function sweepLockPayload(tenantId: string): string {
  return `reminder-sweep:${tenantId}`;
}

/**
 * What one tenant's pass did. Counts and booleans only: it crosses the
 * scheduler's step boundary as JSON, and it is what the pass logs.
 */
export type SweepTenantOutcome = {
  /** Marks due and not yet taken when the pass read. */
  due: number;
  /** Shadow rows written. */
  recorded: number;
  /** More was due than the pass was allowed to take. */
  overCeiling: boolean;
};

/**
 * ONE TENANT'S PASS, IN SHADOW. One transaction as the reminder job: bound the
 * waits, take the tenant's sweep lock, select, write one shadow row per mark
 * taken, write the heartbeat.
 *
 * The lock makes two passes of one tenant queue, so the second reads the
 * first's shadow rows and takes nothing twice. It is transaction-scoped, the
 * pattern of the reminder claim.
 *
 * IT THROWS when anything fails, and the transaction rolls back: no shadow row
 * and no heartbeat for this tenant. The caller logs it and goes on to the next
 * tenant. Nothing a patient receives depends on this function.
 */
export async function sweepTenantInShadow(args: {
  tenantId: string;
  /** The pass's clock. Every instant the selection compares against comes from it. */
  now: Date;
  /** How many marks this tenant may still take: the ceiling less what earlier tenants took. */
  limit: number;
  /** The scheduler's id for the run, so the rows of one pass can be read together. */
  passId?: string;
  /** The switch of ./reminder-population.ts. Passed by tests only. */
  includeNeverReminded?: boolean;
}): Promise<SweepTenantOutcome> {
  // The tables take a pass id or none, never a blank one.
  const passId = args.passId || null;
  return withReminderTenantContext(args.tenantId, async (tx): Promise<SweepTenantOutcome> => {
    await tx.execute(
      sql`select set_config('lock_timeout', ${SWEEP_LOCK_TIMEOUT}, true), set_config('statement_timeout', ${SWEEP_STATEMENT_TIMEOUT}, true)`,
    );
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${sweepLockPayload(args.tenantId)}, 0))`);

    const selected = await selectDueMarks(tx, args);

    // One row per mark taken: ids, enums, instants and counts, and nobody's
    // name. The mark is stored as `due_at`, as the offset defines it today.
    const shadowRows = selected.marks.map((m) => ({
      tenantId: args.tenantId,
      appointmentId: m.appointmentId,
      kind: SWEEP_SHADOW_KIND,
      offsetId: m.offsetId,
      channel: m.channel,
      startsAt: m.startsAt,
      dueAt: m.mark,
      minutesAfterMark: m.minutesAfterMark,
      savedAfterMark: m.savedAfterMark,
      passId,
    }));
    if (shadowRows.length > 0) await tx.insert(reminderClaims).values(shadowRows);

    const outcome: SweepTenantOutcome = {
      due: selected.due,
      recorded: shadowRows.length,
      overCeiling: selected.due > shadowRows.length,
    };
    await tx.insert(reminderSweepPasses).values({
      tenantId: args.tenantId,
      passId,
      mode: SWEEP_PASS_MODE,
      passAt: args.now,
      lookAheadBefore: sweepLookAheadLimit(args.now),
      // The count and the rows are two reads of one transaction, and a visit
      // saved between them can make the rows one more than the count. The
      // table holds "recorded is never more than due", so the heartbeat says
      // at least what was recorded rather than lose the whole pass to it.
      dueCount: Math.max(outcome.due, outcome.recorded),
      recordedCount: outcome.recorded,
      overCeiling: outcome.overCeiling,
      // With the switch on nothing is left out, and the count says so: 0.
      excludedCount: selected.neverRemindedLeftOut ?? 0,
    });
    return outcome;
  });
}

/* ------------------------------------------------------------------ */
/* The pass                                                            */
/* ------------------------------------------------------------------ */

/**
 * Runs one named unit of work. The scheduler's `step.run` in production, so a
 * tenant that was swept is not swept again when the run is resumed; a plain
 * call in tests.
 */
export type SweepStep = <T>(id: string, fn: () => Promise<T>) => Promise<T>;

const runInline: SweepStep = (_id, fn) => fn();

export const SWEEP_LOG_PREFIX = "[reminders] sweep:";

export type SweepPassOutcome = {
  mode: "shadow";
  tenants: number;
  failedTenants: number;
  due: number;
  recorded: number;
  overCeiling: boolean;
};

/** A pass that could not finish for every tenant. Counts only. */
export class ReminderSweepError extends Error {
  constructor(public readonly outcome: SweepPassOutcome) {
    super(`reminder sweep: ${outcome.failedTenants} of ${outcome.tenants} tenant(s) could not be swept`);
    this.name = "ReminderSweepError";
  }
}

export type SweepDeps = {
  /**
   * Every tenant's id. Injected: this file holds no connection that can read
   * across tenants, and which one may is not this file's to decide.
   */
  listTenantIds: () => Promise<string[]>;
  step?: SweepStep;
  passId?: string;
  /** The clock, read once per tenant INSIDE its step, so a resumed run keeps the instant it used. */
  now?: () => Date;
  sweepTenant?: typeof sweepTenantInShadow;
  log?: (line: string) => void;
  alarm?: (line: string) => void;
};

/**
 * ONE PASS: list the tenants, sweep each in its own step and its own
 * transaction, never more than SWEEP_MARK_CEILING marks in all.
 *
 * A tenant that fails does not stop the others. When any failed, the pass
 * throws AFTER the last tenant, so the run shows as failed where the owner
 * looks; the function is declared with no retries, and the next pass is 15
 * minutes away.
 *
 * LOGS COUNTS ONLY, and a tenant id on a failure (rule 7).
 */
export async function runReminderSweep(deps: SweepDeps): Promise<SweepPassOutcome> {
  const step = deps.step ?? runInline;
  const clock = deps.now ?? (() => new Date());
  const sweepTenant = deps.sweepTenant ?? sweepTenantInShadow;
  const log = deps.log ?? ((line: string) => console.info(line));
  const alarm = deps.alarm ?? ((line: string) => console.error(line));

  const tenantIds = await step("list-tenants", () => deps.listTenantIds());
  const outcome: SweepPassOutcome = {
    mode: "shadow",
    tenants: tenantIds.length,
    failedTenants: 0,
    due: 0,
    recorded: 0,
    overCeiling: false,
  };

  for (const tenantId of tenantIds) {
    const limit = Math.max(0, SWEEP_MARK_CEILING - outcome.recorded);
    try {
      const swept = await step(`sweep-tenant-${tenantId}`, () =>
        sweepTenant({ tenantId, now: clock(), limit, passId: deps.passId }),
      );
      outcome.due += swept.due;
      outcome.recorded += swept.recorded;
      outcome.overCeiling = outcome.overCeiling || swept.overCeiling;
    } catch (e) {
      outcome.failedTenants += 1;
      alarm(`${SWEEP_LOG_PREFIX} tenant FAILED tenantId=${tenantId}: ${e instanceof Error ? e.name : "unknown"}`);
    }
  }

  log(
    `${SWEEP_LOG_PREFIX} mode=${outcome.mode} tenants=${outcome.tenants} failed=${outcome.failedTenants} ` +
      `due=${outcome.due} recorded=${outcome.recorded}`,
  );
  if (outcome.overCeiling) {
    alarm(
      `${SWEEP_LOG_PREFIX} OVER THE CEILING due=${outcome.due} recorded=${outcome.recorded} ceiling=${SWEEP_MARK_CEILING}`,
    );
  }
  if (outcome.failedTenants > 0) throw new ReminderSweepError(outcome);
  return outcome;
}
