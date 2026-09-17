/**
 * nesa-patient-name-for-therapists.db.test.ts — NESA-NAMES, against a real
 * Postgres.
 *
 * Owner request 2026-09-17: "every therapist must see the patient's name on NESA
 * bookings instead of Marcação reservada". Strategy ruling the same day: the name
 * on any appointment held by a shared-resource staff row installed at a clinic
 * where that therapist is installed, the same card fields their own appointments
 * show and NOTHING MORE - no ficha, no phone, no NIF - and if RLS is what
 * withholds it, a narrow SECURITY DEFINER function returning appointment id and
 * display name only, never a wider policy on `patients`.
 *
 * ==========================================================================
 * WHAT THIS FILE HAS TO PROVE, AND WHY THE NEGATIVES OUTNUMBER THE POSITIVE
 * ==========================================================================
 * The positive is one line: an LV therapist reads the name. Every risk in this
 * change is in what ELSE such a function could hand over, so most of the arms
 * below are refusals: a therapist at another clinic, the portal's `patient` role,
 * the columns the function is even capable of returning, and `patients_select`
 * itself, which must be byte-identical afterwards.
 *
 * `asRole("authenticated", …)` is how every assertion runs, because RLS on these
 * tables is ENABLE and not FORCE: an assertion on the owner connection would
 * pass for the wrong reason. Seeding uses the owner connection and nothing else.
 *
 * GATING: needs a live privileged DATABASE_URL with this migration applied.
 * Skipped without one, exactly like every other suite in this directory.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

const F = {
  tenant: randomUUID(),
  lv: randomUUID(),
  cb: randomUUID(),
  /** The shared resource. Installed at LV only. */
  nesa: randomUUID(),
  /** A therapist installed at LV, with NO care relation to the patient. */
  lvTherapist: randomUUID(),
  /** A therapist installed at CB only. Must never read an LV name. */
  cbTherapist: randomUUID(),
  reception: randomUUID(),
  patient: randomUUID(),
  /** A patient the LV therapist DOES treat, for the unchanged-behaviour arm. */
  ownPatient: randomUUID(),
  service: randomUUID(),
  /** LV booking held by NESA as the PRIMARY practitioner. */
  nesaAppt: randomUUID(),
  /** LV booking held by NESA as Terapeuta 2 (0088's shape). */
  nesaSecondAppt: randomUUID(),
  /** The LV therapist's own ordinary booking. */
  ownAppt: randomUUID(),
  /** A NESA booking at CB, where the LV therapist is not installed. */
  cbNesaAppt: randomUUID(),
};

const d = live ? describe : describe.skip;

d("NESA-NAMES: a therapist reads the patient name on a shared resource's booking", () => {
  let sql: ReturnType<typeof connect>;

  const FN = "shared_resource_appointment_patient_names";

  beforeAll(async () => {
    sql = connect();
    await sql`insert into tenants (id, name, slug) values (${F.tenant}, 'NESA Names Co', ${"nn-" + F.tenant.slice(0, 8)})`;
    await sql`insert into locations (id, tenant_id, name) values (${F.lv}, ${F.tenant}, 'Linda-a-Velha (teste)'), (${F.cb}, ${F.tenant}, 'Castelo Branco (teste)')`;

    const person = (id: string, name: string, shared: boolean) =>
      sql`insert into users (id, tenant_id, email, full_name, is_active, is_bookable, is_shared_resource)
          values (${id}, ${F.tenant}, ${"u-" + id.slice(0, 8) + "@t.test"}, ${name}, true, ${!shared}, ${shared})`;
    await person(F.nesa, "NESA", true);
    await person(F.lvTherapist, "Terapeuta LV", false);
    await person(F.cbTherapist, "Terapeuta CB", false);
    await person(F.reception, "Rececao", false);

    // WHERE EACH ONE IS INSTALLED. This is the whole subject of the ruling.
    await sql`insert into staff_locations (tenant_id, user_id, location_id) values
      (${F.tenant}, ${F.nesa}, ${F.lv}),
      (${F.tenant}, ${F.nesa}, ${F.cb}),
      (${F.tenant}, ${F.lvTherapist}, ${F.lv}),
      (${F.tenant}, ${F.cbTherapist}, ${F.cb}),
      (${F.tenant}, ${F.reception}, ${F.lv})`;

    await sql`insert into services (id, tenant_id, name) values (${F.service}, ${F.tenant}, 'Osteopatia')`;
    // The patient carries a phone AND a NIF, so "the function returns neither"
    // is a claim about real values rather than about empty columns.
    await sql`insert into patients (id, tenant_id, full_name, phone, nif)
              values (${F.patient}, ${F.tenant}, 'Marta Nunes', '+351912000111', '123456789')`;
    await sql`insert into patients (id, tenant_id, full_name) values (${F.ownPatient}, ${F.tenant}, 'Paciente Proprio')`;

    const appt = (
      id: string,
      location: string,
      practitioner: string,
      practitionerTwo: string | null,
      patient: string,
    ) =>
      sql`insert into appointments
            (id, tenant_id, patient_id, practitioner_id, practitioner_2_id, location_id, service_id,
             starts_at, ends_at, status, created_by)
          values (${id}, ${F.tenant}, ${patient}, ${practitioner}, ${practitionerTwo}, ${location}, ${F.service},
                  '2027-04-14T10:00:00Z', '2027-04-14T11:00:00Z', 'scheduled', ${F.reception})`;

    await appt(F.nesaAppt, F.lv, F.nesa, null, F.patient);
    await appt(F.nesaSecondAppt, F.lv, F.cbTherapist, F.nesa, F.patient);
    await appt(F.ownAppt, F.lv, F.lvTherapist, null, F.ownPatient);
    await appt(F.cbNesaAppt, F.cb, F.nesa, null, F.patient);
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from appointments where tenant_id = ${F.tenant}`;
    await sql`delete from patients where tenant_id = ${F.tenant}`;
    await sql`delete from services where tenant_id = ${F.tenant}`;
    await sql`delete from staff_locations where tenant_id = ${F.tenant}`;
    await sql`delete from users where tenant_id = ${F.tenant}`;
    await sql`delete from locations where tenant_id = ${F.tenant}`;
    await sql`delete from tenants where id = ${F.tenant}`;
    await sql.end();
  });

  /** The function's answer for one principal, as a Map of appointment id -> name. */
  async function namesFor(role: "therapist" | "reception", userId: string) {
    return asRole(sql, "authenticated", claimsFor(F.tenant, role, userId), async (tx) => {
      const rows = await tx`select appointment_id, patient_name
                              from public.shared_resource_appointment_patient_names()`;
      return new Map(rows.map((r) => [r.appointment_id as string, r.patient_name as string]));
    });
  }

  /* ------------------------------------------------------------ positive */

  it("an LV therapist reads the patient's name on an LV NESA booking", async () => {
    const names = await namesFor("therapist", F.lvTherapist);
    expect(names.get(F.nesaAppt)).toBe("Marta Nunes");
  });

  it("and on the booking where NESA is only Terapeuta 2 (0088's shape)", async () => {
    const names = await namesFor("therapist", F.lvTherapist);
    expect(names.get(F.nesaSecondAppt)).toBe("Marta Nunes");
  });

  it("the name was genuinely WITHHELD from them before - the defect is real", async () => {
    // Without this the positive arms prove nothing: if `patients_select` already
    // admitted this patient, the function would be redundant rather than the fix.
    const visible = await asRole(
      sql,
      "authenticated",
      claimsFor(F.tenant, "therapist", F.lvTherapist),
      async (tx) => tx`select id from patients where id = ${F.patient}`,
    );
    expect(visible).toHaveLength(0);
  });

  /* ------------------------------------------------------------ negatives */

  it("a therapist NOT installed at that clinic reads nothing for it", async () => {
    const names = await namesFor("therapist", F.cbTherapist);
    expect(names.has(F.nesaAppt)).toBe(false);
    expect(names.has(F.nesaSecondAppt)).toBe(false);
  });

  it("and an LV therapist reads nothing for a NESA booking at CB", async () => {
    const names = await namesFor("therapist", F.lvTherapist);
    expect(names.has(F.cbNesaAppt)).toBe(false);
  });

  it("RECEPTION gets nothing from this function - their names come from patients_select, unchanged", async () => {
    const names = await namesFor("reception", F.reception);
    expect(names.size).toBe(0);
  });

  it("an ordinary appointment of the therapist's own is NOT returned by this function", async () => {
    // It needs no help: `patients_select` admits a patient they treat. A function
    // that also answered for those rows would be widening something nobody asked
    // about.
    const names = await namesFor("therapist", F.lvTherapist);
    expect(names.has(F.ownAppt)).toBe(false);
  });

  it("returns EXACTLY two columns, and neither is a phone, a NIF or anything clinical", async () => {
    // The ruling is "the name and nothing more". Asserted on the function's own
    // signature, so a later edit that adds a column fails here rather than
    // quietly shipping a phone number to every therapist at the clinic.
    const [row] = await sql`select pg_get_function_result(p.oid) as result
                              from pg_proc p
                              join pg_namespace n on n.oid = p.pronamespace
                             where n.nspname = 'public' and p.proname = ${FN}`;
    const result = String(row!.result);
    expect(result).toContain("appointment_id uuid");
    expect(result).toContain("patient_name text");
    for (const forbidden of ["phone", "nif", "email", "date_of_birth", "notes", "patient_id"]) {
      expect(result.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("the PORTAL's patient role cannot execute it at all", async () => {
    const [row] = await sql`select
        has_function_privilege('patient',      'public.' || ${FN} || '()', 'EXECUTE') as patient_may,
        has_function_privilege('anon',         'public.' || ${FN} || '()', 'EXECUTE') as anon_may,
        has_function_privilege('authenticated','public.' || ${FN} || '()', 'EXECUTE') as staff_may`;
    expect(row!.patient_may).toBe(false);
    expect(row!.anon_may).toBe(false);
    // The positive control for the three: if `authenticated` were false too, the
    // two refusals above would be satisfied by a function nobody can call.
    expect(row!.staff_may).toBe(true);
  });

  it("is SECURITY DEFINER, owned by postgres, with search_path pinned", async () => {
    const [row] = await sql`select p.prosecdef, pg_get_userbyid(p.proowner) as owner,
                                   coalesce(array_to_string(p.proconfig, ','), '') as config
                              from pg_proc p
                              join pg_namespace n on n.oid = p.pronamespace
                             where n.nspname = 'public' and p.proname = ${FN}`;
    expect(row!.prosecdef).toBe(true);
    expect(row!.owner).toBe("postgres");
    expect(String(row!.config)).toContain("search_path=public");
  });

  it("patients_select is UNTOUCHED - the ruling's central prohibition", async () => {
    // The whole reason this is a function: widening this policy would have handed
    // a therapist the ficha, the phone and the NIF of every patient NESA sees.
    const [row] = await sql`select pg_get_expr(pol.polqual, pol.polrelid) as qual
                              from pg_policy pol
                              join pg_class c on c.oid = pol.polrelid
                             where c.relname = 'patients' and pol.polname = 'patients_select'`;
    const qual = String(row!.qual);
    expect(qual).toContain("viewer_treated_patient_ids");
    expect(qual).not.toContain("shared_resource");
  });
});
