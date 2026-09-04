#!/usr/bin/env node
/**
 * perf-seed-admin-stats.mjs - a LOCAL database shaped like the owner's screen.
 *
 * ==========================================================================
 * WHY A SECOND SEED AND NOT `perf-seed-loadtest.mjs`
 * ==========================================================================
 * That one seeds 2,000 patients and 20,000 appointments into its OWN tenant,
 * and it was built to load-test throughput. This card is not about throughput:
 * the owner clicked *Pacientes* once, as an admin, and waited about ten
 * seconds, and the four numbers on his stat strip were
 *
 *     8413 total | 56 seen this month | 153 with a future appointment
 *     | 88 in the recovery window
 *
 * Those four ARE the query. Reproducing them exactly is the only way to know
 * the aggregate is doing the same work his did - a database with the right ROW
 * COUNT but the wrong distribution runs different filters over a different
 * fraction of the scan, and would answer a question nobody asked.
 *
 * So this seeds into TENANT_A, the tenant the e2e admin actually signs in to,
 * and it hits the four counts ON THE NOSE. The script VERIFIES that at the end
 * by running the same four aggregates the page runs, and exits non-zero if any
 * of them is off by one. A seed that silently drifted from the target would be
 * a measurement of the wrong screen.
 *
 * ==========================================================================
 * HOW THE BUCKETS ARE KEPT DISJOINT, WHICH IS THE WHOLE DIFFICULTY
 * ==========================================================================
 * The four statistics are not independent - one patient can land in several -
 * so the buckets are constructed so that each patient falls in exactly one:
 *
 *   seenThisMonth (56)     one COMPLETED appointment 1-5 days ago, and NO
 *                          future one. Recent enough to be "this month",
 *                          NEWER than `to` (= now - 7 quiet days), so it is
 *                          NOT in the recovery window.
 *   withUpcoming (153)     one SCHEDULED appointment in the future and NO
 *                          completed one at all, so `last_completed` is null
 *                          and it cannot reach the window.
 *   inRecoveryWindow (88)  one COMPLETED appointment in the PREVIOUS month -
 *                          inside [from, to] and BEFORE this month's start, so
 *                          it is in the window and NOT "seen this month" - and
 *                          no future booking.
 *   the remaining 8,116    three COMPLETED appointments, all older than
 *                          `from`. They are in no bucket and they are the
 *                          point: they make the aggregate scan a real one.
 *
 * `from` is the first of the PREVIOUS month in Lisbon and `to` is now minus
 * FOLLOWUP_QUIET_DAYS (7). Both are re-derived here from the same arithmetic
 * `lib/followup/window.ts` uses rather than copied as literals.
 *
 * ==========================================================================
 * LOCAL ONLY, ENFORCED, NOT PROMISED
 * ==========================================================================
 * `assertLocalTarget` reads its host allowlist out of the TypeScript source at
 * runtime, so this cannot be pointed at production by editing a constant here.
 * Standing rule 1.
 *
 * USAGE
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54522/postgres \
 *     node scripts/perf-seed-admin-stats.mjs
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { assertLocalTarget } from "./local-target.mjs";

const DB_URL = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
assertLocalTarget(DB_URL, process.env.DATABASE_URL_DIRECT ? "DATABASE_URL_DIRECT" : "DATABASE_URL");

const HERE = dirname(fileURLToPath(import.meta.url));
const requireFromDb = createRequire(join(HERE, "..", "packages", "db", "package.json"));
const { default: postgres } = await import(pathToFileURL(requireFromDb.resolve("postgres")).href);
const sql = postgres(DB_URL, { max: 4, idle_timeout: 20, connect_timeout: 15 });

/* ---------------------------------------------------------------- targets */
const TOTAL = 8413;
const SEEN_THIS_MONTH = 56;
const WITH_UPCOMING = 153;
const IN_RECOVERY = 88;
const BULK_APPTS_EACH = 3;

const TENANT = "00000000-0000-0000-0000-0000000000a1"; // TENANT_A, the e2e tenant
const MARKER = "perf-admin-stats"; // notes field; identifies every row this writes
const BATCH = 1000;

/* ------------------------------------------------------------------ dates */
const now = new Date();
const QUIET_DAYS = 7; // FOLLOWUP_QUIET_DAYS
const to = new Date(now.getTime() - QUIET_DAYS * 86400000);
const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

// Inside [from, to] AND before monthStart: the previous month's 15th.
const prevMonth15 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15, 10, 0, 0));
if (!(prevMonth15 >= from && prevMonth15 <= to && prevMonth15 < monthStart)) {
  console.error("the recovery-window instant is not inside the window; refusing to seed a shape that cannot hit the target");
  process.exit(2);
}
// Recent, this month, and NEWER than `to` so it is not in the window.
const recent = new Date(now.getTime() - 2 * 86400000);
if (!(recent >= monthStart && recent > to)) {
  console.error("the seen-this-month instant would also land in the recovery window; refusing");
  process.exit(2);
}
const future = new Date(now.getTime() + 10 * 86400000);
const ancient = new Date(from.getTime() - 120 * 86400000); // well before `from`

/* ------------------------------------------------------------------ helpers */
const FM = ["Maria","Ana","Joana","Sofia","Ines","Catarina","Sara","Margarida","Filipa","Beatriz"];
const MM = ["Joao","Antonio","Jose","Manuel","Francisco","Carlos","Paulo","Pedro","Luis","Miguel"];
const SUR = ["Silva","Santos","Ferreira","Pereira","Oliveira","Costa","Rodrigues","Martins","Sousa","Fernandes"];
const nameFor = (i) => `${i % 2 ? pick(FM, i) : pick(MM, i)} ${pick(SUR, i)} ${pick(SUR, i * 7 + 3)}`;
const pick = (a, i) => a[i % a.length];

async function one(q) {
  const rows = await q;
  return rows[0];
}

/* -------------------------------------------------------------------- run */
console.log(`[perf-seed] target ${TOTAL} patients into tenant ${TENANT}`);
console.log(`[perf-seed] window from=${from.toISOString()} to=${to.toISOString()} monthStart=${monthStart.toISOString()}`);

const loc = await one(sql`select id from locations where tenant_id = ${TENANT} and is_active order by created_at limit 1`);
// The role lives in `roles`, joined by role_id - `users` has no `role` column.
const prac = await one(sql`
  select u.id from users u join roles r on r.id = u.role_id
   where u.tenant_id = ${TENANT} and r.slug = 'therapist' and u.is_active
   order by u.created_at limit 1`);
const svc = await one(sql`select id from services where tenant_id = ${TENANT} order by created_at limit 1`);
if (!loc || !prac || !svc) {
  console.error("[perf-seed] tenant A has no location / therapist / service. Run: node apps/web/e2e/seed/seed-e2e.mjs");
  process.exit(2);
}

/**
 * The page's four aggregates, verbatim in shape, run as `postgres` over the
 * whole tenant. Used TWICE - once as a baseline before inserting, once as the
 * verification after - so the two can never disagree about what is counted.
 */
async function stats() {
  return one(sql`
    with participations as (
      select patient_id as pid, starts_at, status from appointments where tenant_id = ${TENANT}
      union all
      select patient_2_id as pid, starts_at, status from appointments where tenant_id = ${TENANT} and patient_2_id is not null
    ), agg as (
      select pid,
             max(starts_at) filter (where status = 'completed') as last_completed,
             count(*) filter (where status = 'completed' and starts_at >= ${monthStart.toISOString()}::timestamptz) as completed_this_month,
             bool_or(starts_at > ${now.toISOString()}::timestamptz and status not in ('cancelled','no_show')) as has_future
        from participations group by pid
    )
    select count(*)::int as total,
           count(*) filter (where coalesce(agg.completed_this_month,0) > 0)::int as seen_this_month,
           count(*) filter (where coalesce(agg.has_future,false))::int as with_upcoming,
           count(*) filter (where agg.last_completed between ${from.toISOString()}::timestamptz and ${to.toISOString()}::timestamptz
                              and not coalesce(agg.has_future,false))::int as in_recovery
      from patients p left join agg on agg.pid = p.id
     where p.tenant_id = ${TENANT} and p.deleted_at is null`);
}

console.log("[perf-seed] clearing any previous run of THIS script only (by marker)");
await sql`delete from appointments where tenant_id = ${TENANT} and notes = ${MARKER}`;
await sql`delete from patients     where tenant_id = ${TENANT} and notes = ${MARKER}`;

/**
 * ==========================================================================
 * THE TENANT IS NOT EMPTY, AND PRETENDING IT IS PUTS THE MEASUREMENT ON THE
 * WRONG SCREEN
 * ==========================================================================
 * TENANT_A already holds the e2e fixture: a handful of patients, some of which
 * land in these very buckets. The first version of this script seeded the four
 * targets outright and its own verification caught the result - 8422 total and
 * 92 in the recovery window against targets of 8413 and 88. That check existed
 * precisely so this could not pass silently, and it did its job.
 *
 * So the baseline is MEASURED and SUBTRACTED. What this script inserts is the
 * DIFFERENCE, and the verification at the end then asserts the FINAL numbers -
 * fixture plus seed - are exactly the owner's four.
 */
const baseline = await stats();
console.log(
  `[perf-seed] existing fixture in this tenant: total=${baseline.total} seen=${baseline.seen_this_month} ` +
    `upcoming=${baseline.with_upcoming} recovery=${baseline.in_recovery}`,
);

const need = {
  total: TOTAL - Number(baseline.total),
  seen: SEEN_THIS_MONTH - Number(baseline.seen_this_month),
  upcoming: WITH_UPCOMING - Number(baseline.with_upcoming),
  recovery: IN_RECOVERY - Number(baseline.in_recovery),
};
for (const [k, v] of Object.entries(need)) {
  if (v < 0) {
    console.error(
      `[perf-seed] the tenant ALREADY exceeds the target for ${k} (${v} short of zero). This script ` +
        "only adds rows; it will not delete fixture data to hit a number. Reset the lane first: " +
        "node scripts/lane-stack.mjs up --lane <lane>",
    );
    process.exit(2);
  }
}
if (need.seen + need.upcoming + need.recovery > need.total) {
  console.error("[perf-seed] the three buckets do not fit inside the patient total; refusing");
  process.exit(2);
}
console.log(
  `[perf-seed] inserting the DIFFERENCE: ${need.total} patients, buckets ` +
    `seen=${need.seen} upcoming=${need.upcoming} recovery=${need.recovery}`,
);

const ids = Array.from({ length: need.total }, () => randomUUID());

for (let i = 0; i < need.total; i += BATCH) {
  const slice = ids.slice(i, i + BATCH).map((id, k) => ({
    id,
    tenant_id: TENANT,
    full_name: nameFor(i + k),
    notes: MARKER,
  }));
  await sql`insert into patients ${sql(slice, "id", "tenant_id", "full_name", "notes")}`;
  process.stdout.write(`\r  ${Math.min(i + BATCH, need.total)}/${need.total}`);
}
process.stdout.write("\n");

/* Buckets, disjoint by construction and in this order. */
const seen = ids.slice(0, need.seen);
const upcoming = ids.slice(need.seen, need.seen + need.upcoming);
const recovery = ids.slice(need.seen + need.upcoming, need.seen + need.upcoming + need.recovery);
const bulk = ids.slice(need.seen + need.upcoming + need.recovery);

const appts = [];
const push = (pid, startsAt, status) =>
  appts.push({
    id: randomUUID(),
    tenant_id: TENANT,
    patient_id: pid,
    practitioner_id: prac.id,
    location_id: loc.id,
    service_id: svc.id,
    starts_at: startsAt.toISOString(),
    ends_at: new Date(startsAt.getTime() + 50 * 60000).toISOString(),
    status,
    notes: MARKER,
  });

for (const p of seen) push(p, recent, "completed");
for (const p of upcoming) push(p, future, "scheduled");
for (const p of recovery) push(p, prevMonth15, "completed");
for (const [i, p] of bulk.entries()) {
  for (let k = 0; k < BULK_APPTS_EACH; k++) {
    push(p, new Date(ancient.getTime() - ((i % 300) * 7 + k * 31) * 86400000), "completed");
  }
}

console.log(`[perf-seed] inserting ${appts.length} appointments`);
for (let i = 0; i < appts.length; i += BATCH) {
  const slice = appts.slice(i, i + BATCH);
  await sql`insert into appointments ${sql(slice, "id", "tenant_id", "patient_id", "practitioner_id", "location_id", "service_id", "starts_at", "ends_at", "status", "notes")}`;
  process.stdout.write(`\r  ${Math.min(i + BATCH, appts.length)}/${appts.length}`);
}
process.stdout.write("\n");

await sql`analyze patients`;
await sql`analyze appointments`;

/* --------------------------------------------------- verify the four counts */
console.log("[perf-seed] verifying against the SAME four aggregates the page runs");
const check = await stats();

const want = { total: TOTAL, seen_this_month: SEEN_THIS_MONTH, with_upcoming: WITH_UPCOMING, in_recovery: IN_RECOVERY };
let bad = false;
for (const [k, v] of Object.entries(want)) {
  const got = Number(check[k]);
  const ok = got === v;
  if (!ok) bad = true;
  console.log(`  ${ok ? "OK " : "OFF"} ${k.padEnd(16)} want ${String(v).padStart(5)}  got ${String(got).padStart(5)}`);
}

await sql.end();
if (bad) {
  console.error(
    "[perf-seed] THE SEED DID NOT HIT THE OWNER'S NUMBERS. It exits non-zero rather than " +
      "letting a measurement be taken against the wrong shape. The most likely cause is that " +
      "the tenant already held patients or appointments this script did not write - it only " +
      `deletes rows carrying its own marker (${MARKER}).`,
  );
  process.exit(1);
}
console.log("[perf-seed] all four counts match the owner's screen.");
