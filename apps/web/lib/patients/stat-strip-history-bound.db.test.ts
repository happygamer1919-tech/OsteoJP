/**
 * stat-strip-history-bound.db.test.ts - PERF-13, against a REAL Postgres.
 *
 * ==========================================================================
 * WHAT IT GUARDS
 * ==========================================================================
 * `getPatientListStats` used to aggregate EVERY appointment the tenant has ever
 * had, on every cold cache key, to produce four numbers about the last two
 * months. PERF-13 bounds that aggregate at `LEAST(from, monthStart)` - the
 * earliest instant any of the four can care about.
 *
 * That is a PERFORMANCE change whose whole risk is BEHAVIOURAL: it drops rows,
 * and `last_completed` is a MAX, so a careless bound silently lowers it and a
 * patient falls out of the recovery window. Nothing on a screen would say so;
 * the strip would simply report a smaller number, which looks like a quiet week.
 *
 * ==========================================================================
 * THE FIXTURE IS THE ORACLE, AND EVERY PATIENT EXISTS FOR ONE REASON
 * ==========================================================================
 * Same discipline as list-queries.db.test.ts, and a separate tenant and file
 * deliberately: adding these six patients to that fixture would move every
 * literal in it, and a suite whose expectations churn is a suite nobody trusts.
 *
 * The two that decide the bound are ANCIENT_PLUS_WINDOW and WINDOW_THEN_LATER.
 * A bound one month too late (at `monthStart` rather than `from`) drops the
 * first out of the recovery window; a bound that ignored the upper end would
 * pull the second in. Both are asserted as literals.
 *
 * `.github/workflows/db-tests.yml` globs `.db.test.ts` in this workspace.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

/** Pinned, for the reason the sibling suite gives: a floating clock moves the window. */
const NOW = new Date("2026-09-15T12:00:00.000Z");
/** Long before the bound. This is the row the change removes. */
const ANCIENT = new Date("2020-05-09T10:00:00.000Z");
/** Inside [from, to]: after 1 August, more than seven days before NOW. */
const IN_WINDOW = new Date("2026-08-10T10:00:00.000Z");
/** This calendar month AND after `to` (NOW - 7d = 8 September). */
const AFTER_TO = new Date("2026-09-10T10:00:00.000Z");
/** After NOW. */
const FUTURE = new Date("2026-09-20T10:00:00.000Z");

d("the stat strip is bounded to the window it reports on", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let getPatientListStats: typeof import("./list-queries").getPatientListStats;

  const tenant = randomUUID();
  const loc = randomUUID();
  const owner = randomUUID();
  const therapist = randomUUID();

  /* One reason each, and the name is the reason. */
  const ancientOnly = randomUUID();        // total only
  const ancientPlusWindow = randomUUID();  // recovery window
  const windowThenLater = randomUUID();    // seen this month, NOT recovery
  const futureOnly = randomUUID();         // upcoming
  const ancientPlusFuture = randomUUID();  // upcoming, and ancient must not matter
  const secondaryInWindow = randomUUID();  // recovery, reachable ONLY as patient_2_id

  let n = 9000;
  const patient = (id: string, name: string) =>
    raw`insert into patients (id, tenant_id, full_name, patient_number, primary_location_id, created_by)
        values (${id}::uuid, ${tenant}::uuid, ${name}, ${n++}, ${loc}::uuid, ${owner}::uuid)`;

  const appt = (
    patientId: string,
    at: Date,
    status: "completed" | "scheduled",
    secondary: string | null = null,
  ) =>
    raw`insert into appointments (tenant_id, patient_id, patient_2_id, practitioner_id, location_id,
                                  starts_at, ends_at, status)
        values (${tenant}::uuid, ${patientId}::uuid, ${secondary}::uuid, ${therapist}::uuid, ${loc}::uuid,
                ${at.toISOString()}::timestamptz, ${new Date(at.getTime() + 45 * 60000).toISOString()}::timestamptz,
                ${status}::appointment_status)`;

  const ctx = () =>
    ({ tenantId: tenant, role: "owner", userId: owner }) as Parameters<
      typeof getPatientListStats
    >[1] & object;

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    ({ getPatientListStats } = await import("./list-queries"));

    await db.execute(
      raw`insert into tenants (id, name, slug) values (${tenant}::uuid, 'perf13', ${"perf13-" + tenant.slice(0, 8)})`,
    );
    await db.execute(
      raw`insert into locations (id, tenant_id, name) values (${loc}::uuid, ${tenant}::uuid, 'Loc')`,
    );
    for (const [id, label] of [
      [owner, "own"],
      [therapist, "thr"],
    ] as const) {
      await db.execute(
        raw`insert into users (id, tenant_id, email, full_name)
            values (${id}::uuid, ${tenant}::uuid, ${label + "-" + id.slice(0, 8) + "@example.test"}, ${label})`,
      );
    }

    await db.execute(patient(ancientOnly, "AAA ancient only"));
    await db.execute(patient(ancientPlusWindow, "BBB ancient plus window"));
    await db.execute(patient(windowThenLater, "CCC window then later"));
    await db.execute(patient(futureOnly, "DDD future only"));
    await db.execute(patient(ancientPlusFuture, "EEE ancient plus future"));
    await db.execute(patient(secondaryInWindow, "FFF secondary in window"));

    // The row the bound removes, and the whole point: it must change nothing.
    await db.execute(appt(ancientOnly, ANCIENT, "completed"));

    // Its ancient visit is dropped; its in-window visit is the max either way.
    await db.execute(appt(ancientPlusWindow, ANCIENT, "completed"));
    await db.execute(appt(ancientPlusWindow, IN_WINDOW, "completed"));

    // Max is AFTER `to`, so it is NOT in the window - the upper bound still
    // decides, and a bound that only looked at the lower end would get this wrong.
    await db.execute(appt(windowThenLater, IN_WINDOW, "completed"));
    await db.execute(appt(windowThenLater, AFTER_TO, "completed"));

    await db.execute(appt(futureOnly, FUTURE, "scheduled"));

    await db.execute(appt(ancientPlusFuture, ANCIENT, "completed"));
    await db.execute(appt(ancientPlusFuture, FUTURE, "scheduled"));

    // Reachable ONLY through patient_2_id, on an in-window completed visit. The
    // arm the source comment says "a rewrite drops silently"; its primary is
    // `futureOnly`, which already has a future booking, so gaining a completed
    // visit cannot move that patient into the recovery window and this row stays
    // a test of the SECONDARY arm alone.
    await db.execute(appt(futureOnly, IN_WINDOW, "completed", secondaryInWindow));
  });

  afterAll(async () => {
    if (!live) return;
    await db.execute(raw`delete from appointments where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from patients where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from users where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from locations where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from tenants where id = ${tenant}::uuid`);
  });

  it("reports the four numbers the fixture defines, with history older than the bound present", async () => {
    // Derived from the fixture by construction, written as literals:
    //   total       all six patients are active
    //   seen        windowThenLater alone has a completed visit since 1 September
    //   upcoming    futureOnly and ancientPlusFuture
    //   recovery    ancientPlusWindow (max = 10 Aug) and secondaryInWindow
    const stats = await getPatientListStats(null, ctx(), NOW);
    expect(stats).toEqual({
      total: 6,
      seenThisMonth: 1,
      withUpcoming: 2,
      inRecoveryWindow: 2,
    });
  });

  it("a visit older than the bound changes nothing - it is dropped and no number moves", async () => {
    // The property the change rests on, stated on its own so a failure names it.
    // `ancientOnly` has ONE appointment and it is from 2020: it must be counted
    // in the total and in nothing else, exactly as it was when the aggregate read
    // every row the tenant ever had.
    const before = await getPatientListStats(null, ctx(), NOW);
    await db.execute(appt(ancientOnly, new Date("2019-01-02T09:00:00.000Z"), "completed"));
    await db.execute(appt(ancientPlusWindow, new Date("2018-03-04T09:00:00.000Z"), "completed"));
    const after = await getPatientListStats(null, ctx(), NOW);
    expect(after).toEqual(before);
  });

  it("the recovery window is decided by the LATEST visit, not by any visit", async () => {
    // Guards the MAX. If the bound ever drops a row it should have kept, this is
    // where it shows: ancientPlusWindow leaves the window the moment it gains a
    // visit after `to`, and windowThenLater is already out for that same reason.
    const before = await getPatientListStats(null, ctx(), NOW);
    expect(before.inRecoveryWindow).toBe(2);
    await db.execute(appt(ancientPlusWindow, AFTER_TO, "completed"));
    const after = await getPatientListStats(null, ctx(), NOW);
    expect(after.inRecoveryWindow).toBe(1);
    // ...and it is now "seen this month" instead, so the row moved rather than vanished.
    expect(after.seenThisMonth).toBe(2);
    expect(after.total).toBe(before.total);
  });
});
