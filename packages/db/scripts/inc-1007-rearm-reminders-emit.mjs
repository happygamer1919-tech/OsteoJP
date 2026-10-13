#!/usr/bin/env node
// ===================================================================
// REMINDER RE-ARM EMIT (INC, 2026-10-07). ONE TIME. HELD.
// OWNER-RUN, OR RUN BY GREEN ON THE OWNER'S DISPATCH NAMING THIS FILE.
// THE BUILD LANE NEVER RUNS IT AGAINST PRODUCTION.
// ===================================================================
// WHAT IT IS FOR. Until the fix of 2026-10-07 (the comment block "A save that
// does NOT change the time" in apps/web/lib/reminders/inngest/functions.ts), a
// second `appointment/scheduled` event for an appointment whose start had not
// changed CANCELLED the sleeping reminder run, and the replacement was dropped
// as a duplicate idempotency key. The patient got no reminder. The fix stops
// new damage. It cannot bring back a run that was already destroyed.
//
// Postgres holds no trace of a sleeping run, so the damaged appointments cannot
// be listed exactly. With the fix live, one more `appointment/scheduled` event
// that the scheduler has never seen before, arriving well clear of a reminder
// mark, ends with exactly one live run per (appointment, offset, channel). So
// this emits that event for every future remindable appointment, with
// confirmationEligible FALSE, because a booking confirmation arriving now for
// a booking made days ago would be wrong. The two conditions in that sentence
// are the next two sections.
//
// ===================================================================
// THE EVENT CARRIES NO ID OF ITS OWN, AND THAT IS THE SAFETY
// ===================================================================
// MEASURED on a local Inngest dev server (inngest-cli 1.46.0, SDK 4.5.0) with
// the settings of functions.ts on main, 10 appointments per pattern, live runs
// per appointment afterwards:
//   one event, a supplied id                       1 email, 1 SMS
//   the SAME supplied id again, 8 s later          0 and 0   (reminders GONE)
//   a different id on each of two sends            1 and 1
//   no supplied id on either of two sends          1 and 1
//   supplied id, an app save, the same id again    0 and 0
// The function sees a supplied id as `event.id`, and the fix builds the
// reminder key from it (`scheduledBy`). A repeated supplied id is therefore
// NOT dropped: its cancelOn cancels the sleeping runs and the replacements
// carry a key already seen. A repeated id is the incident again.
//
// So this script supplies NO id. Inngest gives every event it receives an id
// of its own, which makes a repeat impossible to construct: not by a second
// run, not by a lost marker, not by two operators, and not by anything between
// this machine and Inngest that delivers one request twice. It is also exactly
// what the app's own save does, which is the case the fix was measured for.
// The id Inngest returns is kept in the marker, so each send can be traced.
//
// MEASURED AGAIN with this script's own buildEvent() and sendToInngest()
// pointed at the same local dev server, 10 appointments per pattern: one send;
// two sends 8 s apart; three sends 8 s apart; a send, an app-style save and a
// send; an app-style save and then a send. EVERY pattern ended with 1 email
// run and 1 SMS run per appointment. 90 sends returned 90 different ids, and
// the function saw the server's id, not one of ours.
//
// The marker and the lock below are no longer what keeps a reminder alive.
// They keep the run tidy: one event per row, and no two runs at once.
//
// ALL OF THIS HOLDS ONLY WITH THE NEW SCHEDULER SETTINGS LIVE. Under the old
// settings a second event inside 24 hours destroys the reminder whatever its
// id is. So --resend-attempted, a lost marker and two overlapping runs are
// safe ONLY when the scheduler runs the fix. THE ONE GUARD for that is the
// look at the dashboard that --i-checked-inngest-settings vouches for. The
// canary is NOT a guard: one event gives one run per channel under the old
// settings and under the new, so the canary looks the same either way.
//
// ===================================================================
// NO EVENT NEAR A REMINDER MARK
// ===================================================================
// MEASURED the same way, 6 appointments per pattern, each with a healthy
// sleeping SMS run: an event 6 s before the 24 hour mark, SMS sent for 6 of 6;
// 1.5 s before, 0 of 6; 0.5 s before, 0 of 6. The event cancels the sleeping
// run, the fan-out waits its 2 s (the debounce), and by then the mark has
// passed, so nothing is scheduled in its place.
//
// So a row is HELD BACK when its 24 hour mark or its 48 hour mark falls inside
// the run's MARGIN, counted from the read instant:
//   margin = 30 s for the read + min(--max x 15 s, 600 s) for the sends + 60 s
// 15 s is the bound on one send (10 s for the request, 5 s for the re-read
// before it). With --max 25 the margin is 465 s; from --max 40 up it is 690 s.
// The run ENFORCES its half: it stops sending when the time for the sends is
// spent, and the rest waits for a later run. The 60 s covers the debounce, the
// scheduler's own delay and a clock difference between this machine and the
// database. A mark that passed less than 60 s before the read holds the row
// back too, because its run may be sending at that moment (reasoned, not
// measured). A row held back for its 24 hour mark will be inside 24 hours by
// the next run, so this script never sends for it: the real floor is 24 hours
// plus the margin. A row held back for its 48 hour mark CAN still be sent, but
// only inside a window: by a run that reads from one minute after that mark
// until the row's 24 hour mark comes inside that run's own margin. In practice
// that is a run within 23 hours of this one. A run a day or more later finds
// the row inside 24 hours and never sends it.
//
// ===================================================================
// WHICH ROWS
// ===================================================================
// All of these, for the one tenant named by --tenant-slug:
//   - status `scheduled` or `confirmed` (the dispatcher's REMINDABLE_STATUSES);
//   - the patient is not soft-deleted;
//   - NOT an unaccepted online request. An online request gets its first event
//     when reception accepts it (apps/web/lib/scheduling/pedido-acceptance.ts).
//     public.is_unconfirmed_pedido cannot answer here: it reads the tenant from
//     the caller's JWT, and this read has none, so it would answer FALSE for
//     every row. The same test is DERIVED from the same columns, and the test
//     file fails if the function's definition moves;
//   - starts more than 24 hours after the read instant (inside 24 hours both
//     offsets have passed);
//   - starts no more than --max-days-ahead days after the read instant. The
//     scope in days is ruled, so a real --confirm must state it. The vendor's
//     limit on how long a run may sleep is NOT ESTABLISHED, and a row beyond
//     the bound waits for a later ruling;
//   - NO emitting audit event in the last 25 hours (next paragraph);
//   - no reminder mark inside the margin (above);
//   - not already sent, and not attempted with the outcome unknown (below).
// Just before each send the row is READ AGAIN. If its start moved, its status
// changed, or it was saved again since the first read, it is skipped and
// counted, and a later run decides about it afresh.
//
// WHY A ROW TOUCHED IN THE LAST 25 HOURS IS LEFT ALONE. This script cannot see
// the hosted scheduler. If it were still on the old settings, an event inside
// 24 hours of the previous one is exactly what destroys a reminder. So a row
// whose audit trail shows an emitting event in the last 25 hours is counted
// under "skipped: touched in the last 25 hours". A later run picks it up.
// The emitting events, each verified against the code that writes it:
//   appointment.create           createAppointment, cloneAppointment, batch
//   appointment.reschedule       rescheduleAppointment
//   appointment.update           with toStatus `scheduled` or `confirmed`
//                                (brought back from cancelled, or accepted with
//                                the Estado control), or with
//                                via `portal_request_confirm` (Aceitar pedido)
//   appointment.sms_reply_reviewed   resolution `confirmed`, applied `true`
//   appointment.patient_sms_reply    outcome `confirmed`
// The appointment.update test is wider than the emits: a status edit that
// emitted nothing is skipped too. Skipping costs a delay, never a reminder.
//
// ===================================================================
// THE MARKER, ATTEMPTED ROWS AND THE LOCK
// ===================================================================
//   1. THE MARKER keeps a permanent history. Each row is written to it as
//      `attempted` BEFORE its request leaves, and changed to `sent` when
//      Inngest answers 2xx. A run that dies, a timeout and a 5xx all leave
//      the row `attempted`: Inngest may or may not have taken the event.
//   2. A `sent` row is skipped by every later run at the same start.
//   3. An `attempted` row is skipped too, and COUNTED, until the operator adds
//      --resend-attempted. Every send has an id of its own, so sending such a
//      row again is safe under the fix, AND ONLY UNDER THE FIX (see "ALL OF
//      THIS HOLDS ONLY" above). With the new settings live the flag is a
//      deliberate choice, not a danger: without it the row may have no run;
//      with it the row gets a fresh one either way.
//   4. THE LOCK (the marker's path plus `.lock`) is taken by every --confirm
//      and removed when it ends. A second --confirm while it exists is
//      refused. A run that is killed leaves it behind on purpose: the operator
//      looks at the marker, then deletes the lock by hand.
// There is no "wait 25 hours between runs" rule: the first run is a canary
// (--max defaults to 25) and a second run continues with the rest.
//
// WHAT IT CANNOT VERIFY, AND SAYS SO WHEN IT RUNS.
//   - That the fix is deployed. --fix-deployed-sha is recorded and printed,
//     nothing more.
//   - That the hosted functions carry the new settings. --confirm is refused
//     without --i-checked-inngest-settings: the owner looks at the Inngest
//     dashboard first and sees THREE things: Debounce on
//     schedule-appointment-reminders, Singleton on send-appointment-reminder,
//     and the trigger expression `event.data.confirmationEligible == true` on
//     send-appointment-confirmation. The third is what keeps this event from
//     sending a booking confirmation: the handler has no second check.
//   - Whether a run exists for any appointment.
//
// ===================================================================
// THE THREE GATE LINES (strategy, 2026-10-08): G1, G4 AND G3
// ===================================================================
//   G1 PROJECTED SCHEDULER EXECUTIONS. Every appointment in scope (not an
//      unaccepted request, not inside 24 hours, not beyond --max-days-ahead)
//      times 8, the most one event can cost. It is the bound for everything
//      in scope at THIS read, sent already or not; the first sitting's number
//      is the gate. (The scope shrinks as sent rows come inside 24 hours or
//      start.) At 20000 or more a --confirm is refused; a dry run prints NO
//      and ends normally.
//   G4 NEXT 48 HOURS, NOT RE-ARMED. A count for reception: the appointments
//      starting within 24 hours, plus those 24 to 48 hours ahead that this
//      run leaves alone. An appointment starting within 24 hours that an
//      earlier run of this operation sent, at the start it has now, was
//      re-armed: it is counted apart, on a line of its own. After the sends,
//      G4 ATTEMPTED EQUALS SENT compares the requests this run started with
//      the ones Inngest took.
//   G3 LEDGER ROWS. Every message attempt writes one row to
//      reminder_dispatches. A re-arm must send no message at run time, so for
//      every row the marker holds, the ledger must hold NOTHING for that
//      appointment between its run's read instant and the end of its run's
//      margin. Counts only, READ ONLY, in every mode. A count above 0 stops
//      everything, the dry run too, and so does a marker row that cannot be
//      checked. A confirm that started a request asks again 20 s after its
//      sends, for its own rows.
//
// USAGE, from the repo root with the production environment sourced:
//   node packages/db/scripts/inc-1007-rearm-reminders-emit.mjs --tenant-slug osteojp
//     DRY RUN, the default. Reads, prints what it WOULD emit, sends nothing.
//   ... plus --confirm --expect <N> --fix-deployed-sha <40 hex> --i-checked-inngest-settings
//       --max-days-ahead <D>
//     Re-reads the same way, refuses unless exactly N rows are eligible, then
//     emits the first --max of them (25 unless told otherwise).
//   --min-days-ahead <D> narrows a run to appointments D or more days ahead.
//   --max-days-ahead <D> leaves out appointments more than D days ahead. A dry
//     run and a rehearsal may omit it; a real --confirm may not.
//   --resend-attempted lets rows the marker holds as attempted be sent again.
//   --sink-file <absolute path> is for REHEARSAL on a local database: events
//     are appended to that file, nothing is sent anywhere, and the marker and
//     the lock are kept beside the file, never in the home directory.
// It reads the exact production target or a strict local database (127.0.0.1
// or localhost) and NOTHING ELSE, the dry run included.
//
// It prints appointment ids, instants, statuses and counts. NEVER a patient
// name, phone or email (CLAUDE.md rule 7), never the connection string, any
// part of it, or the key. Every read is a READ ONLY transaction, the ledger
// read included. It writes nothing to Postgres.
//
// EXIT 0 OK, 1 FAILED, 2 BAD_INVOCATION (the repo's tooling convention).

import {
  accessSync,
  appendFileSync,
  closeSync,
  constants,
  existsSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PRODUCTION, REASONS, checkProductionTarget } from "../../../scripts/production-target.mjs";

/** EVENT_APPOINTMENT_SCHEDULED, apps/web/lib/reminders/inngest/client.ts. */
export const EVENT_NAME = "appointment/scheduled";
/** REMINDER_OFFSETS, apps/web/lib/reminders/offsets.ts. The marks a row is held
 *  back for, and the preview. The real decision about what to schedule is
 *  computeDueReminders inside the Inngest function. */
export const OFFSETS = [
  { id: "48h", minutesBefore: 48 * 60, channel: "email" },
  { id: "24h", minutesBefore: 24 * 60, channel: "sms" },
];
/** The first real run is a canary. */
export const DEFAULT_MAX = 25;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** A row must start MORE than this after the read instant. */
export const LEAD_MS = 24 * HOUR_MS;
/** A row with an emitting audit event this recent is left alone. */
export const TOUCH_MS = 25 * HOUR_MS;
/** The bound on one request to Inngest. */
export const SEND_TIMEOUT_MS = 10_000;
/** The bound on the re-read of one row before its send. */
export const RECHECK_BOUND_MS = 5_000;
/** The bound on one whole send: the re-read plus the request. */
export const PER_SEND_BOUND_MS = RECHECK_BOUND_MS + SEND_TIMEOUT_MS;
/** However large --max is, the sends of one run stop after this. */
export const RUN_CAP_MS = 600_000;
/** The time allowed between the start of the read and the first send. */
export const READ_BOUND_MS = 30_000;
/** Debounce (2 s), the scheduler's own delay, and a clock difference. */
export const SLACK_MS = 60_000;
/** A mark this recently passed may have its run sending right now. */
export const BACK_MS = 60_000;
/**
 * G1. The most one event of this script can cost the scheduler, as the vendor
 * counts it (one execution per function run and one per step):
 *   schedule-appointment-reminders   1 run + 1 step (the fan-out)       = 2
 *   send-appointment-reminder, twice 1 run + 2 steps (sleep, dispatch)  = 6
 * 3 runs and 5 steps. An appointment 24 to 48 hours ahead costs 5, so 8 is an
 * upper bound. confirmationEligible is false, so no confirmation run starts.
 * "At most 8" is WITHOUT RETRIES: a run or a step the scheduler tries again
 * is not counted here, and whether the vendor bills a retry is not established.
 */
export const EXECUTIONS_PER_EVENT = 8;
/** G1. Strategy's limit of 2026-10-08: the projection must be UNDER this. */
export const EXECUTION_LIMIT = 20_000;
/** The bound on one read of the reminder ledger. */
export const LEDGER_BOUND_MS = 10_000;
/**
 * G3. How long a confirm waits after its sends before it reads the ledger
 * again: ten times the debounce (2 s). It must stay below SLACK_MS, so that
 * the second read ends before any mark of a row this run sent.
 */
export const SETTLE_MS = 20_000;
/** CONFIRMATION_TRIGGER_FILTER, apps/web/lib/reminders/inngest/functions.ts.
 *  The third thing the owner sees in the dashboard before a real --confirm. */
export const CONFIRMATION_FILTER = "event.data.confirmationEligible == true";
export const INNGEST_ORIGIN = "https://inn.gs";
const MARKER_NAME = ".osteojp-inc1007-rearm.json";
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{40}$/;
const REMINDABLE = ["scheduled", "confirmed"];
/** The only local form this script reads: one "@", no list of hosts, no query. */
const STRICT_LOCAL = /^postgres(?:ql)?:\/\/[^@/?#,\s]+@(?:127\.0\.0\.1|localhost):\d+\/[A-Za-z0-9_]+$/;

/** How long the sends of one run may take. */
export function runBudgetMs(max) {
  return Math.min(max * PER_SEND_BOUND_MS, RUN_CAP_MS);
}

/** How far ahead of the read instant a reminder mark holds its row back. */
export function marginMsFor(max) {
  return READ_BOUND_MS + runBudgetMs(max) + SLACK_MS;
}

/*
 * THE TWO READS. Both are built from the same two pieces, so the re-read
 * before a send asks exactly what the first read asked.
 *
 * UNACCEPTED is public.is_unconfirmed_pedido's own test (migration 0067),
 * without its JWT tenant line: the tenant is bound from $1. EMITTING reads the
 * audit trail for the emitting events the header lists. Neither read decides
 * anything: verdictOf() and changedSince() do, so the boundaries are tested as
 * code and not as text. No patient column is read except the soft-delete flag.
 */
const UNACCEPTED = `(a.status = 'scheduled'
        and (a.origin = 'patient_portal'
             or exists (select 1 from staff_notifications n
                         where n.tenant_id = a.tenant_id
                           and n.appointment_id = a.id
                           and n.kind = 'appointment_request')))`;

const EMITTING = `cross join lateral (
    select max(l.created_at) as last_emit_at, count(*)::int as emit_events
      from audit_log l
     where l.tenant_id = a.tenant_id
       and l.entity_type = 'appointment'
       and l.entity_id = a.id
       and (l.action in ('appointment.create', 'appointment.reschedule')
            or (l.action = 'appointment.update'
                and (l.metadata ->> 'toStatus' in ('scheduled', 'confirmed')
                     or l.metadata ->> 'via' = 'portal_request_confirm'))
            or (l.action = 'appointment.sms_reply_reviewed'
                and l.metadata ->> 'resolution' = 'confirmed'
                and l.metadata ->> 'applied' = 'true')
            or (l.action = 'appointment.patient_sms_reply'
                and l.metadata ->> 'outcome' = 'confirmed'))
  ) e`;

/** One tenant ($1): every future remindable row and the facts the verdict needs. */
export const SELECT_ROWS = `
with k as (select $1::uuid as tenant_id, now() as t0)
select a.id::text as id,
       a.tenant_id::text as tenant_id,
       a.starts_at,
       a.status::text as status,
       ${UNACCEPTED} as unaccepted_request,
       e.last_emit_at,
       e.emit_events,
       k.t0
  from appointments a
  join k on k.tenant_id = a.tenant_id
  join patients p on p.id = a.patient_id and p.tenant_id = a.tenant_id
  ${EMITTING}
 where a.status::text in ('scheduled', 'confirmed')
   and p.deleted_at is null
   and a.starts_at > k.t0
 order by a.starts_at, a.id`;

/** One row ($2) of one tenant ($1), as it is NOW. Asked just before its send. */
export const RECHECK_ROW = `
select a.starts_at,
       a.status::text as status,
       (p.deleted_at is not null) as patient_deleted,
       ${UNACCEPTED} as unaccepted_request,
       e.last_emit_at
  from appointments a
  join patients p on p.id = a.patient_id and p.tenant_id = a.tenant_id
  ${EMITTING}
 where a.tenant_id = $1::uuid
   and a.id = $2::uuid`;

/*
 * G3, THE LEDGER READ. One tenant ($1) and a list of windows ($2), counts only.
 * A window is one appointment this operation sent an event for, from the read
 * instant of the run that sent it to the end of that run's margin. By
 * construction no reminder mark of a sent row falls inside its window, and the
 * event carries confirmationEligible false, so every ledger row counted here
 * is a message this operation may have caused. `handed_over` leaves out the
 * attempts the dispatcher suppressed, where nothing reached a provider.
 *
 * $2 is ONE JSON string, never a JavaScript array: the driver runs with
 * `prepare: false` and `tx.unsafe`, where array parameters are not reliable.
 * It is cast `::text::jsonb` and not `::jsonb`. MEASURED on a local Postgres
 * through openReader() below (postgres.js 3.4.9): with `$2::jsonb` the driver
 * learns the parameter is jsonb and encodes the string a second time, and the
 * statement fails with 22023, "cannot call jsonb_to_recordset on a non-array".
 * Declared as text, the string arrives as it was written.
 * It reads no patient column and no message content.
 */
export const LEDGER_CHECK = `
select count(*)::int as n,
       count(*) filter (where d.outcome <> 'suppressed')::int as handed_over
  from jsonb_to_recordset($2::text::jsonb) as s(appointment_id uuid, from_at timestamptz, to_at timestamptz)
  join reminder_dispatches d
    on d.tenant_id = $1::uuid
   and d.appointment_id = s.appointment_id
   and d.created_at >= s.from_at
   and d.created_at < s.to_at`;

export const USAGE = `usage:
  node packages/db/scripts/inc-1007-rearm-reminders-emit.mjs --tenant-slug <slug>
       [--confirm --expect <N> --fix-deployed-sha <40 hex> --i-checked-inngest-settings --max-days-ahead <D>]
       [--max <N, default ${DEFAULT_MAX}>] [--min-days-ahead <D, default 1>] [--resend-attempted]
       [--max-days-ahead <D, 2 or more and above --min-days-ahead; required with a real --confirm>]
       [--sink-file <absolute path, rehearsal on a local database only>]
  every mode prints the gate lines G1 (projected scheduler executions, limit ${EXECUTION_LIMIT}),
  G4 (the next 48 hours, not re-armed) and G3 (reminder ledger rows, expected 0)`;

/** A refusal. `code` is the exit code: 1 FAILED, 2 BAD_INVOCATION. */
export class Halt extends Error {
  constructor(code, message) {
    super(message);
    this.name = "Halt";
    this.code = code;
  }
}

function bad(msg) {
  throw new Halt(2, msg);
}

function fail(msg) {
  throw new Halt(1, msg);
}

export function parseArgs(argv) {
  const out = { confirm: false, checkedInngest: false, resendAttempted: false, max: String(DEFAULT_MAX), minDaysAhead: "1" };
  const takes = new Set(["--tenant-slug", "--expect", "--max", "--min-days-ahead", "--max-days-ahead", "--sink-file", "--fix-deployed-sha"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--confirm") {
      out.confirm = true;
      continue;
    }
    if (a === "--i-checked-inngest-settings") {
      out.checkedInngest = true;
      continue;
    }
    if (a === "--resend-attempted") {
      out.resendAttempted = true;
      continue;
    }
    if (!takes.has(a)) bad(`unknown argument ${JSON.stringify(a)}`);
    const v = argv[++i];
    if (v === undefined || v.startsWith("--")) bad(`${a} needs a value`);
    if (a === "--tenant-slug") out.tenantSlug = v;
    if (a === "--expect") out.expect = v;
    if (a === "--max") out.max = v;
    if (a === "--min-days-ahead") out.minDaysAhead = v;
    if (a === "--max-days-ahead") out.maxDaysAhead = v;
    if (a === "--sink-file") out.sinkFile = v;
    if (a === "--fix-deployed-sha") out.fixDeployedSha = v;
  }
  if (!out.tenantSlug || !SLUG.test(out.tenantSlug)) bad("--tenant-slug is required (lowercase slug)");
  if (out.expect !== undefined && !/^\d+$/.test(out.expect)) bad("--expect must be a whole number");
  if (!/^[1-9]\d{0,5}$/.test(out.max)) bad("--max must be a whole number, 1 or more");
  if (!/^[1-9]\d{0,3}$/.test(out.minDaysAhead)) {
    bad("--min-days-ahead must be a whole number, 1 or more. It can narrow a run; the 24 hour floor never moves");
  }
  if (out.maxDaysAhead !== undefined) {
    // At least 2, so that no row of the next 48 hours is ever "beyond" the bound.
    if (!/^[1-9]\d{0,3}$/.test(out.maxDaysAhead) || Number(out.maxDaysAhead) < 2) {
      bad("--max-days-ahead must be a whole number, 2 or more");
    }
    if (Number(out.maxDaysAhead) <= Number(out.minDaysAhead)) {
      bad("--max-days-ahead must be greater than --min-days-ahead");
    }
  }
  if (out.fixDeployedSha !== undefined && !SHA.test(out.fixDeployedSha)) {
    bad("--fix-deployed-sha must be the full 40 character lowercase commit sha of the deployed fix");
  }
  if (out.sinkFile !== undefined && !isAbsolute(out.sinkFile)) {
    bad("--sink-file must be an absolute path to a local file; it exists for rehearsal only");
  }
  if (out.confirm && out.expect === undefined) bad("--confirm needs --expect <N>, the ELIGIBLE count the dry run printed");
  // The two deploy flags guard the HOSTED scheduler. A sink run sends nothing
  // there, so it does not ask anybody to vouch for it.
  if (out.confirm && out.sinkFile === undefined) {
    if (out.fixDeployedSha === undefined) {
      bad("--confirm needs --fix-deployed-sha <40 hex>: the commit of the reminder fix that production is serving");
    }
    if (!out.checkedInngest) {
      bad(
        "--confirm needs --i-checked-inngest-settings. Before giving it, open the Inngest dashboard for the " +
          "production app and check three things: schedule-appointment-reminders shows Debounce, " +
          "send-appointment-reminder shows Singleton, and the trigger of send-appointment-confirmation shows the " +
          `expression ${CONFIRMATION_FILTER}. If the first or the second is missing the fix is not live in the ` +
          "scheduler; if the third is missing every event starts the confirmation function, and a patient who " +
          "booked online gets a booking confirmation. With any of the three missing: do not run this.",
      );
    }
    if (out.maxDaysAhead === undefined) {
      bad(
        "--confirm needs --max-days-ahead <D>. How many days ahead this operation reaches is a ruled scope, " +
          "and a real run must state it: the dispatch names the number.",
      );
    }
  }
  out.expect = out.expect === undefined ? undefined : Number(out.expect);
  out.max = Number(out.max);
  out.minDaysAhead = Number(out.minDaysAhead);
  out.maxDaysAhead = out.maxDaysAhead === undefined ? null : Number(out.maxDaysAhead);
  return out;
}

/**
 * Where the connection string points, read by the repository's one shared
 * production check. PURE: it opens nothing, and it returns NO part of the
 * string, only a verdict and a fixed sentence.
 *   production       the exact production target, every parsed part.
 *   local            the strict local form a rehearsal uses.
 *   near-production  it names the production ref or host but is NOT the exact
 *                    target: the wrong pooler, or somebody getting past a guard.
 *   other            anything else that parses: a retired project, a dev one.
 *   unreadable       it did not parse.
 * Only the first two are ever read, in any mode.
 */
export function classifyTarget(raw) {
  const check = checkProductionTarget(raw);
  if (check.ok) return { kind: "production", why: null };
  if (check.seen === null) return { kind: "unreadable", why: REASONS[check.failed] };
  const lower = raw.toLowerCase();
  if (lower.includes(PRODUCTION.ref) || lower.includes(PRODUCTION.host)) {
    return { kind: "near-production", why: REASONS[check.failed] };
  }
  return { kind: STRICT_LOCAL.test(raw) ? "local" : "other", why: null };
}

const TARGET_LABEL = {
  production: "PRODUCTION",
  local: "NOT production (a strict local database)",
  "near-production": "NAMES PRODUCTION BUT IS NOT THE EXACT TARGET",
  other: "NEITHER PRODUCTION NOR A STRICT LOCAL DATABASE",
  unreadable: "UNREADABLE",
};

/**
 * Every refusal that needs no database, in order. PURE. Returns null, or the
 * refusal as { code, msg }. It runs BEFORE a connection is opened.
 */
export function preflight(args, target, env) {
  if (target.kind === "unreadable") {
    return { code: 2, msg: `the connection string cannot be used: ${target.why}` }; // the value is never printed
  }
  if (target.kind === "near-production") {
    return {
      code: 1,
      msg:
        `the connection string names production but is not the exact production target: ${target.why} ` +
        "Refusing every mode. Use DATABASE_URL_DIRECT, the session pooler.",
    };
  }
  if (target.kind !== "production" && target.kind !== "local") {
    return {
      code: 1,
      msg:
        "this script reads the exact production target or a strict LOCAL database (127.0.0.1 or localhost, " +
        "one host, no query string) and nothing else. The target is neither. Refusing every mode, the dry run included.",
    };
  }
  if (args.sinkFile !== undefined && target.kind === "production") {
    return { code: 1, msg: "--sink-file is for rehearsal and the target is PRODUCTION. Refusing." };
  }
  if (args.confirm && args.sinkFile === undefined) {
    if (!env.INNGEST_EVENT_KEY) {
      return { code: 1, msg: "INNGEST_EVENT_KEY is not set. It is the osteojp-platform PRODUCTION value; it is never printed." };
    }
    if (env.INNGEST_DEV) return { code: 1, msg: "INNGEST_DEV is set, which means a dev server. Unset it." };
    if (target.kind !== "production") {
      return { code: 1, msg: "--confirm without --sink-file sends to Inngest Cloud, and the target is NOT production. Refusing." };
    }
  }
  return null;
}

/**
 * The id of the offset whose mark is too close to the read for this run, or
 * null. PURE. "Too close" is from BACK_MS before the read to the margin after.
 */
export function markTooClose(startMs, t0Ms, marginMs) {
  for (const o of OFFSETS) {
    const mark = startMs - o.minutesBefore * 60_000;
    if (mark > t0Ms - BACK_MS && mark <= t0Ms + marginMs) return o.id;
  }
  return null;
}

/**
 * What happens to one row. PURE. `t0Ms` is the read instant from the database.
 * The order is the order of the report: the first reason that applies wins.
 */
export function verdictOf(row, t0Ms, opts) {
  const startMs = Date.parse(row.startsAt);
  if (row.unacceptedRequest) return "unaccepted_request";
  if (!(startMs - t0Ms > LEAD_MS)) return "inside_24h";
  // No bound unless --max-days-ahead gave one. Exactly D days ahead is in scope.
  if (opts.maxDaysAhead !== null && opts.maxDaysAhead !== undefined && startMs - t0Ms > opts.maxDaysAhead * DAY_MS) return "beyond_max_days";
  if (row.lastEmitAt !== null && Date.parse(row.lastEmitAt) >= t0Ms - TOUCH_MS) return "touched_25h";
  if (opts.sent(row)) return "already_sent";
  if (opts.attempted(row) && !opts.resendAttempted) return "attempted";
  if (markTooClose(startMs, t0Ms, opts.marginMs) !== null) return "near_mark";
  if (startMs - t0Ms < opts.minDaysAhead * DAY_MS) return "held_back";
  return "emit";
}

/**
 * True for a touched row that this script can NEVER re-arm: by the time its 25
 * hours are up it will be inside 24 hours plus the margin of its start. PURE.
 */
export function tooLateToWait(row, marginMs) {
  if (row.lastEmitAt === null) return false;
  return Date.parse(row.startsAt) <= Date.parse(row.lastEmitAt) + TOUCH_MS + LEAD_MS + marginMs;
}

/**
 * G1. True for a row that is in scope at THIS read, sent already or not: every
 * verdict except the three that put a row out of scope. PURE.
 * Rows already sent, eligible now, touched, attempted and held back all count:
 * a later run can still reach them, or an earlier one already did. A sent row
 * leaves the scope when it comes inside 24 hours or starts, so the number of a
 * later read is smaller: the first sitting's number is the gate.
 */
export function inScope(verdict) {
  return verdict !== "unaccepted_request" && verdict !== "inside_24h" && verdict !== "beyond_max_days";
}

/** G1. The most the scheduler can be asked to execute for `count` appointments. PURE. */
export function projectedExecutions(count) {
  return count * EXECUTIONS_PER_EVENT;
}

/** G1. "Under" is strict: the limit itself is not under the limit. PURE. */
export function underExecutionLimit(projected) {
  return projected < EXECUTION_LIMIT;
}

/**
 * G4. True for a row 24 to 48 hours ahead of the read that this run leaves
 * without a new event. PURE. A row this run sends (`emit`) or an earlier run
 * sent (`already_sent`) is re-armed. An unaccepted request has no reminder
 * until reception accepts it, so it is not counted either.
 */
export function leftUnarmed24To48(startMs, t0Ms, verdict) {
  const ahead = startMs - t0Ms;
  if (!(ahead > LEAD_MS && ahead <= 2 * DAY_MS)) return false;
  return verdict === "touched_25h" || verdict === "attempted" || verdict === "near_mark" || verdict === "held_back";
}

/**
 * G4. Where a row starting within 24 hours of the read is counted. PURE.
 * `sentAtThisStart` is the marker's answer for the row at the start it has NOW.
 *   "sent_earlier"  an earlier run of this operation sent it at this start, so
 *                   it was re-armed: it is not "not re-armed".
 *   "not_rearmed"   every other row inside 24 hours: never sent, attempted
 *                   with the outcome unknown, or sent at ANOTHER start and
 *                   moved since.
 *   null            the row does not start within 24 hours.
 */
export function within24hCount(verdict, sentAtThisStart) {
  if (verdict !== "inside_24h") return null;
  return sentAtThisStart === true ? "sent_earlier" : "not_rearmed";
}

/** G4. A run attempted exactly what it sent, or it did not. PURE. */
export function attemptedEqualsSent(started, sent) {
  return started === sent;
}

/**
 * G3. The windows the ledger is asked about, built from the marker's entries.
 * PURE. One window per marker row (sent or attempted, since Inngest may have
 * taken either): the appointment, from the read instant of the run that sent
 * it to the end of that run's margin. Both come from the entry, so they are the
 * database clock and the margin of THAT run, not of this one. An entry without
 * a readable `readAt` or `marginMs`, or a row whose id is not a uuid, cannot be
 * asked about: its rows are counted in `unchecked` and reported, never dropped
 * in silence.
 */
export function ledgerWindows(entries) {
  const windows = [];
  let unchecked = 0;
  for (const e of entries) {
    const rows = (e && Array.isArray(e.rows) ? e.rows : []).filter((r) => r && (r.state === "sent" || r.state === "attempted"));
    const fromMs = e && typeof e.readAt === "string" ? Date.parse(e.readAt) : NaN;
    const marginMs = e ? e.marginMs : undefined;
    const usable = !Number.isNaN(fromMs) && Number.isInteger(marginMs) && marginMs > 0;
    for (const r of rows) {
      if (!usable || typeof r.id !== "string" || !UUID.test(r.id)) {
        unchecked += 1;
        continue;
      }
      windows.push({ appointment_id: r.id, from_at: new Date(fromMs).toISOString(), to_at: new Date(fromMs + marginMs).toISOString() });
    }
  }
  return { windows, unchecked };
}

/**
 * Why a row must not be sent after all, or null. PURE. `fresh` is the re-read
 * taken just before the send, or null when the row is no longer there.
 */
export function changedSince(row, fresh) {
  if (!fresh) return "gone";
  const starts = new Date(fresh.starts_at);
  if (Number.isNaN(starts.getTime()) || starts.toISOString() !== row.startsAt) return "moved";
  if (!REMINDABLE.includes(fresh.status) || fresh.patient_deleted !== false || fresh.unaccepted_request !== false) return "status";
  const before = row.lastEmitAt === null ? null : Date.parse(row.lastEmitAt);
  const now = fresh.last_emit_at === null || fresh.last_emit_at === undefined ? null : new Date(fresh.last_emit_at).getTime();
  if (now !== null && (before === null || now > before)) return "saved_again";
  return null;
}

export function bucketOf(startMs, t0Ms) {
  const days = (startMs - t0Ms) / DAY_MS;
  if (days < 2) return "1 to 2";
  if (days < 7) return "2 to 7";
  if (days < 30) return "7 to 30";
  return "over 30";
}

/** Which offsets would still schedule, as a preview of computeDueReminders. */
export function wouldSchedule(startMs, t0Ms) {
  return OFFSETS.filter((o) => startMs - o.minutesBefore * 60_000 > t0Ms).map((o) => `${o.id} ${o.channel}`);
}

/**
 * The one event a row gets. A name, four data keys, and NO id: Inngest gives
 * each event it receives an id of its own. See the header for why a supplied
 * id is the one thing this event must never carry.
 */
export function buildEvent(row) {
  return {
    name: EVENT_NAME,
    data: { appointmentId: row.id, tenantId: row.tenantId, startsAt: row.startsAt, confirmationEligible: false },
  };
}

/** A database row as the verdict reads it. Ids, instants, a status, two flags, a count. */
function normalise(r, tenantId) {
  const id = String(r.id);
  if (!UUID.test(id)) fail("the read returned a row whose id is not a uuid. Refusing.");
  if (String(r.tenant_id) !== tenantId) fail(`the read returned row ${id} for another tenant. Refusing.`);
  if (!REMINDABLE.includes(r.status)) fail(`the read returned row ${id} with a status that is not remindable. Refusing.`);
  const starts = new Date(r.starts_at);
  if (Number.isNaN(starts.getTime())) fail(`the read returned row ${id} with no readable start. Refusing.`);
  return {
    id,
    tenantId,
    startsAt: starts.toISOString(),
    status: r.status,
    unacceptedRequest: r.unaccepted_request === true,
    lastEmitAt: r.last_emit_at === null || r.last_emit_at === undefined ? null : new Date(r.last_emit_at).toISOString(),
    emitEvents: Number(r.emit_events ?? 0),
  };
}

/**
 * What every previous --confirm recorded, keyed id|startsAt. A row is in
 * `sent` once any run got a 2xx for it, and in `attempted` when a run started
 * its request and no run ever confirmed it.
 */
export function readHistory(marker) {
  const sent = new Map();
  const attempted = new Map();
  if (!existsSync(marker)) return { sent, attempted, entries: [] };
  let doc;
  try {
    doc = JSON.parse(readFileSync(marker, "utf8"));
  } catch {
    fail(`the marker ${marker} exists but is not JSON. Refusing: it is the only record of what was already sent.`);
  }
  if (!doc || !Array.isArray(doc.history)) {
    fail(`the marker ${marker} has no history list. Refusing: it is the only record of what was already sent.`);
  }
  for (const e of doc.history) {
    if (!e || !Array.isArray(e.rows)) {
      fail(`the marker ${marker} holds an entry with no row list. Refusing: it is the only record of what was already sent.`);
    }
    for (const r of e.rows) {
      const known = r && typeof r.id === "string" && typeof r.startsAt === "string" && (r.state === "sent" || r.state === "attempted");
      if (!known) fail(`the marker ${marker} holds a row this script cannot read. Refusing: it is the only record of what was already sent.`);
      const key = `${r.id}|${r.startsAt}`;
      if (r.state === "sent") {
        sent.set(key, e.at ?? "an earlier run");
        attempted.delete(key);
      } else if (!sent.has(key)) {
        attempted.set(key, e.at ?? "an earlier run");
      }
    }
  }
  return { sent, attempted, entries: doc.history };
}

/** Written whole, then renamed, so a run that dies mid-write leaves the old file. */
export function writeMarker(marker, entries) {
  const tmp = `${marker}.tmp`;
  writeFileSync(tmp, JSON.stringify({ history: entries }, null, 2) + "\n");
  renameSync(tmp, marker);
}

/**
 * Take the lock, or refuse. Returns the function that releases it. The lock
 * is created with the exclusive flag, so of two runs starting together exactly
 * one gets it.
 */
export function takeLock(lock) {
  let fd;
  try {
    fd = openSync(lock, "wx");
  } catch (e) {
    if (!e || e.code !== "EEXIST") fail(`cannot take the lock ${lock}. Refusing to send without it.`);
    let held = "its holder is not readable";
    try {
      const j = JSON.parse(readFileSync(lock, "utf8"));
      held = `pid ${Number(j.pid)}, taken ${String(j.at).slice(0, 24)}`;
    } catch {
      // The sentence above stands.
    }
    fail(
      `another run holds the lock ${lock} (${held}), or a run died and left it. Two runs must never overlap. ` +
        "If no run is going: read the marker's attempted rows, then delete the lock file by hand.",
    );
  }
  writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }) + "\n");
  closeSync(fd);
  return () => {
    try {
      unlinkSync(lock);
    } catch {
      // Nothing to do: a lock that cannot be removed refuses the next run, which is the safe side.
    }
  };
}

/**
 * The real send. The key goes in the URL path, as Inngest's event API takes
 * it, and is never printed. `eventId` is the id Inngest gave the event.
 */
export async function sendToInngest(event, { key, origin = INNGEST_ORIGIN, fetchImpl = fetch }) {
  let res;
  try {
    res = await fetchImpl(`${origin}/e/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch (e) {
    return { ok: false, why: `network error (${describeError(e)})`, eventId: null };
  }
  if (!res.ok) return { ok: false, why: `HTTP ${res.status}`, eventId: null };
  let eventId = null;
  try {
    const body = await res.json();
    const first = Array.isArray(body?.ids) ? body.ids[0] : null;
    if (typeof first === "string" && /^[0-9A-Za-z_-]{1,64}$/.test(first)) eventId = first;
  } catch {
    // A 2xx is the receipt. The id is a convenience for tracing.
  }
  return { ok: true, why: null, eventId };
}

/** The rehearsal send: one JSON line per event in a local file. Nothing leaves the machine. */
function sinkSender(file) {
  return async (event) => {
    try {
      appendFileSync(file, JSON.stringify(event) + "\n");
    } catch (e) {
      return { ok: false, why: `could not write the sink file (${describeError(e)})`, eventId: null };
    }
    return { ok: true, why: null, eventId: null };
  };
}

/**
 * The sender for this run. CHECKED AGAIN, HERE: preflight() already refused
 * every other case, and the real sender is still built only for the exact
 * production target with a key, so no single mistake before this point can
 * turn a rehearsal into a send. The accepting arm returns a function and
 * calls nothing.
 */
export function buildSender(args, target, env) {
  if (args.sinkFile !== undefined) return sinkSender(args.sinkFile);
  if (target.kind !== "production" || !env.INNGEST_EVENT_KEY) fail("the real send is for the exact production target only. Refusing.");
  return (event) => sendToInngest(event, { key: env.INNGEST_EVENT_KEY });
}

/**
 * An error as this script prints it: its NAME and its CODE, never its message.
 * A database driver's or a network library's message can carry a host, a port
 * or a user name (`connect ECONNREFUSED <host>:<port>`, `password
 * authentication failed for user "<user>"`), and no part of the connection
 * string is ever printed. The name and the code come from fixed vocabularies:
 * anything that does not look like one is left out.
 */
export function describeError(e) {
  const name = e instanceof Error && typeof e.name === "string" && /^[A-Za-z]{1,40}$/.test(e.name) ? e.name : "Error";
  let code = null;
  if (e instanceof Error) {
    if (typeof e.code === "string") code = e.code;
    else if (e.cause instanceof Error && typeof e.cause.code === "string") code = e.cause.code;
  }
  return code !== null && /^[A-Z0-9_]{1,32}$/.test(code) ? `${name} ${code}` : name;
}

/** A promise that loses to a clock. */
function within(promise, ms, what) {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`${what} took longer than ${ms} ms`), { code: "TIMEOUT" })), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/**
 * G3. The answer of the ledger statement as the run reads it. PURE. The
 * statement returns exactly ONE row of two whole numbers, `n` and
 * `handed_over`. Anything else is the NO_COUNT error, never a zero: a count
 * that did not arrive must not read as "no message left".
 */
export function ledgerAnswer(rows) {
  const whole = (v) => Number.isInteger(v) && v >= 0;
  const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  if (!row || !whole(row.n) || !whole(row.handed_over)) {
    throw Object.assign(new Error("the ledger read returned no count"), { code: "NO_COUNT" });
  }
  return { n: row.n, handedOver: row.handed_over };
}

/**
 * The database, read only. `selection` is one READ ONLY transaction: the
 * tenant, the read instant, the rows. `recheck` is one READ ONLY transaction
 * for one row. `ledger` is one READ ONLY transaction for two counts. It ALWAYS
 * asks: with no window it sends the statement with an empty list and reads 0
 * from the database, so the dry run of a first sitting proves the statement
 * on the target before anything is sent.
 */
export async function openReader(raw) {
  // Lazy on purpose: every refusal is testable without the driver.
  const { default: postgres } = await import("postgres");
  const sql = postgres(raw, { max: 1, prepare: false, onnotice: () => {} });
  return {
    async selection(tenantSlug) {
      return sql.begin("read only", async (tx) => {
        const t = await tx`select id::text as id from tenants where slug = ${tenantSlug}`;
        // The script's own sentence, so a Halt: it is printed whole. A driver's error is not.
        if (t.length !== 1) throw new Halt(1, `the read failed: tenant slug "${tenantSlug}" matched ${t.length} tenants, not 1`);
        const clock = await tx`select now() as t0`;
        const rows = await tx.unsafe(SELECT_ROWS, [t[0].id]);
        return { tenantId: t[0].id, t0: clock[0].t0, rows };
      });
    },
    async recheck(tenantId, id) {
      const rows = await sql.begin("read only", (tx) => tx.unsafe(RECHECK_ROW, [tenantId, id]));
      return rows.length === 1 ? rows[0] : null;
    },
    async ledger(tenantId, windows) {
      const rows = await sql.begin("read only", (tx) => tx.unsafe(LEDGER_CHECK, [tenantId, JSON.stringify(windows)]));
      return ledgerAnswer(rows);
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}

/**
 * One bounded read of the ledger. An answer that is not two whole numbers is
 * an error, never a zero: a count that did not arrive must not read as "no
 * message left".
 */
async function readLedger(reader, tenantId, windows) {
  const answer = await within(reader.ledger(tenantId, windows), LEDGER_BOUND_MS, "the ledger read");
  const whole = (v) => Number.isInteger(v) && v >= 0;
  if (!answer || !whole(answer.n) || !whole(answer.handedOver)) {
    throw Object.assign(new Error("the ledger read returned no count"), { code: "NO_COUNT" });
  }
  return answer;
}

/** G3. The refusal, the same sentence after the first read and after the sends. */
function ledgerRefusal(n) {
  return (
    `G3: ${n} reminder ledger row(s) were written for appointments this operation sent, inside the margin of the run ` +
    "that sent them. No message may leave at run time. Send nothing further and report every line above."
  );
}

/** G3. The refusal for marker rows the ledger cannot be asked about. */
function uncheckedRefusal(u) {
  return (
    `G3: ${u} marker row(s) cannot be checked against the ledger. The marker is this operation's only record of ` +
    "what was sent. Send nothing further and report every line above."
  );
}

/**
 * The whole run. `deps` exists for the test file: `env`, `home`, `out` and
 * `now` replace the process's own, `openReader` replaces the database,
 * `writeMarker` replaces the marker's writer and `sleep` replaces the wait
 * before the second ledger read. The command line never sets any of them.
 */
export async function run(argv, deps = {}) {
  const env = deps.env ?? process.env;
  const out = deps.out ?? ((line) => console.log(line));
  const home = deps.home ?? homedir();
  const open = deps.openReader ?? openReader;
  const now = deps.now ?? Date.now;
  const write = deps.writeMarker ?? writeMarker;
  const sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  const args = parseArgs(argv);
  const raw = env.DATABASE_URL_DIRECT ?? env.DATABASE_URL;
  if (!raw) bad("neither DATABASE_URL_DIRECT nor DATABASE_URL is set; source the environment first");
  const target = classifyTarget(raw);
  // THE VERDICT ONLY. No host, port or other parsed piece is printed: in a
  // malformed string any parsed piece can be a piece of the password.
  out(`target   ${TARGET_LABEL[target.kind]}`);
  out(`mode     ${args.confirm ? `CONFIRM, expecting ${args.expect} eligible` : "DRY RUN - nothing is sent"}`);
  if (args.sinkFile !== undefined) out(`sink     REHEARSAL. Events go to ${args.sinkFile} and nowhere else.`);
  out(
    `fix sha  ${args.fixDeployedSha ?? "not given"}  (recorded only: this script CANNOT verify what is deployed, ` +
      "and cannot see whether a reminder run exists for any appointment)",
  );
  out(
    `inngest  ${
      args.checkedInngest
        ? "the operator says the dashboard shows Debounce on schedule-appointment-reminders, Singleton on " +
          `send-appointment-reminder and the trigger expression ${CONFIRMATION_FILTER} on send-appointment-confirmation`
        : "dashboard check not stated"
    }  (recorded only: this script cannot see the hosted scheduler)`,
  );
  if (args.resendAttempted) {
    out(
      "resend   --resend-attempted is given. Sending a row a second time is safe ONLY with the new scheduler settings live. " +
        "The dashboard check is the only guard for that; the canary cannot tell old settings from new.",
    );
  }
  const budgetMs = runBudgetMs(args.max);
  const marginMs = marginMsFor(args.max);
  out(
    `margin   ${marginMs / 1000} s around a reminder mark = ${READ_BOUND_MS / 1000} s for the read + ${budgetMs / 1000} s for the sends ` +
      `(min of --max ${args.max} x ${PER_SEND_BOUND_MS / 1000} s and ${RUN_CAP_MS / 1000} s) + ${SLACK_MS / 1000} s`,
  );

  const refusal = preflight(args, target, env);
  if (refusal) throw new Halt(refusal.code, refusal.msg);

  // A rehearsal keeps its marker and its lock beside its sink file. It never
  // touches the marker a production run reads, and a production run never reads it.
  const marker = args.sinkFile !== undefined ? `${args.sinkFile}.marker.json` : join(home, MARKER_NAME);
  let release = () => {};
  let reader = null;
  try {
    if (args.confirm) {
      // THE MARKER MUST BE WRITABLE BEFORE ANYTHING IS SENT, and no other run
      // may be sending. Both are settled before the database is opened.
      try {
        accessSync(dirname(marker), constants.W_OK);
      } catch {
        fail(`cannot write the marker in ${dirname(marker)}. Refusing to send without it.`);
      }
      release = takeLock(`${marker}.lock`);
    }
    // Read on the DRY RUN too, so the count the dry run prints is the count
    // --confirm will find.
    const history = readHistory(marker);
    const unfinished = history.entries.filter((e) => e.state === "sending");
    if (unfinished.length > 0) {
      out(`NOTE     ${unfinished.length} earlier run(s) did not finish. A row such a run was sending is recorded as attempted.`);
    }

    const readStarted = now();
    let selection;
    try {
      reader = await open(raw);
      selection = await reader.selection(args.tenantSlug);
    } catch (e) {
      if (e instanceof Halt) throw e;
      // The name and the code only. See describeError().
      fail(`the read failed: ${describeError(e)}`);
    }
    const tenantId = String(selection.tenantId);
    if (!UUID.test(tenantId)) fail("the read returned a tenant id that is not a uuid. Refusing.");
    const t0 = new Date(selection.t0);
    if (Number.isNaN(t0.getTime())) fail("the read returned no read instant. Refusing.");
    const t0Ms = t0.getTime();
    const rows = selection.rows.map((r) => normalise(r, tenantId));

    const keyOf = (row) => `${row.id}|${row.startsAt}`;
    const opts = {
      minDaysAhead: args.minDaysAhead,
      maxDaysAhead: args.maxDaysAhead,
      marginMs,
      resendAttempted: args.resendAttempted,
      sent: (row) => history.sent.has(keyOf(row)),
      attempted: (row) => history.attempted.has(keyOf(row)),
    };
    const tally = {
      unaccepted_request: 0,
      inside_24h: 0,
      beyond_max_days: 0,
      touched_25h: 0,
      already_sent: 0,
      attempted: 0,
      near_mark: 0,
      held_back: 0,
      emit: 0,
    };
    const eligible = [];
    let touchedTooLate = 0;
    let near24 = 0;
    let scope = 0;
    let unarmed24To48 = 0;
    let unarmedWithin24 = 0;
    let sentEarlierWithin24 = 0;
    for (const row of rows) {
      const verdict = verdictOf(row, t0Ms, opts);
      tally[verdict] += 1;
      if (verdict === "emit") eligible.push(row);
      if (inScope(verdict)) scope += 1;
      if (leftUnarmed24To48(Date.parse(row.startsAt), t0Ms, verdict)) unarmed24To48 += 1;
      const within24 = within24hCount(verdict, opts.sent(row));
      if (within24 === "not_rearmed") unarmedWithin24 += 1;
      if (within24 === "sent_earlier") sentEarlierWithin24 += 1;
      if (verdict === "touched_25h" && tooLateToWait(row, marginMs)) touchedTooLate += 1;
      if (verdict === "near_mark" && markTooClose(Date.parse(row.startsAt), t0Ms, marginMs) === "24h") near24 += 1;
    }

    out(`tenant   ${args.tenantSlug} = ${tenantId}`);
    out(`read at  ${t0.toISOString()}`);
    out(`FUTURE REMINDABLE: ${rows.length}  (scheduled or confirmed, patient not deleted, starts after the read instant)`);
    out(`skipped: unaccepted online request: ${tally.unaccepted_request}`);
    out(`skipped: starts within 24 hours: ${tally.inside_24h}`);
    out(
      args.maxDaysAhead === null
        ? `held back: starts more than --max-days-ahead days after the read: ${tally.beyond_max_days}  (not given: no upper bound)`
        : `held back: starts more than --max-days-ahead ${args.maxDaysAhead} days after the read: ${tally.beyond_max_days}`,
    );
    out(`skipped: touched in the last 25 hours: ${tally.touched_25h}`);
    out(`  of those, too near their start by the time the 25 hours are up (no later run can reach them): ${touchedTooLate}`);
    out(`skipped: already sent by an earlier run (marker): ${tally.already_sent}`);
    out(`skipped: attempted by an earlier run, outcome unknown (marker): ${tally.attempted}`);
    if (tally.attempted > 0) {
      out("  Inngest may or may not have taken those events. Each send has its own id, so sending them again is safe");
      out("  ONLY IF the scheduler runs the new settings. The dashboard check is the only guard for that: the canary");
      out("  cannot tell old settings from new. If that check passed: add --resend-attempted to include them.");
    }
    out(`held back: a reminder mark is inside the margin: ${tally.near_mark}`);
    out(`  of those, the 24 hour mark (this script will never send for them): ${near24}`);
    out(`  of those, the 48 hour mark (only a run from 1 minute after the mark, and within 23 hours of this read, can send them): ${tally.near_mark - near24}`);
    out(`held back: nearer than --min-days-ahead ${args.minDaysAhead}: ${tally.held_back}`);
    out(`ELIGIBLE: ${eligible.length}`);
    const byStatus = Object.fromEntries(REMINDABLE.map((s) => [s, 0]));
    const byBucket = { "1 to 2": 0, "2 to 7": 0, "7 to 30": 0, "over 30": 0 };
    let resaved = 0;
    let resends = 0;
    for (const row of eligible) {
      byStatus[row.status] += 1;
      byBucket[bucketOf(Date.parse(row.startsAt), t0Ms)] += 1;
      if (row.emitEvents >= 2) resaved += 1;
      if (opts.attempted(row)) resends += 1;
    }
    out(`  by status: ${Object.entries(byStatus).map(([s, n]) => `${s}=${n}`).join(" ")}`);
    out(`  by days until start: ${Object.entries(byBucket).map(([b, n]) => `${b}=${n}`).join("  ")}`);
    out(`  with two or more emitting audit events (saved again at least once): ${resaved}`);
    out(`  attempted before and sent again now (--resend-attempted): ${resends}`);

    // G1. The bound for everything in scope at THIS read, sent already or not,
    // and not for this run alone. The first sitting's number is the gate.
    const projected = projectedExecutions(scope);
    const underLimit = underExecutionLimit(projected);
    out(
      `G1 PROJECTED SCHEDULER EXECUTIONS: ${projected} at most  ` +
        `(${scope} appointments in scope x ${EXECUTIONS_PER_EVENT}: 3 runs and 5 steps each)`,
    );
    out(`G1 UNDER THE LIMIT OF ${EXECUTION_LIMIT}: ${underLimit ? "yes" : "NO"}`);
    // G4. A count for reception. No screen lists appointments without a reminder,
    // so the sentence names the two screens reception compares. A row inside 24
    // hours that an earlier run sent at this start was re-armed: the third line.
    out(
      `G4 NEXT 48 HOURS, NOT RE-ARMED: ${unarmedWithin24 + unarmed24To48}  ` +
        `(starting within 24 hours: ${unarmedWithin24}; 24 to 48 hours ahead: ${unarmed24To48})`,
    );
    out("  reception sees these appointments in Agenda, and which of them got an SMS in Comunicações, Lembretes SMS");
    out(`  not counted: ${sentEarlierWithin24} starting within 24 hours that an earlier run of this operation sent`);
    // G3, in every mode and before anything is sent: did a message leave for a
    // row an earlier run sent, inside that run's margin? Expected: nothing.
    const earlier = ledgerWindows(history.entries);
    let ledger;
    try {
      ledger = await readLedger(reader, tenantId, earlier.windows);
    } catch (e) {
      fail(`the G3 ledger read failed: ${describeError(e)}`);
    }
    out(
      `G3 LEDGER ROWS FOR APPOINTMENTS THIS OPERATION SENT, INSIDE THE MARGIN OF THEIR RUN: ${ledger.n}  ` +
        `(appointments checked: ${earlier.windows.length}; handed to a provider: ${ledger.handedOver}; ` +
        `not checkable: ${earlier.unchecked}; expected 0)`,
    );
    if (ledger.n > 0) fail(ledgerRefusal(ledger.n));
    // A marker row the ledger cannot be asked about is a row nobody checked.
    if (earlier.unchecked > 0) fail(uncheckedRefusal(earlier.unchecked));

    const batch = eligible.slice(0, args.max);
    out(`THIS RUN: ${batch.length} of ${eligible.length}  (--max ${args.max}; left for a later run: ${eligible.length - batch.length})`);
    if (!args.confirm) {
      out(`the first ${Math.min(20, eligible.length)} eligible, in the order they would be sent:`);
      for (const row of eligible.slice(0, 20)) {
        const startMs = Date.parse(row.startsAt);
        out(`  ${row.id}  starts ${row.startsAt}  ${row.status.padEnd(9)}  would schedule: ${wouldSchedule(startMs, t0Ms).join(", ") || "nothing"}`);
      }
      out(
        `DRY RUN - nothing was sent. To send the first ${batch.length}: the same command plus --confirm --expect ${eligible.length} ` +
          "--fix-deployed-sha <sha> --i-checked-inngest-settings",
      );
      return { sent: 0, eligible: eligible.length, changed: 0, attempted: 0, notReached: 0 };
    }
    // G1 refuses a confirm, real or rehearsal, before the marker is touched.
    if (!underLimit) {
      fail(
        `G1: the projected scheduler executions are ${projected}, which is not under the limit of ${EXECUTION_LIMIT}. ` +
          "Nothing was sent and nothing was recorded. Report every line above.",
      );
    }
    if (eligible.length !== args.expect) {
      fail(`expected ${args.expect} eligible rows and found ${eligible.length}. Something changed since the dry run; run the dry run again.`);
    }
    if (batch.length === 0) {
      out("SENT: 0 of 0  (nothing is eligible; the marker was not touched)");
      return { sent: 0, eligible: 0, changed: 0, attempted: 0, notReached: 0 };
    }

    const send = buildSender(args, target, env);
    const entries = [...history.entries];
    const entry = {
      at: new Date().toISOString(),
      tenantSlug: args.tenantSlug,
      tenantId,
      readAt: t0.toISOString(),
      fixDeployedSha: args.fixDeployedSha ?? null,
      checkedInngestSettings: args.checkedInngest,
      resendAttempted: args.resendAttempted,
      sink: args.sinkFile !== undefined,
      eligible: eligible.length,
      max: args.max,
      minDaysAhead: args.minDaysAhead,
      maxDaysAhead: args.maxDaysAhead,
      marginMs,
      state: "sending",
      rows: [],
    };
    entries.push(entry);
    // CLAIM FIRST. The marker is written before the first event, so a marker
    // that cannot be written stops the run while nothing has been sent.
    try {
      write(marker, entries);
    } catch {
      fail(`could not write the marker ${marker}; nothing was sent.`);
    }
    out(
      `sending  ${batch.length} x ${EVENT_NAME} to ${args.sinkFile !== undefined ? "the sink file" : INNGEST_ORIGIN} ` +
        "(the event key is not printed)",
    );
    let stopped = null;
    let outOfTime = false;
    let sent = 0;
    let changed = 0;
    let handled = 0;
    for (const row of batch) {
      // THE RUN'S HALF OF THE MARGIN. A send that could end after the time for
      // the sends is spent is not started.
      if (now() - readStarted + PER_SEND_BOUND_MS > READ_BOUND_MS + budgetMs) {
        outOfTime = true;
        break;
      }
      // READ AGAIN, just before the send.
      let fresh;
      try {
        fresh = await within(reader.recheck(tenantId, row.id), RECHECK_BOUND_MS, "the re-read");
      } catch (e) {
        stopped = `${row.id}: could not be read again (${describeError(e)}); nothing was sent for it`;
        break;
      }
      const reason = changedSince(row, fresh);
      if (reason !== null) {
        changed += 1;
        handled += 1;
        out(`  skip ${row.id}  starts ${row.startsAt}  changed since the read (${reason})`);
        continue;
      }
      // ATTEMPTED, ON DISK, BEFORE THE REQUEST LEAVES. A run that dies in the
      // request leaves the row attempted, and no later run sends it unasked.
      const record = { id: row.id, startsAt: row.startsAt, state: "attempted", at: new Date().toISOString() };
      entry.rows.push(record);
      try {
        write(marker, entries);
      } catch {
        entry.rows.pop();
        stopped = `${row.id}: the marker ${marker} could not be updated; nothing was sent for it`;
        break;
      }
      handled += 1;
      const res = await send(buildEvent(row));
      if (!res.ok) {
        record.why = res.why;
        stopped = `${row.id}: ${res.why}. The row stays ATTEMPTED: Inngest may or may not have taken the event`;
        break;
      }
      record.state = "sent";
      record.eventId = res.eventId;
      sent += 1;
      // AND SENT, ON DISK, before the line that says so.
      try {
        write(marker, entries);
      } catch {
        stopped = `${row.id}: SENT, but the marker ${marker} could not be updated and still says attempted`;
        break;
      }
      out(`  sent ${row.id}  starts ${row.startsAt}  ${row.status}`);
    }
    entry.state = stopped ? "stopped" : outOfTime ? "out_of_time" : "done";
    try {
      write(marker, entries);
    } catch {
      console.error(`WARNING: could not update ${marker}. Keep every line above and below; they are the record.`);
    }
    const attempted = entry.rows.filter((r) => r.state === "attempted").length;
    const notReached = batch.length - handled;
    out(`SENT: ${sent} of ${batch.length}  (recorded in ${marker})`);
    out(`changed since the read, not sent: ${changed}`);
    out(`attempted, outcome unknown: ${attempted}`);
    out(`not reached: ${notReached}`);
    // G4. Every row in the entry was written as attempted before its request left.
    const started = entry.rows.length;
    out(`G4 ATTEMPTED EQUALS SENT: ${attemptedEqualsSent(started, sent) ? "yes" : "NO"} (${started} requests started, ${sent} sent)`);
    // G3 AGAIN, for the rows of this run, once the scheduler has had time to
    // act on them. A run that started no request has nothing to ask about: it
    // prints the same line with zeros, without a wait and without a read.
    let after = null;
    let afterFailed = null;
    if (started > 0) {
      await sleep(SETTLE_MS);
      out(`settle   waited ${SETTLE_MS / 1000} s for the scheduler before the second ledger read`);
      const mine = ledgerWindows([entry]);
      try {
        after = await readLedger(reader, tenantId, mine.windows);
        out(`G3 AFTER THIS RUN: ${after.n}  (appointments checked: ${mine.windows.length}; handed to a provider: ${after.handedOver}; expected 0)`);
      } catch (e) {
        afterFailed = describeError(e);
        out(`G3 AFTER THIS RUN: NOT READ  (the G3 ledger read failed: ${afterFailed})`);
      }
    } else {
      out("G3 AFTER THIS RUN: 0  (appointments checked: 0; handed to a provider: 0; expected 0)");
    }
    // A run whose second read found a ledger row, or could not be made, says so
    // in the marker: its entry is not `done`.
    if (afterFailed !== null || (after !== null && after.n > 0)) {
      entry.state = "g3_failed";
      try {
        write(marker, entries);
      } catch {
        console.error(`WARNING: could not update ${marker}. Keep every line above and below; they are the record.`);
      }
    }
    if (stopped) fail(`stopped at ${stopped}. Report the lines above. A later run skips what the marker holds as sent or attempted.`);
    if (afterFailed !== null) fail(`the G3 ledger read failed: ${afterFailed}`);
    if (after !== null && after.n > 0) fail(ledgerRefusal(after.n));
    if (outOfTime) {
      out("OUT OF TIME: the time for the sends is spent, so no event can land near a reminder mark. Run the dry run again for the rest.");
    }
    return { sent, eligible: eligible.length, changed, attempted, notReached };
  } finally {
    if (reader) {
      try {
        await reader.close();
      } catch {
        // The run's result stands whether or not the connection closed cleanly.
      }
    }
    release();
  }
}

function isMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  try {
    await run(process.argv.slice(2));
  } catch (e) {
    if (e instanceof Halt) {
      console.error(`${e.code === 2 ? "BAD INVOCATION" : "FAILED"}: ${e.message}`);
      if (e.code === 2) console.error(USAGE);
      process.exit(e.code);
    }
    // The name and the code only: an unexpected error's message is not known to be free of data.
    console.error(`FAILED: unexpected error (${describeError(e)})`);
    process.exit(1);
  }
}
