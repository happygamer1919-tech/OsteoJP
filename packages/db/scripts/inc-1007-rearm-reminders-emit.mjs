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
// measured). A row held back for its 48 hour mark is sent by a later run. A
// row held back for its 24 hour mark will be inside 24 hours by then, so this
// script never sends for it: the real floor is 24 hours plus the margin.
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
//      row again is safe under the fix. The flag is a deliberate choice, not a
//      danger: without it the row may have no run; with it the row gets a
//      fresh one either way.
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
//     dashboard first and sees Singleton and Debounce on the two functions.
//   - Whether a run exists for any appointment.
//
// USAGE, from the repo root with the production environment sourced:
//   node packages/db/scripts/inc-1007-rearm-reminders-emit.mjs --tenant-slug osteojp
//     DRY RUN, the default. Reads, prints what it WOULD emit, sends nothing.
//   ... plus --confirm --expect <N> --fix-deployed-sha <40 hex> --i-checked-inngest-settings
//     Re-reads the same way, refuses unless exactly N rows are eligible, then
//     emits the first --max of them (25 unless told otherwise).
//   --min-days-ahead <D> narrows a run to appointments D or more days ahead.
//   --resend-attempted lets rows the marker holds as attempted be sent again.
//   --sink-file <absolute path> is for REHEARSAL on a local database: events
//     are appended to that file, nothing is sent anywhere, and the marker and
//     the lock are kept beside the file, never in the home directory.
// It reads the exact production target or a strict local database (127.0.0.1
// or localhost) and NOTHING ELSE, the dry run included.
//
// It prints appointment ids, instants, statuses and counts. NEVER a patient
// name, phone or email (CLAUDE.md rule 7), never the connection string, any
// part of it, or the key. Every read is a READ ONLY transaction. It writes
// nothing to Postgres.
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

export const USAGE = `usage:
  node packages/db/scripts/inc-1007-rearm-reminders-emit.mjs --tenant-slug <slug>
       [--confirm --expect <N> --fix-deployed-sha <40 hex> --i-checked-inngest-settings]
       [--max <N, default ${DEFAULT_MAX}>] [--min-days-ahead <D, default 1>] [--resend-attempted]
       [--sink-file <absolute path, rehearsal on a local database only>]`;

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
  const takes = new Set(["--tenant-slug", "--expect", "--max", "--min-days-ahead", "--sink-file", "--fix-deployed-sha"]);
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
    if (a === "--sink-file") out.sinkFile = v;
    if (a === "--fix-deployed-sha") out.fixDeployedSha = v;
  }
  if (!out.tenantSlug || !SLUG.test(out.tenantSlug)) bad("--tenant-slug is required (lowercase slug)");
  if (out.expect !== undefined && !/^\d+$/.test(out.expect)) bad("--expect must be a whole number");
  if (!/^[1-9]\d{0,5}$/.test(out.max)) bad("--max must be a whole number, 1 or more");
  if (!/^[1-9]\d{0,3}$/.test(out.minDaysAhead)) {
    bad("--min-days-ahead must be a whole number, 1 or more. It can narrow a run; the 24 hour floor never moves");
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
          "production app and check that schedule-appointment-reminders shows Debounce and that " +
          "send-appointment-reminder shows Singleton. If either is missing the fix is not live in the " +
          "scheduler: do not run this.",
      );
    }
  }
  out.expect = out.expect === undefined ? undefined : Number(out.expect);
  out.max = Number(out.max);
  out.minDaysAhead = Number(out.minDaysAhead);
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
function writeMarker(marker, entries) {
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
    return { ok: false, why: `network error (${e instanceof Error ? e.name : "unknown"})`, eventId: null };
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
      return { ok: false, why: `could not write the sink file (${e instanceof Error ? e.name : "unknown"})`, eventId: null };
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

/** A promise that loses to a clock. */
function within(promise, ms, what) {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took longer than ${ms} ms`)), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/**
 * The database, read only. `selection` is one READ ONLY transaction: the
 * tenant, the read instant, the rows. `recheck` is one READ ONLY transaction
 * for one row.
 */
export async function openReader(raw) {
  // Lazy on purpose: every refusal is testable without the driver.
  const { default: postgres } = await import("postgres");
  const sql = postgres(raw, { max: 1, prepare: false, onnotice: () => {} });
  return {
    async selection(tenantSlug) {
      return sql.begin("read only", async (tx) => {
        const t = await tx`select id::text as id from tenants where slug = ${tenantSlug}`;
        if (t.length !== 1) throw new Error(`tenant slug "${tenantSlug}" matched ${t.length} tenants, not 1`);
        const clock = await tx`select now() as t0`;
        const rows = await tx.unsafe(SELECT_ROWS, [t[0].id]);
        return { tenantId: t[0].id, t0: clock[0].t0, rows };
      });
    },
    async recheck(tenantId, id) {
      const rows = await sql.begin("read only", (tx) => tx.unsafe(RECHECK_ROW, [tenantId, id]));
      return rows.length === 1 ? rows[0] : null;
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}

/**
 * The whole run. `deps` exists for the test file: `env`, `home`, `out` and
 * `now` replace the process's own, and `openReader` replaces the database.
 * The command line never sets any of them.
 */
export async function run(argv, deps = {}) {
  const env = deps.env ?? process.env;
  const out = deps.out ?? ((line) => console.log(line));
  const home = deps.home ?? homedir();
  const open = deps.openReader ?? openReader;
  const now = deps.now ?? Date.now;

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
    `inngest  ${args.checkedInngest ? "the operator says the two functions show Singleton and Debounce" : "dashboard check not stated"}` +
      "  (recorded only: this script cannot see the hosted scheduler)",
  );
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
      fail(`the read failed: ${e instanceof Error ? e.message : "unknown error"}`);
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
      marginMs,
      resendAttempted: args.resendAttempted,
      sent: (row) => history.sent.has(keyOf(row)),
      attempted: (row) => history.attempted.has(keyOf(row)),
    };
    const tally = { unaccepted_request: 0, inside_24h: 0, touched_25h: 0, already_sent: 0, attempted: 0, near_mark: 0, held_back: 0, emit: 0 };
    const eligible = [];
    let touchedTooLate = 0;
    let near24 = 0;
    for (const row of rows) {
      const verdict = verdictOf(row, t0Ms, opts);
      tally[verdict] += 1;
      if (verdict === "emit") eligible.push(row);
      if (verdict === "touched_25h" && tooLateToWait(row, marginMs)) touchedTooLate += 1;
      if (verdict === "near_mark" && markTooClose(Date.parse(row.startsAt), t0Ms, marginMs) === "24h") near24 += 1;
    }

    out(`tenant   ${args.tenantSlug} = ${tenantId}`);
    out(`read at  ${t0.toISOString()}`);
    out(`FUTURE REMINDABLE: ${rows.length}  (scheduled or confirmed, patient not deleted, starts after the read instant)`);
    out(`skipped: unaccepted online request: ${tally.unaccepted_request}`);
    out(`skipped: starts within 24 hours: ${tally.inside_24h}`);
    out(`skipped: touched in the last 25 hours: ${tally.touched_25h}`);
    out(`  of those, too near their start by the time the 25 hours are up (no later run can reach them): ${touchedTooLate}`);
    out(`skipped: already sent by an earlier run (marker): ${tally.already_sent}`);
    out(`skipped: attempted by an earlier run, outcome unknown (marker): ${tally.attempted}`);
    if (tally.attempted > 0) {
      out("  Inngest may or may not have taken those events. Each send has its own id, so sending them again is safe");
      out("  under the fix: add --resend-attempted to include them.");
    }
    out(`held back: a reminder mark is inside the margin: ${tally.near_mark}`);
    out(`  of those, the 24 hour mark (this script will never send for them): ${near24}`);
    out(`  of those, the 48 hour mark (a later run sends them): ${tally.near_mark - near24}`);
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
      marginMs,
      state: "sending",
      rows: [],
    };
    entries.push(entry);
    // CLAIM FIRST. The marker is written before the first event, so a marker
    // that cannot be written stops the run while nothing has been sent.
    try {
      writeMarker(marker, entries);
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
        stopped = `${row.id}: could not be read again (${e instanceof Error ? e.name : "unknown"}); nothing was sent for it`;
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
        writeMarker(marker, entries);
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
        writeMarker(marker, entries);
      } catch {
        stopped = `${row.id}: SENT, but the marker ${marker} could not be updated and still says attempted`;
        break;
      }
      out(`  sent ${row.id}  starts ${row.startsAt}  ${row.status}`);
    }
    entry.state = stopped ? "stopped" : outOfTime ? "out_of_time" : "done";
    try {
      writeMarker(marker, entries);
    } catch {
      console.error(`WARNING: could not update ${marker}. Keep every line above and below; they are the record.`);
    }
    const attempted = entry.rows.filter((r) => r.state === "attempted").length;
    const notReached = batch.length - handled;
    out(`SENT: ${sent} of ${batch.length}  (recorded in ${marker})`);
    out(`changed since the read, not sent: ${changed}`);
    out(`attempted, outcome unknown: ${attempted}`);
    out(`not reached: ${notReached}`);
    if (stopped) fail(`stopped at ${stopped}. Report the lines above. A later run skips what the marker holds as sent or attempted.`);
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
    // The NAME only: an unexpected error's message is not known to be free of data.
    console.error(`FAILED: unexpected error (${e instanceof Error ? e.name : "unknown"})`);
    process.exit(1);
  }
}
