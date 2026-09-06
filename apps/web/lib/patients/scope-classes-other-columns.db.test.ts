/**
 * scope-classes-other-columns.db.test.ts - THE TWO CALL SITES THAT DO NOT PASS
 * `patients.id`.
 *
 * ==========================================================================
 * WHY THESE TWO ARE THEIR OWN FILE
 * ==========================================================================
 * `patientLocationScope(column, locationIds)` takes the column it correlates
 * on. Nine of its eleven call sites pass `patients.id`; two do not:
 *
 *   lib/consultation/stuck-consultations.ts   consultations.patient_id
 *   lib/reminders/unreachable-by-sms.ts       appointments.patient_id
 *
 * A rewrite that assumed `patients.id` - joining the patients table, or reading
 * `primary_location_id` off the outer query instead of correlating - would still
 * compile, would still pass every suite that drives the patients path, and would
 * silently change who these two screens show. That is the same shape as PERF-15's
 * finding (an arm that was never the reason for anything) one level out: an
 * ARGUMENT that is never anything but one value in the covered tests.
 *
 * ==========================================================================
 * THE TWO CALL SITES DO NOT AGREE, AND THE DISAGREEMENT WAS MEASURED HERE
 * ==========================================================================
 * The first draft of this file put every FUTURE appointment at `elsewhere` and
 * asserted that the assigned admin still saw four patients on the unreachable
 * screen - the reasoning being that `patientLocationScope` correlates over ALL
 * of a patient's appointments, so the location on the row in front of you is not
 * what decides. THAT IS TRUE OF THE PREDICATE AND FALSE OF THE SCREEN, and the
 * database said so: the assigned admin saw NONE of them.
 *
 * `listPatientsUnreachableBySms` selects FROM `appointments`, so every row must
 * first survive `appointments_rls`, which scopes a location-assigned viewer to
 * appointments AT their own clinics. RLS gets there before the app predicate
 * does. So on this screen a patient reachable ONLY through
 * `primary_location_id` is NOT visible to an assigned admin, while on the
 * patients list they are - the same four classes, two different answers, and
 * both are correct for what each screen is about.
 *
 * `listStuckConsultations` behaves the other way: it selects FROM
 * `consultations`, whose policy is not location-scoped, so there the app
 * predicate is the whole of the rule and all four classes behave as they do on
 * the patients path.
 *
 * THAT ASYMMETRY IS WHAT THIS FILE IS FOR. It is invisible to any suite that
 * drives only `patients.id` call sites, it is the sort of thing a rewrite
 * "corrects" in one direction or the other without noticing, and it was found by
 * running the fixture rather than by reading the query.
 *
 * It asserts SETS through the production functions under `runScoped`, exactly as
 * location-scope-classes.db.test.ts does, and every expectation is derived from
 * the fixture by construction.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

const PAST = new Date("2026-09-02T10:00:00.000Z");
const FUTURE = new Date("2026-12-01T10:00:00.000Z");

d("the four visibility classes, through the call sites that pass another column", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let listStuckConsultations: typeof import("../consultation/stuck-consultations").listStuckConsultations;
  let listPatientsUnreachableBySms: typeof import("../reminders/unreachable-by-sms").listPatientsUnreachableBySms;

  const tenant = randomUUID();
  const assignedOne = randomUUID();
  const assignedTwo = randomUUID();
  const elsewhere = randomUUID();
  const assignedAdmin = randomUUID();
  const unassignedAdmin = randomUUID();
  const therapist = randomUUID();

  /* One patient per class, and the constant's name is the class. */
  const byAppointmentOnly = randomUUID();
  const byPrimaryOnly = randomUUID();
  const byBoth = randomUUID();
  const byNeither = randomUUID();
  const bySecondaryAppointmentOnly = randomUUID();

  /** What an ASSIGNED admin may see where the app predicate is the whole rule. */
  const ASSIGNED_SEES = [byAppointmentOnly, byPrimaryOnly, byBoth, bySecondaryAppointmentOnly]
    .slice()
    .sort();
  /** What an UNASSIGNED admin may see anywhere: the whole tenant. */
  const UNASSIGNED_SEES = [...ASSIGNED_SEES, byNeither].slice().sort();
  /**
   * And what an ASSIGNED admin may see on a screen that selects FROM
   * `appointments`. `byPrimaryOnly` DROPS OUT: their only future appointment is
   * at a clinic outside the assignment, and `appointments_rls` removes that row
   * before `patientLocationScope` is consulted about it. See the header.
   */
  const ASSIGNED_SEES_VIA_APPOINTMENTS = [byAppointmentOnly, byBoth].slice().sort();

  const ctx = (userId: string) =>
    ({ tenantId: tenant, role: "admin" as const, userId });

  let n = 9700;
  const patient = (id: string, name: string, primary: string | null) =>
    // A LANDLINE, because `listPatientsUnreachableBySms` is a query ABOUT
    // landlines: `phone_e164 like '+3512%'`. A mobile here would empty that half
    // of the file for a reason that has nothing to do with the scope.
    raw`insert into patients (id, tenant_id, full_name, patient_number, phone, primary_location_id, created_by)
        values (${id}::uuid, ${tenant}::uuid, ${name}, ${n++}, ${"212345" + String(n).slice(-3)},
                ${primary}::uuid, ${therapist}::uuid)`;

  const appt = (patientId: string, location: string, at: Date, secondary: string | null = null) =>
    raw`insert into appointments (tenant_id, patient_id, patient_2_id, practitioner_id, location_id,
                                  starts_at, ends_at, status)
        values (${tenant}::uuid, ${patientId}::uuid, ${secondary}::uuid, ${therapist}::uuid, ${location}::uuid,
                ${at.toISOString()}::timestamptz,
                ${new Date(at.getTime() + 45 * 60000).toISOString()}::timestamptz,
                ${at > new Date() ? "scheduled" : "completed"}::appointment_status)`;

  const consultation = (patientId: string) =>
    raw`insert into consultations (tenant_id, patient_id, doctor_id, audio_object_key,
                                   consultation_started_at, consultation_ended_at,
                                   fire_status, attempt_count, last_error)
        values (${tenant}::uuid, ${patientId}::uuid, ${therapist}::uuid, ${"k/" + patientId},
                ${PAST.toISOString()}::timestamptz,
                ${new Date(PAST.getTime() + 30 * 60000).toISOString()}::timestamptz,
                'needs_attention', 8, '503')`;

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    ({ listStuckConsultations } = await import("../consultation/stuck-consultations"));
    ({ listPatientsUnreachableBySms } = await import("../reminders/unreachable-by-sms"));

    await db.execute(
      raw`insert into tenants (id, name, slug) values (${tenant}::uuid, 'cols', ${"cols-" + tenant.slice(0, 8)})`,
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
    for (const loc of [assignedOne, assignedTwo]) {
      await db.execute(
        raw`insert into staff_locations (tenant_id, user_id, location_id)
            values (${tenant}::uuid, ${assignedAdmin}::uuid, ${loc}::uuid)`,
      );
    }

    await db.execute(patient(byAppointmentOnly, "AAA appointment only", null));
    await db.execute(patient(byPrimaryOnly, "BBB primary only", assignedOne));
    await db.execute(patient(byBoth, "CCC both arms", assignedTwo));
    await db.execute(patient(byNeither, "DDD neither arm", elsewhere));
    await db.execute(patient(bySecondaryAppointmentOnly, "EEE secondary only", null));

    /* THE PAST APPOINTMENTS ARE WHAT DEFINE THE CLASSES. */
    await db.execute(appt(byAppointmentOnly, assignedOne, PAST));
    await db.execute(appt(byPrimaryOnly, elsewhere, PAST));
    await db.execute(appt(byBoth, assignedOne, PAST));
    await db.execute(appt(byNeither, elsewhere, PAST));
    // Reachable ONLY as the second participant, on an appointment inside the
    // assignment whose primary participant is already visible.
    await db.execute(appt(byAppointmentOnly, assignedTwo, PAST, bySecondaryAppointmentOnly));

    /* AND EVERY PATIENT GETS A FUTURE ONE, at the clinic their class implies -
       which is what makes `byPrimaryOnly` and `byNeither` fall out of the
       unreachable screen for an assigned admin while `byPrimaryOnly` stays on
       the stuck-consultations one. The two clinics are the whole difference. */
    await db.execute(appt(byAppointmentOnly, assignedOne, FUTURE));
    await db.execute(appt(byBoth, assignedOne, FUTURE));
    // Outside the assignment, deliberately: this patient's visits are all
    // elsewhere and only their home clinic reaches them.
    await db.execute(appt(byPrimaryOnly, elsewhere, FUTURE));
    await db.execute(appt(byNeither, elsewhere, FUTURE));
    /**
     * AND THIS ONE IS OUTSIDE IT TOO, WHICH A NEGATIVE CONTROL IS THE REASON
     * FOR. The first draft gave this patient their own future appointment at
     * `assignedTwo` so that they would appear on the unreachable screen - and
     * that made the `patient_2_id` arm STOP BEING LOAD-BEARING anywhere in this
     * file: deleting it from `patientLocationScope` left all seven assertions
     * green, because the first arm reached them through their own row.
     *
     * With their only in-assignment link being the appointment where they are
     * the SECOND participant, the arm is load-bearing again on the stuck list -
     * and they are correctly absent from the unreachable one, where a patient
     * with no future appointment at your clinic is not your problem to solve.
     */
    await db.execute(appt(bySecondaryAppointmentOnly, elsewhere, FUTURE));

    for (const p of [byAppointmentOnly, byPrimaryOnly, byBoth, byNeither, bySecondaryAppointmentOnly]) {
      await db.execute(consultation(p));
    }
  });

  afterAll(async () => {
    if (!live) return;
    await db.execute(raw`delete from consultations where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from appointments where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from staff_locations where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from patients where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from users where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from locations where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from tenants where id = ${tenant}::uuid`);
  });

  const stuckFor = async (userId: string) =>
    (await listStuckConsultations(ctx(userId))).map((r) => r.patientName).sort();

  const unreachableFor = async (userId: string) =>
    (await listPatientsUnreachableBySms(ctx(userId))).map((r) => r.patientId).sort();

  const nameOf: Record<string, string> = {
    [byAppointmentOnly]: "AAA appointment only",
    [byPrimaryOnly]: "BBB primary only",
    [byBoth]: "CCC both arms",
    [byNeither]: "DDD neither arm",
    [bySecondaryAppointmentOnly]: "EEE secondary only",
  };
  const namesOf = (ids: string[]) => ids.map((id) => nameOf[id]!).sort();

  it("the fixture really does populate all four classes", async () => {
    // A guard on the ORACLE. Without it every assertion below still passes over
    // a fixture that quietly lost the class it is named for.
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
    const r =
      (rows as unknown as { rows?: Record<string, number>[] }).rows?.[0] ??
      (rows as unknown as Record<string, number>[])[0];
    expect(r).toEqual({ appointment_only: 2, primary_only: 1, both: 1, neither: 1 });
  });

  /* ============================ consultations.patient_id ==================== */

  it("STUCK CONSULTATIONS: an assigned admin sees every class except the one no arm reaches", async () => {
    expect(await stuckFor(assignedAdmin)).toEqual(namesOf(ASSIGNED_SEES));
  });

  it("STUCK CONSULTATIONS: an unassigned admin sees the whole tenant", async () => {
    // The positive control for the assertion above. Both run over the same five
    // consultations, so "the assigned admin sees four" only means something
    // against a principal who sees five.
    expect(await stuckFor(unassignedAdmin)).toEqual(namesOf(UNASSIGNED_SEES));
  });

  it("STUCK CONSULTATIONS: the primary_location_id arm is load-bearing here too", async () => {
    expect(await stuckFor(assignedAdmin)).toContain(nameOf[byPrimaryOnly]);
  });

  it("STUCK CONSULTATIONS: the patient_2_id arm is load-bearing here too", async () => {
    // Their ONLY link to an assigned clinic is an appointment on which they are
    // the second participant. See the note on their future appointment in the
    // fixture for why this assertion did not exist until a control proved it
    // could not fail.
    expect(await stuckFor(assignedAdmin)).toContain(nameOf[bySecondaryAppointmentOnly]);
  });

  /* ============================ appointments.patient_id ==================== */

  it("UNREACHABLE BY SMS: an assigned admin sees the classes whose APPOINTMENT is at their clinic", async () => {
    expect(await unreachableFor(assignedAdmin)).toEqual(ASSIGNED_SEES_VIA_APPOINTMENTS);
  });

  it("UNREACHABLE BY SMS: an unassigned admin sees the whole tenant", async () => {
    expect(await unreachableFor(unassignedAdmin)).toEqual(UNASSIGNED_SEES);
  });

  it("THE ASYMMETRY, ASSERTED: byPrimaryOnly is on the stuck list and NOT on the unreachable one", async () => {
    // THE SAME PATIENT, THE SAME PRINCIPAL, THE SAME MINUTE, TWO ANSWERS - and
    // both are right. `listStuckConsultations` reads a table whose policy is not
    // location-scoped, so the app predicate decides and the primary_location_id
    // arm reaches them. `listPatientsUnreachableBySms` reads `appointments`,
    // whose policy IS location-scoped, so their only future appointment is gone
    // before the predicate is asked about it.
    //
    // This is the assertion that fails if a rewrite quietly makes the two agree
    // in either direction, which is exactly what a rewrite of a shared helper
    // is likely to do.
    expect(await stuckFor(assignedAdmin)).toContain(nameOf[byPrimaryOnly]);
    expect(await unreachableFor(assignedAdmin)).not.toContain(byPrimaryOnly);
    // And the control: an unassigned admin, who is subject to neither rule, has
    // them on both.
    expect(await stuckFor(unassignedAdmin)).toContain(nameOf[byPrimaryOnly]);
    expect(await unreachableFor(unassignedAdmin)).toContain(byPrimaryOnly);
  });
});
