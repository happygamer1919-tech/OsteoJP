/**
 * appointment-scope.db.test.ts — SEC-appointment-vanishes-with-patient-scope.
 *
 * THE ISOLATION TEST THE OWNER ASKED FOR, in his words: "out-of-scope principal
 * sees the slot, never the name."
 *
 * ==========================================================================
 * THE DEFECT, AND WHY NOTHING CAUGHT IT
 * ==========================================================================
 * `baseAppointmentQuery` INNER JOINED `patients`. Every agenda surface reads
 * through it. So a row the APPOINTMENTS policy admits was dropped by the query
 * whenever the PATIENTS policy did not admit its patient - not shown with the
 * name withheld: GONE, with nothing anywhere saying a row had been dropped. The
 * slot read as FREE, and a receptionist would book over it or tell a patient
 * their appointment does not exist.
 *
 * Every existing test on this path asserts what a viewer CAN see. A row silently
 * missing from a list satisfies all of them.
 *
 * ==========================================================================
 * THE ARM THAT MAKES THE TWO SCOPES DISAGREE, DERIVED RATHER THAN GUESSED
 * ==========================================================================
 * Both policies open with `created_by = auth.uid()`. They are the same clause
 * over DIFFERENT ROWS:
 *
 *   appointments_rls (0071):  created_by = auth.uid()  -- the APPOINTMENT's creator
 *   patients_select  (0074):  created_by = auth.uid()  -- the PATIENT's creator
 *
 * So an appointment booked by this viewer, for a patient somebody else
 * registered at a clinic this viewer is not assigned to, is ADMITTED as an
 * appointment and REFUSED as a patient. That is the fixture below, and it is
 * reachable without any exotic state: a receptionist books at another clinic
 * once, or a location assignment changes after a booking.
 *
 * IT IS NOT THE ONLY ARM, IT IS THE CLEANEST. For a reception/admin viewer the
 * location arms cannot disagree - `viewer_visible_patient_ids()` (0073) admits
 * any patient with an appointment at one of the viewer's locations, so an
 * appointment at a visible location always carries a visible patient. For a
 * therapist the practitioner arms cannot disagree either, for the mirror reason
 * in `viewer_treated_patient_ids()` (0074). `created_by` is the arm that is in
 * both policies and keyed on neither location nor practitioner.
 *
 * ==========================================================================
 * WHICH SURFACES IT REACHED, STATED PRECISELY SO NOBODY OVERCLAIMS
 * ==========================================================================
 *   getAppointment(id)        - no location filter, no practitioner filter. The
 *                               marcação drawer and every deep link by id.
 *   the DASHBOARD             - `listAppointments(ctx, {startUtc, endUtc})` with
 *                               NO practitionerId and NO locationId, and
 *                               `viewerLocationScope` returns null for a
 *                               therapist. Both the "Próximas marcações" list
 *                               and the weekly chart read low.
 *   listPatientAppointments   - no filters.
 *
 * /agenda and /marcacoes were closed, but BY THEIR CALLERS and not by this
 * query: a therapist is practitioner-locked (`lockTherapist`), and a located
 * reception/admin is location-filtered at the app layer. That is the kind of
 * safety that reopens the day a caller changes, which is why the fix is here.
 *
 * Runs in `.github/workflows/db-tests.yml` (it globs `.db.test.ts` in this
 * workspace) and self-skips without DATABASE_URL, like every suite beside it.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const url = process.env.DATABASE_URL;
const live = Boolean(url);
const d = live ? describe : describe.skip;

/** Pinned, so the window the queries ask for never drifts under the fixture. */
const NOW = new Date("2026-10-14T09:00:00.000Z");
const WINDOW_START = new Date("2026-10-14T00:00:00.000Z");
const WINDOW_END = new Date("2026-10-15T00:00:00.000Z");

d("an appointment whose patient is out of scope is SHOWN, with the name withheld", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let getAppointment: typeof import("./data").getAppointment;
  let listAppointments: typeof import("./data").listAppointments;

  const tenant = randomUUID();
  const locMine = randomUUID(); // the receptionist IS assigned here
  const locTheirs = randomUUID(); // and is NOT assigned here

  const reception = randomUUID();
  const therapist = randomUUID();
  const otherTherapist = randomUUID();
  const outsider = randomUUID(); // registers the patients, so created_by never widens

  /** Filed at the clinic the receptionist cannot see. Registered by somebody else. */
  const pWithheld = randomUUID();
  /** Filed at the receptionist's own clinic. The positive control. */
  const pVisible = randomUUID();
  /** Never treated by `therapist`, for the dashboard arm. */
  const pUntreated = randomUUID();

  /** Booked BY the receptionist, at the other clinic, for the withheld patient. */
  const apptWithheldPatient = randomUUID();
  /** Booked by anyone, at the receptionist's clinic, for a patient she can see. */
  const apptVisiblePatient = randomUUID();
  /** Booked BY the therapist, for another practitioner, for a patient she has not treated. */
  const apptTherapistCreated = randomUUID();

  let n = 8400;
  const patientRow = (id: string, name: string, primary: string) =>
    raw`insert into patients (id, tenant_id, full_name, patient_number, primary_location_id, created_by)
        values (${id}::uuid, ${tenant}::uuid, ${name}, ${n++}, ${primary}::uuid, ${outsider}::uuid)`;

  const apptRow = (
    id: string,
    patient: string,
    location: string,
    practitioner: string,
    createdBy: string,
    at: Date,
  ) =>
    raw`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id,
                                  starts_at, ends_at, status, created_by)
        values (${id}::uuid, ${tenant}::uuid, ${patient}::uuid, ${practitioner}::uuid, ${location}::uuid,
                ${at.toISOString()}::timestamptz,
                ${new Date(at.getTime() + 45 * 60_000).toISOString()}::timestamptz,
                'scheduled'::appointment_status, ${createdBy}::uuid)`;

  const ctx = (userId: string, role: "reception" | "therapist" | "owner") =>
    ({ tenantId: tenant, role, userId }) as Parameters<typeof getAppointment>[0];

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    ({ getAppointment, listAppointments } = await import("./data"));

    await db.execute(
      raw`insert into tenants (id, name, slug) values (${tenant}::uuid, 'appt-scope', ${"appt-scope-" + tenant.slice(0, 8)})`,
    );
    for (const [id, name] of [
      [locMine, "Clinica Minha"],
      [locTheirs, "Clinica Deles"],
    ] as const) {
      await db.execute(
        raw`insert into locations (id, tenant_id, name) values (${id}::uuid, ${tenant}::uuid, ${name})`,
      );
    }
    for (const [id, label] of [
      [reception, "rec"],
      [therapist, "thr"],
      [otherTherapist, "thr2"],
      [outsider, "out"],
    ] as const) {
      await db.execute(
        raw`insert into users (id, tenant_id, email, full_name)
            values (${id}::uuid, ${tenant}::uuid, ${label + "-" + id.slice(0, 8) + "@example.test"}, ${label})`,
      );
    }
    // THE RECEPTIONIST IS ASSIGNED TO ONE CLINIC ONLY. This is what makes
    // viewer_has_location_assignment() true, and therefore what narrows her.
    await db.execute(
      raw`insert into staff_locations (tenant_id, user_id, location_id)
          values (${tenant}::uuid, ${reception}::uuid, ${locMine}::uuid)`,
    );

    await db.execute(patientRow(pWithheld, "ZZZ outra clinica", locTheirs));
    await db.execute(patientRow(pVisible, "AAA minha clinica", locMine));
    await db.execute(patientRow(pUntreated, "MMM nunca tratada", locTheirs));

    await db.execute(
      apptRow(apptWithheldPatient, pWithheld, locTheirs, therapist, reception, NOW),
    );
    await db.execute(apptRow(apptVisiblePatient, pVisible, locMine, therapist, outsider, NOW));
    // Booked BY the therapist FOR another practitioner: appointments_rls admits
    // it on created_by, viewer_treated_patient_ids() does not contain the patient.
    await db.execute(
      apptRow(apptTherapistCreated, pUntreated, locTheirs, otherTherapist, therapist, NOW),
    );
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

  /**
   * THE FIXTURE IS ONLY MEANINGFUL IF THE PATIENT IS GENUINELY OUT OF SCOPE.
   * Asserted first, and through the same RLS the queries run under, so a change
   * that widened `patients_select` turns this suite red HERE - saying the
   * fixture stopped testing anything - instead of leaving the cases below
   * passing for the wrong reason. ACC-vacuous-guard-sweep criterion F.
   */
  it("PREMISE: the receptionist genuinely cannot see the withheld patient, and can see the other", async () => {
    const { withTenantContext } = await import("@osteojp/db");
    const { toClaims } = await import("@osteojp/auth");
    const seen = await withTenantContext(
      toClaims(ctx(reception, "reception") as never),
      async (tx) =>
        (
          await tx.execute(
            raw`select id from patients where id in (${pWithheld}::uuid, ${pVisible}::uuid)`,
          )
        ).map((r) => String(r.id)),
    );
    expect(seen).toEqual([pVisible]);
  });

  it("THE SLOT IS THERE: the appointment is returned, not dropped", async () => {
    const appt = await getAppointment(ctx(reception, "reception"), apptWithheldPatient);
    expect(appt).not.toBeNull();
    expect(appt?.id).toBe(apptWithheldPatient);
  });

  it("THE NAME IS NOT: patientName is null, which is what withheld means", async () => {
    const appt = await getAppointment(ctx(reception, "reception"), apptWithheldPatient);
    expect(appt?.patientName).toBeNull();
  });

  it("NOTHING ELSE OF THE PATIENT LEAKS: no full name anywhere in the row", async () => {
    // The row carries `patientId`, which the appointment itself already
    // disclosed and which no query will resolve for this viewer. What must not
    // appear is the NAME, in any field - a label, a note, a search string.
    const appt = await getAppointment(ctx(reception, "reception"), apptWithheldPatient);
    expect(JSON.stringify(appt)).not.toContain("ZZZ outra clinica");
  });

  it("THE SLOT IS FULLY DESCRIBED, so it reads as taken rather than as broken", async () => {
    // This is the whole point of showing it: the receptionist must be able to
    // see that the time is gone. A row with a null name and null times would be
    // no better than the row vanishing.
    const appt = await getAppointment(ctx(reception, "reception"), apptWithheldPatient);
    expect(appt?.startsAt).toBe(NOW.toISOString());
    expect(appt?.endsAt).toBe(new Date(NOW.getTime() + 45 * 60_000).toISOString());
    expect(appt?.locationId).toBe(locTheirs);
    expect(appt?.status).toBe("scheduled");
    expect(appt?.patientId).toBe(pWithheld);
  });

  it("A PATIENT SHE CAN SEE IS STILL NAMED, so the fix withheld one row and not all of them", async () => {
    const appt = await getAppointment(ctx(reception, "reception"), apptVisiblePatient);
    expect(appt?.patientName).toBe("AAA minha clinica");
  });

  it("THE OWNER SEES BOTH NAMES, so nothing was narrowed for an unrestricted viewer", async () => {
    const owner = ctx(outsider, "owner");
    expect((await getAppointment(owner, apptWithheldPatient))?.patientName).toBe(
      "ZZZ outra clinica",
    );
    expect((await getAppointment(owner, apptVisiblePatient))?.patientName).toBe(
      "AAA minha clinica",
    );
  });

  it("THE DASHBOARD ARM: a therapist's own list keeps the row she booked for a colleague", async () => {
    // `listAppointments` with no practitionerId and no locationId, which is
    // exactly how the dashboard calls it, and `viewerLocationScope` is null for
    // a therapist. Before the left join this row was missing and the KPI count
    // was low, with nothing saying so.
    const rows = await listAppointments(ctx(therapist, "therapist"), {
      startUtc: WINDOW_START,
      endUtc: WINDOW_END,
    });
    const row = rows.find((r) => r.id === apptTherapistCreated);
    expect(row).toBeDefined();
    expect(row?.patientName).toBeNull();
    expect(JSON.stringify(rows)).not.toContain("MMM nunca tratada");
  });

  it("AND THE COUNT IS RIGHT, which is the failure a missing row produced", async () => {
    // Two appointments in the window are hers by any arm: the one she is the
    // practitioner of, and the one she created. A count of one is the bug.
    const rows = await listAppointments(ctx(therapist, "therapist"), {
      startUtc: WINDOW_START,
      endUtc: WINDOW_END,
    });
    expect(rows.map((r) => r.id).sort()).toEqual(
      [apptWithheldPatient, apptVisiblePatient, apptTherapistCreated].sort(),
    );
  });
});
