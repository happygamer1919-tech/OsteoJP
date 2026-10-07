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
// be listed exactly. With the fix live, emitting `appointment/scheduled` again
// is SAFE: it ends with exactly one live run per (appointment, offset,
// channel). So this emits that event once for every future remindable
// appointment, with confirmationEligible FALSE, because a booking confirmation
// arriving now for a booking made days ago would be wrong.
//
// WHICH ROWS. All of these, for the one tenant named by --tenant-slug:
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
//   - NO emitting audit event in the last 25 hours. See the next section.
//
// ===================================================================
// WHY A ROW TOUCHED IN THE LAST 25 HOURS IS NEVER EMITTED
// ===================================================================
// This script cannot see the hosted scheduler. If it were still on the old
// settings, an emit inside 24 hours of the previous one is exactly what
// destroys a reminder. So a row whose audit trail shows an emitting event in
// the last 25 hours is counted under "skipped: touched in the last 25 hours"
// and left alone. A later run picks it up.
//
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
// WHAT STOPS ONE ROW BEING EMITTED TWICE
// ===================================================================
//   1. every event carries the id inc1007-rearm:<appointmentId>:<startsAt>, so
//      Inngest drops a repeat inside 24 hours;
//   2. the marker file keeps a PERMANENT history of every id sent. A row
//      already in it at the same start is skipped on every later run, at any
//      age. It is written after every single event, so a run that dies keeps
//      what it sent. Never delete the marker.
// There is no "wait 25 hours between runs" rule here, on purpose: the first
// run is a canary (--max defaults to 25) and a second run continues with the
// rest.
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
//   --sink-file <absolute path> is for REHEARSAL on a local database: events
//     are appended to that file, nothing is sent anywhere, and the marker is
//     kept beside the file, never in the home directory.
//
// It prints appointment ids, instants, statuses and counts. NEVER a patient
// name, phone or email (CLAUDE.md rule 7), never the connection string or the
// key. The read is one READ ONLY transaction. It writes nothing to Postgres.
//
// EXIT 0 OK, 1 FAILED, 2 BAD_INVOCATION (the repo's tooling convention).

import { accessSync, appendFileSync, constants, existsSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PRODUCTION, REASONS, checkProductionTarget } from "../../../scripts/production-target.mjs";

/** EVENT_APPOINTMENT_SCHEDULED, apps/web/lib/reminders/inngest/client.ts. */
export const EVENT_NAME = "appointment/scheduled";
/** REMINDER_OFFSETS, apps/web/lib/reminders/offsets.ts. Used for the PREVIEW only:
 *  the real decision is computeDueReminders inside the Inngest function. */
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
const INNGEST_ORIGIN = "https://inn.gs";
const MARKER_NAME = ".osteojp-inc1007-rearm.json";
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{40}$/;
const REMINDABLE = ["scheduled", "confirmed"];
/** The only local form a rehearsal may use: one "@", no list of hosts, no query. */
const STRICT_LOCAL = /^postgres(?:ql)?:\/\/[^@/?#,\s]+@(?:127\.0\.0\.1|localhost):\d+\/[A-Za-z0-9_]+$/;

/*
 * THE READ. One tenant ($1), every future remindable row, and the facts the
 * verdict needs. It decides nothing: verdictOf() below does, so the 24 hour and
 * 25 hour boundaries are tested as code and not as text.
 *
 * `unaccepted_request` is public.is_unconfirmed_pedido's own test (migration
 * 0067), without its JWT tenant line: the tenant is bound here from $1.
 * `last_emit_at` and `emit_events` read the audit trail for the emitting events
 * the header lists. No patient column is selected except the soft-delete flag
 * in the WHERE clause.
 */
export const SELECT_ROWS = `
with k as (select $1::uuid as tenant_id, now() as t0)
select a.id::text as id,
       a.tenant_id::text as tenant_id,
       a.starts_at,
       a.status::text as status,
       (a.status = 'scheduled'
        and (a.origin = 'patient_portal'
             or exists (select 1 from staff_notifications n
                         where n.tenant_id = a.tenant_id
                           and n.appointment_id = a.id
                           and n.kind = 'appointment_request'))) as unaccepted_request,
       e.last_emit_at,
       e.emit_events,
       k.t0
  from appointments a
  join k on k.tenant_id = a.tenant_id
  join patients p on p.id = a.patient_id and p.tenant_id = a.tenant_id
  cross join lateral (
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
  ) e
 where a.status::text in ('scheduled', 'confirmed')
   and p.deleted_at is null
   and a.starts_at > k.t0
 order by a.starts_at, a.id`;

export const USAGE = `usage:
  node packages/db/scripts/inc-1007-rearm-reminders-emit.mjs --tenant-slug <slug>
       [--confirm --expect <N> --fix-deployed-sha <40 hex> --i-checked-inngest-settings]
       [--max <N, default ${DEFAULT_MAX}>] [--min-days-ahead <D, default 1>]
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
  const out = { confirm: false, checkedInngest: false, max: String(DEFAULT_MAX), minDaysAhead: "1" };
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
  if (!/^[1-9]\d*$/.test(out.max)) bad("--max must be a whole number, 1 or more");
  if (!/^[1-9]\d*$/.test(out.minDaysAhead)) {
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
 * production check. PURE: it opens nothing.
 *   production       the exact production target, every parsed part.
 *   near-production  it names the production ref or host but is NOT the exact
 *                    target. Refused in every mode: a string like that is either
 *                    the wrong pooler or somebody getting past a guard.
 *   local            the strict local form a rehearsal uses.
 *   other            anything else that parses. A dry run may read it.
 *   unreadable       it did not parse.
 */
export function classifyTarget(raw) {
  const check = checkProductionTarget(raw);
  if (check.ok) return { kind: "production", seen: check.seen, why: null };
  if (check.seen === null) return { kind: "unreadable", seen: null, why: REASONS[check.failed] };
  const lower = raw.toLowerCase();
  if (lower.includes(PRODUCTION.ref) || lower.includes(PRODUCTION.host)) {
    return { kind: "near-production", seen: check.seen, why: REASONS[check.failed] };
  }
  return { kind: STRICT_LOCAL.test(raw) ? "local" : "other", seen: check.seen, why: null };
}

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
  if (args.sinkFile !== undefined && target.kind === "production") {
    return { code: 1, msg: "--sink-file is for rehearsal and the target is PRODUCTION. Refusing." };
  }
  if (args.sinkFile !== undefined && target.kind !== "local") {
    return {
      code: 1,
      msg:
        "--sink-file is for rehearsal on a LOCAL database: 127.0.0.1 or localhost, one host, no query string. " +
        "The target is not that. Refusing.",
    };
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
 * What happens to one row. PURE. `t0Ms` is the read instant from the database.
 * The order is the order of the report: the first reason that applies wins.
 */
export function verdictOf(row, t0Ms, opts) {
  const startMs = Date.parse(row.startsAt);
  if (row.unacceptedRequest) return "unaccepted_request";
  if (!(startMs - t0Ms > LEAD_MS)) return "inside_24h";
  if (row.lastEmitAt !== null && Date.parse(row.lastEmitAt) >= t0Ms - TOUCH_MS) return "touched_25h";
  if (opts.alreadySent(row)) return "already_sent";
  if (startMs - t0Ms < opts.minDaysAhead * DAY_MS) return "held_back";
  return "emit";
}

/**
 * True for a touched row that this script can NEVER re-arm: by the time its 25
 * hours are up it will be inside 24 hours of its start. PURE.
 */
export function tooLateToWait(row) {
  if (row.lastEmitAt === null) return false;
  return Date.parse(row.startsAt) <= Date.parse(row.lastEmitAt) + TOUCH_MS + LEAD_MS;
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

/** The one event a row gets. Four data keys and no fifth. */
export function buildEvent(row) {
  return {
    name: EVENT_NAME,
    id: `inc1007-rearm:${row.id}:${row.startsAt}`,
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

/** Everything any previous --confirm recorded as sent, keyed id|startsAt. */
export function readHistory(marker) {
  const exact = new Map();
  if (!existsSync(marker)) return { exact, entries: [] };
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
    for (const s of Array.isArray(e?.sent) ? e.sent : []) {
      if (s && typeof s.id === "string" && typeof s.startsAt === "string") exact.set(`${s.id}|${s.startsAt}`, e.at ?? "an earlier run");
    }
  }
  return { exact, entries: doc.history };
}

/** Written whole, then renamed, so a run that dies mid-write leaves the old file. */
function writeMarker(marker, entries) {
  const tmp = `${marker}.tmp`;
  writeFileSync(tmp, JSON.stringify({ history: entries }, null, 2) + "\n");
  renameSync(tmp, marker);
}

/** The real send. The key goes in the URL path, as Inngest's event API takes it, and is never printed. */
export async function sendToInngest(event, { key, origin = INNGEST_ORIGIN, fetchImpl = fetch }) {
  let res;
  try {
    res = await fetchImpl(`${origin}/e/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    return { ok: false, why: `network error (${e instanceof Error ? e.name : "unknown"})` };
  }
  if (!res.ok) return { ok: false, why: `HTTP ${res.status}` };
  return { ok: true, why: null };
}

/** The rehearsal send: one JSON line per event in a local file. Nothing leaves the machine. */
function sinkSender(file) {
  return async (event) => {
    try {
      appendFileSync(file, JSON.stringify(event) + "\n");
    } catch (e) {
      return { ok: false, why: `could not write the sink file (${e instanceof Error ? e.name : "unknown"})` };
    }
    return { ok: true, why: null };
  };
}

/** One READ ONLY transaction: the tenant, the read instant, the rows. */
async function readSelection(raw, tenantSlug) {
  // Lazy on purpose: every refusal is testable without the driver.
  const { default: postgres } = await import("postgres");
  const sql = postgres(raw, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await sql.begin("read only", async (tx) => {
      const t = await tx`select id::text as id from tenants where slug = ${tenantSlug}`;
      if (t.length !== 1) throw new Error(`tenant slug "${tenantSlug}" matched ${t.length} tenants, not 1`);
      const clock = await tx`select now() as t0`;
      const rows = await tx.unsafe(SELECT_ROWS, [t[0].id]);
      return { tenantId: t[0].id, t0: clock[0].t0, rows };
    });
  } catch (e) {
    fail(`the read failed: ${e instanceof Error ? e.message : "unknown error"}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * The whole run. `deps` exists for the test file: `env`, `home` and `out`
 * replace the process's own, and `readSelection` replaces the database read.
 * The command line never sets any of them.
 */
export async function run(argv, deps = {}) {
  const env = deps.env ?? process.env;
  const out = deps.out ?? ((line) => console.log(line));
  const home = deps.home ?? homedir();
  const read = deps.readSelection ?? readSelection;

  const args = parseArgs(argv);
  const raw = env.DATABASE_URL_DIRECT ?? env.DATABASE_URL;
  if (!raw) bad("neither DATABASE_URL_DIRECT nor DATABASE_URL is set; source the environment first");
  const target = classifyTarget(raw);
  // The host is printed only for a string with exactly one "@". A stray "@" in a
  // password would move part of the password into what parses as the host.
  if (target.seen && raw.split("@").length === 2) {
    const label = { production: "PRODUCTION", "near-production": "NAMES PRODUCTION, NOT THE EXACT TARGET", local: "NOT production (local)", other: "NOT production" };
    out(`target   host ${target.seen.host}  port ${target.seen.port}  ref ${target.seen.ref || "(none)"}  ${label[target.kind]}`);
  }
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

  const refusal = preflight(args, target, env);
  if (refusal) throw new Halt(refusal.code, refusal.msg);

  // A rehearsal keeps its marker beside its sink file. It never touches the
  // marker a production run reads, and a production run never reads it.
  const marker = args.sinkFile !== undefined ? `${args.sinkFile}.marker.json` : join(home, MARKER_NAME);
  if (args.confirm) {
    // THE MARKER MUST BE WRITABLE BEFORE ANYTHING IS SENT. It is the record that
    // stops a later run sending the same row again.
    try {
      accessSync(dirname(marker), constants.W_OK);
    } catch {
      fail(`cannot write the marker in ${dirname(marker)}. Refusing to send without it.`);
    }
  }
  // Read on the DRY RUN too, so the count the dry run prints is the count
  // --confirm will find.
  const history = readHistory(marker);
  const unfinished = history.entries.filter((e) => e?.state === "sending");
  if (unfinished.length > 0) {
    out(
      `NOTE     ${unfinished.length} earlier run(s) did not finish. Their last event may have been sent without being ` +
        "recorded. Inngest drops a repeat of the same event id for 24 hours.",
    );
  }

  const selection = await read(raw, args.tenantSlug);
  const tenantId = String(selection.tenantId);
  if (!UUID.test(tenantId)) fail("the read returned a tenant id that is not a uuid. Refusing.");
  const t0 = new Date(selection.t0);
  if (Number.isNaN(t0.getTime())) fail("the read returned no read instant. Refusing.");
  const t0Ms = t0.getTime();
  const rows = selection.rows.map((r) => normalise(r, tenantId));

  const opts = {
    minDaysAhead: args.minDaysAhead,
    alreadySent: (row) => history.exact.has(`${row.id}|${row.startsAt}`),
  };
  const tally = { unaccepted_request: 0, inside_24h: 0, touched_25h: 0, already_sent: 0, held_back: 0, emit: 0 };
  const eligible = [];
  let touchedTooLate = 0;
  for (const row of rows) {
    const verdict = verdictOf(row, t0Ms, opts);
    tally[verdict] += 1;
    if (verdict === "emit") eligible.push(row);
    if (verdict === "touched_25h" && tooLateToWait(row)) touchedTooLate += 1;
  }

  out(`tenant   ${args.tenantSlug} = ${tenantId}`);
  out(`read at  ${t0.toISOString()}`);
  out(`FUTURE REMINDABLE: ${rows.length}  (scheduled or confirmed, patient not deleted, starts after the read instant)`);
  out(`skipped: unaccepted online request: ${tally.unaccepted_request}`);
  out(`skipped: starts within 24 hours: ${tally.inside_24h}`);
  out(`skipped: touched in the last 25 hours: ${tally.touched_25h}`);
  out(`  of those, inside 24 hours of their start before the 25 hours are up (no later run can reach them): ${touchedTooLate}`);
  out(`skipped: already sent by an earlier run (marker): ${tally.already_sent}`);
  out(`held back: nearer than --min-days-ahead ${args.minDaysAhead}: ${tally.held_back}`);
  out(`ELIGIBLE: ${eligible.length}`);
  const byStatus = Object.fromEntries(REMINDABLE.map((s) => [s, 0]));
  const byBucket = { "1 to 2": 0, "2 to 7": 0, "7 to 30": 0, "over 30": 0 };
  let resaved = 0;
  for (const row of eligible) {
    byStatus[row.status] += 1;
    byBucket[bucketOf(Date.parse(row.startsAt), t0Ms)] += 1;
    if (row.emitEvents >= 2) resaved += 1;
  }
  out(`  by status: ${Object.entries(byStatus).map(([s, n]) => `${s}=${n}`).join(" ")}`);
  out(`  by days until start: ${Object.entries(byBucket).map(([b, n]) => `${b}=${n}`).join("  ")}`);
  out(`  with two or more emitting audit events (saved again at least once): ${resaved}`);

  const batch = eligible.slice(0, args.max);
  out(`THIS RUN: ${batch.length} of ${eligible.length}  (--max ${args.max}; left for a later run: ${eligible.length - batch.length})`);
  if (!args.confirm) {
    out(`the first ${Math.min(20, eligible.length)} eligible, in the order they would be sent:`);
    for (const row of eligible.slice(0, 20)) {
      const startMs = Date.parse(row.startsAt);
      out(`  ${row.id}  starts ${row.startsAt}  ${row.status.padEnd(9)}  would schedule: ${wouldSchedule(startMs, t0Ms).join(", ") || "nothing"}`);
    }
    out(
      `DRY RUN - nothing was sent. To send the first ${batch.length}: add --confirm --expect ${eligible.length} ` +
        "--fix-deployed-sha <sha> --i-checked-inngest-settings",
    );
    return { sent: 0, eligible: eligible.length };
  }
  if (eligible.length !== args.expect) {
    fail(`expected ${args.expect} eligible rows and found ${eligible.length}. Something changed since the dry run; run the dry run again.`);
  }
  if (batch.length === 0) {
    out("SENT: 0 of 0  (nothing is eligible; the marker was not touched)");
    return { sent: 0, eligible: 0 };
  }

  // CHECKED AGAIN, HERE. preflight() already refused every other case. The real
  // sender is still built only for the exact production target, so no single
  // mistake above this line can turn a rehearsal into a send.
  let send;
  if (args.sinkFile !== undefined) {
    send = sinkSender(args.sinkFile);
  } else {
    if (target.kind !== "production" || !env.INNGEST_EVENT_KEY) fail("the real send is for the exact production target only. Refusing.");
    send = (event) => sendToInngest(event, { key: env.INNGEST_EVENT_KEY });
  }
  const entries = [...history.entries];
  const entry = {
    at: new Date().toISOString(),
    tenantSlug: args.tenantSlug,
    tenantId,
    readAt: t0.toISOString(),
    fixDeployedSha: args.fixDeployedSha ?? null,
    checkedInngestSettings: args.checkedInngest,
    sink: args.sinkFile !== undefined,
    eligible: eligible.length,
    max: args.max,
    minDaysAhead: args.minDaysAhead,
    state: "sending",
    sent: [],
  };
  entries.push(entry);
  // CLAIM FIRST. The marker is written before the first event, so a marker that
  // cannot be written stops the run while nothing has been sent.
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
  for (const row of batch) {
    const res = await send(buildEvent(row));
    if (!res.ok) {
      stopped = `${row.id}: ${res.why}`;
      break;
    }
    entry.sent.push({ id: row.id, startsAt: row.startsAt });
    // AFTER EVERY EVENT, and before the line that says so, so a run that dies
    // keeps what it sent. If the record cannot be kept, stop at once: one
    // unrecorded event is covered by the event id for 24 hours, a whole
    // unrecorded run is not.
    try {
      writeMarker(marker, entries);
    } catch {
      stopped = `${row.id}: SENT, but the marker ${marker} could not be updated`;
      break;
    }
    out(`  sent ${row.id}  starts ${row.startsAt}  ${row.status}`);
  }
  entry.state = stopped ? "stopped" : "done";
  try {
    writeMarker(marker, entries);
  } catch {
    console.error(`WARNING: could not update ${marker}. Keep every "sent" line above and the lines below; they are the record.`);
  }
  out(`SENT: ${entry.sent.length} of ${batch.length}  (recorded in ${marker})`);
  if (stopped) fail(`stopped at ${stopped}. Report the SENT line. A later run skips what the marker recorded.`);
  return { sent: entry.sent.length, eligible: eligible.length };
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
