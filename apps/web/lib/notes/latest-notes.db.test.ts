/**
 * latest-notes.db.test.ts — THE NEGATIVE ARM FOR THE NOTE PREVIEWS.
 *
 * ==========================================================================
 * THE PROPERTY, IN THE DISPATCH'S OWN WORDS
 * ==========================================================================
 * "A principal who cannot read notes receives NO note text in the response
 * payload, not a hidden element." A preview that leaks a clinical note to
 * somebody who cannot open the full view is worse than no preview.
 *
 * ==========================================================================
 * WHY THIS SUITE HAS TO EXIST AGAINST REAL POSTGRES
 * ==========================================================================
 * The gate is not a line of TypeScript. It is the SHAPE of the statement: both
 * reads select FROM `patients`, so `patients_select` decides whether the row
 * exists at all. Nothing in a unit test with a stubbed transaction can tell a
 * query that joins the patient from one that does not - they type identically
 * and they read identically. Only a database with RLS on can.
 *
 * ==========================================================================
 * THE CONTROL THAT MAKES IT LOAD-BEARING RATHER THAN INCIDENTAL
 * ==========================================================================
 * "The preview is empty for this principal" is also what a fixture with no
 * notes produces. So this suite runs `readPatientNotesUngated` AS THE SAME
 * PRINCIPAL, in the same transaction, and asserts it SUCCEEDS: the note IS
 * there, `appointment_notes` RLS is tenant-only (0026) and would have handed it
 * over, and the join is what refuses. Without that arm every assertion below
 * would pass against a fixture that simply forgot to write a note.
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

const NOW = new Date("2026-10-21T09:00:00.000Z");

/** The bodies. Distinct sentences so a leak is greppable in a whole payload. */
const NOTE_VISIBLE_PATIENT = "VISIVEL-PACIENTE ligou a remarcar na proxima semana";
const NOTE_WITHHELD_PATIENT = "OCULTA-PACIENTE toma anticoagulante desde marco";
const NOTE_VISIBLE_APPT = "VISIVEL-MARCACAO trazer exames da ressonancia";
const NOTE_WITHHELD_APPT = "OCULTA-MARCACAO dor lombar irradiada a perna direita";

d("a note preview is never handed to a principal who cannot open the full view", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let readLatestPatientNotes: typeof import("./latest-notes").readLatestPatientNotes;
  let readLatestAppointmentNotes: typeof import("./latest-notes").readLatestAppointmentNotes;
  let readPatientNotesUngated: typeof import("./latest-notes").readPatientNotesUngated;
  let getAppointment: typeof import("../scheduling/data").getAppointment;

  const tenant = randomUUID();
  const locMine = randomUUID();
  const locTheirs = randomUUID();

  const reception = randomUUID();
  const therapist = randomUUID();
  const otherTherapist = randomUUID();
  const outsider = randomUUID(); // registers every patient, so created_by never widens

  const pWithheld = randomUUID();
  const pVisible = randomUUID();

  const apptWithheld = randomUUID();
  const apptVisible = randomUUID();

  let n = 9100;
  const patientRow = (id: string, name: string, primary: string) =>
    raw`insert into patients (id, tenant_id, full_name, patient_number, primary_location_id, created_by)
        values (${id}::uuid, ${tenant}::uuid, ${name}, ${n++}, ${primary}::uuid, ${outsider}::uuid)`;

  const apptRow = (
    id: string,
    patient: string,
    location: string,
    practitioner: string,
    createdBy: string,
  ) =>
    raw`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id,
                                  starts_at, ends_at, status, created_by)
        values (${id}::uuid, ${tenant}::uuid, ${patient}::uuid, ${practitioner}::uuid, ${location}::uuid,
                ${NOW.toISOString()}::timestamptz,
                ${new Date(NOW.getTime() + 45 * 60_000).toISOString()}::timestamptz,
                'scheduled'::appointment_status, ${createdBy}::uuid)`;

  /** A note. `appointment_id` NULL = a note about the PERSON; set = about the VISIT. */
  const noteRow = (patient: string, appointment: string | null, body: string) =>
    appointment === null
      ? raw`insert into appointment_notes (tenant_id, patient_id, appointment_id, author_user_id, body)
            values (${tenant}::uuid, ${patient}::uuid, null, ${outsider}::uuid, ${body})`
      : raw`insert into appointment_notes (tenant_id, patient_id, appointment_id, author_user_id, body)
            values (${tenant}::uuid, ${patient}::uuid, ${appointment}::uuid, ${outsider}::uuid, ${body})`;

  const ctx = (userId: string, role: "reception" | "therapist" | "owner") => ({
    tenantId: tenant,
    role,
    userId,
  });

  /** Run `fn` inside ONE RLS-scoped transaction as `principal`. */
  async function asPrincipal<T>(
    principal: ReturnType<typeof ctx>,
    fn: (tx: Parameters<typeof readLatestPatientNotes>[0]) => Promise<T>,
  ): Promise<T> {
    const { withTenantContext } = await import("@osteojp/db");
    const { toClaims } = await import("@osteojp/auth");
    return withTenantContext(toClaims(principal as never), (tx) =>
      fn(tx as Parameters<typeof readLatestPatientNotes>[0]),
    ) as Promise<T>;
  }

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    ({ readLatestPatientNotes, readLatestAppointmentNotes, readPatientNotesUngated } =
      await import("./latest-notes"));
    ({ getAppointment } = await import("../scheduling/data"));

    await db.execute(
      raw`insert into tenants (id, name, slug)
          values (${tenant}::uuid, 'note-preview', ${"note-preview-" + tenant.slice(0, 8)})`,
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
    // ONE clinic only: this is what makes viewer_has_location_assignment() true
    // and therefore what narrows her at all. An unassigned receptionist falls
    // back to all-locations (PL-09) and this fixture would test nothing.
    await db.execute(
      raw`insert into staff_locations (tenant_id, user_id, location_id)
          values (${tenant}::uuid, ${reception}::uuid, ${locMine}::uuid)`,
    );

    await db.execute(patientRow(pWithheld, "ZZZ outra clinica", locTheirs));
    await db.execute(patientRow(pVisible, "AAA minha clinica", locMine));

    /**
     * THE ARM THAT MAKES THE TWO POLICIES DISAGREE, and the fixture is worthless
     * without it. `appointments_rls` and `patients_select` both open with
     * `created_by = auth.uid()`, over DIFFERENT ROWS: the APPOINTMENT's creator
     * and the PATIENT's. So an appointment the receptionist BOOKED, at a clinic
     * she is not assigned to, for a patient somebody else registered, is
     * ADMITTED as an appointment and REFUSED as a patient - which is exactly the
     * shape SEC-appointment-vanishes-with-patient-scope was carded for.
     *
     * WRITTEN WITH `outsider` AS THE CREATOR FIRST, and the suite caught it: the
     * appointment was then invisible too, so "no note" proved only that the row
     * was gone. `otherTherapist` is the practitioner so `therapist` never
     * treats pWithheld.
     */
    await db.execute(apptRow(apptWithheld, pWithheld, locTheirs, otherTherapist, reception));
    await db.execute(apptRow(apptVisible, pVisible, locMine, therapist, outsider));

    await db.execute(noteRow(pVisible, null, NOTE_VISIBLE_PATIENT));
    await db.execute(noteRow(pWithheld, null, NOTE_WITHHELD_PATIENT));
    await db.execute(noteRow(pVisible, apptVisible, NOTE_VISIBLE_APPT));
    await db.execute(noteRow(pWithheld, apptWithheld, NOTE_WITHHELD_APPT));
  });

  afterAll(async () => {
    if (!live) return;
    await db.execute(raw`delete from appointment_notes where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from patient_note_revisions where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from appointments where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from staff_locations where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from patients where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from users where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from locations where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from tenants where id = ${tenant}::uuid`);
  });

  /* ------------------------------------------------------------------ */
  /* PREMISES. Both, before any conclusion is drawn from an empty result. */
  /* ------------------------------------------------------------------ */

  it("PREMISE 1: the receptionist genuinely cannot see the withheld patient", async () => {
    const seen = await asPrincipal(ctx(reception, "reception"), async (tx) =>
      (
        await tx.execute(
          raw`select id from patients where id in (${pWithheld}::uuid, ${pVisible}::uuid)`,
        )
      ).map((r) => String(r.id)),
    );
    expect(seen).toEqual([pVisible]);
  });

  it("PREMISE 2 — THE CONTROL: the note IS there, and the note table would hand it over", async () => {
    /**
     * THE ASSERTION THAT MAKES EVERY "EMPTY" BELOW MEAN SOMETHING.
     *
     * `appointment_notes` RLS is TENANT-ONLY (0026): one SELECT policy,
     * `tenant_id = jwt_tenant_id()`, no location arm and no therapist arm. So
     * this receptionist - the very principal the previews refuse - can read the
     * withheld patient's clinical note by asking the table directly.
     *
     * That is not a defect to fix here. It is the fact that makes the join in
     * `latest-notes.ts` load-bearing: if the note read did NOT go through
     * `patients`, this is what the row would have shown.
     */
    const rows = await asPrincipal(ctx(reception, "reception"), (tx) =>
      readPatientNotesUngated(tx, pWithheld),
    );
    expect(rows.map((r) => r.body)).toEqual([NOTE_WITHHELD_PATIENT]);
  });

  /* ------------------------------------------------------------------ */
  /* JOB 1's SURFACE: the patient note behind a Recuperacao row.          */
  /* ------------------------------------------------------------------ */

  it("the PATIENT note is withheld from a principal who cannot see the patient", async () => {
    const map = await asPrincipal(ctx(reception, "reception"), (tx) =>
      readLatestPatientNotes(tx, [pWithheld, pVisible]),
    );
    expect(map.has(pWithheld)).toBe(false);
    // NO TEXT IN THE PAYLOAD, not a hidden element: the whole serialised answer
    // is searched, so a field added later that happens to carry the body fails
    // here rather than reaching a screen.
    expect(JSON.stringify([...map])).not.toContain("OCULTA-PACIENTE");
  });

  it("and it IS given to a principal who can - so the refusal is narrow, not blanket", async () => {
    const map = await asPrincipal(ctx(reception, "reception"), (tx) =>
      readLatestPatientNotes(tx, [pWithheld, pVisible]),
    );
    expect(map.get(pVisible)?.excerpt.text).toBe(NOTE_VISIBLE_PATIENT);
    expect(map.get(pVisible)?.total).toBe(1);
  });

  it("A THERAPIST WHO NEVER TREATED THE PATIENT gets no patient note either", async () => {
    // The therapist arm of `patients_select` is `viewer_treated_patient_ids()`
    // (0074). `therapist` treated pVisible and never pWithheld, so the same
    // read answers differently for the two - a different policy branch from the
    // receptionist's, exercised on the same statement.
    const map = await asPrincipal(ctx(therapist, "therapist"), (tx) =>
      readLatestPatientNotes(tx, [pWithheld, pVisible]),
    );
    expect(map.has(pWithheld)).toBe(false);
    expect(map.get(pVisible)?.excerpt.text).toBe(NOTE_VISIBLE_PATIENT);
  });

  /* ------------------------------------------------------------------ */
  /* JOB 2's SURFACE: both notes beside a Marcacoes row.                  */
  /* ------------------------------------------------------------------ */

  it("the APPOINTMENT note is withheld when the patient is withheld", async () => {
    const map = await asPrincipal(ctx(reception, "reception"), (tx) =>
      readLatestAppointmentNotes(tx, [
        { id: apptWithheld, patientId: pWithheld },
        { id: apptVisible, patientId: pVisible },
      ]),
    );
    expect(map.has(apptWithheld)).toBe(false);
    expect(JSON.stringify([...map])).not.toContain("OCULTA-MARCACAO");
    expect(map.get(apptVisible)?.excerpt.text).toBe(NOTE_VISIBLE_APPT);
  });

  /**
   * ==========================================================================
   * WHAT THE CONTROLS ACTUALLY SAY ABOUT THE APPOINTMENT-NOTE GATE
   * ==========================================================================
   * Recorded here rather than in a report, because the next person to run them
   * will otherwise draw the wrong conclusion from a green one.
   *
   *   DELETE THE `patients` PARTICIPATION ENTIRELY (join AND the id pin)
   *     -> the case below REDDENS. The gate is load-bearing.
   *   TURN THE INNER JOIN INTO A LEFT JOIN, KEEPING THE PIN
   *     -> everything stays GREEN, and that is CORRECT rather than a hole in
   *        the suite. `patients.id IN (…)` is NULL for a withheld patient and
   *        `NULL IN (…)` is not true, so the row is filtered either way. There
   *        are two independent gates over the same set.
   *
   * The pin is there for the PLAN (63.5 ms -> 7.3 ms; see `latest-notes.ts`),
   * and it turns out to close the same door a second time. Neither is a reason
   * to remove the other: the join is what a reader recognises as the rule, and
   * the pin is what makes it affordable.
   */
  it("THE INNER JOIN IS THE GATE: the appointment itself is perfectly visible", async () => {
    /**
     * THE DISTINCTION THIS SUITE EXISTS TO HOLD. `appointments_rls` admits this
     * row - the slot must show as taken (SEC-appointment-vanishes-with-patient-
     * scope, owner ruling CONFIRM-09). So the appointment note is not withheld
     * because the APPOINTMENT is out of scope; it is withheld because the
     * PATIENT is. Turning the join in `readLatestAppointmentNotes` into a LEFT
     * join reddens the case above and leaves this one green, which is exactly
     * the pair that says which of the two rules moved.
     */
    const visible = await asPrincipal(ctx(reception, "reception"), async (tx) =>
      (
        await tx.execute(raw`select id from appointments where id = ${apptWithheld}::uuid`)
      ).map((r) => String(r.id)),
    );
    expect(visible).toEqual([apptWithheld]);
  });

  /* ------------------------------------------------------------------ */
  /* THE PRE-EXISTING PREVIEW: the agenda hover's own note column.        */
  /* ------------------------------------------------------------------ */

  it("the hover's `notes` column is withheld with the name", async () => {
    /**
     * NOT A NEW SURFACE - AN OLD ONE THAT LEAKED. `appointmentSelection.notes`
     * has projected the latest note of a visit since W12-13, correlated on
     * `appointment_id` alone, and `appointment_notes` RLS is tenant-only. So the
     * row rendered "Marcação reservada" where the name should be AND the
     * clinical note underneath it, on the hover and prefilled into the drawer's
     * notes field. Found while building the row preview beside it; fixed in the
     * same expression, gated on `patients.id is not null`.
     */
    const appt = await getAppointment(
      ctx(reception, "reception") as Parameters<typeof getAppointment>[0],
      apptWithheld,
    );
    expect(appt).not.toBeNull();
    expect(appt?.patientName).toBeNull();
    expect(appt?.notes).toBeNull();
    expect(JSON.stringify(appt)).not.toContain("OCULTA-MARCACAO");
  });

  it("and it is STILL THERE for a visit whose patient she can see", async () => {
    const appt = await getAppointment(
      ctx(reception, "reception") as Parameters<typeof getAppointment>[0],
      apptVisible,
    );
    expect(appt?.patientName).toBe("AAA minha clinica");
    expect(appt?.notes).toBe(NOTE_VISIBLE_APPT);
  });

  it("THE SCHEDULING SIGNAL SURVIVES: hasNote and noteCount are NOT withheld", async () => {
    // They carry no note text. `hasNote` drives the "Sem nota" chip that tells
    // reception a completed visit was never documented; withholding it would
    // remove a scheduling signal to protect nothing.
    const appt = await getAppointment(
      ctx(reception, "reception") as Parameters<typeof getAppointment>[0],
      apptWithheld,
    );
    expect(appt?.hasNote).toBe(true);
    expect(appt?.noteCount).toBe(1);
  });

  /* ------------------------------------------------------------------ */
  /* The unified + legacy merge, and the backfill duplicate.              */
  /* ------------------------------------------------------------------ */

  it("reads the LEGACY relation too, and the newest of the two legs wins", async () => {
    const at = new Date(NOW.getTime() + 60 * 60_000);
    await db.execute(
      raw`insert into patient_note_revisions (tenant_id, patient_id, content, author_user_id, created_at)
          values (${tenant}::uuid, ${pVisible}::uuid, ${"LEGADO mais recente"}, ${outsider}::uuid,
                  ${at.toISOString()}::timestamptz)`,
    );
    const map = await asPrincipal(ctx(reception, "reception"), (tx) =>
      readLatestPatientNotes(tx, [pVisible]),
    );
    // `patient_note_revisions` is the pre-W12-13 store and `listPatientNotes`
    // still merges it, so a row whose only notes are legacy must not read as
    // "no notes". Newest across BOTH legs, which is this one.
    expect(map.get(pVisible)?.excerpt.text).toBe("LEGADO mais recente");
    expect(map.get(pVisible)?.total).toBe(2);
  });

  it("a BACKFILL DUPLICATE does not double the count", async () => {
    /**
     * The owner-gated backfill copies legacy rows into the unified store, so for
     * a window the same note exists twice with the same body and the same
     * instant. `notes-merge.ts` de-duplicates on exactly that natural key for
     * the full view; the count here does the same with
     * `count(distinct (content, at))`. A bare `count(*)` would tell reception
     * there are two notes when there is one.
     */
    const at = new Date(NOW.getTime() + 60 * 60_000);
    await db.execute(
      raw`insert into appointment_notes (tenant_id, patient_id, appointment_id, author_user_id, body, created_at)
          values (${tenant}::uuid, ${pVisible}::uuid, null, ${outsider}::uuid, ${"LEGADO mais recente"},
                  ${at.toISOString()}::timestamptz)`,
    );
    const map = await asPrincipal(ctx(reception, "reception"), (tx) =>
      readLatestPatientNotes(tx, [pVisible]),
    );
    expect(map.get(pVisible)?.excerpt.text).toBe("LEGADO mais recente");
    // Still 2: the duplicate is the same (content, created_at) pair.
    expect(map.get(pVisible)?.total).toBe(2);
  });

  it("A VISIT NOTE IS NOT A PATIENT NOTE: the patient read ignores appointment-linked rows", async () => {
    // The two labels on the Marcacoes row mean different things, and this is
    // where that difference is enforced. NOTE_VISIBLE_APPT is attached to
    // apptVisible for pVisible; it must never surface as that patient's note.
    const map = await asPrincipal(ctx(reception, "reception"), (tx) =>
      readLatestPatientNotes(tx, [pVisible]),
    );
    expect(JSON.stringify([...map])).not.toContain("VISIVEL-MARCACAO");
  });
});
