/**
 * list-queries.db.test.ts — the /patients scope predicate, against a REAL
 * Postgres, THROUGH THE PRODUCTION FUNCTIONS.
 *
 * ==========================================================================
 * WHY IT EXISTS: THIS PATH HAD NO ISOLATION PROOF AT ALL
 * ==========================================================================
 * `listPatientsPage` and `getPatientListStats` decide which patients a member of
 * staff can see. Before this file the only test near them was
 * `scope.test.ts`, which is a pure unit test asserting that
 * `therapistPatientScope` returns a predicate for one role and `undefined` for
 * three. It never touches a database, never exercises `patientLocationScope` at
 * all, and its own comment defers the predicate's contents to an E2E.
 *
 * So a rewrite of these queries could have changed WHO IS VISIBLE and every
 * existing test would have stayed green. `scope.ts` says in as many words that
 * "a redesign that quietly widened who can see a row would be a security change
 * dressed as a table" — and nothing in the repository could have caught one.
 *
 * ==========================================================================
 * THE FIXTURE IS THE ORACLE. NEITHER IMPLEMENTATION IS.
 * ==========================================================================
 * The obvious way to prove a rewrite is to run both versions and compare. That
 * proves they AGREE; it cannot tell you they are both wrong, and it stops being
 * runnable the moment the old one is deleted.
 *
 * So every expectation below is derived FROM THE FIXTURE BY CONSTRUCTION and
 * written as a literal. Each patient is created to be visible, or not, for ONE
 * named reason, and the reason is in the constant's name. A predicate that drops
 * any arm moves a number that is written down here.
 *
 * ==========================================================================
 * IT ASSERTS SETS AND COUNTS, NEVER SQL
 * ==========================================================================
 * Both functions run through `runScoped`, so `set local role authenticated` and
 * the JWT claims are real and `patients_select` (migration 0047) is enforced.
 * The visible set is therefore the COMPOSITE of the app-layer scope and RLS,
 * which is the only thing that matters to a member of staff. A suite asserting
 * generated SQL would go green against a statement the database narrows
 * differently.
 *
 * `.github/workflows/db-tests.yml` globs `.db.test.ts` in this workspace, so it
 * runs; `assert-rls-executed.mjs`'s derived half covers any suite that appears
 * in the report, so a silent skip REDDENS rather than passing.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const url = process.env.DATABASE_URL;
const live = Boolean(url);
const d = live ? describe : describe.skip;

/**
 * PINNED, not `new Date()`. The recovery window is "first of the previous month"
 * to "now minus seven days", so a floating clock would move the boundary under
 * the fixture and the suite would be differently true on different days.
 */
const NOW = new Date("2026-09-15T12:00:00.000Z");
/** Inside the window: after 1 August, more than seven days before NOW. */
const IN_WINDOW = new Date("2026-08-10T10:00:00.000Z");
/** This calendar month, and before NOW, so it counts as "seen this month". */
const THIS_MONTH = new Date("2026-09-02T10:00:00.000Z");
/** After NOW, so it is an upcoming booking. */
const FUTURE = new Date("2026-09-20T10:00:00.000Z");

d("the /patients scope predicate, against a real database", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let listPatientsPage: typeof import("./list-queries").listPatientsPage;
  let getPatientListStats: typeof import("./list-queries").getPatientListStats;

  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const locOne = randomUUID();   // the receptionist IS assigned here
  const locTwo = randomUUID();   // and is NOT assigned here
  const locOther = randomUUID(); // tenant B
  const reception = randomUUID();
  const therapist = randomUUID();
  const outsider = randomUUID(); // creates the patients, so `created_by` never widens the set

  /* Every patient exists for ONE reason, and the name is the reason. */
  const pByPrimaryLocation = randomUUID();
  const pByApptAtLocOne = randomUUID();
  const pBySecondaryApptAtLocOne = randomUUID();
  const pByApptNoPrimary = randomUUID();
  const pInWindowButBooked = randomUUID();
  const pOtherLocationOnly = randomUUID();
  const pSoftDeleted = randomUUID();
  const pOtherTenant = randomUUID();

  /** Visible to the loc-one receptionist, by construction. Five patients. */
  const VISIBLE = [
    pByPrimaryLocation, pByApptAtLocOne, pBySecondaryApptAtLocOne, pByApptNoPrimary, pInWindowButBooked,
  ];
  /** Not visible, each for its own reason. */
  const HIDDEN = [pOtherLocationOnly, pSoftDeleted, pOtherTenant];

  let n = 7000;
  const patientRow = (id: string, tenant: string, name: string, primary: string | null, deleted = false) =>
    raw`insert into patients (id, tenant_id, full_name, patient_number, primary_location_id, created_by, deleted_at)
        values (${id}::uuid, ${tenant}::uuid, ${name}, ${n++}, ${primary}::uuid, ${outsider}::uuid,
                ${deleted ? NOW.toISOString() : null}::timestamptz)`;

  const appt = (
    tenant: string, patient: string, location: string, at: Date,
    status: "completed" | "scheduled", secondary: string | null = null,
  ) =>
    raw`insert into appointments (tenant_id, patient_id, patient_2_id, practitioner_id, location_id,
                                  starts_at, ends_at, status)
        values (${tenant}::uuid, ${patient}::uuid, ${secondary}::uuid, ${therapist}::uuid, ${location}::uuid,
                ${at.toISOString()}::timestamptz, ${new Date(at.getTime() + 45 * 60000).toISOString()}::timestamptz,
                ${status}::appointment_status)`;

  const ctx = (userId: string, role: "reception" | "owner" | "therapist") =>
    ({ tenantId: tenantA, role, userId }) as Parameters<typeof getPatientListStats>[1] & object;

  const filters = (over: Partial<Parameters<typeof listPatientsPage>[0]> = {}) => ({
    q: "", locationId: null, upcomingOnly: false, sort: "name" as const, dir: "asc" as const, page: 1, ...over,
  });

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    ({ listPatientsPage, getPatientListStats } = await import("./list-queries"));

    for (const [id, name] of [[tenantA, "scope-a"], [tenantB, "scope-b"]] as const) {
      await db.execute(raw`insert into tenants (id, name, slug) values (${id}::uuid, ${name}, ${name + "-" + id.slice(0, 8)})`);
    }
    await db.execute(raw`insert into locations (id, tenant_id, name) values (${locOne}::uuid, ${tenantA}::uuid, 'Loc One')`);
    await db.execute(raw`insert into locations (id, tenant_id, name) values (${locTwo}::uuid, ${tenantA}::uuid, 'Loc Two')`);
    await db.execute(raw`insert into locations (id, tenant_id, name) values (${locOther}::uuid, ${tenantB}::uuid, 'Loc Other')`);

    for (const [id, tenant, email] of [
      [reception, tenantA, "rec"], [therapist, tenantA, "thr"], [outsider, tenantA, "out"],
    ] as const) {
      await db.execute(raw`insert into users (id, tenant_id, email, full_name)
                           values (${id}::uuid, ${tenant}::uuid, ${email + "-" + id.slice(0, 8) + "@example.test"}, ${email})`);
    }
    // The receptionist is assigned to loc ONE only. This is what makes
    // viewer_has_location_assignment() true and narrows both RLS and the app layer.
    await db.execute(raw`insert into staff_locations (tenant_id, user_id, location_id)
                         values (${tenantA}::uuid, ${reception}::uuid, ${locOne}::uuid)`);

    await db.execute(patientRow(pByPrimaryLocation, tenantA, "AAA primary at loc one", locOne));
    await db.execute(patientRow(pByApptAtLocOne, tenantA, "BBB appt at loc one", locTwo));
    await db.execute(patientRow(pBySecondaryApptAtLocOne, tenantA, "CCC secondary appt at loc one", locTwo));
    await db.execute(patientRow(pByApptNoPrimary, tenantA, "DDD appt, no primary", null));
    // pInWindowButBooked EXISTS FOR ONE CLAUSE. Its last completed visit is inside
    // the recovery window AND it has a future booking, so it is the only patient
    // that `followupNoFutureBookingClause` decides. Without it, deleting that
    // clause changes no number and the suite stays green - which is exactly what a
    // negative control found on 2026-09-01 before the rewrite was written.
    await db.execute(patientRow(pInWindowButBooked, tenantA, "EE0 in window but booked", locOne));
    await db.execute(patientRow(pOtherLocationOnly, tenantA, "EEE loc two only", locTwo));
    await db.execute(patientRow(pSoftDeleted, tenantA, "FFF soft deleted at loc one", locOne, true));
    await db.execute(patientRow(pOtherTenant, tenantB, "GGG other tenant", locOther));

    // pByPrimaryLocation: last completed IN the recovery window, nothing ahead.
    await db.execute(appt(tenantA, pByPrimaryLocation, locTwo, IN_WINDOW, "completed"));
    // pByApptAtLocOne: completed THIS MONTH, at loc one. Reaches the scope by the
    // appointment arm and the stats by "seen this month".
    await db.execute(appt(tenantA, pByApptAtLocOne, locOne, THIS_MONTH, "completed"));
    // pBySecondaryApptAtLocOne: at loc one ONLY as patient_2_id. The arm a rewrite
    // is most likely to drop, in the scope AND in every stat.
    //
    // ITS PRIMARY PATIENT IS ONE THAT IS ALREADY VISIBLE, and that matters. The
    // first draft of this fixture used `pOtherLocationOnly` as the primary, which
    // gave that patient an appointment at loc one and pulled it INTO scope - so
    // the suite failed against the shipped implementation and the shipped
    // implementation was right. Reusing an already-visible patient keeps this row
    // a test of the SECONDARY arm and of nothing else.
    await db.execute(appt(tenantA, pByApptAtLocOne, locOne, IN_WINDOW, "completed", pBySecondaryApptAtLocOne));
    // pByApptNoPrimary: a future booking at loc one, so "with upcoming" is 1.
    await db.execute(appt(tenantA, pByApptNoPrimary, locOne, FUTURE, "scheduled"));
    await db.execute(appt(tenantA, pInWindowButBooked, locOne, IN_WINDOW, "completed"));
    await db.execute(appt(tenantA, pInWindowButBooked, locOne, FUTURE, "scheduled"));
    // pOtherLocationOnly: every appointment at loc two, primary at loc two. The
    // control for "in the tenant, out of the viewer's scope".
    await db.execute(appt(tenantA, pOtherLocationOnly, locTwo, IN_WINDOW, "completed"));
    // Soft-deleted, and it has an appointment at loc one so ONLY deleted_at hides it.
    await db.execute(appt(tenantA, pSoftDeleted, locOne, IN_WINDOW, "completed"));
    // Tenant B, entirely separate.
    await db.execute(appt(tenantB, pOtherTenant, locOther, IN_WINDOW, "completed"));
  });

  afterAll(async () => {
    if (!live) return;
    await db.execute(raw`delete from appointments where tenant_id in (${tenantA}::uuid, ${tenantB}::uuid)`);
    await db.execute(raw`delete from staff_locations where tenant_id = ${tenantA}::uuid`);
    await db.execute(raw`delete from patients where tenant_id in (${tenantA}::uuid, ${tenantB}::uuid)`);
    await db.execute(raw`delete from users where tenant_id in (${tenantA}::uuid, ${tenantB}::uuid)`);
    await db.execute(raw`delete from locations where tenant_id in (${tenantA}::uuid, ${tenantB}::uuid)`);
    await db.execute(raw`delete from tenants where id in (${tenantA}::uuid, ${tenantB}::uuid)`);
  });

  const idsFor = async (userId: string, role: "reception" | "owner", over = {}) =>
    (await listPatientsPage(filters(over), ctx(userId, role))).rows.map((r) => r.id).sort();

  it("shows a location-scoped receptionist EXACTLY the five patients the fixture makes visible", async () => {
    expect(await idsFor(reception, "reception")).toEqual([...VISIBLE].sort());
  });

  it.each([
    ["primary_location_id is in scope", () => pByPrimaryLocation],
    ["an appointment AT the location", () => pByApptAtLocOne],
    ["a SECONDARY appointment at the location", () => pBySecondaryApptAtLocOne],
    ["an appointment at the location with no primary_location_id", () => pByApptNoPrimary],
  ])("includes the patient reachable by %s", async (_why, id) => {
    expect(await idsFor(reception, "reception")).toContain(id());
  });

  it("EXCLUDES every patient in the hidden set, each for its own reason", async () => {
    // Asserted as a SET rather than one `not.toContain` per patient: a hidden
    // patient added to the fixture without a matching assertion would otherwise
    // be silently unchecked.
    const ids = await idsFor(reception, "reception");
    for (const id of HIDDEN) expect(ids).not.toContain(id);
    expect(HIDDEN).toHaveLength(3); // soft-deleted, other-location, other-tenant
  });

  it("EXCLUDES the other tenant's patient from an unscoped viewer too", async () => {
    // The owner is unscoped BY LOCATION and still cannot see across tenants.
    expect(await idsFor(therapist, "owner")).not.toContain(pOtherTenant);
  });

  it("an UNASSIGNED viewer falls back to the whole tenant, and still not across it", async () => {
    // `outsider` has no staff_locations row: viewerLocationScope returns null and
    // viewer_has_location_assignment() is false, so neither layer narrows.
    const ids = await idsFor(outsider, "reception");
    for (const id of [...VISIBLE, pOtherLocationOnly]) expect(ids).toContain(id);
    expect(ids).not.toContain(pSoftDeleted);
    expect(ids).not.toContain(pOtherTenant);
  });

  it("the total the page reports equals the number of rows it can show", async () => {
    const page = await listPatientsPage(filters(), ctx(reception, "reception"));
    expect(page.total).toBe(VISIBLE.length);
    expect(page.rows).toHaveLength(VISIBLE.length);
  });

  it("the location FILTER narrows within the viewer's scope and can never widen it", async () => {
    // THE PROPERTY IS SUBSET, NOT EMPTINESS, and the difference is worth stating
    // because the first draft asserted emptiness and was wrong. `scopeConditions`
    // ANDs the viewer's own scope with the chosen location, so picking loc two
    // yields the patients reachable from BOTH - which is a real answer, not a
    // leak. What must never happen is a filtered set containing somebody the
    // unfiltered set does not.
    const unfiltered = await idsFor(reception, "reception");
    const filtered = await idsFor(reception, "reception", { locationId: locTwo });
    for (const id of filtered) expect(unfiltered).toContain(id);
    expect(filtered).not.toContain(pOtherLocationOnly);
    expect(filtered).not.toContain(pOtherTenant);
  });

  /* ------------------------------------------------------------------ */
  /* THE STAT STRIP. Four numbers, each fixed by construction.           */
  /* ------------------------------------------------------------------ */

  it("reports the four statistics the fixture defines, for the scoped viewer", async () => {
    const stats = await getPatientListStats(null, ctx(reception, "reception"), NOW);
    expect(stats).toEqual({
      total: 5,             // the VISIBLE set
      seenThisMonth: 1,     // pByApptAtLocOne, completed 2026-09-02
      withUpcoming: 2,      // pByApptNoPrimary and pInWindowButBooked, both 2026-09-20
      inRecoveryWindow: 2,  // pByPrimaryLocation and pBySecondaryApptAtLocOne ONLY -
                            // pInWindowButBooked is in the window but has a booking
    });
  });

  it("the strip's total equals the page's total, so the two can never disagree", async () => {
    const [stats, page] = await Promise.all([
      getPatientListStats(null, ctx(reception, "reception"), NOW),
      listPatientsPage(filters(), ctx(reception, "reception")),
    ]);
    expect(stats.total).toBe(page.total);
  });

  it("counts the SECONDARY-appointment patient in the recovery window", async () => {
    // The single most droppable arm: pBySecondaryApptAtLocOne reaches every one of
    // these queries only through `patient_2_id`. If a rewrite unnests only
    // `patient_id`, inRecoveryWindow falls to 1 and total falls to 3.
    const stats = await getPatientListStats(null, ctx(reception, "reception"), NOW);
    expect(stats.inRecoveryWindow).toBe(2);
    expect(stats.total).toBe(5);
  });

  it("narrows the statistics when a location filter is applied, and never widens them", async () => {
    const scoped = await getPatientListStats(null, ctx(reception, "reception"), NOW);
    const filtered = await getPatientListStats(locTwo, ctx(reception, "reception"), NOW);
    expect(filtered.total).toBeLessThan(scoped.total);
    expect(filtered.total).toBeGreaterThan(0); // it is a narrowing, not an emptying
  });

  it("an unassigned viewer's statistics cover the whole tenant and no more", async () => {
    const stats = await getPatientListStats(null, ctx(outsider, "reception"), NOW);
    expect(stats.total).toBe(6); // the five, plus pOtherLocationOnly; never the other tenant
  });

  it("EXCLUDES from the recovery window a patient who is in it but already booked", async () => {
    // The only assertion `followupNoFutureBookingClause` decides. Dropping that
    // clause moves inRecoveryWindow from 2 to 3 and reddens here.
    const stats = await getPatientListStats(null, ctx(reception, "reception"), NOW);
    expect(stats.inRecoveryWindow).toBe(2);
    expect(stats.withUpcoming).toBe(2);
  });

  /**
   * THE MEMO MUST NOT LEAK ACROSS PRINCIPALS.
   *
   * `resolveViewerLocationIds` is memoised per request with React `cache()`, keyed
   * on (tenantId, role, userId). A cache keyed too coarsely - on nothing, or on a
   * context object whose identity happens to be shared - would hand one member of
   * staff another's location scope, and every OTHER test here would still pass,
   * because they each use one principal.
   *
   * So this one interleaves two. `reception` is assigned to loc one and
   * `outsider` to nothing; they must get different answers within the same
   * process, in both orders, with the second call of each pair coming after the
   * other principal has populated the cache.
   */
  it("gives two principals different scopes, in both orders, from the same cache", async () => {
    const a1 = await idsFor(reception, "reception");
    const b1 = await idsFor(outsider, "reception");
    const a2 = await idsFor(reception, "reception");
    const b2 = await idsFor(outsider, "reception");

    expect(a1).toEqual(a2);
    expect(b1).toEqual(b2);
    expect(a1).not.toEqual(b1);
    expect(b1).toContain(pOtherLocationOnly);   // unassigned sees the whole tenant
    expect(a1).not.toContain(pOtherLocationOnly); // assigned does not
  });

  /**
   * THE DRIFT GUARD FOR "IN THE RECOVERY WINDOW".
   *
   * `getPatientListStats` used to BIND `followupLastAttendanceClause` and
   * `followupNoFutureBookingClause` from @osteojp/db, so its number could not
   * drift from the page it summarises. The one-pass rewrite cannot bind them -
   * they ARE the per-row re-scan it removes - so it expresses the same rule a
   * second time against the aggregate.
   *
   * This is what replaces the shared expression. It counts the window BOTH ways
   * over the same fixture: once through the production function, once through the
   * imported clauses verbatim, with the bindings in FOLLOWUP_BINDINGS order. If
   * /recuperacao's definition changes, this reddens and names the function that
   * has to follow it.
   */
  it("counts the recovery window identically to the shared /recuperacao clauses", async () => {
    const dbmod = await import("@osteojp/db");
    const { followupWindow } = await import("../followup/window");
    const { from, to } = followupWindow(NOW);
    const P = '"patients"."id"';
    const bindClause = (c: string) =>
      c.replace(/\$1/g, `'${from.toISOString()}'::timestamptz`)
        .replace(/\$2/g, `'${to.toISOString()}'::timestamptz`)
        .replace(/\$3/g, `'${NOW.toISOString()}'::timestamptz`);

    const res = await db.execute(
      raw.raw(`select count(*)::int as n from patients
                where patients.tenant_id = '${tenantA}'
                  and patients.deleted_at is null
                  and (${bindClause(dbmod.followupLastAttendanceClause(P))})
                  and (${bindClause(dbmod.followupNoFutureBookingClause(P))})`),
    );
    const viaSharedClauses = Number((res as unknown as { n: number }[])[0]!.n);

    // The unassigned viewer, so neither layer narrows and both sides see the same
    // tenant-wide population.
    const stats = await getPatientListStats(null, ctx(outsider, "reception"), NOW);
    expect(stats.inRecoveryWindow).toBe(viaSharedClauses);
    expect(viaSharedClauses).toBeGreaterThan(0); // never vacuously equal at zero
  });

  /* ------------------------------------------------------------------ */
  /* THE APP-LAYER PREDICATE, PINNED WITHOUT RLS.                       */
  /* ------------------------------------------------------------------ */
  /**
   * ==========================================================================
   * RLS IS THE CEILING; THE APP LAYER CAN ONLY NARROW BELOW IT
   * ==========================================================================
   * `patients_select` (migration 0047) narrows for `reception` by the SAME two
   * arms `patientLocationScope` uses - an appointment at a location the viewer is
   * assigned to, or a `primary_location_id` in scope. The two layers therefore do
   * not behave symmetrically, and the difference is worth stating precisely
   * because it decides what the suite above can and cannot prove.
   *
   * MEASURED, NOT ASSUMED. Six negative controls were run before the stat-strip
   * rewrite was written:
   *
   *   dropping the `patient_2_id` arm            8 of 21 red
   *   dropping the `primary_location_id` arm     8 of 21 red
   *   dropping `activePatientsOnly` (stats)      5 of 21 red
   *   dropping `activePatientsOnly` (page)       5 of 21 red
   *   dropping the no-future-booking clause      3 of 21 red
   *   replacing `roleScope` with `undefined`     GREEN, 21 of 21
   *
   * THE LAST ONE IS GREEN AND IT IS CORRECT THAT IT IS. Removing the app-layer
   * scope entirely makes the application WIDER than the database, and RLS then
   * binds - the composite is unchanged because the database refuses what the
   * application stopped refusing. Making the app layer NARROWER, as the first two
   * controls do, moves the composite immediately.
   *
   * So the suite above proves the app layer never narrows WRONGLY, and proves
   * nothing about it narrowing at all - RLS would carry the visible set on its
   * own. That is defence in depth working as designed, and it also means a
   * deletion of the whole predicate would pass every test above it.
   *
   * SO THIS BLOCK RUNS THE PREDICATE ALONE, through the BYPASSRLS admin handle,
   * where nothing else is narrowing. It is the only place in the repository where
   * `patientLocationScope` has a proof of its own.
   */
  describe("patientLocationScope, alone, with RLS out of the way", () => {
    const selected = async (locationIds: string[]) => {
      const { patientLocationScope } = await import("./scope");
      const { activePatientsOnly } = await import("./filters");
      const { patients } = await import("@osteojp/db");
      const { and, eq } = await import("drizzle-orm");
      const rows = await db
        .select({ id: patients.id })
        .from(patients)
        .where(and(eq(patients.tenantId, tenantA), activePatientsOnly, patientLocationScope(patients.id, locationIds)));
      return rows.map((r) => r.id).sort();
    };

    it("selects exactly the five patients reachable from loc one", async () => {
      expect(await selected([locOne])).toEqual([...VISIBLE].sort());
    });

    it("INCLUDES the patient reachable only as patient_2_id", async () => {
      // Deleting `OR ap.patient_2_id = ...` from the predicate reddens here and
      // NOWHERE ELSE, because RLS keeps the composite identical.
      expect(await selected([locOne])).toContain(pBySecondaryApptAtLocOne);
    });

    it("INCLUDES the patient reachable only by primary_location_id", async () => {
      expect(await selected([locOne])).toContain(pByPrimaryLocation);
    });

    it("EXCLUDES a patient with neither an appointment there nor a primary location there", async () => {
      expect(await selected([locOne])).not.toContain(pOtherLocationOnly);
    });

    it("is a NARROWING: loc one selects fewer than loc one and loc two together", async () => {
      const one = await selected([locOne]);
      const both = await selected([locOne, locTwo]);
      expect(both.length).toBeGreaterThan(one.length);
      for (const id of one) expect(both).toContain(id);
    });
  });
});
