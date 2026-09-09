/**
 * AGENDA-01 — SEED ONE WEEK AT THE DENSITY RECEPTION ACTUALLY WORKS AT.
 *
 * ==========================================================================
 * WHY A SEED AND NOT A FIXTURE
 * ==========================================================================
 * The defect this exists to prove is a SCROLL defect: the weekday row leaves
 * the viewport and the reader loses the day. Every agenda spec in the suite
 * books between one and three appointments, and at that density the grid is
 * ~1150px tall and the reader scrolls past two hours. Reception's week carries
 * 310 appointments over Monday-Saturday, shaped like a clinic day - a lunch hour,
 * thin edges, and several therapists seeing patients at the same time through the
 * middle - so the STAFF-03 hour rows grow to fit what starts inside them and
 * 11:00 ends up well below the fold.
 *
 * A three-appointment fixture can prove the CSS is present. Only a real week can
 * show what the reader sees at 11:00, which is what was reported.
 *
 * ==========================================================================
 * IT WRITES A MANIFEST, AND THE SPEC ASSERTS AGAINST THE SCREEN, NOT AGAINST IT
 * ==========================================================================
 * The Monday it seeds is written to `apps/web/e2e/.perf-agenda-week.json`
 * (gitignored) so the spec does not have to re-derive a date and drift from this
 * file across a midnight boundary. The manifest carries the ANCHOR only as an
 * address. The COUNT the spec asserts is read off the agenda's own range chip,
 * because a spec that trusted this file's number would report a density nothing
 * on screen had.
 *
 * ==========================================================================
 * LOCAL ONLY, AND IT CANNOT BE POINTED ELSEWHERE
 * ==========================================================================
 * `assertLocalTarget` reads its host allowlist out of the TypeScript source at
 * runtime, so this cannot be aimed at production by editing a constant here.
 * Standing rule 1. Every row it writes carries `notes = 'perf-agenda-week'` and
 * a re-run deletes exactly those rows first, so it is idempotent and it never
 * touches a fixture it did not create.
 *
 * USAGE (from the repo root, against a lane database)
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54522/postgres \
 *     node scripts/perf-seed-agenda-week.mjs
 *
 *   node scripts/lane-stack.mjs e2e --lane purple -- --project=perf \
 *     --grep "agenda density"
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { assertLocalTarget } from "./local-target.mjs";

const DB_URL = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
assertLocalTarget(DB_URL, process.env.DATABASE_URL_DIRECT ? "DATABASE_URL_DIRECT" : "DATABASE_URL");

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const requireFromDb = createRequire(join(ROOT, "packages", "db", "package.json"));
const { default: postgres } = await import(pathToFileURL(requireFromDb.resolve("postgres")).href);
const sql = postgres(DB_URL, { max: 4, idle_timeout: 20, connect_timeout: 15 });

const TENANT = "00000000-0000-0000-0000-0000000000a1"; // TENANT_A, the e2e tenant
const MARKER = "perf-agenda-week";
const MANIFEST = join(ROOT, "apps", "web", "e2e", ".perf-agenda-week.json");

/** The reported production density: 310 appointments over one Mon-Sat week. */
const TARGET = 310;
/** The grid's visible window, Europe/Lisbon (lib/scheduling/time.ts). */
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 20;

/* ------------------------------------------------------------------ dates */
/**
 * THE MONDAY OF THE WEEK 21 DAYS FROM TODAY, and it is deliberately in the
 * FUTURE. A past week would let the now-line and any status-derived rendering
 * differ from what reception sees, and 21 days clears every other spec's
 * `RUN_DAY_BASE + n` fixture window (fixtures.ts caps those at +40 on a 300-day
 * rotation, so the collision cost would be a shared column rather than a wrong
 * assertion - but a week nobody else writes into is free).
 */
function mondayOfWeekIn(days) {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0); // noon, so a DST shift cannot move the calendar day
  d.setUTCDate(d.getUTCDate() + days);
  const dow = d.getUTCDay(); // 0 = Sunday
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
  return d;
}
const monday = mondayOfWeekIn(21);
const anchor = monday.toISOString().slice(0, 10);

/**
 * Lisbon wall-clock -> the UTC instant to store. Europe/Lisbon is UTC+1 from
 * late March to late October and UTC+0 otherwise, and the seeded week can fall
 * on either side of the boundary. Derived from the zone rather than hardcoded:
 * an hour of drift would put 08:00 rows outside DAY_START_HOUR and the grid
 * would silently clamp them.
 */
function lisbonOffsetMinutes(isoDate) {
  const probe = new Date(`${isoDate}T12:00:00Z`);
  const local = new Date(probe.toLocaleString("en-US", { timeZone: "Europe/Lisbon" }));
  const utc = new Date(probe.toLocaleString("en-US", { timeZone: "UTC" }));
  return Math.round((local.getTime() - utc.getTime()) / 60000);
}
function lisbonInstant(isoDate, minutesFromMidnight) {
  const off = lisbonOffsetMinutes(isoDate);
  return new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + (minutesFromMidnight - off) * 60000);
}

const dayIso = (i) => {
  const d = new Date(monday.getTime());
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
};
const DAYS = [0, 1, 2, 3, 4, 5].map(dayIso); // Mon-Sat, the grid's six columns

/* ---------------------------------------------------------------- helpers */
const FM = ["Maria", "Ana", "Joana", "Sofia", "Ines", "Catarina", "Sara", "Margarida", "Filipa", "Beatriz"];
const MM = ["Joao", "Antonio", "Jose", "Manuel", "Francisco", "Carlos", "Paulo", "Pedro", "Luis", "Miguel"];
const SUR = ["Silva", "Santos", "Ferreira", "Pereira", "Oliveira", "Costa", "Rodrigues", "Martins", "Sousa", "Fernandes"];
const pick = (a, i) => a[i % a.length];
const nameFor = (i) => `${i % 2 ? pick(FM, i) : pick(MM, i)} ${pick(SUR, i * 3 + 1)}`;

async function one(q) {
  const rows = await q;
  return rows[0];
}

/* -------------------------------------------------------------------- run */
console.log(`[agenda-week] tenant ${TENANT}, week of ${anchor} (Mon-Sat), target ${TARGET} appointments`);

/**
 * THE LOCATION IS THE ONE THE MEASURING ADMIN CAN ACTUALLY SEE.
 *
 * The base e2e seed gives the admin NO `staff_locations` row, so
 * `viewerLocationScope` returns null and every location is in scope.
 * `perf-seed-admin-stats.mjs` GRANTS two assignments (PERF-14), and after it has
 * run a week seeded at a third location would be invisible to the very principal
 * the spec drives - an empty agenda that looks like a broken query. So the
 * assignment is read, and only used as a fallback when there is none.
 */
const admin = await one(sql`
  select u.id from users u join roles r on r.id = u.role_id
   where u.tenant_id = ${TENANT} and r.slug = 'admin' and u.is_active
   order by u.created_at limit 1`);
if (!admin) {
  console.error("[agenda-week] tenant A has no admin user. Run: node apps/web/e2e/seed/seed-e2e.mjs");
  process.exit(2);
}
const assigned = await one(sql`
  select l.id, l.name from staff_locations sl join locations l on l.id = sl.location_id
   where sl.tenant_id = ${TENANT} and sl.user_id = ${admin.id} and l.is_active
   order by l.created_at limit 1`);
const loc =
  assigned ??
  (await one(sql`
    select id, name from locations where tenant_id = ${TENANT} and is_active order by created_at limit 1`));
const svc = await one(sql`
  select id from services where tenant_id = ${TENANT} and is_active and location_id = ${loc?.id ?? null}
   order by created_at limit 1`);
const pracs = await sql`
  select u.id from users u join roles r on r.id = u.role_id
   where u.tenant_id = ${TENANT} and r.slug = 'therapist' and u.is_active
   order by u.created_at`;
if (!loc || !svc || pracs.length === 0) {
  console.error(
    "[agenda-week] tenant A has no active location / service at that location / therapist. " +
      "Run: node apps/web/e2e/seed/seed-e2e.mjs",
  );
  process.exit(2);
}
console.log(
  `[agenda-week] location "${loc.name}" (${assigned ? "the admin's assignment" : "no assignment; first active"}), ` +
    `${pracs.length} therapist(s)`,
);

console.log("[agenda-week] clearing any previous run of THIS script only (by marker)");
await sql`delete from appointments where tenant_id = ${TENANT} and notes = ${MARKER}`;
await sql`delete from patients     where tenant_id = ${TENANT} and notes = ${MARKER}`;

/* ---------------------------------------------------------------- patients */
// Fewer patients than appointments, because a real week is largely returning
// people - and because a name repeating across two days is the exact shape
// agenda-cards.spec.ts had to learn to scope for.
const PATIENTS = 90;
const patientIds = Array.from({ length: PATIENTS }, () => randomUUID());
await sql`insert into patients ${sql(
  patientIds.map((id, i) => ({
    id,
    tenant_id: TENANT,
    full_name: nameFor(i),
    // Set, so the row survives `patientLocationScope` for an ASSIGNED viewer.
    // An appointment whose PATIENT is out of scope disappears from the agenda
    // (SEC-appointment-vanishes-with-patient-scope), which would present here as
    // a density that quietly failed to arrive.
    primary_location_id: loc.id,
    notes: MARKER,
  })),
  "id",
  "tenant_id",
  "full_name",
  "primary_location_id",
  "notes",
)}`;

/* ------------------------------------------------------------ appointments */
/**
 * A CLINIC DAY, NOT A FLAT SPREAD, and the difference is measurable rather than
 * cosmetic.
 *
 * The first version of this script put one appointment in each of the 48
 * half-hour slots and the grid came out 1152px tall - the plain 12-hour base.
 * That is because STAFF-03 only grows an hour when the LINES STARTING IN IT need
 * more than 96px (`lines * 20 + 8`), i.e. from five lines up, and a flat spread
 * never reaches three. So a flat 310 proves the pin on a grid no denser than an
 * empty one, which is the three-appointment fixture again with extra rows.
 *
 * Reception's week is not flat. It has a lunch hour, thin edges, and several
 * therapists seeing patients at the same time through the middle of the day -
 * which is exactly what the vertical stack (W11-00 v3) exists to render. The
 * weights below produce that, and with them the busy hours DO expand.
 *
 * EVERY ROW IS `scheduled`, NEVER `confirmed`. 0061 bans two CONFIRMED
 * appointments overlapping on one practitioner at the database, so a confirming
 * seed would hit that constraint the moment the stack it is trying to build
 * appeared. The practitioner also rotates WITHIN a start slot, so concurrent
 * rows are different people - which is what a real slot holds.
 */
const SLOTS = [];
for (let h = DAY_START_HOUR; h < DAY_END_HOUR; h += 1) {
  SLOTS.push(h * 60);
  SLOTS.push(h * 60 + 30);
}
/** How many patients start in a given slot on an ordinary day. */
function weight(slotMin) {
  const h = Math.floor(slotMin / 60);
  if (h === 13) return 0; // lunch
  if (h === DAY_START_HOUR || h === DAY_END_HOUR - 1) return 1; // thin edges
  return 3;
}

const appts = [];
let seq = 0;
for (const [d, day] of DAYS.entries()) {
  // The remainder goes on the earliest days, so the total is EXACTLY the target
  // rather than the target rounded.
  let quota = Math.floor(TARGET / DAYS.length) + (d < TARGET % DAYS.length ? 1 : 0);
  for (let pass = 0; quota > 0; pass += 1) {
    for (const slot of SLOTS) {
      if (quota <= 0) break;
      // Pass 0 lays down the shape; a later pass (only reached if the quota
      // outruns the shape) thickens it one row at a time rather than dumping
      // the remainder into the last slot.
      const here = Math.min(pass === 0 ? weight(slot) : weight(slot) > 0 ? 1 : 0, quota);
      for (let k = 0; k < here; k += 1) {
        const starts = lisbonInstant(day, slot);
        appts.push({
          id: randomUUID(),
          tenant_id: TENANT,
          patient_id: patientIds[seq % patientIds.length],
          // Rotated WITHIN the slot (k), so the rows stacked at one start time
          // belong to different therapists - and pick up different colours.
          practitioner_id: pracs[(seq + k) % pracs.length].id,
          location_id: loc.id,
          service_id: svc.id,
          starts_at: starts.toISOString(),
          ends_at: new Date(starts.getTime() + 30 * 60000).toISOString(),
          status: "scheduled",
          notes: MARKER,
        });
        seq += 1;
        quota -= 1;
      }
    }
  }
}

await sql`insert into appointments ${sql(
  appts,
  "id",
  "tenant_id",
  "patient_id",
  "practitioner_id",
  "location_id",
  "service_id",
  "starts_at",
  "ends_at",
  "status",
  "notes",
)}`;
await sql`analyze appointments`;

/* ------------------------------------------------------- verify, then write */
// THE COUNT IS READ BACK, not assumed from `appts.length`. A partial insert, a
// constraint that swallowed rows, or a week boundary computed wrong would all
// leave this script reporting a density the database does not hold.
const seeded = await one(sql`
  select count(*)::int as n from appointments
   where tenant_id = ${TENANT} and notes = ${MARKER}
     and starts_at >= ${lisbonInstant(DAYS[0], 0).toISOString()}
     and starts_at <  ${lisbonInstant(DAYS[5], 24 * 60).toISOString()}`);
if (seeded.n !== TARGET) {
  console.error(`[agenda-week] seeded ${seeded.n} rows inside the week, expected ${TARGET}`);
  process.exit(1);
}

writeFileSync(
  MANIFEST,
  `${JSON.stringify({ anchor, days: DAYS, seeded: seeded.n, locationName: loc.name }, null, 2)}\n`,
);
console.log(`[agenda-week] ${seeded.n} appointments in the week of ${anchor}`);
console.log(`[agenda-week] manifest -> ${MANIFEST}`);
await sql.end();
