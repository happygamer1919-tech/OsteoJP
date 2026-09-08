/**
 * create-location-link.db.test.ts — PL-34. EVERY PATH THAT CREATES A PATIENT
 * FILES THEM AT A CLINIC, AND THE JUNCTION ROW EXISTS AFTERWARDS.
 *
 * ==========================================================================
 * THE DEFECT, AND THE PART OF IT THE DISPATCH HAD BACKWARDS
 * ==========================================================================
 * The 2026-09-07 Castelo Branco reconciliation counted 26 live patients with no
 * `patient_locations` row: twenty numbered 8401-8420 and six numbered
 * 16426-16431, the second block created after the CB import. It was reported as
 * a visibility defect on the grounds that "PL-09 scopes patient visibility by
 * that table".
 *
 * IT DOES NOT, AND THIS FILE ASSERTS THAT DIRECTLY RATHER THAN LEAVING IT IN A
 * COMMENT. `patientLocationScope` (lib/patients/scope.ts) and 0047's
 * `patients_select` both scope a patient to a clinic by `appointments.location_id`
 * OR `patients.primary_location_id`. Nothing in this repo READS
 * `patient_locations` — the app only ever DELETEs from it (hard delete, location
 * delete) and `merge_patients` re-points it. So a missing link row hides nobody.
 *
 * THE DEFECT IS REAL AND THERE ARE TWO OF THEM, WHICH IS WHY THIS FILE HAS TWO
 * HALVES:
 *
 *   1. THE ONE THAT HIDES PEOPLE. `createStubPatientAction` — the walk-in box on
 *      /consultation — passed name and phone and nothing else, so the patient
 *      landed with `primary_location_id` NULL. With no appointment either, that
 *      patient satisfies NEITHER arm of the scope and is invisible to every
 *      located reception and admin. The therapist who created them still sees
 *      them through `therapistPatientScope`'s `created_by` arm, which is exactly
 *      why the desk that produced the row is the one place it looks fine.
 *
 *   2. THE ONE THAT HIDES NOBODY YET. No application path wrote
 *      `patient_locations` at all; the Fisiozero importer was its only writer.
 *      A junction table that disagrees with the column beside it is a defect
 *      waiting for its first reader, and `merge_patients` and `deletePatientHard`
 *      both already maintain it.
 *
 * ==========================================================================
 * WHY A REAL DATABASE
 * ==========================================================================
 * The claim is "a row exists in another table afterwards". A mocked query
 * builder cannot make that claim: it would assert that `.insert()` was CALLED,
 * which is the same sentence as the code under test and passes if RLS refuses
 * the write, if the FK is wrong, or if the unique index rejects it. Every
 * assertion below reads `patient_locations` back with an admin connection.
 *
 * WHAT IS STUBBED, AND NEITHER IS UNDER TEST: `requireRequestContext`, because a
 * vitest worker has no Supabase session, and `next/cache`, which needs a request
 * scope. `runScoped`, `assertCan`, RLS, the 0029 patient-number trigger and
 * every insert are real.
 *
 * THE FIXTURE IS BUILT, NEVER BORROWED. CI's DB-gated database has no catalogue
 * and no seeded locations; a suite that reached for one would pass locally and
 * be skipped-shaped in CI.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  updateTag: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

type Role = "reception" | "therapist" | "admin";
const acting = vi.hoisted(() => ({
  ctx: null as { tenantId: string; role: string; userId: string } | null,
}));
vi.mock("@/lib/auth/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/context")>();
  return {
    ...actual,
    requireRequestContext: async () => {
      if (!acting.ctx) throw new Error("no acting principal - use as()");
      return acting.ctx;
    },
  };
});

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("PL-34: a patient is created AT a clinic, on every path", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let createPatient: typeof import("./actions").createPatient;
  let createStubPatientAction: typeof import("../../app/consultation/actions").createStubPatientAction;
  let convertGuestRequest: typeof import("../scheduling/guest-convert").convertGuestRequest;

  const tenant = randomUUID();
  const clinicA = randomUUID();
  const clinicB = randomUUID();
  const reception = randomUUID();
  /** Assigned to clinicA ONLY — the PL-14 "fixed" case, and the common one. */
  const soloTherapist = randomUUID();
  /** Assigned to BOTH — the PL-14 "picker" case. */
  const dualTherapist = randomUUID();

  async function as<T>(role: Role, userId: string, fn: () => Promise<T>): Promise<T> {
    acting.ctx = { tenantId: tenant, role, userId };
    try {
      return await fn();
    } finally {
      acting.ctx = null;
    }
  }

  /** The whole assertion of this file, asked of the database. */
  const linksOf = async (patientId: string): Promise<string[]> => {
    const rows = (await db.execute(
      raw`select location_id from patient_locations where patient_id = ${patientId}::uuid
           and tenant_id = ${tenant}::uuid order by location_id`,
    )) as unknown as { location_id: string }[];
    return rows.map((r) => r.location_id);
  };

  const primaryOf = async (patientId: string): Promise<string | null> => {
    const rows = (await db.execute(
      raw`select primary_location_id from patients where id = ${patientId}::uuid`,
    )) as unknown as { primary_location_id: string | null }[];
    return rows[0]!.primary_location_id;
  };

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    ({ createPatient } = await import("./actions"));
    ({ createStubPatientAction } = await import("../../app/consultation/actions"));
    ({ convertGuestRequest } = await import("../scheduling/guest-convert"));

    await db.execute(
      raw`insert into tenants (id, name, slug)
          values (${tenant}::uuid, 'pl34', ${"pl34-" + tenant.slice(0, 8)})`,
    );
    for (const [id, name] of [
      [clinicA, "Clinica A PL34"],
      [clinicB, "Clinica B PL34"],
    ] as const) {
      await db.execute(
        raw`insert into locations (id, tenant_id, name) values (${id}::uuid, ${tenant}::uuid, ${name})`,
      );
    }
    const [role] = (await db.execute(raw`select id from roles limit 1`)) as unknown as {
      id: string;
    }[];
    for (const [id, label] of [
      [reception, "rec"],
      [soloTherapist, "solo"],
      [dualTherapist, "dual"],
    ] as const) {
      await db.execute(
        raw`insert into users (id, tenant_id, role_id, email, full_name)
            values (${id}::uuid, ${tenant}::uuid, ${role!.id}::uuid,
                    ${`${label}-${id.slice(0, 8)}@pl34.test`}, ${label})`,
      );
    }
    // THE ASSIGNMENTS ARE THE FIXTURE. `soloTherapist` is the PL-14 fixed case
    // and `dualTherapist` the picker case; the difference between them is
    // exactly these rows and nothing else.
    await db.execute(
      raw`insert into staff_locations (tenant_id, user_id, location_id)
          values (${tenant}::uuid, ${soloTherapist}::uuid, ${clinicA}::uuid)`,
    );
    for (const loc of [clinicA, clinicB]) {
      await db.execute(
        raw`insert into staff_locations (tenant_id, user_id, location_id)
            values (${tenant}::uuid, ${dualTherapist}::uuid, ${loc}::uuid)`,
      );
    }
  });

  afterAll(async () => {
    if (!live) return;
    await db.execute(raw`delete from guest_booking_requests where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from audit_log where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from patient_locations where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from patients where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from services where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from staff_locations where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from users where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from locations where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from tenants where id = ${tenant}::uuid`);
  });

  /* ================================================================== */
  /* THE ORACLE FIRST. Without this, every assertion below could be      */
  /* satisfied by a trigger nobody wrote and the suite would be proving  */
  /* the database rather than the code path.                             */
  /* ================================================================== */
  it("a patient inserted DIRECTLY gets no link — the link comes from the code, not from a trigger", async () => {
    const id = randomUUID();
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name, primary_location_id, created_by)
          values (${id}::uuid, ${tenant}::uuid, 'Directo PL34', ${clinicA}::uuid, ${reception}::uuid)`,
    );
    expect(await primaryOf(id)).toBe(clinicA);
    expect(
      await linksOf(id),
      "no trigger writes this row; if one did, every other assertion here would be vacuous",
    ).toEqual([]);
  });

  /* ================================================================== */
  /* PATH 1 — THE STAFF FORM.                                            */
  /* ================================================================== */
  it("createPatient files the patient at the clinic the form chose, and links it", async () => {
    const r = await as("reception", reception, () =>
      createPatient({
        fullName: "Forma Recepcao PL34",
        nif: null,
        nifExempt: true,
        nifExemptReason: "Nao aplicavel",
        primaryLocationId: clinicA,
      } as Parameters<typeof createPatient>[0]),
    );
    expect(r.ok, `createPatient refused: ${JSON.stringify("error" in r ? r.error : null)}`).toBe(
      true,
    );
    if (!r.ok) return;

    expect(await primaryOf(r.patient.id)).toBe(clinicA);
    expect(await linksOf(r.patient.id)).toEqual([clinicA]);
  });

  /* ================================================================== */
  /* PATH 2 — THE WALK-IN STUB. THE ONE THAT WAS HIDING PEOPLE.          */
  /* ================================================================== */
  it("the walk-in stub is filed at the therapist's own clinic, with NOTHING sent from the browser", async () => {
    // The regression in one assertion: before PL-34 both of these were null/[]
    // for a therapist who typed a name into the /consultation box.
    const r = await as("therapist", soloTherapist, () =>
      createStubPatientAction({ fullName: "Walk-in Solo PL34" }),
    );
    expect(r.ok, `stub refused: ${JSON.stringify(r)}`).toBe(true);
    if (!r.ok) return;

    expect(
      await primaryOf(r.patientId),
      "a stub with no location satisfies NEITHER arm of patientLocationScope",
    ).toBe(clinicA);
    expect(await linksOf(r.patientId)).toEqual([clinicA]);
  });

  it("a multi-clinic therapist's ANSWER is honoured", async () => {
    const r = await as("therapist", dualTherapist, () =>
      createStubPatientAction({ fullName: "Walk-in Dual PL34", locationId: clinicB }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await primaryOf(r.patientId)).toBe(clinicB);
    expect(await linksOf(r.patientId)).toEqual([clinicB]);
  });

  it("a single-clinic therapist's OWN clinic wins over anything the browser sends", async () => {
    // `scopedLocationId`'s first rule, and the reason the resolution is on the
    // server: this module is "use server", so `locationId` is a value a browser
    // chooses, on a path that decides who can see the resulting patient.
    const r = await as("therapist", soloTherapist, () =>
      createStubPatientAction({ fullName: "Walk-in Forged PL34", locationId: clinicB }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await primaryOf(r.patientId)).toBe(clinicA);
    expect(await linksOf(r.patientId)).toEqual([clinicA]);
  });

  it("a clinic OUTSIDE a multi-clinic therapist's assignment is dropped, not honoured", async () => {
    const outsider = randomUUID();
    await db.execute(
      raw`insert into locations (id, tenant_id, name)
          values (${outsider}::uuid, ${tenant}::uuid, 'Clinica Alheia PL34')`,
    );
    const r = await as("therapist", dualTherapist, () =>
      createStubPatientAction({ fullName: "Walk-in Outside PL34", locationId: outsider }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Dropped to null rather than accepted: `scopedLocationId` has no third
    // answer. The patient is then unplaced, which is the OLD behaviour and is
    // still better than filing them at a clinic this therapist does not work at.
    expect(await primaryOf(r.patientId)).toBeNull();
    expect(await linksOf(r.patientId)).toEqual([]);
  });

  /* ================================================================== */
  /* PATH 3 — THE GUEST CONVERT.                                         */
  /* ================================================================== */
  it("converting a guest request files the new patient at the clinic the guest chose", async () => {
    const service = randomUUID();
    const requestId = randomUUID();
    await db.execute(
      raw`insert into services (id, tenant_id, name, duration_min, price_cents)
          values (${service}::uuid, ${tenant}::uuid, 'Consulta PL34', 45, 5000)`,
    );
    await db.execute(
      raw`insert into guest_booking_requests
            (id, tenant_id, full_name, phone, service_id, location_id,
             requested_starts_at, requested_ends_at)
          values (${requestId}::uuid, ${tenant}::uuid, 'Convidada PL34', '912345678',
                  ${service}::uuid, ${clinicB}::uuid,
                  '2026-10-05T08:00:00Z'::timestamptz, '2026-10-05T12:00:00Z'::timestamptz)`,
    );

    const r = await as("reception", reception, () =>
      convertGuestRequest(requestId, { kind: "new_patient" }),
    );
    expect(r.ok, `convert refused: ${JSON.stringify(r)}`).toBe(true);
    if (!r.ok) return;

    const rows = (await db.execute(
      raw`select converted_patient_id from guest_booking_requests where id = ${requestId}::uuid`,
    )) as unknown as { converted_patient_id: string | null }[];
    const patientId = rows[0]!.converted_patient_id!;
    expect(patientId).toBeTruthy();

    expect(await primaryOf(patientId)).toBe(clinicB);
    expect(await linksOf(patientId)).toEqual([clinicB]);
  });

  /* ================================================================== */
  /* AND THE CLAIM THE DISPATCH GOT BACKWARDS, ASSERTED.                 */
  /* ================================================================== */
  it("deleting the link does NOT hide the patient — PL-09 reads the column, not the table", async () => {
    // This is the correction, run rather than argued. If `patient_locations`
    // were the visibility basis, removing the row would remove the patient from
    // a located admin's list. It does not, and the day somebody makes it the
    // basis, this assertion is the one that has to be deliberately changed.
    const { searchPatients } = await import("./queries");
    const r = await as("reception", reception, () =>
      createPatient({
        fullName: "Zebra Ligacao PL34",
        nif: null,
        nifExempt: true,
        nifExemptReason: "Nao aplicavel",
        primaryLocationId: clinicA,
      } as Parameters<typeof createPatient>[0]),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    await db.execute(
      raw`delete from patient_locations where patient_id = ${r.patient.id}::uuid`,
    );
    expect(await linksOf(r.patient.id)).toEqual([]);

    const visible = await as("admin", soloTherapist, () => searchPatients("Zebra Ligacao"));
    expect(
      visible.map((p) => p.id),
      "an admin assigned to clinicA still reaches the patient by primary_location_id",
    ).toContain(r.patient.id);
  });
});
