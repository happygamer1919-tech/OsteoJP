#!/usr/bin/env node
// ===================================================================
// OBS-05 BACKFILL EMIT. OWNER-RUN, AND ONLY ON THE OWNER'S LETTER.
// ===================================================================
// Card: OBS-05-batch-path-emits-no-reminder-event. Fix: #1261, merged
// 2026-09-10T22:43:35Z, deployed to osteojp-platform 2026-09-10T22:45:15Z
// (GitHub commit status on 46e2014f: "Deployment has completed").
//
// WHAT IT IS FOR. Before #1261, Agendar lote committed appointments and never
// emitted `appointment/scheduled`, so no reminder run was ever created for them:
// no 48h email, no 24h SMS, and nothing anywhere recorded the absence. The fix
// emits at CREATE time, so it cannot reach a row created before it deployed.
// This emits the one event each such row never got - with confirmationEligible
// FALSE, because those patients booked days ago and a booking confirmation
// arriving now would be wrong.
//
// WHAT IT SELECTS, in ONE tenant (CLAUDE.md rule 3: never global), read-only:
//   batch_id IS NOT NULL               created by the batch engine
//   created_at < --created-before      before the fix deployed; later rows emitted themselves
//   status IN (scheduled, confirmed)   REMINDABLE_STATUSES, apps/web/lib/reminders/dispatch.ts
//   starts_at > now() + 24 hours       inside 24h both offsets have passed; nothing would schedule
//   the patient is not soft-deleted    the dispatcher refuses them anyway; not emitting is quieter
//   NO appointment.reschedule audit    rescheduleAppointment EMITS, so that row already has a run
//
// ===================================================================
// WHY ONE ROW MUST NEVER BE EMITTED TWICE, AND THE THREE THINGS THAT PREVENT IT
// ===================================================================
// send-appointment-reminder is cancelOn'd by ANY new appointment/scheduled for
// the same appointment, and is idempotent for 24 hours on
// appointmentId:offset:channel:sendAt (apps/web/lib/reminders/inngest/functions.ts).
// So a second emit for an UNCHANGED startsAt cancels the sleeping run the first
// emit created, and the run it starts in its place carries the SAME key and is
// dropped as a duplicate. Net result: no reminder at all. That is derived from
// the function config and Inngest's documented semantics; it was not executed
// against Inngest from the lane that wrote this. The OBS-05 card said a re-run
// "dedupes" and is safe. By this reading it is the opposite, so:
//   1. every event carries an Inngest event id derived from the row
//      (obs05-backfill:<appointmentId>:<startsAt>), so an identical re-send
//      within 24h is dropped by Inngest before any function sees it;
//   2. a local marker file refuses a second --confirm inside 25 hours;
//   3. rows that already have a run (rescheduled ones) are never selected.
//
// USAGE, from the repo root with the production environment sourced:
//   node packages/db/scripts/obs-05-backfill-emit.mjs \
//        --tenant-slug osteojp --created-before 2026-09-10T22:45:15Z
//     DRY RUN, the default. Reads, prints what it WOULD emit, sends nothing.
//   ... the same, plus --confirm --expect <N>
//     Re-reads the same way, refuses unless exactly N rows, then emits.
//
// It prints appointment ids, instants and statuses. NEVER a patient name, phone
// or email (CLAUDE.md rule 7), and never the connection string or the event key.
//
// EXIT 0 OK, 1 FAILED, 2 BAD_INVOCATION (the repo's tooling convention).

import { existsSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PROD_REF = "dfotoodqvmjhbdcxyaxf";
/** EVENT_APPOINTMENT_SCHEDULED, apps/web/lib/reminders/inngest/client.ts. */
const EVENT_NAME = "appointment/scheduled";
/** REMINDABLE_STATUSES, apps/web/lib/reminders/dispatch.ts. */
const REMINDABLE = ["scheduled", "confirmed"];
/** REMINDER_OFFSETS, apps/web/lib/reminders/offsets.ts. Used for the PREVIEW only:
 *  the real decision is computeDueReminders inside the Inngest function. */
const OFFSETS = [
  { id: "48h", minutesBefore: 48 * 60, channel: "email" },
  { id: "24h", minutesBefore: 24 * 60, channel: "sms" },
];
const DEFAULT_MAX = 100;
const MARKER_HOURS = 25;
const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

const USAGE = `usage:
  node packages/db/scripts/obs-05-backfill-emit.mjs --tenant-slug <slug> --created-before <ISO-8601 Z>
       [--confirm --expect <N>] [--max <N>] [--sink <http origin, rehearsal only>]`;

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
  const takes = new Set(["--tenant-slug", "--created-before", "--expect", "--max", "--sink"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--confirm") {
      out.confirm = true;
      continue;
    }
    if (!takes.has(a)) bad(`unknown argument ${JSON.stringify(a)}`);
    const v = argv[++i];
    if (v === undefined || v.startsWith("--")) bad(`${a} needs a value`);
    if (a === "--tenant-slug") out.tenantSlug = v;
    if (a === "--created-before") out.createdBefore = v;
    if (a === "--expect") out.expect = v;
    if (a === "--max") out.max = v;
    if (a === "--sink") out.sink = v;
  }
  if (!out.tenantSlug || !SLUG.test(out.tenantSlug)) bad("--tenant-slug is required (lowercase slug)");
  if (!out.createdBefore || !ISO_Z.test(out.createdBefore)) {
    bad("--created-before is required, as a UTC instant ending in Z (e.g. 2026-09-10T22:45:15Z)");
  }
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
    const marker = join(homedir(), ".osteojp-obs05-backfill.json");
    if (existsSync(marker)) {
      const ageHours = (Date.now() - statSync(marker).mtimeMs) / 3_600_000;
      if (ageHours < MARKER_HOURS) {
        fail(
          `a previous --confirm ran ${ageHours.toFixed(1)}h ago (${marker}). A second emit inside 24h ` +
            "cancels the reminders the first one scheduled; see the header. Refusing.",
        );
      }
    }
  }

  // Lazy on purpose: the refusals above are testable without the driver.
  const { default: postgres } = await import("postgres");
  const sql = postgres(raw, { max: 1, prepare: false, onnotice: () => {} });

  let tenantId;
  let rows;
  try {
    ({ tenantId, rows } = await sql.begin("read only", async (tx) => {
      const t = await tx`select id::text as id from tenants where slug = ${args.tenantSlug}`;
      if (t.length !== 1) throw new Error(`tenant slug "${args.tenantSlug}" matched ${t.length} tenants, not 1`);
      const r = await tx`
        select a.id::text as id, a.tenant_id::text as tenant_id, a.starts_at, a.status::text as status
          from appointments a
          join patients p on p.id = a.patient_id and p.tenant_id = a.tenant_id
         where a.tenant_id = ${t[0].id}
           and a.batch_id is not null
           and a.created_at < ${args.createdBefore}::timestamptz
           and a.status::text in ${tx(REMINDABLE)}
           and a.starts_at > now() + interval '24 hours'
           and p.deleted_at is null
           and not exists (
             select 1 from audit_log l
              where l.tenant_id = a.tenant_id
                and l.entity_type = 'appointment'
                and l.entity_id = a.id
                and l.action = 'appointment.reschedule')
         order by a.starts_at, a.id`;
      return { tenantId: t[0].id, rows: r };
    }));
  } catch (e) {
    await sql.end({ timeout: 5 });
    fail(`the read failed: ${e instanceof Error ? e.message : "unknown error"}`);
  }
  await sql.end({ timeout: 5 });

  const now = new Date();
  console.log(`tenant   ${args.tenantSlug} = ${tenantId}`);
  console.log(`cutoff   created before ${args.createdBefore}`);
  for (const r of rows) {
    const due = wouldSchedule(new Date(r.starts_at), now);
    console.log(
      `  ${r.id}  starts ${new Date(r.starts_at).toISOString()}  ${r.status.padEnd(9)}  would schedule: ${due.join(", ") || "nothing"}`,
    );
  }
  console.log(`ROWS: ${rows.length}`);

  if (rows.length > args.max) {
    fail(`${rows.length} rows is above the ${args.max} ceiling. That is not a backfill, it is a defect in the selection. Refusing.`);
  }

  if (!args.confirm) {
    console.log(`DRY RUN - nothing was sent. To send exactly these: add --confirm --expect ${rows.length}`);
    return;
  }

  if (rows.length !== args.expect) {
    fail(`expected ${args.expect} rows and found ${rows.length}. Something changed since the dry run; run the dry run again.`);
  }

  const origin = args.sink ?? "https://inn.gs";
  const marker = join(homedir(), ".osteojp-obs05-backfill.json");
  console.log(`sending  ${rows.length} x ${EVENT_NAME} to ${origin} (the event key is not printed)`);
  const sent = [];
  let stopped = null;
  for (const r of rows) {
    const startsAt = new Date(r.starts_at).toISOString();
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
    sent.push(r.id);
    console.log(`  sent ${r.id}  starts ${startsAt}`);
  }
  writeFileSync(marker, JSON.stringify({ at: new Date().toISOString(), tenantId, sent }, null, 2) + "\n");
  console.log(`SENT: ${sent.length} of ${rows.length}  (recorded in ${marker})`);
  if (stopped) fail(`stopped at ${stopped}. Do NOT re-run inside ${MARKER_HOURS}h; report the SENT line.`);
}

await main();
