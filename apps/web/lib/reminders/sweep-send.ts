import "server-only";
import { and, count, eq, gt, gte, lt, min, ne, not, notExists, sql, type SQL } from "drizzle-orm";
import { alias, type PgColumn } from "drizzle-orm/pg-core";
import { appointments, reminderClaims, reminderDispatches, reminderSweepPasses, type DbTx } from "@osteojp/db";

import { withReminderTenantContext } from "./context";
import { REMINDER_LATE_LIMIT_MS, dispatchReminder, reminderWasHandedOver } from "./dispatch";
import { REMINDER_OFFSETS, type ReminderOffset } from "./offsets";
import { REMINDER_CLAIM_KIND, REMINDER_CLAIM_RELEASE_KIND } from "./reminder-claim";
import { REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER, hasSchedulingEvent } from "./reminder-population";
import {
  SWEEP_LOG_PREFIX,
  SWEEP_MARK_CEILING,
  SWEEP_STATEMENT_TIMEOUT,
  dueVisits,
  recordedStart,
  sweepLookAheadLimit,
  type SweepStep,
} from "./sweep";
import { sweepRemindsNeverReminded } from "./sweep-mode";

/**
 * SWEEP-47. THE REMINDER SWEEP AS THE SENDER: a pass reads the database, picks
 * the reminders that are due, and hands each one to the dispatcher.
 *
 * ==========================================================================
 * IT RUNS ONLY BEHIND THE SEND SWITCH
 * ==========================================================================
 * The scheduled function (./inngest/sweep.ts) calls `runReminderSweepSend`
 * only while REMINDERS_SWEEP_MODE is exactly `send` (./sweep-mode.ts). Unset,
 * or anything else, it calls the shadow pass of ./sweep.ts, which has no path
 * to a sender. This file is the path, and it is its own file so that one stays
 * provable by reading the other's imports.
 *
 * ==========================================================================
 * WHAT A SENDING PASS TAKES (`selectSendableMarks`)
 * ==========================================================================
 * The due marks the shadow takes (./sweep.ts, `dueVisits`): the mark is due,
 * the visit is still ahead, scheduled or confirmed, created before its mark,
 * and saved by the clinic unless the second switch says every visit counts.
 * Then, instead of the shadow's own record:
 *
 *   - NO LIVE CLAIM for the start the visit has now, of either sender. A live
 *     claim is a reminder that was sent, is being sent, or whose outcome is
 *     unknown. ONLY THAT IS FINAL. A claim its sender gave up (a release names
 *     it) is a reminder that was held back, and it is taken again;
 *   - NO CLAIM TAKEN IN THE LAST HOUR for that start, released or not. A
 *     reminder that was held back is tried again once an hour, not once every
 *     15 minutes: each try leaves a claim, a release and a ledger row.
 *
 * An `early` claim counts for neither, as everywhere: it was taken over ten
 * minutes before this start's mark, by a job that woke at an older time. The
 * shadow's own rows count for neither as well: a shadow row sent nothing.
 *
 * ONLY A MARK THAT FELL DUE SINCE THE SWEEP BEGAN TO SEND FOR THE TENANT
 * (`readSweepFloor`): at or after the first heartbeat of mode `send` that
 * comes after the tenant's last heartbeat of any other mode. So the floor is
 * the first pass of THIS spell of sending, and a tenant with no such heartbeat
 * is not swept: the pass writes one and starts from there.
 *
 * WHY THE FLOOR IS THE MOMENT THE SWITCH WAS TURNED. Until then the sleeping
 * job sent every reminder under the rules of today, and what those rules leave
 * on record does not mean what the closed rules read into it:
 *
 *   - a reminder the sleeping job HELD BACK (a request not accepted, a channel
 *     off, live send off) kept its claim: today only a throw gives a claim up.
 *     To a sending pass that claim is live, so the reminder is never retried;
 *   - a reminder the sleeping job SENT WHILE THE CLAIM STORE FAILED has no
 *     claim at all: today a claim that cannot be written does not stop a send.
 *     To a sending pass that reminder was never sent, and it would send it a
 *     second time;
 *   - and a reminder sent before claims existed has none either.
 *
 * With the floor at the first sending heartbeat no pass ever takes a mark from
 * before the switch, so none of the three can be read wrongly: EVERYTHING THAT
 * FELL DUE BEFORE THE SWITCH WAS TURNED STAYS WITH THE SLEEPING JOB, AS IT WAS
 * HANDLED. What that costs, once, each time the switch is turned on: a
 * reminder that was held back before the switch is not retried by the sweep
 * (nothing retries it today either), and the first sending pass sends nothing.
 * Turning the switch off and on again starts a new spell and a new floor.
 *
 * WHAT THE FLOOR CANNOT COVER: a sleeping job of the OLD deploy still in the
 * middle of a send at the instant the switch turns, for a mark that falls due
 * at or after the first sending heartbeat, while the claim store is failing.
 * It needs an old instance alive after a whole pass of the new one.
 *
 * THE LATE RULE (owner, answer 8a). A mark is taken while the visit is ahead,
 * however long ago it fell due, and the DISPATCHER decides, ON ITS OWN CLOCK AT
 * THE MOMENT OF THE SEND: up to 3 hours late for an SMS and 12 for an email it
 * may still go out; later it is recorded as too late (`mark_missed`), not
 * sent, and never taken again. So a reminder that was held back is tried again
 * only inside that limit. THE PASS'S CLOCK DECIDES NOTHING ABOUT LATENESS: it
 * is read once, with the selection, and a send step may run long after it.
 *
 * At most SWEEP_MARK_CEILING marks a pass over every tenant. THE MARKS THAT
 * MAY STILL GO OUT COME FIRST, oldest first; the marks that are only to be
 * recorded as too late come after them, so a backlog of those never delays a
 * reminder that can still be sent.
 *
 * ==========================================================================
 * WHAT IT DOES WITH A MARK: ONE STEP, ONE CALL OF THE DISPATCHER
 * ==========================================================================
 * `dispatchReminder`, as the taker `sweep`. The dispatcher is the one door:
 * it takes the claim (closed, ./reminder-claim.ts), asks every gate, sends,
 * and writes the ledger. A pass decides nothing about a patient that the
 * sleeping job's call would not decide the same way.
 *
 * Each mark is its own step and catches its own error, so one reminder that
 * fails does not stop the next, and a resumed run does not hand over a mark it
 * already handed over. A second pass at the same moment is harmless: both pick
 * the same mark, the claim lets one through, the other answers `claim_held`.
 *
 * ==========================================================================
 * THE HEARTBEAT
 * ==========================================================================
 * One row per tenant per pass in `reminder_sweep_passes`, mode `send`, written
 * AFTER the tenant's marks. `recorded_count` is the marks handed to the
 * dispatcher. What became of each is in the ledger and in the pass's log line;
 * the table has no column for it.
 *
 * ==========================================================================
 * A CLAIM WITH NOTHING AFTER IT (`readUnsettledClaims`)
 * ==========================================================================
 * The dispatcher writes its claim before it sends. If the process dies between
 * the two (a deploy, a timeout), the claim stays live and no ledger row
 * follows it. Nobody takes that reminder again, which is right: whether the
 * message left is not known, and an unknown outcome is never sent twice. But
 * nothing said so. Every sending pass now counts those claims for the tenant,
 * logs the count, and names their appointments on the alarm line, at every
 * pass until the visit begins. IT READS AND REPORTS. It releases nothing and
 * sends nothing.
 */

/** A reminder that was held back is taken again no sooner than this after its last claim. */
export const SWEEP_RETRY_AFTER_MS = 60 * 60_000;

/** The mode a sending pass writes on its heartbeat. The table's list holds it. */
export const SWEEP_SEND_PASS_MODE = "send";

/* ------------------------------------------------------------------ */
/* The selection                                                       */
/* ------------------------------------------------------------------ */

/**
 * NOT SETTLED AND NOT JUST TRIED, for the start the visit has now. See the
 * header. Both reads are of claims only, of either taker.
 */
function notSettledNorJustTried(tx: DbTx, tenantId: string, offset: ReminderOffset, now: Date): SQL | undefined {
  const live = alias(reminderClaims, "reminder_send_live_claim");
  const release = alias(reminderClaims, "reminder_send_live_claim_release");
  const recent = alias(reminderClaims, "reminder_send_recent_claim");
  const start = recordedStart();
  const claimOfThisMark = (
    t: Record<"tenantId" | "appointmentId" | "kind" | "offsetId" | "channel" | "startsAt" | "early", PgColumn>,
  ) =>
    and(
      eq(t.tenantId, tenantId),
      eq(t.appointmentId, appointments.id),
      eq(t.kind, REMINDER_CLAIM_KIND),
      eq(t.offsetId, offset.id),
      eq(t.channel, offset.channel),
      eq(t.startsAt, start),
      sql`${t.early} is distinct from true`,
    );
  return and(
    notExists(
      tx
        .select({ one: sql`1` })
        .from(live)
        .where(
          and(
            claimOfThisMark(live),
            notExists(
              tx
                .select({ one: sql`1` })
                .from(release)
                .where(
                  and(
                    eq(release.tenantId, tenantId),
                    eq(release.appointmentId, appointments.id),
                    eq(release.kind, REMINDER_CLAIM_RELEASE_KIND),
                    eq(release.claimId, live.id),
                  ),
                ),
            ),
          ),
        ),
    ),
    notExists(
      tx
        .select({ one: sql`1` })
        .from(recent)
        .where(and(claimOfThisMark(recent), gt(recent.createdAt, new Date(now.getTime() - SWEEP_RETRY_AFTER_MS)))),
    ),
  );
}

/**
 * THE FLOOR: the first heartbeat of mode `send` after the tenant's last
 * heartbeat of any other mode. Null when the tenant has no sending heartbeat
 * since then: the sweep has not begun to send for it. See the header.
 */
export async function readSweepFloor(tx: DbTx, tenantId: string): Promise<Date | null> {
  const other = alias(reminderSweepPasses, "reminder_sweep_pass_of_another_mode");
  const [row] = await tx
    .select({ first: min(reminderSweepPasses.passAt) })
    .from(reminderSweepPasses)
    .where(
      and(
        eq(reminderSweepPasses.tenantId, tenantId),
        eq(reminderSweepPasses.mode, SWEEP_SEND_PASS_MODE),
        notExists(
          tx
            .select({ one: sql`1` })
            .from(other)
            .where(
              and(
                eq(other.tenantId, tenantId),
                ne(other.mode, SWEEP_SEND_PASS_MODE),
                gte(other.passAt, reminderSweepPasses.passAt),
              ),
            ),
        ),
      ),
    );
  return row?.first ?? null;
}

/* ------------------------------------------------------------------ */
/* A claim with nothing after it                                       */
/* ------------------------------------------------------------------ */

/** A live claim is counted as unsettled once it is this old: one pass of the sweep. */
export const UNSETTLED_CLAIM_AFTER_MS = 15 * 60_000;

/** At most this many appointments are named on one alarm line. */
export const UNSETTLED_CLAIMS_NAMED = 10;

/** Ids only (rule 7). */
export type UnsettledClaims = { count: number; appointmentIds: string[] };

/**
 * THE CLAIMS A SENDER LEFT WITH NOTHING AFTER THEM, for one tenant: a claim of
 * either sender that
 *
 *   - is live: not `early`, and no release names it;
 *   - is for a start still ahead of `now`;
 *   - was taken more than UNSETTLED_CLAIM_AFTER_MS before `now`, so a send in
 *     progress is not counted;
 *   - HAS NO LEDGER ROW AT OR AFTER IT for its appointment, channel and
 *     offset, of any outcome. Sent, held back, too late and refused by the
 *     provider each leave one (./dispatch.ts).
 *
 * That is what a sender leaves when it dies between its claim and its send,
 * or when the ledger row of a send could not be written. A read, in the
 * caller's transaction. It changes nothing.
 */
export async function readUnsettledClaims(tx: DbTx, args: { tenantId: string; now: Date }): Promise<UnsettledClaims> {
  const release = alias(reminderClaims, "reminder_unsettled_claim_release");
  const unsettled = and(
    eq(reminderClaims.tenantId, args.tenantId),
    eq(reminderClaims.kind, REMINDER_CLAIM_KIND),
    sql`${reminderClaims.early} is distinct from true`,
    gt(reminderClaims.startsAt, args.now),
    lt(reminderClaims.createdAt, new Date(args.now.getTime() - UNSETTLED_CLAIM_AFTER_MS)),
    notExists(
      tx
        .select({ one: sql`1` })
        .from(release)
        .where(
          and(
            eq(release.tenantId, args.tenantId),
            eq(release.appointmentId, reminderClaims.appointmentId),
            eq(release.kind, REMINDER_CLAIM_RELEASE_KIND),
            eq(release.claimId, reminderClaims.id),
          ),
        ),
    ),
    notExists(
      tx
        .select({ one: sql`1` })
        .from(reminderDispatches)
        .where(
          and(
            eq(reminderDispatches.tenantId, args.tenantId),
            eq(reminderDispatches.appointmentId, reminderClaims.appointmentId),
            eq(reminderDispatches.channel, reminderClaims.channel),
            // This offset's reminder, the fee-notice body included, as `claimIsHeld` reads it.
            sql`${reminderDispatches.templateId} like 'reminder.' || ${reminderClaims.offsetId} || '.%'`,
            gte(reminderDispatches.createdAt, reminderClaims.createdAt),
          ),
        ),
    ),
  );
  const [counted] = await tx.select({ n: count() }).from(reminderClaims).where(unsettled);
  const n = Number(counted?.n ?? 0);
  if (n === 0) return { count: 0, appointmentIds: [] };
  const named = await tx
    .selectDistinct({ id: reminderClaims.appointmentId })
    .from(reminderClaims)
    .where(unsettled)
    .orderBy(reminderClaims.appointmentId)
    .limit(UNSETTLED_CLAIMS_NAMED);
  return { count: n, appointmentIds: named.map((r) => r.id) };
}

/** One mark a sending pass hands to the dispatcher. Ids and instants, no person. */
export type SendableMark = {
  appointmentId: string;
  offsetId: ReminderOffset["id"];
  channel: ReminderOffset["channel"];
  startsAt: Date;
  /** The start minus the offset. */
  mark: Date;
};

export type SendableMarks = {
  /** The marks this pass takes: at most `limit`, oldest mark first. */
  marks: SendableMark[];
  /** Every mark that was due, not settled and not just tried, the ones over `limit` included. */
  due: number;
  /** Due marks left out because the visit never had a reminder. Null when nothing is left out. */
  neverRemindedLeftOut: number | null;
};

/**
 * THE SENDING PASS'S SELECTION for one tenant, read inside the caller's
 * transaction. It reads and decides nothing else.
 */
export async function selectSendableMarks(
  tx: DbTx,
  args: { tenantId: string; now: Date; limit: number; includeNeverReminded: boolean },
): Promise<SendableMarks> {
  const limit = Math.max(0, Math.floor(args.limit));
  const floor = await readSweepFloor(tx, args.tenantId);
  // No heartbeat yet: the sweep starts for this tenant with this pass.
  if (floor === null) return { marks: [], due: 0, neverRemindedLeftOut: args.includeNeverReminded ? null : 0 };

  const inTime: SendableMark[] = [];
  const tooLate: SendableMark[] = [];
  let due = 0;
  let leftOut = 0;

  for (const offset of REMINDER_OFFSETS) {
    const offsetMs = offset.minutesBefore * 60_000;
    // The mark is at or after the floor: the start is at or after the floor plus the offset.
    const sinceTheSweepBegan = gte(appointments.startsAt, new Date(floor.getTime() + offsetMs));
    const dueSinceTheFloor = and(dueVisits(args.tenantId, offset, args.now), sinceTheSweepBegan);
    const selectable = and(
      dueSinceTheFloor,
      args.includeNeverReminded ? undefined : hasSchedulingEvent(tx),
      notSettledNorJustTried(tx, args.tenantId, offset, args.now),
    );

    const [counted] = await tx.select({ n: count() }).from(appointments).where(selectable);
    due += Number(counted?.n ?? 0);

    if (!args.includeNeverReminded) {
      const [out] = await tx
        .select({ n: count() })
        .from(appointments)
        .where(and(dueSinceTheFloor, not(hasSchedulingEvent(tx))));
      leftOut += Number(out?.n ?? 0);
    }

    if (limit === 0) continue;
    // Too late is "the mark is more than the limit before now" (`reminderIsTooLate`),
    // which on the start is: before now, less the limit, plus the offset.
    const lateBefore = new Date(args.now.getTime() - REMINDER_LATE_LIMIT_MS[offset.channel] + offsetMs);
    for (const [late, into] of [
      [false, inTime],
      [true, tooLate],
    ] as const) {
      const rows = await tx
        .select({ id: appointments.id, startsAt: appointments.startsAt })
        .from(appointments)
        .where(and(selectable, late ? lt(appointments.startsAt, lateBefore) : gte(appointments.startsAt, lateBefore)))
        .orderBy(appointments.startsAt, appointments.id)
        .limit(limit);
      for (const row of rows) {
        into.push({
          appointmentId: row.id,
          offsetId: offset.id,
          channel: offset.channel,
          startsAt: row.startsAt,
          mark: new Date(row.startsAt.getTime() - offsetMs),
        });
      }
    }
  }

  const oldestFirst = (a: SendableMark, b: SendableMark) =>
    a.mark.getTime() - b.mark.getTime() ||
    a.appointmentId.localeCompare(b.appointmentId) ||
    a.offsetId.localeCompare(b.offsetId);
  return {
    marks: [...inTime.sort(oldestFirst), ...tooLate.sort(oldestFirst)].slice(0, limit),
    due,
    neverRemindedLeftOut: args.includeNeverReminded ? null : leftOut,
  };
}

/**
 * Does a sending pass take the visits that never had a reminder? The constant
 * of ./reminder-population.ts (off, and what the shadow and the counts on
 * Lembretes SMS read), or the second switch of ./sweep-mode.ts. Either one on
 * is on. Read at each pass, never at import.
 */
export function sendingPassIncludesNeverReminded(env: Record<string, string | undefined> = process.env): boolean {
  return REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER || sweepRemindsNeverReminded(env);
}

/* ------------------------------------------------------------------ */
/* One mark                                                            */
/* ------------------------------------------------------------------ */

/**
 * What became of one mark a pass handed over. One word each, so it crosses the
 * scheduler's step boundary as JSON and can be counted.
 *
 *   sent        a message was handed to the provider. Final for this start.
 *   held_back   the dispatcher sent nothing and said why in the ledger. Its
 *               claim was given up; the mark is taken again in an hour.
 *   too_late    the reminder's time passed longer ago than its channel allows
 *               (`mark_missed`), or the visit has begun (`start_passed`), by
 *               the dispatcher's clock when it came to send. Recorded in the
 *               ledger, not sent. Final.
 *   claim_held  another sender holds this reminder, or already sent it. No row.
 *   held_by_duplicate
 *               the table refused this claim's attempt as another taker's
 *               (`claim_held_by_duplicate`, strategy Q-A of 2026-10-15). No
 *               row; counted on its own, so the pass's line records it.
 *   failed      the call threw: the claim could not be taken, or the provider
 *               refused. Logged with ids only. Whether it is taken again is the
 *               claim's to say (./dispatch.ts).
 */
export type SweepMarkResult = "sent" | "held_back" | "too_late" | "claim_held" | "held_by_duplicate" | "failed";

type Dispatch = typeof dispatchReminder;

/**
 * Hand ONE mark to the dispatcher, as the taker `sweep`, and say what became
 * of it. IT NEVER THROWS: a pass goes on to its next mark whatever this one did.
 */
export async function handOverMark(args: {
  tenantId: string;
  mark: SendableMark;
  /**
   * The pass's clock, the instant its selection compared against. The
   * dispatcher reads it for "too early" only; "too late" it judges on its own
   * clock, when it sends.
   */
  now: Date;
  dispatch?: Dispatch;
  alarm?: (line: string) => void;
}): Promise<SweepMarkResult> {
  const dispatch = args.dispatch ?? dispatchReminder;
  const alarm = args.alarm ?? ((line: string) => console.error(line));
  const { tenantId, mark } = args;
  try {
    const outcome = await dispatch(tenantId, mark.appointmentId, mark.offsetId, mark.channel, "sweep", {
      now: args.now,
      // A mark still ahead of the pass's clock was taken by the day's last
      // pass. The dispatcher grants it only for the start it loads itself.
      ...(mark.mark.getTime() > args.now.getTime() ? { takenAhead: true } : {}),
    });
    if (reminderWasHandedOver(outcome)) return "sent";
    if (!outcome.dispatched && outcome.reason === "claim_held") return "claim_held";
    if (!outcome.dispatched && outcome.reason === "claim_held_by_duplicate") return "held_by_duplicate";
    if (!outcome.dispatched && (outcome.reason === "mark_missed" || outcome.reason === "start_passed")) return "too_late";
    return "held_back";
  } catch (e) {
    alarm(
      `${SWEEP_LOG_PREFIX} mark FAILED tenantId=${tenantId} appointmentId=${mark.appointmentId} ` +
        `offsetId=${mark.offsetId} channel=${mark.channel}: ${e instanceof Error ? e.name : "unknown"}`,
    );
    return "failed";
  }
}

/* ------------------------------------------------------------------ */
/* One tenant's pass                                                   */
/* ------------------------------------------------------------------ */

/** What one tenant's sending pass did. Counts and booleans only. */
export type SweepSendTenantOutcome = {
  /** Marks due, not settled and not just tried, when the pass read. */
  due: number;
  /** Marks handed to the dispatcher. */
  taken: number;
  sent: number;
  heldBack: number;
  /** Recorded as too late, not sent. */
  tooLate: number;
  claimHeld: number;
  /** Held because the table refused the claim's attempt as another taker's (Q-A). */
  heldByDuplicate: number;
  failed: number;
  /** More was due than the pass was allowed to take. */
  overCeiling: boolean;
  /** Live claims with no ledger row after them (`readUnsettledClaims`). Reported, never retried. */
  unsettledClaims: number;
};

/** A selected mark as it crosses the step boundary: instants as ISO text. */
type StoredMark = { appointmentId: string; offsetId: ReminderOffset["id"]; channel: ReminderOffset["channel"]; startsAt: string; mark: string };
type StoredSelection = { at: string; due: number; leftOut: number; marks: StoredMark[]; unsettled: UnsettledClaims };

const runInline: SweepStep = (_id, fn) => fn();

/**
 * ONE TENANT'S SENDING PASS. Three kinds of step, so a resumed run repeats
 * none of them:
 *
 *   sweep-select-<tenant>            reads the clock ONCE and the selection, as
 *                                    the reminder job, in one short transaction;
 *   sweep-send-<appointment>-<offset>  one per mark: `handOverMark`. THE STORED
 *                                    CLOCK IS NOT THE TIME OF THIS STEP: the
 *                                    dispatcher reads its own for "too late";
 *   sweep-heartbeat-<tenant>         writes the heartbeat.
 *
 * NO TRANSACTION AND NO LOCK IS HELD ACROSS A SEND. The selection is a read;
 * what stops a second sender of a mark is the claim, taken inside the
 * dispatcher. So two passes of one tenant at the same moment cost a second
 * heartbeat and nothing else.
 *
 * IT THROWS when the selection or the heartbeat fails, and the caller counts
 * the tenant as failed. A mark that fails does not: it is counted.
 */
export async function sweepTenantSending(args: {
  tenantId: string;
  /** How many marks this tenant may still take: the ceiling less what earlier tenants took. */
  limit: number;
  /** The scheduler's id for the run. */
  passId?: string;
  step?: SweepStep;
  /** The clock, read once, inside the selection's step. */
  now?: () => Date;
  /** The second switch. Passed by tests only. */
  includeNeverReminded?: boolean;
  dispatch?: Dispatch;
  alarm?: (line: string) => void;
}): Promise<SweepSendTenantOutcome> {
  const step = args.step ?? runInline;
  const clock = args.now ?? (() => new Date());
  const passId = args.passId || null;
  const { tenantId } = args;

  const selection = await step(`sweep-select-${tenantId}`, async (): Promise<StoredSelection> => {
    const at = clock();
    const includeNeverReminded = args.includeNeverReminded ?? sendingPassIncludesNeverReminded();
    const { selected, unsettled } = await withReminderTenantContext(tenantId, async (tx) => {
      await tx.execute(sql`select set_config('statement_timeout', ${SWEEP_STATEMENT_TIMEOUT}, true)`);
      return {
        selected: await selectSendableMarks(tx, { tenantId, now: at, limit: args.limit, includeNeverReminded }),
        unsettled: await readUnsettledClaims(tx, { tenantId, now: at }),
      };
    });
    // Inside the step, so a run the scheduler resumes says it once a pass.
    if (unsettled.count > 0) {
      (args.alarm ?? ((line: string) => console.error(line)))(
        `${SWEEP_LOG_PREFIX} UNSETTLED CLAIMS tenantId=${tenantId} count=${unsettled.count} ` +
          `appointmentIds=${unsettled.appointmentIds.join(",")}: a claim was taken and nothing was recorded after it. ` +
          `Whether the reminder left is not known. It is not sent again.`,
      );
    }
    return {
      at: at.toISOString(),
      due: selected.due,
      leftOut: selected.neverRemindedLeftOut ?? 0,
      unsettled,
      marks: selected.marks.map((m) => ({
        appointmentId: m.appointmentId,
        offsetId: m.offsetId,
        channel: m.channel,
        startsAt: m.startsAt.toISOString(),
        mark: m.mark.toISOString(),
      })),
    };
  });

  const at = new Date(selection.at);
  const outcome: SweepSendTenantOutcome = {
    due: selection.due,
    taken: selection.marks.length,
    sent: 0,
    heldBack: 0,
    tooLate: 0,
    claimHeld: 0,
    heldByDuplicate: 0,
    failed: 0,
    overCeiling: selection.due > selection.marks.length,
    unsettledClaims: selection.unsettled.count,
  };

  for (const m of selection.marks) {
    const result = await step(`sweep-send-${m.appointmentId}-${m.offsetId}`, () =>
      handOverMark({
        tenantId,
        mark: { ...m, startsAt: new Date(m.startsAt), mark: new Date(m.mark) },
        now: at,
        dispatch: args.dispatch,
        alarm: args.alarm,
      }),
    );
    if (result === "sent") outcome.sent += 1;
    else if (result === "held_back") outcome.heldBack += 1;
    else if (result === "too_late") outcome.tooLate += 1;
    else if (result === "claim_held") outcome.claimHeld += 1;
    else if (result === "held_by_duplicate") outcome.heldByDuplicate += 1;
    else outcome.failed += 1;
  }

  await step(`sweep-heartbeat-${tenantId}`, async () => {
    await withReminderTenantContext(tenantId, async (tx) => {
      await tx.insert(reminderSweepPasses).values({
        tenantId,
        passId,
        mode: SWEEP_SEND_PASS_MODE,
        passAt: at,
        lookAheadBefore: sweepLookAheadLimit(at),
        // As in shadow: the count and the rows are two reads, and the table
        // holds "recorded is never more than due".
        dueCount: Math.max(outcome.due, outcome.taken),
        recordedCount: outcome.taken,
        overCeiling: outcome.overCeiling,
        excludedCount: selection.leftOut,
      });
    });
    return true;
  });

  return outcome;
}

/* ------------------------------------------------------------------ */
/* The pass                                                            */
/* ------------------------------------------------------------------ */

export type SweepSendPassOutcome = {
  mode: "send";
  tenants: number;
  failedTenants: number;
  due: number;
  taken: number;
  sent: number;
  heldBack: number;
  tooLate: number;
  claimHeld: number;
  heldByDuplicate: number;
  failedMarks: number;
  overCeiling: boolean;
  /** Live claims with no ledger row after them, over every tenant swept. */
  unsettledClaims: number;
};

/** A sending pass that could not finish for every tenant. Counts only. */
export class ReminderSweepSendError extends Error {
  constructor(public readonly outcome: SweepSendPassOutcome) {
    super(`reminder sweep: ${outcome.failedTenants} of ${outcome.tenants} tenant(s) could not be swept`);
    this.name = "ReminderSweepSendError";
  }
}

export type SweepSendDeps = {
  /** Every tenant's id. Injected, as for the shadow pass. */
  listTenantIds: () => Promise<string[]>;
  step?: SweepStep;
  passId?: string;
  now?: () => Date;
  sweepTenant?: typeof sweepTenantSending;
  log?: (line: string) => void;
  alarm?: (line: string) => void;
};

/**
 * ONE SENDING PASS: list the tenants, sweep each, never more than
 * SWEEP_MARK_CEILING marks in all.
 *
 * A tenant that fails does not stop the others, and the pass then throws after
 * the last one, as the shadow pass does. A MARK that fails does not fail the
 * pass: it is counted and logged, and the run stays green. The function is
 * declared with no retries either way.
 *
 * LOGS COUNTS ONLY, and ids on a failure (rule 7).
 */
export async function runReminderSweepSend(deps: SweepSendDeps): Promise<SweepSendPassOutcome> {
  const step = deps.step ?? runInline;
  const sweepTenant = deps.sweepTenant ?? sweepTenantSending;
  const log = deps.log ?? ((line: string) => console.info(line));
  const alarm = deps.alarm ?? ((line: string) => console.error(line));

  const tenantIds = await step("list-tenants", () => deps.listTenantIds());
  const outcome: SweepSendPassOutcome = {
    mode: "send",
    tenants: tenantIds.length,
    failedTenants: 0,
    due: 0,
    taken: 0,
    sent: 0,
    heldBack: 0,
    tooLate: 0,
    claimHeld: 0,
    heldByDuplicate: 0,
    failedMarks: 0,
    overCeiling: false,
    unsettledClaims: 0,
  };

  for (const tenantId of tenantIds) {
    const limit = Math.max(0, SWEEP_MARK_CEILING - outcome.taken);
    try {
      const swept = await sweepTenant({ tenantId, limit, passId: deps.passId, step, now: deps.now, alarm });
      outcome.due += swept.due;
      outcome.taken += swept.taken;
      outcome.sent += swept.sent;
      outcome.heldBack += swept.heldBack;
      outcome.tooLate += swept.tooLate;
      outcome.claimHeld += swept.claimHeld;
      outcome.heldByDuplicate += swept.heldByDuplicate;
      outcome.failedMarks += swept.failed;
      outcome.overCeiling = outcome.overCeiling || swept.overCeiling;
      outcome.unsettledClaims += swept.unsettledClaims;
    } catch (e) {
      outcome.failedTenants += 1;
      alarm(`${SWEEP_LOG_PREFIX} tenant FAILED tenantId=${tenantId}: ${e instanceof Error ? e.name : "unknown"}`);
    }
  }

  log(
    `${SWEEP_LOG_PREFIX} mode=${outcome.mode} tenants=${outcome.tenants} failed=${outcome.failedTenants} ` +
      `due=${outcome.due} taken=${outcome.taken} sent=${outcome.sent} heldBack=${outcome.heldBack} ` +
      `tooLate=${outcome.tooLate} claimHeld=${outcome.claimHeld} heldByDuplicate=${outcome.heldByDuplicate} ` +
      `failedMarks=${outcome.failedMarks} unsettledClaims=${outcome.unsettledClaims}`,
  );
  if (outcome.overCeiling) {
    alarm(`${SWEEP_LOG_PREFIX} OVER THE CEILING due=${outcome.due} taken=${outcome.taken} ceiling=${SWEEP_MARK_CEILING}`);
  }
  if (outcome.failedTenants > 0) throw new ReminderSweepSendError(outcome);
  return outcome;
}
