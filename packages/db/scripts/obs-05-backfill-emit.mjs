#!/usr/bin/env node
// ===================================================================
// REMINDER EXPOSURE BACKFILL EMIT (OBS-05, extended by Y2 2026-09-11).
// OWNER-RUN, AND ONLY ON THE OWNER'S LETTER.
// ===================================================================
// WHAT IT IS FOR. Some appointments were created or confirmed by a path that did
// not emit `appointment/scheduled`, so no reminder run was ever created for them:
// no 48h email, no 24h SMS, and nothing anywhere recorded the absence. Each fix
// emits at the moment its path runs, so none of them can reach a row that path
// handled before the fix deployed. This emits the one event each such row never
// got - with confirmationEligible FALSE, because a booking confirmation arriving
// now, for a booking made days ago, would be wrong.
//
// WHICH ROWS. The classification is scripts/reminder-exposure-read-2026-09-11.sql's,
// BYTE FOR BYTE (between the EXPOSURE CLASSIFICATION markers; the test file
// fails if the copies drift). The owner runs that read first; this emits for the
// classes he names, and only for rows that are:
//   - EXPOSED by their path (see the read's header for each path and its fix instant),
//   - not rescheduled since the silent event (rescheduleAppointment EMITS),
//   - starting more than 24 hours out (inside 24h both offsets have passed),
//   - WITHOUT ANY reminder ledger row (if a reminder was ever attempted, a run
//     existed, and a second emit would destroy it - see below).
// Classes: batch, estado, sms_queue, sms_reply, portal_confirmed_before_fix,
// outside_app. `staff_drawer` rows are never selectable: their path emitted, and
// the only evidence one lacks a run is inference from the ledger, which is not
// enough to risk cancelling a live run.
//
// ===================================================================
// WHY ONE ROW MUST NEVER BE EMITTED TWICE, AND WHAT PREVENTS IT
// ===================================================================
// send-appointment-reminder is cancelOn'd by ANY new appointment/scheduled for
// the same appointment, and is idempotent for 24 hours on
// appointmentId:offset:channel:sendAt (apps/web/lib/reminders/inngest/functions.ts).
// So a second emit for an UNCHANGED startsAt cancels the sleeping run the first
// emit created, and the run it starts in its place carries the SAME key and is
// dropped as a duplicate. Net result: no reminder at all. (Derived from the
// function config and Inngest's documented semantics, not executed against
// Inngest.) So:
//   1. every event carries an Inngest event id derived from the row
//      (obs05-backfill:<appointmentId>:<startsAt>) - the SAME scheme as the
//      batch-only version, so a re-send inside 24h is dropped by Inngest;
//   2. a local marker refuses a second --confirm inside 25 hours;
//   3. the marker keeps a PERMANENT history of every id sent, and a row already
//      in it at the same startsAt is skipped on every later run, at any age.
//      Inngest's event-id window is 24h; this is what covers day 2 onwards. A
//      marker written by the batch-only version (which kept ids but no startsAt)
//      skips those ids outright;
//   4. rows that already have a run (rescheduled ones) or ever had a reminder
//      attempted (any ledger row) are never selected.
//
// USAGE, from the repo root with the production environment sourced:
//   node packages/db/scripts/obs-05-backfill-emit.mjs \
//        --tenant-slug osteojp --classes batch,estado,sms_queue,sms_reply,portal_confirmed_before_fix,outside_app
//     DRY RUN, the default. Reads, prints what it WOULD emit, sends nothing.
//   ... the same, plus --confirm --expect <N>
//     Re-reads the same way, refuses unless exactly N rows, then emits.
//
// It prints appointment ids, instants, statuses and classes. NEVER a patient
// name, phone or email (CLAUDE.md rule 7), never the connection string or the key.
//
// EXIT 0 OK, 1 FAILED, 2 BAD_INVOCATION (the repo's tooling convention).

import { accessSync, constants, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const PROD_REF = "dfotoodqvmjhbdcxyaxf";
/** EVENT_APPOINTMENT_SCHEDULED, apps/web/lib/reminders/inngest/client.ts. */
const EVENT_NAME = "appointment/scheduled";
/** REMINDER_OFFSETS, apps/web/lib/reminders/offsets.ts. Used for the PREVIEW only:
 *  the real decision is computeDueReminders inside the Inngest function. */
const OFFSETS = [
  { id: "48h", minutesBefore: 48 * 60, channel: "email" },
  { id: "24h", minutesBefore: 24 * 60, channel: "sms" },
];
/** The read's EXPOSED paths. Nothing else can be named. */
const EXPOSED_CLASSES = ["batch", "estado", "sms_queue", "sms_reply", "portal_confirmed_before_fix", "outside_app"];
const DEFAULT_MAX = 100;
const MARKER_HOURS = 25;
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/*
 * THE CLASSIFICATION. Byte-identical to both copies in
 * scripts/reminder-exposure-read-2026-09-11.sql, which the test file enforces.
 * The read binds `k` from a psql variable; this binds it from $1.
 */
const CLASSIFY = `
-- >>> EXPOSURE CLASSIFICATION
fix as (
  select timestamptz '2026-08-31 22:59:10+00' as portal_fix,
         timestamptz '2026-09-10 22:45:15+00' as batch_fix,
         timestamptz '2026-09-11 12:32:05+00' as doors_fix,
         timestamptz '2026-09-10 19:58:24+00' as ledger_live
),
fut as (
  select a.id, a.tenant_id, a.starts_at, a.status::text as status, a.origin,
         a.batch_id, a.created_at,
         (p.email is not null and p.reminder_email_enabled) as email_ok,
         (p.phone is not null and p.reminder_sms_enabled) as sms_ok
    from appointments a
    join patients p on p.id = a.patient_id and p.tenant_id = a.tenant_id
    join k on k.tenant_id = a.tenant_id
   where a.starts_at > k.t0
     and a.status::text in ('scheduled', 'confirmed')
     and p.deleted_at is null
),
ev as (
  select f.id,
         coalesce(bool_or(l.action = 'appointment.create'), false) as has_create,
         max(l.created_at) filter (where l.action = 'appointment.reschedule') as reschedule_at,
         min(l.created_at) filter (where l.action = 'appointment.update'
                                     and l.metadata ->> 'via' = 'portal_request_confirm') as aceitar_at,
         min(l.created_at) filter (where l.action = 'appointment.update'
                                     and l.metadata ->> 'toStatus' = 'confirmed'
                                     and l.metadata ->> 'via' is null) as estado_at,
         min(l.created_at) filter (where l.action = 'appointment.sms_reply_reviewed'
                                     and l.metadata ->> 'resolution' = 'confirmed'
                                     and l.metadata ->> 'applied' = 'true') as queue_at,
         min(l.created_at) filter (where l.action = 'appointment.patient_sms_reply'
                                     and l.metadata ->> 'outcome' = 'confirmed') as reply_at
    from fut f
    left join audit_log l
      on l.tenant_id = f.tenant_id and l.entity_type = 'appointment' and l.entity_id = f.id
   group by f.id
),
led as (
  select f.id,
         coalesce(bool_or(d.template_id like 'reminder.%'), false) as any_reminder_row,
         coalesce(bool_or(d.template_id = 'reminder.48h.email'), false) as has_48h,
         coalesce(bool_or(d.template_id = 'reminder.24h.sms'), false) as has_24h
    from fut f
    left join reminder_dispatches d on d.tenant_id = f.tenant_id and d.appointment_id = f.id
   group by f.id
),
cls0 as (
  select f.*, e.has_create, e.reschedule_at,
         least(e.aceitar_at, e.estado_at, e.queue_at, e.reply_at) as conf_at,
         case least(e.aceitar_at, e.estado_at, e.queue_at, e.reply_at)
           when e.aceitar_at then 'aceitar'
           when e.estado_at then 'estado'
           when e.queue_at then 'sms_queue'
           when e.reply_at then 'sms_reply'
         end as conf_via,
         g.any_reminder_row, g.has_48h, g.has_24h
    from fut f
    join ev e on e.id = f.id
    join led g on g.id = f.id
),
cls as (
  select c.*,
         case
           when c.origin = 'patient_portal' and c.status = 'scheduled' then 'portal_awaiting_acceptance'
           when c.origin = 'patient_portal' and c.conf_at is null then 'portal_confirmed_unknown_path'
           when c.origin = 'patient_portal' and c.conf_at < x.portal_fix then 'portal_confirmed_before_fix'
           when c.origin = 'patient_portal' and c.conf_via = 'aceitar' then 'portal_accepted'
           when c.origin = 'patient_portal' and c.conf_at >= x.doors_fix then 'portal_door_after_fix'
           when c.origin = 'patient_portal' then c.conf_via
           when c.batch_id is not null and c.created_at < x.batch_fix then 'batch'
           when c.batch_id is not null then 'batch_after_fix'
           when not c.has_create then 'outside_app'
           else 'staff_drawer'
         end as path,
         (c.reschedule_at is not null
          and c.reschedule_at > case when c.origin = 'patient_portal' then c.conf_at
                                     else c.created_at end) as rescheduled_since,
         (c.starts_at - interval '48 hours' > x.ledger_live
          and c.starts_at - interval '48 hours' < k.t0 and c.email_ok) as due_48h,
         (c.starts_at - interval '24 hours' > x.ledger_live
          and c.starts_at - interval '24 hours' < k.t0 and c.sms_ok) as due_24h
    from cls0 c
    cross join fix x
    cross join k
),
exposure as (
  select s.*,
         (s.path in ('batch', 'estado', 'sms_queue', 'sms_reply',
                     'portal_confirmed_before_fix', 'outside_app')
          and not coalesce(s.rescheduled_since, false)) as exposed,
         ((s.due_48h and not s.has_48h) or (s.due_24h and not s.has_24h)) as due_without_ledger
    from cls s
)
-- <<< EXPOSURE CLASSIFICATION
`;

const SELECT_ROWS =
  `with k as (select $1::uuid as tenant_id, now() as t0),\n` +
  CLASSIFY +
  `select e.id::text as id, e.tenant_id::text as tenant_id, e.starts_at, e.status, e.path
     from exposure e
    where e.exposed
      and not e.any_reminder_row
      and e.starts_at > now() + interval '24 hours'
      and e.path = any($2::text[])
    order by e.path, e.starts_at, e.id`;

const USAGE = `usage:
  node packages/db/scripts/obs-05-backfill-emit.mjs --tenant-slug <slug> --classes <c1,c2,...>
       [--confirm --expect <N>] [--max <N>] [--sink <http origin, rehearsal only>]
  classes: ${EXPOSED_CLASSES.join(", ")}`;

function bad(msg) {
  console.error(`BAD INVOCATION: ${msg}`);
  console.error(USAGE);
  process.exit(2);
}

function fail(msg) {
  console.error(`FAILED: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { confirm: false, max: DEFAULT_MAX };
  const takes = new Set(["--tenant-slug", "--classes", "--expect", "--max", "--sink", "--created-before"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--confirm") {
      out.confirm = true;
      continue;
    }
    if (!takes.has(a)) bad(`unknown argument ${JSON.stringify(a)}`);
    const v = argv[++i];
    if (v === undefined || v.startsWith("--")) bad(`${a} needs a value`);
    if (a === "--created-before") {
      bad(
        "--created-before is retired. The batch cutoff (2026-09-10T22:45:15Z, #1261's deploy) and every other " +
          "path's fix instant now live in the shared classification; name the classes with --classes instead",
      );
    }
    if (a === "--tenant-slug") out.tenantSlug = v;
    if (a === "--classes") out.classes = v;
    if (a === "--expect") out.expect = v;
    if (a === "--max") out.max = v;
    if (a === "--sink") out.sink = v;
  }
  if (!out.tenantSlug || !SLUG.test(out.tenantSlug)) bad("--tenant-slug is required (lowercase slug)");
  if (!out.classes) bad(`--classes is required: a comma list of ${EXPOSED_CLASSES.join(", ")}`);
  const classes = out.classes.split(",").map((c) => c.trim()).filter(Boolean);
  const unknown = classes.filter((c) => !EXPOSED_CLASSES.includes(c));
  if (classes.length === 0 || unknown.length > 0) {
    bad(`unknown class ${JSON.stringify(unknown.join(","))}. Only the read's EXPOSED paths can be named: ${EXPOSED_CLASSES.join(", ")}`);
  }
  out.classes = [...new Set(classes)];
  if (out.confirm && out.expect === undefined) bad("--confirm needs --expect <N>, the count the dry run printed");
  if (out.expect !== undefined && !/^\d+$/.test(out.expect)) bad("--expect must be a whole number");
  if (!/^\d+$/.test(String(out.max))) bad("--max must be a whole number");
  if (out.sink !== undefined && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(out.sink)) {
    bad("--sink must be a LOCAL http origin such as http://127.0.0.1:8288; it exists for rehearsal only");
  }
  out.expect = out.expect === undefined ? undefined : Number(out.expect);
  out.max = Number(out.max);
  return out;
}

/** Which offsets would still schedule, as a preview of computeDueReminders. */
function wouldSchedule(startsAt, now) {
  return OFFSETS.filter((o) => startsAt.getTime() - o.minutesBefore * 60_000 > now.getTime()).map(
    (o) => `${o.id} ${o.channel}`,
  );
}

/**
 * Everything any previous --confirm recorded as sent. `exact` holds id|startsAt;
 * `anyStart` holds ids from the batch-only marker, which recorded ids without the
 * instant - those are skipped outright, at any startsAt, because not knowing what
 * was sent is not permission to send it again.
 */
function readHistory(marker) {
  const exact = new Map();
  const anyStart = new Map();
  if (!existsSync(marker)) return { exact, anyStart, entries: [] };
  let doc;
  try {
    doc = JSON.parse(readFileSync(marker, "utf8"));
  } catch {
    fail(`the marker ${marker} exists but is not JSON. Refusing: it is the only record of what was already sent.`);
  }
  const entries = Array.isArray(doc?.history) ? doc.history : doc && Object.keys(doc).length ? [doc] : [];
  for (const e of entries) {
    for (const s of Array.isArray(e?.sent) ? e.sent : []) {
      if (typeof s === "string") anyStart.set(s, e.at ?? "an earlier run");
      else if (s && typeof s.id === "string" && typeof s.startsAt === "string") exact.set(`${s.id}|${s.startsAt}`, e.at ?? "an earlier run");
    }
  }
  return { exact, anyStart, entries };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!raw) bad("neither DATABASE_URL_DIRECT nor DATABASE_URL is set; source the environment first");
  let url;
  try {
    url = new URL(raw);
  } catch {
    bad("the connection string could not be parsed as a URL"); // the value is never printed
  }
  const ref = url.username.split(".").pop() ?? "";
  const isProd = ref === PROD_REF;
  console.log(`target   host ${url.hostname}  port ${url.port}  ref ${ref || "(none)"}  ${isProd ? "PRODUCTION" : "NOT production"}`);
  console.log(`mode     ${args.confirm ? `CONFIRM, expecting ${args.expect}` : "DRY RUN - nothing is sent"}`);
  console.log(`classes  ${args.classes.join(", ")}`);

  const marker = join(homedir(), ".osteojp-obs05-backfill.json");
  // Every refusal that needs no database happens BEFORE a connection is opened.
  if (args.sink && isProd) fail("--sink is for rehearsal and the target is PRODUCTION. Refusing.");
  if (args.confirm && !args.sink && !isProd) {
    fail("--confirm without --sink sends to Inngest Cloud, and the target is NOT production. Refusing.");
  }
  if (args.confirm) {
    if (!process.env.INNGEST_EVENT_KEY) {
      fail("INNGEST_EVENT_KEY is not set. It is the osteojp-platform PRODUCTION value; it is never printed.");
    }
    if (!args.sink && process.env.INNGEST_DEV) fail("INNGEST_DEV is set, which means a dev server. Unset it.");
    if (existsSync(marker)) {
      const ageHours = (Date.now() - statSync(marker).mtimeMs) / 3_600_000;
      if (ageHours < MARKER_HOURS) {
        fail(
          `a previous --confirm ran ${ageHours.toFixed(1)}h ago (${marker}). A second emit inside 24h ` +
            "cancels the reminders the first one scheduled; see the header. Refusing.",
        );
      }
    }
    // THE MARKER MUST BE WRITABLE BEFORE ANYTHING IS SENT. It is what stops a second
    // run from cancelling the first run's reminders, so a run that sends and then
    // cannot record that it sent leaves the next run unguarded. Found in rehearsal:
    // with a HOME that did not exist, two consecutive runs both sent every event.
    try {
      accessSync(dirname(marker), constants.W_OK);
    } catch {
      fail(`cannot write the marker in ${dirname(marker)}. Refusing to send without it.`);
    }
  }
  // Read on the DRY RUN too, so the count the dry run prints is the count
  // --confirm will find.
  const history = readHistory(marker);

  // Lazy on purpose: the refusals above are testable without the driver.
  const { default: postgres } = await import("postgres");
  const sql = postgres(raw, { max: 1, prepare: false, onnotice: () => {} });
  let tenantId;
  let selected;
  try {
    ({ tenantId, selected } = await sql.begin("read only", async (tx) => {
      const t = await tx`select id::text as id from tenants where slug = ${args.tenantSlug}`;
      if (t.length !== 1) throw new Error(`tenant slug "${args.tenantSlug}" matched ${t.length} tenants, not 1`);
      const r = await tx.unsafe(SELECT_ROWS, [t[0].id, args.classes]);
      return { tenantId: t[0].id, selected: r };
    }));
  } catch (e) {
    await sql.end({ timeout: 5 });
    fail(`the read failed: ${e instanceof Error ? e.message : "unknown error"}`);
  }
  await sql.end({ timeout: 5 });

  const now = new Date();
  console.log(`tenant   ${args.tenantSlug} = ${tenantId}`);
  const rows = [];
  for (const r of selected) {
    const startsAt = new Date(r.starts_at).toISOString();
    const prior = history.exact.get(`${r.id}|${startsAt}`) ?? history.anyStart.get(r.id);
    if (prior) {
      console.log(`  skip ${r.id}  ${r.path.padEnd(28)} already sent by the run at ${prior}; never twice`);
      continue;
    }
    rows.push({ ...r, startsAt });
  }
  const byClass = Object.fromEntries(args.classes.map((c) => [c, 0]));
  for (const r of rows) {
    byClass[r.path] = (byClass[r.path] ?? 0) + 1;
    const due = wouldSchedule(new Date(r.startsAt), now);
    console.log(
      `  ${r.id}  ${r.path.padEnd(28)} starts ${r.startsAt}  ${r.status.padEnd(9)}  would schedule: ${due.join(", ") || "nothing"}`,
    );
  }
  console.log(`CLASSES: ${Object.entries(byClass).map(([c, n]) => `${c}=${n}`).join(" ")}`);
  console.log(`ROWS: ${rows.length}`);
  if (rows.length > args.max) {
    fail(`${rows.length} rows is above the ${args.max} ceiling. Read the list; raise --max only if every row is expected.`);
  }
  if (!args.confirm) {
    console.log(`DRY RUN - nothing was sent. To send exactly these: add --confirm --expect ${rows.length}`);
    return;
  }
  if (rows.length !== args.expect) {
    fail(`expected ${args.expect} rows and found ${rows.length}. Something changed since the dry run; run the dry run again.`);
  }

  const origin = args.sink ?? "https://inn.gs";
  const entries = [...history.entries];
  const entry = { at: new Date().toISOString(), tenantId, classes: args.classes, state: "sending", sent: [] };
  entries.push(entry);
  // CLAIM FIRST. The marker is written before the first event, so a run that dies
  // half-way still leaves the guard in place for the next one, and a marker that
  // cannot be written stops the run while nothing has been sent.
  try {
    writeFileSync(marker, JSON.stringify({ history: entries }, null, 2) + "\n");
  } catch {
    fail(`could not write the marker ${marker}; nothing was sent.`);
  }
  console.log(`sending  ${rows.length} x ${EVENT_NAME} to ${origin} (the event key is not printed)`);
  let stopped = null;
  for (const r of rows) {
    const startsAt = r.startsAt;
    const event = {
      name: EVENT_NAME,
      id: `obs05-backfill:${r.id}:${startsAt}`,
      data: { appointmentId: r.id, tenantId: r.tenant_id, startsAt, confirmationEligible: false },
    };
    let res;
    try {
      res = await fetch(`${origin}/e/${encodeURIComponent(process.env.INNGEST_EVENT_KEY)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      });
    } catch (e) {
      stopped = `${r.id}: network error (${e instanceof Error ? e.name : "unknown"})`;
      break;
    }
    if (!res.ok) {
      stopped = `${r.id}: HTTP ${res.status}`;
      break;
    }
    entry.sent.push({ id: r.id, startsAt });
    console.log(`  sent ${r.id}  ${r.path}  starts ${startsAt}`);
  }
  entry.state = stopped ? "stopped" : "done";
  try {
    writeFileSync(marker, JSON.stringify({ history: entries }, null, 2) + "\n");
  } catch {
    // The claim written before the first send is still there, so the 25h guard
    // holds; only this run's list is missing, and the SENT line below carries it.
    console.error(`WARNING: could not update ${marker}; the claim written before sending still guards a re-run.`);
  }
  console.log(`SENT: ${entry.sent.length} of ${rows.length}  (recorded in ${marker})`);
  if (stopped) fail(`stopped at ${stopped}. Do NOT re-run inside ${MARKER_HOURS}h; report the SENT line.`);
}

await main();
