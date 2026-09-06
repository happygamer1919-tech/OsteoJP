/**
 * location-scope-classes.db.test.ts - PERF-15. THE FOUR WAYS A LOCATION-SCOPED
 * VIEWER REACHES A PATIENT, AND THE PRINCIPAL THAT REACHES EVERYONE.
 *
 * ==========================================================================
 * WHY THIS EXISTS SEPARATELY FROM list-queries.db.test.ts
 * ==========================================================================
 * That suite proves WHO IS VISIBLE for a location-scoped RECEPTIONIST, and it is
 * the reason a rewrite of the scope cannot quietly widen the set. This one exists
 * for a narrower and more mechanical question, asked because a rewrite of
 * `patientLocationScope` is coming: it is TWO correlated EXISTS, and the two are
 * not symmetric. A patient can be reached by an APPOINTMENT at one of the
 * viewer's locations, or by `primary_location_id`, or by both, or by neither.
 *
 * THE PERF LANE WAS BLIND TO HALF OF IT AND THIS WAS COUNTED, NOT ASSUMED: on
 * 2026-09-05 the production-scale fixture was appointment-only 8,409,
 * primary-only 0, both 0. A rewrite that dropped the `primary_location_id` arm
 * would have measured faster, passed every gate, and changed who can see whom.
 *
 * ==========================================================================
 * AND THE PRINCIPAL PRODUCTION DOES NOT HAVE
 * ==========================================================================
 * `viewer_has_location_assignment()` false is a distinct branch of BOTH the
 * app-layer scope and the RLS policy, and every admin on production is assigned,
 * so no production reading exercises it. It is asserted here beside the assigned
 * one, on the same rows, so an equivalence gate has both classes in one place.
 *
 * ==========================================================================
 * WHAT IT ASSERTS, AND WHAT IT DELIBERATELY DOES NOT
 * ==========================================================================
 * It asserts the COMPOSITE - the app-layer predicate AND `patients_select` - by
 * running the production functions through `runScoped`, because that composite is
 * the only thing that matters to a member of staff. It asserts SETS, never SQL.
 * Every expectation is derived from the fixture by construction and written as a
 * literal, and every patient exists for exactly one reason named in its constant.
 *
 * ALL FIVE PLACES `patientLocationScope` IS COMPOSED IN `lib/patients`, not one:
 * `scopeConditions` (the data table and the stat strip), and `getPatient`,
 * `listPatients` and `searchPatients`, each of which composes it again on its
 * own. Before this file covered them, the only tests naming those three mocked
 * them.
 *
 * ==========================================================================
 * THE LIMIT OF A COMPOSITE ASSERTION, MEASURED RATHER THAN REASONED ABOUT
 * ==========================================================================
 * A composite cannot see the app-layer predicate DISAPPEAR. Removing `roleScope`
 * from all four compositions on this path leaves every assertion below green,
 * because 0073's `patients_select` narrows an admin to `viewer_visible_patient_
 * ids()` and produces the identical set on its own. Run, not assumed:
 * 10/10 passed with the app predicate gone.
 *
 * That is not a hole in the file, it is the shape of the system - the app
 * predicate can only ever NARROW what RLS already returned, so its absence is
 * invisible and its MUTILATION is not. Removing ONE ARM of it reddens 6 of these
 * 10. What this file is a gate against is a rewrite that changes the SET; a
 * rewrite that deletes the app-layer predicate outright is a defence-in-depth
 * decision, and no test here will make it for you.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * THE ONE SEAM, AND WHY IT IS THE ONLY ONE.
 *
 * `listPatientsPage` and `getPatientListStats` TAKE a context. The other three
 * patients-path readers - `getPatient`, `listPatients`, `searchPatients` - call
 * `requireRequestContext()` themselves, which reads a Supabase session that does
 * not exist in a vitest worker. Answering that ONE call is the whole difference
 * between running them as a chosen principal and not running them at all.
 *
 * Everything else stays real, and that is the point: `runScoped` still sets
 * `role authenticated` and the JWT claims (so `patients_select` applies),
 * `viewerLocationScope` still reads `staff_locations`, `patientLocationScope`
 * still builds the two correlated EXISTS, and `assertCan` is NOT stubbed - an
 * admin genuinely holds `patients:read`, so stubbing it would only hide a
 * capability regression this file would otherwise catch for free.
 */
const acting = vi.hoisted(() => ({
  ctx: null as { tenantId: string; role: "admin"; userId: string } | null,
}));
vi.mock("../auth/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth/context")>();
  return {
    ...actual,
    requireRequestContext: async () => {
      if (!acting.ctx) throw new Error("no acting principal - use asPrincipal()");
      return acting.ctx;
    },
  };
});

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

const NOW = new Date("2026-09-15T12:00:00.000Z");
const SEEN = new Date("2026-09-02T10:00:00.000Z");

d("the four visibility classes of a location-scoped viewer", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let listPatientsPage: typeof import("./list-queries").listPatientsPage;
  let getPatientListStats: typeof import("./list-queries").getPatientListStats;
  let getPatient: typeof import("./queries").getPatient;
  let listPatients: typeof import("./queries").listPatients;
  let searchPatients: typeof import("./queries").searchPatients;

  const tenant = randomUUID();
  const assignedOne = randomUUID(); // the admin IS assigned here
  const assignedTwo = randomUUID(); // and here
  const elsewhere = randomUUID(); // and NOT here
  const assignedAdmin = randomUUID();
  const unassignedAdmin = randomUUID(); // no staff_locations row at all
  const therapist = randomUUID();

  /* One class each, and the constant's name is the class. */
  const byAppointmentOnly = randomUUID();
  const byPrimaryOnly = randomUUID();
  const byBoth = randomUUID();
  const byNeither = randomUUID();
  const bySecondaryAppointmentOnly = randomUUID();

  /** What the ASSIGNED admin may see. `byNeither` is the only one out. */
  const ASSIGNED_SEES = [byAppointmentOnly, byPrimaryOnly, byBoth, bySecondaryAppointmentOnly]
    .slice()
    .sort();
  /** What an UNASSIGNED admin may see: the whole tenant. */
  const UNASSIGNED_SEES = [...ASSIGNED_SEES, byNeither].slice().sort();

  let n = 9500;
  const patient = (id: string, name: string, primary: string | null) =>
    raw`insert into patients (id, tenant_id, full_name, patient_number, primary_location_id, created_by)
        values (${id}::uuid, ${tenant}::uuid, ${name}, ${n++}, ${primary}::uuid, ${therapist}::uuid)`;

  const appt = (patientId: string, location: string, secondary: string | null = null) =>
    raw`insert into appointments (tenant_id, patient_id, patient_2_id, practitioner_id, location_id,
                                  starts_at, ends_at, status)
        values (${tenant}::uuid, ${patientId}::uuid, ${secondary}::uuid, ${therapist}::uuid, ${location}::uuid,
                ${SEEN.toISOString()}::timestamptz, ${new Date(SEEN.getTime() + 45 * 60000).toISOString()}::timestamptz,
                'completed'::appointment_status)`;

  const ctx = (userId: string) =>
    ({ tenantId: tenant, role: "admin", userId }) as Parameters<typeof getPatientListStats>[1] &
      object;

  const filters = () => ({
    q: "",
    locationId: null,
    upcomingOnly: false,
    sort: "name" as const,
    dir: "asc" as const,
    page: 1,
  });

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    ({ listPatientsPage, getPatientListStats } = await import("./list-queries"));
    ({ getPatient, listPatients, searchPatients } = await import("./queries"));

    await db.execute(
      raw`insert into tenants (id, name, slug) values (${tenant}::uuid, 'perf15', ${"perf15-" + tenant.slice(0, 8)})`,
    );
    for (const [id, name] of [
      [assignedOne, "Assigned One"],
      [assignedTwo, "Assigned Two"],
      [elsewhere, "Elsewhere"],
    ] as const) {
      await db.execute(
        raw`insert into locations (id, tenant_id, name) values (${id}::uuid, ${tenant}::uuid, ${name})`,
      );
    }
    for (const [id, label] of [
      [assignedAdmin, "asg"],
      [unassignedAdmin, "una"],
      [therapist, "thr"],
    ] as const) {
      await db.execute(
        raw`insert into users (id, tenant_id, email, full_name)
            values (${id}::uuid, ${tenant}::uuid, ${label + "-" + id.slice(0, 8) + "@example.test"}, ${label})`,
      );
    }
    // ONLY the assigned admin gets rows. The other principal is defined by their
    // ABSENCE from this table, which is what `viewer_has_location_assignment()`
    // reads and what no production admin exercises.
    for (const loc of [assignedOne, assignedTwo]) {
      await db.execute(
        raw`insert into staff_locations (tenant_id, user_id, location_id)
            values (${tenant}::uuid, ${assignedAdmin}::uuid, ${loc}::uuid)`,
      );
    }

    await db.execute(patient(byAppointmentOnly, "AAA appointment only PERFCLASSE", null));
    await db.execute(patient(byPrimaryOnly, "BBB primary only PERFCLASSE", assignedOne));
    await db.execute(patient(byBoth, "CCC both arms PERFCLASSE", assignedTwo));
    await db.execute(patient(byNeither, "DDD neither arm PERFCLASSE", elsewhere));
    await db.execute(patient(bySecondaryAppointmentOnly, "EEE secondary appointment only PERFCLASSE", null));

    await db.execute(appt(byAppointmentOnly, assignedOne));
    // Its visits are all OUTSIDE the assignment; only its home clinic reaches it.
    await db.execute(appt(byPrimaryOnly, elsewhere));
    await db.execute(appt(byBoth, assignedOne));
    await db.execute(appt(byNeither, elsewhere));
    // Reachable ONLY as `patient_2_id`, on an appointment inside the assignment.
    // Its primary participant is `byAppointmentOnly`, which is already visible,
    // so this row tests the secondary arm and nothing else.
    await db.execute(appt(byAppointmentOnly, assignedTwo, bySecondaryAppointmentOnly));
  });

  afterAll(async () => {
    if (!live) return;
    await db.execute(raw`delete from appointments where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from staff_locations where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from patients where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from users where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from locations where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from tenants where id = ${tenant}::uuid`);
  });

  const idsFor = async (userId: string) =>
    (await listPatientsPage(filters(), ctx(userId))).rows.map((r) => r.id).sort();

  it("the fixture really does populate all four classes", async () => {
    // A guard on the ORACLE, not on the product. Three of these classes did not
    // exist in the production-scale fixture at all until PERF-15, and a suite
    // that silently lost one would go on passing while covering less.
    const rows = await db.execute(raw`
      select
        count(*) filter (where appt and not prim)::int as appointment_only,
        count(*) filter (where prim and not appt)::int as primary_only,
        count(*) filter (where appt and prim)::int as both,
        count(*) filter (where not appt and not prim)::int as neither
      from (
        select p.id,
          exists (select 1 from appointments ap
                   where (ap.patient_id = p.id or ap.patient_2_id = p.id)
                     and ap.location_id in (${assignedOne}::uuid, ${assignedTwo}::uuid)) as appt,
          (p.primary_location_id in (${assignedOne}::uuid, ${assignedTwo}::uuid)) is true as prim
          from patients p where p.tenant_id = ${tenant}::uuid) x`);
    const r = (rows as unknown as { rows?: Record<string, number>[] }).rows?.[0] ?? (rows as unknown as Record<string, number>[])[0];
    expect(r).toEqual({ appointment_only: 2, primary_only: 1, both: 1, neither: 1 });
  });

  it("an ASSIGNED admin sees every class except the one no arm reaches", async () => {
    expect(await idsFor(assignedAdmin)).toEqual(ASSIGNED_SEES);
  });

  it("an UNASSIGNED admin sees the whole tenant - the branch production has no principal for", async () => {
    expect(await idsFor(unassignedAdmin)).toEqual(UNASSIGNED_SEES);
  });

  it("the primary_location_id arm is LOAD-BEARING, not decoration", async () => {
    // The single assertion a rewrite that keeps only the appointment arm would
    // fail. `byPrimaryOnly` has no appointment anywhere near the assignment.
    expect(await idsFor(assignedAdmin)).toContain(byPrimaryOnly);
  });

  it("the secondary-participant arm is load-bearing too", async () => {
    expect(await idsFor(assignedAdmin)).toContain(bySecondaryAppointmentOnly);
  });

  it("the strip's totals agree with the lists, for both principals", async () => {
    const [assigned, unassigned] = await Promise.all([
      getPatientListStats(null, ctx(assignedAdmin), NOW),
      getPatientListStats(null, ctx(unassignedAdmin), NOW),
    ]);
    expect(assigned.total).toBe(ASSIGNED_SEES.length);
    expect(unassigned.total).toBe(UNASSIGNED_SEES.length);
  });

  /**
   * ==========================================================================
   * THE OTHER THREE READERS ON THIS PATH, WHICH NOTHING EXERCISED FOR REAL
   * ==========================================================================
   * `patientLocationScope` is composed FIVE times in `lib/patients`, not once:
   * `list-queries.ts` builds it in one shared `scopeConditions` that both the
   * data table and the stat strip use (the tests above), and `queries.ts`
   * composes it again, separately, in each of `getPatient`, `listPatients` and
   * `searchPatients`.
   *
   * COUNTED, NOT ASSUMED: before this block, every test that named those three
   * did so through `vi.mock("./queries")`. A mocked reader answers from a
   * fixture, so a scope arm that stopped narrowing there would be invisible -
   * the rows it should have removed were never in the fixture to remove. The
   * rewrite 0079 is aimed at changes the SHARED helper, so it changes all five
   * call sites at once, and an equivalence gate covering two of them is a gate
   * with three holes.
   *
   * `getPatient` is the one that matters most and it is the one furthest from a
   * list: it decides whether a member of staff opens a record or gets a 404.
   */
  async function asPrincipal<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    acting.ctx = { tenantId: tenant, role: "admin", userId };
    try {
      return await fn();
    } finally {
      acting.ctx = null;
    }
  }

  it("getPatient: an ASSIGNED admin opens every class an arm reaches, and 404s on the one no arm reaches", async () => {
    await asPrincipal(assignedAdmin, async () => {
      for (const id of ASSIGNED_SEES) {
        expect(await getPatient(id), `assigned admin cannot open ${id}`).not.toBeNull();
      }
      // The 404 half. Without it every assertion above passes on a predicate
      // that stopped narrowing at all.
      expect(await getPatient(byNeither)).toBeNull();
    });
  });

  it("getPatient: an UNASSIGNED admin opens all five, including the one no assignment reaches", async () => {
    await asPrincipal(unassignedAdmin, async () => {
      for (const id of UNASSIGNED_SEES) {
        expect(await getPatient(id), `unassigned admin cannot open ${id}`).not.toBeNull();
      }
    });
  });

  it("listPatients answers with the same set as the data table, for both principals", async () => {
    const assigned = await asPrincipal(assignedAdmin, () => listPatients({ limit: 200 }));
    const unassigned = await asPrincipal(unassignedAdmin, () => listPatients({ limit: 200 }));
    expect(assigned.map((r) => r.id).sort()).toEqual(ASSIGNED_SEES);
    expect(unassigned.map((r) => r.id).sort()).toEqual(UNASSIGNED_SEES);
  });

  it("searchPatients keeps the scope when a search term narrows the rows", async () => {
    // The token is on all five names, so the SEARCH removes nobody and the only
    // thing that can change the answer is the scope - which is the property
    // under test. A term that also filtered would make a lost arm look like a
    // search miss.
    const assigned = await asPrincipal(assignedAdmin, () => searchPatients("PERFCLASSE", { limit: 200 }));
    const unassigned = await asPrincipal(unassignedAdmin, () =>
      searchPatients("PERFCLASSE", { limit: 200 }),
    );
    expect(assigned.map((r) => r.id).sort()).toEqual(ASSIGNED_SEES);
    expect(unassigned.map((r) => r.id).sort()).toEqual(UNASSIGNED_SEES);
  });
});
