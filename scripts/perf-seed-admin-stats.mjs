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
const BULK_APPTS_EACH = 5;

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
/**
 * The four aggregates, optionally as a LOCATION-SCOPED principal sees them.
 *
 * `locIds` null reproduces an UNASSIGNED viewer - `viewerLocationScope` returns
 * null for them and `scopeConditions` adds no predicate. A non-empty array
 * reproduces `patientLocationScope`: reachable by an appointment at one of those
 * locations, or by `primary_location_id`. It is restated here rather than
 * imported because this script is plain node and the predicate lives in a
 * server-only TypeScript module; the numbers it produces are checked against the
 * ones the PAGE produces by the spec that reads them, which is the real oracle.
 */
async function stats(locIds = null) {
  const scoped = locIds
    ? sql`and (
        exists (select 1 from appointments ap
                 where (ap.patient_id = p.id or ap.patient_2_id = p.id)
                   and ap.location_id in ${sql(locIds)})
        or exists (select 1 from patients pl
                    where pl.id = p.id and pl.primary_location_id in ${sql(locIds)})
      )`
    : sql``;
  /**
   * THE APPOINTMENT SCAN IS BOUNDED THE WAY `appointments_rls` BOUNDS IT.
   *
   * Scoping the PATIENTS and not the APPOINTMENTS is what let this script print
   * "all four counts match" over a screen showing 55 and 150. A location-scoped
   * admin does not see an appointment at a clinic they are not assigned to, so a
   * statistic derived from that appointment is not theirs to count either.
   */
  const visible = locIds ? sql`and location_id in ${sql(locIds)}` : sql``;
  return one(sql`
    with participations as (
      select patient_id as pid, starts_at, status from appointments where tenant_id = ${TENANT} ${visible}
      union all
      select patient_2_id as pid, starts_at, status from appointments where tenant_id = ${TENANT} and patient_2_id is not null ${visible}
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
     where p.tenant_id = ${TENANT} and p.deleted_at is null ${scoped}`);
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

/* ------------------------------------------- the principal, and it is the point */
/**
 * PERF-14. THE MEASURING PRINCIPAL IS GIVEN A staff_locations ASSIGNMENT.
 *
 * ==========================================================================
 * WHY, AND IT IS A DEFECT IN EVERY NUMBER THIS PROJECT HAS TAKEN LOCALLY
 * ==========================================================================
 * The e2e admin has no `staff_locations` row, so `viewerLocationScope` returns
 * null, `scopeConditions` adds NO predicate, and `viewer_has_location_assignment()`
 * is false inside the RLS policies. That principal is the CHEAP one: it skips
 * `patientLocationScope`'s two correlated EXISTS entirely, and it skips
 * `location_in_viewer_scope` inside `appointments_rls`.
 *
 * The owner's admin on production IS assigned. BLUE measured what that costs -
 * `location_in_viewer_scope` evaluated once per row, and the two EXISTS at
 * loops=8414 and 4184 - and a lane that measures as an unassigned admin CANNOT
 * SEE THAT CLASS OF DEFECT AT ALL. Every number taken here was taken by the
 * cheap principal, which is SR-24 one level deeper: it is not enough to run with
 * RLS on if the principal never triggers the expensive half of it.
 *
 * TWO LOCATIONS, NOT ONE, AND NOT ALL. One would make
 * `resolveLocationControl` return `fixed` and remove the filter select the
 * measurement suite uses to force a cold cache key. All of them would be
 * indistinguishable from unassigned on screen, so nothing could assert that the
 * assignment exists. Two leaves a picker AND leaves a visible difference: the
 * select offers 2 options where an unassigned admin sees every active location.
 *
 * IT IS PART OF THE SEED, not of seed-e2e.mjs, deliberately. This changes what
 * the e2e admin IS, and the ordinary suite must not inherit it - a perf-seeded
 * lane is already not a database the ordinary suite can pass on (see
 * LE-recuperacao-spec-leaves-a-contact-row-per-run). `lane-stack up` resets.
 */
/**
 * A THIRD ACTIVE LOCATION, OWNED BY THIS SCRIPT, AND THE ASSIGNMENT EXCLUDES IT.
 *
 * PERF-14 shipped with the spec asserting "the filter offers exactly the two
 * locations the seed assigned", on the reasoning that an unassigned admin is
 * offered every ACTIVE location. THAT ASSERTION COULD NOT FAIL: tenant A has
 * exactly two active locations (the third fixture location is archived), so an
 * unassigned admin is offered two as well and the check discriminated nothing.
 * Found by counting them here rather than by reading the fixture.
 *
 * With a third active location that the admin is NOT assigned to, the numbers
 * separate again - assigned sees 2, unassigned sees 3 - and it is also what
 * makes the `primary_location_id` class below possible at all, because that
 * class needs somewhere OUTSIDE the assignment to put appointments.
 */
const PERF_LOCATION = "00000000-0000-0000-0000-00000000fe14";
await sql`
  insert into locations (id, tenant_id, name, is_active)
  values (${PERF_LOCATION}, ${TENANT}, ${"Clinica de Medicao (PERF-14)"}, true)
  on conflict (id) do update set is_active = true`;

const locs = await sql`
  select id from locations
   where tenant_id = ${TENANT} and is_active and id <> ${PERF_LOCATION}
   order by created_at limit 2`;
if (locs.length < 2) {
  console.error(
    "[perf-seed] tenant A has fewer than two active locations besides the measurement one, so an " +
      "assigned principal cannot keep a location picker. Run: node apps/web/e2e/seed/seed-e2e.mjs",
  );
  process.exit(2);
}
const admin = await one(sql`
  select u.id from users u join roles r on r.id = u.role_id
   where u.tenant_id = ${TENANT} and u.email = ${"e2e-admin@osteojp.test"} and r.slug = 'admin'`);
if (!admin) {
  console.error("[perf-seed] no e2e admin in tenant A. Run: node apps/web/e2e/seed/seed-e2e.mjs");
  process.exit(2);
}
await sql`delete from staff_locations where tenant_id = ${TENANT} and user_id = ${admin.id}`;
for (const l of locs) {
  await sql`insert into staff_locations (tenant_id, user_id, location_id)
            values (${TENANT}, ${admin.id}, ${l.id})`;
}
const assigned = await one(sql`
  select count(*)::int as n from staff_locations where tenant_id = ${TENANT} and user_id = ${admin.id}`);
if (assigned.n !== 2) {
  console.error(`[perf-seed] expected the admin to hold 2 location assignments, found ${assigned.n}`);
  process.exit(1);
}
console.log(`[perf-seed] measuring principal e2e-admin@osteojp.test is assigned to ${assigned.n} locations`);

/**
 * PERF-15. BOTH ARMS OF `patientLocationScope`, AND AN UNASSIGNED ADMIN.
 *
 * ==========================================================================
 * THE FIXTURE COVERED ONE ARM OF TWO, AND IT WAS COUNTED, NOT ASSUMED
 * ==========================================================================
 * `patientLocationScope` is TWO correlated EXISTS: reachable by an APPOINTMENT
 * at one of the viewer's locations, OR by `primary_location_id`. Before this,
 * the seeded shape was appointment-only 8,409 / primary-only 0 / both 0 - so a
 * rewrite that dropped the `primary_location_id` arm entirely would have passed
 * on this lane and changed who can see whom on production.
 *
 * Three classes are now constructed, and the totals are unchanged by
 * construction so the four statistics and the assigned total stay where the spec
 * asserts them:
 *
 *   PRIMARY ONLY  their appointments move to the measurement location, which the
 *                 admin is NOT assigned to, and their `primary_location_id` is
 *                 set to one they ARE assigned to. Visible through the second
 *                 arm alone. It is also a real shape: a patient whose visits are
 *                 all at a site that has since closed, whose home clinic is a
 *                 current one.
 *   BOTH          `primary_location_id` set to an assigned location while their
 *                 appointments stay there too.
 *   APPOINTMENT   everyone else.
 *   NEITHER       the fixture patients reachable by no assigned location. They
 *                 are the reason the assigned total is 8,409 rather than 8,413.
 *
 * ==========================================================================
 * AND AN ADMIN WITH NO ASSIGNMENT, WHICH PRODUCTION DOES NOT HAVE
 * ==========================================================================
 * PERF-14 made the only admin on this lane an assigned one, which removed the
 * other class entirely. An equivalence gate for a rewrite of these predicates
 * has to run BOTH: `viewer_has_location_assignment()` false is a distinct branch
 * of both the app-layer scope and the RLS policy, and no principal on production
 * exercises it. A `users` row is all it takes - the branch is decided by the
 * ABSENCE of `staff_locations` rows, and a DB-gated test builds its own context.
 */
const UNASSIGNED_ADMIN = "00000000-0000-0000-0000-00000000fe15";
const adminRole = await one(sql`select id from roles where slug = ${"admin"}`);
await sql`
  insert into users (id, tenant_id, email, full_name, role_id, is_active)
  values (${UNASSIGNED_ADMIN}, ${TENANT}, ${"e2e-perf-admin-unassigned@osteojp.test"},
          ${"Admin Sem Clinica (PERF-15)"}, ${adminRole.id}, true)
  on conflict (id) do nothing`;
await sql`delete from staff_locations where tenant_id = ${TENANT} and user_id = ${UNASSIGNED_ADMIN}`;

const CLASS_SIZE = 50;
/**
 * ==========================================================================
 * THE CLASSES ARE BUILT FROM `bulk`, AND THE FIRST VERSION DREW THEM AT RANDOM
 * ==========================================================================
 * This block MOVES a patient's appointments to a location the admin is not
 * assigned to. For a patient in no statistic bucket that is invisible: their
 * visits are ancient completed ones that no statistic counts. For a patient in
 * the `seen`, `upcoming` or `recovery` bucket it is NOT: under
 * `appointments_rls` the assigned admin no longer sees the appointment that put
 * them in the bucket, so THE STAT STRIP DROPS BY ONE for that principal.
 *
 * The first version selected the 100 patients with
 * `select id ... where notes = MARKER order by p.id limit 100`. `p.id` is a
 * RANDOM uuid, so that is a random draw from all 8,404 seeded patients, of which
 * 297 are in a bucket - about three and a half hits per run, differing every
 * run. MEASURED, not reasoned about: on 2026-09-06 it moved 1 `seen this month`
 * and 3 `with upcoming` appointments out of the assignment, and
 * `perf-admin-stats.spec.ts` failed its premise with 55 and 150 against 56 and
 * 153 - after this script had printed "all four counts match the owner's
 * screen", because its own check both asserted the UNASSIGNED principal and
 * counted appointments with RLS out of the way.
 *
 * `bulk` is exactly the patients in NO bucket, held in memory from the insert
 * above, so drawing from it cannot move a statistic. The verification below now
 * asserts the ASSIGNED principal too, and bounds the appointment scan the way
 * the policy does, so a future change that reintroduces this fails HERE - in
 * seconds, with a sentence - rather than twenty minutes later in a browser.
 */
const primaryOnly = bulk.slice(0, CLASS_SIZE);
const both = bulk.slice(CLASS_SIZE, CLASS_SIZE * 2);
if (primaryOnly.length < CLASS_SIZE || both.length < CLASS_SIZE) {
  console.error("[perf-seed] not enough bucket-free seeded patients to build the visibility classes");
  process.exit(1);
}
// PRIMARY ONLY: appointments out of the assignment, home clinic inside it.
await sql`update appointments set location_id = ${PERF_LOCATION}
           where tenant_id = ${TENANT} and patient_id = any(${primaryOnly})`;
await sql`update patients set primary_location_id = ${locs[0].id}
           where tenant_id = ${TENANT} and id = any(${primaryOnly})`;
// BOTH: home clinic inside the assignment, appointments already inside it.
await sql`update patients set primary_location_id = ${locs[0].id}
           where tenant_id = ${TENANT} and id = any(${both})`;
await sql`analyze patients`;
await sql`analyze appointments`;

const classes = await one(sql`
  select
    count(*) filter (where appt and not prim)::int as appointment_only,
    count(*) filter (where prim and not appt)::int as primary_only,
    count(*) filter (where appt and prim)::int as both,
    count(*) filter (where not appt and not prim)::int as neither
  from (
    select p.id,
      exists (select 1 from appointments ap
               where (ap.patient_id = p.id or ap.patient_2_id = p.id)
                 and ap.location_id = any(${locs.map((l) => l.id)})) as appt,
      (p.primary_location_id = any(${locs.map((l) => l.id)})) is true as prim
      from patients p where p.tenant_id = ${TENANT} and p.deleted_at is null) x`);
console.log("[perf-seed] how the ASSIGNED admin reaches each patient:");
for (const [k, v] of Object.entries(classes)) console.log(`  ${k.padEnd(17)} ${String(v).padStart(5)}`);
for (const k of ["appointment_only", "primary_only", "both", "neither"]) {
  if (Number(classes[k]) < 1) {
    console.error(
      `[perf-seed] the "${k}" visibility class is EMPTY. A rewrite of patientLocationScope could ` +
        "drop the arm that decides it and this lane would not notice. Refusing to leave the " +
        "harness blind to a class it exists to cover (PERF-15).",
    );
    process.exit(1);
  }
}

/* --------------------------------------------------- verify the four counts */
console.log("[perf-seed] verifying against the SAME four aggregates the page runs");
const check = await stats();
const scopedCheck = await stats(locs.map((l) => l.id));
console.log("[perf-seed] the two principals, side by side:");
for (const k of ["total", "seen_this_month", "with_upcoming", "in_recovery"]) {
  console.log(
    `  ${k.padEnd(16)} unassigned ${String(check[k]).padStart(5)}   assigned ${String(scopedCheck[k]).padStart(5)}`,
  );
}

const want = { total: TOTAL, seen_this_month: SEEN_THIS_MONTH, with_upcoming: WITH_UPCOMING, in_recovery: IN_RECOVERY };
let bad = false;
for (const [k, v] of Object.entries(want)) {
  const got = Number(check[k]);
  const ok = got === v;
  if (!ok) bad = true;
  console.log(`  ${ok ? "OK " : "OFF"} ${k.padEnd(16)} want ${String(v).padStart(5)}  got ${String(got).padStart(5)}`);
}

/**
 * ==========================================================================
 * AND THE ASSIGNED PRINCIPAL, WHICH IS THE ONE THE MEASUREMENT RUNS AS
 * ==========================================================================
 * Until 2026-09-06 these four numbers were PRINTED and nothing compared them.
 * The principal every timing on this lane is taken as is the assigned one, and
 * `perf-admin-stats.spec.ts` asserts ITS stat strip - so an unasserted print was
 * the difference between failing here in seconds and failing in a browser twenty
 * minutes later, which is exactly what happened.
 *
 * `total` is DERIVED rather than pinned to a literal: it is the seeded total
 * minus the patients no arm of the scope reaches, which is the sentence the
 * board card makes about 8,409 against 8,413. The other three must be IDENTICAL
 * to the unassigned principal's - the visibility classes are constructed out of
 * bucket-free patients precisely so that moving their appointments cannot move a
 * statistic, and this is the assertion that holds that promise.
 */
const wantAssigned = {
  total: TOTAL - Number(classes.neither),
  seen_this_month: SEEN_THIS_MONTH,
  with_upcoming: WITH_UPCOMING,
  in_recovery: IN_RECOVERY,
};
for (const [k, v] of Object.entries(wantAssigned)) {
  const got = Number(scopedCheck[k]);
  const ok = got === v;
  if (!ok) bad = true;
  console.log(
    `  ${ok ? "OK " : "OFF"} assigned ${k.padEnd(16)} want ${String(v).padStart(5)}  got ${String(got).padStart(5)}`,
  );
}

await sql.end();
if (bad) {
  console.error(
    "[perf-seed] THE SEED DID NOT HIT THE OWNER'S NUMBERS. It exits non-zero rather than " +
      "letting a measurement be taken against the wrong shape.\n" +
      "  An UNASSIGNED line is off: the tenant already held patients or appointments this script " +
      `did not write - it only deletes rows carrying its own marker (${MARKER}).\n` +
      "  An ASSIGNED line is off while the unassigned one matches: the visibility classes were " +
      "built out of patients that ARE in a statistic bucket, so moving their appointments outside " +
      "the assignment took the statistic with them. Draw them from `bulk` (PERF-15/16).",
  );
  process.exit(1);
}
console.log("[perf-seed] all four counts match the owner's screen.");
