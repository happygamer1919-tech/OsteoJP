/**
 * patients-location-rls.test.ts — PL-09 (migration 0047) patients RLS matrix:
 * owner all-in-tenant, admin + reception their-location, therapist own-patients.
 *
 * This is the RLS defense-in-depth counterpart to the app-layer scope
 * (patients/queries.ts therapistPatientScope + patientLocationScope). It proves
 * the policy mirrors the app EXACTLY — never stricter — INCLUDING the two ways
 * the patients scope is WIDER than the 0045 clinical admin scope:
 *   1. The primary_location_id fallback is UNCONDITIONAL (a patient with a LocA
 *      appointment AND primary_location_id=LocB is visible to BOTH LocA and LocB
 *      staff), not gated on "no appointments".
 *   2. Visibility follows patient_2_id (the secondary participant), not only
 *      patient_id.
 * Plus the two behaviours unique to demographics vs clinical:
 *   - reception is ALLOWED (location-scoped), not denied.
 *   - an UNASSIGNED admin/reception (no staff_locations) sees ALL in-tenant
 *     (no-lockout, mirrors viewerLocationScope's empty -> null fallback).
 *
 * CORRECTNESS (harness invariant): RLS is ENABLE-not-FORCE, so every assertion
 * runs on the role-switched `authenticated` connection inside a rolled-back
 * transaction — NEVER the owner (which bypasses RLS and would pass for the wrong
 * reason). auth.uid() is pinned per-assertion via the JWT `sub` (claimsFor's 3rd
 * arg). GATING: requires a live privileged DATABASE_URL with 0047 applied;
 * skipped when DATABASE_URL is absent so `vitest run` stays green in CI.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

const A = {
  tenant: randomUUID(),
  ownerU: randomUUID(),
  adminA: randomUUID(),
  adminB: randomUUID(),
  receptionA: randomUUID(),
  therapistT: randomUUID(),
  otherT: randomUUID(),
  unassignedAdmin: randomUUID(), // admin with NO staff_locations (no-lockout case)
  locA: randomUUID(),
  locB: randomUUID(),
  locC: randomUUID(),
  pA: randomUUID(), // appointment @ LocA, practitioner therapistT
  pB: randomUUID(), // appointment @ LocB, practitioner otherT
  pBoth: randomUUID(), // appointments @ LocA + LocB
  pFallbackB: randomUUID(), // 0 appointments, primary_location_id = LocB
  pUnassigned: randomUUID(), // 0 appointments, primary_location_id = NULL
  pApptAfbB: randomUUID(), // appointment @ LocA AND primary_location_id = LocB
  pSecondaryA: randomUUID(), // ONLY a secondary participant (patient_2_id) @ LocA
  pCreatedByT: randomUUID(), // 0 appointments, created_by = therapistT
};

// Cross-tenant neighbour.
const Z = {
  tenant: randomUUID(),
  admin: randomUUID(),
  loc: randomUUID(),
  patient: randomUUID(),
};

const T0 = "2026-04-06T09:00:00Z";
const T1 = "2026-04-06T10:00:00Z";
const T2 = "2026-04-07T09:00:00Z";
const T3 = "2026-04-07T10:00:00Z";

async function seed(p: Sql): Promise<void> {
  // Tenant A ---------------------------------------------------------------
  await p`insert into tenants (id, name, slug) values (${A.tenant}, 'PL09 A', ${`pl09-a-${A.tenant}`})`;
  await p`insert into users (id, tenant_id, email, full_name) values
    (${A.ownerU},          ${A.tenant}, ${`owner-${A.ownerU}@x.pt`},   'Owner'),
    (${A.adminA},          ${A.tenant}, ${`admA-${A.adminA}@x.pt`},    'Admin A'),
    (${A.adminB},          ${A.tenant}, ${`admB-${A.adminB}@x.pt`},    'Admin B'),
    (${A.receptionA},      ${A.tenant}, ${`recA-${A.receptionA}@x.pt`},'Reception A'),
    (${A.therapistT},      ${A.tenant}, ${`ther-${A.therapistT}@x.pt`},'Therapist T'),
    (${A.otherT},          ${A.tenant}, ${`oth-${A.otherT}@x.pt`},     'Other T'),
    (${A.unassignedAdmin}, ${A.tenant}, ${`una-${A.unassignedAdmin}@x.pt`}, 'Unassigned Admin')`;
  await p`insert into locations (id, tenant_id, name) values
    (${A.locA}, ${A.tenant}, 'Loc A'),
    (${A.locB}, ${A.tenant}, 'Loc B'),
    (${A.locC}, ${A.tenant}, 'Loc C')`;
  // Memberships: adminA + receptionA @ LocA, adminB @ LocB. unassignedAdmin: none.
  await p`insert into staff_locations (tenant_id, user_id, location_id) values
    (${A.tenant}, ${A.adminA},     ${A.locA}),
    (${A.tenant}, ${A.receptionA}, ${A.locA}),
    (${A.tenant}, ${A.adminB},     ${A.locB})`;

  // Patients (fallback / created_by columns carry the edge-case state).
  await p`insert into patients (id, tenant_id, full_name) values
    (${A.pA},          ${A.tenant}, 'Patient A'),
    (${A.pB},          ${A.tenant}, 'Patient B'),
    (${A.pBoth},       ${A.tenant}, 'Patient Both'),
    (${A.pSecondaryA}, ${A.tenant}, 'Patient Secondary A')`;
  // pFallbackB: 0 appointments, fallback LocB. pApptAfbB: LocA appointment (below)
  // AND fallback LocB — the unconditional-fallback case.
  await p`insert into patients (id, tenant_id, full_name, primary_location_id) values
    (${A.pFallbackB}, ${A.tenant}, 'Patient Fallback B', ${A.locB}),
    (${A.pApptAfbB},  ${A.tenant}, 'Patient ApptA FallbackB', ${A.locB})`;
  await p`insert into patients (id, tenant_id, full_name, primary_location_id)
          values (${A.pUnassigned}, ${A.tenant}, 'Patient Unassigned', ${null})`;
  await p`insert into patients (id, tenant_id, full_name, created_by)
          values (${A.pCreatedByT}, ${A.tenant}, 'Patient Created By T', ${A.therapistT})`;

  // Appointments establish the location basis (location_id is NOT NULL).
  await p`insert into appointments (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at) values
    (${A.tenant}, ${A.pA},        ${A.therapistT}, ${A.locA}, ${T0}, ${T1}),
    (${A.tenant}, ${A.pB},        ${A.otherT},     ${A.locB}, ${T0}, ${T1}),
    (${A.tenant}, ${A.pBoth},     ${A.otherT},     ${A.locA}, ${T0}, ${T1}),
    (${A.tenant}, ${A.pBoth},     ${A.otherT},     ${A.locB}, ${T2}, ${T3}),
    (${A.tenant}, ${A.pApptAfbB}, ${A.otherT},     ${A.locA}, ${T0}, ${T1})`;
  // Secondary-participant appointment: pSecondaryA is ONLY the patient_2_id.
  await p`insert into appointments (tenant_id, patient_id, patient_2_id, practitioner_id, location_id, starts_at, ends_at)
          values (${A.tenant}, ${A.pA}, ${A.pSecondaryA}, ${A.otherT}, ${A.locA}, ${T2}, ${T3})`;

  // Tenant Z (cross-tenant neighbour) -------------------------------------
  await p`insert into tenants (id, name, slug) values (${Z.tenant}, 'PL09 Z', ${`pl09-z-${Z.tenant}`})`;
  await p`insert into users (id, tenant_id, email, full_name)
          values (${Z.admin}, ${Z.tenant}, ${`z-${Z.admin}@x.pt`}, 'Z Admin')`;
  await p`insert into locations (id, tenant_id, name) values (${Z.loc}, ${Z.tenant}, 'Z Loc')`;
  await p`insert into staff_locations (tenant_id, user_id, location_id) values (${Z.tenant}, ${Z.admin}, ${Z.loc})`;
  await p`insert into patients (id, tenant_id, full_name) values (${Z.patient}, ${Z.tenant}, 'Z Patient')`;
  await p`insert into appointments (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at)
          values (${Z.tenant}, ${Z.patient}, ${Z.admin}, ${Z.loc}, ${T0}, ${T1})`;
}

/** Ids of patients visible in a SELECT under the given claims. */
async function visiblePatients(sql: Sql, claims: string): Promise<Set<string>> {
  const rows = await asRole(sql, "authenticated", claims, async (tx) =>
    (await tx`select id::text as id from patients`) as { id: string }[],
  );
  return new Set(rows.map((r) => r.id));
}

describe.skipIf(!live)("PL-09 patients location/patient RLS matrix", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    await seed(sql);
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from tenants where id in (${A.tenant}, ${Z.tenant})`;
    await sql.end();
  });

  /* ---- NEGATIVE CONTROL (proves RLS is actually on) ------------------- */
  it("NEGATIVE CONTROL: owner-connection sees pB; adminA (authenticated) does not", async () => {
    const ownerConn = await sql<{ id: string }[]>`select id from patients where id = ${A.pB}`;
    expect(ownerConn.length).toBe(1);
    const adminASees = await visiblePatients(sql, claimsFor(A.tenant, "admin", A.adminA));
    expect(adminASees.has(A.pB)).toBe(false);
  });

  /* ---- owner = all in-tenant ----------------------------------------- */
  it("owner sees EVERY in-tenant patient (incl. unassigned), never cross-tenant", async () => {
    const seen = await visiblePatients(sql, claimsFor(A.tenant, "owner", A.ownerU));
    for (const id of [A.pA, A.pB, A.pBoth, A.pFallbackB, A.pUnassigned, A.pApptAfbB, A.pSecondaryA, A.pCreatedByT]) {
      expect(seen.has(id)).toBe(true);
    }
    expect(seen.has(Z.patient)).toBe(false);
  });

  /* ---- admin STRICT location READ ------------------------------------ */
  it("adminA (LocA) sees LocA patients, not LocB-exclusive ones", async () => {
    const seen = await visiblePatients(sql, claimsFor(A.tenant, "admin", A.adminA));
    expect(seen.has(A.pA)).toBe(true); // appt @ LocA
    expect(seen.has(A.pBoth)).toBe(true); // appt @ LocA (+ LocB)
    expect(seen.has(A.pB)).toBe(false); // LocB-exclusive
    expect(seen.has(A.pFallbackB)).toBe(false); // fallback LocB
    expect(seen.has(A.pUnassigned)).toBe(false); // unassigned -> owner-only
    expect(seen.has(A.pCreatedByT)).toBe(false); // no appt, no fallback, not LocA
  });

  it("adminB (LocB) sees LocB patients, not LocA-exclusive ones", async () => {
    const seen = await visiblePatients(sql, claimsFor(A.tenant, "admin", A.adminB));
    expect(seen.has(A.pB)).toBe(true);
    expect(seen.has(A.pBoth)).toBe(true);
    expect(seen.has(A.pFallbackB)).toBe(true); // fallback = LocB
    expect(seen.has(A.pA)).toBe(false);
  });

  /* ---- KEY: UNCONDITIONAL fallback (the 0045-clinical divergence) ----- */
  it("a patient with a LocA appointment AND primary_location_id=LocB is visible to BOTH LocA and LocB admins", async () => {
    const seenA = await visiblePatients(sql, claimsFor(A.tenant, "admin", A.adminA));
    const seenB = await visiblePatients(sql, claimsFor(A.tenant, "admin", A.adminB));
    expect(seenA.has(A.pApptAfbB)).toBe(true); // appointment basis
    // The fallback is UNCONDITIONAL: LocB admin sees it via primary_location_id
    // EVEN THOUGH the patient has a (LocA) appointment. This is exactly where the
    // gated clinical helper (0045) would have hidden it -> would be stricter than
    // the app's patientLocationScope.
    expect(seenB.has(A.pApptAfbB)).toBe(true);
  });

  /* ---- KEY: secondary participant (patient_2_id) --------------------- */
  it("a patient who is ONLY a secondary participant (patient_2_id) at LocA is visible to LocA admin", async () => {
    const seenA = await visiblePatients(sql, claimsFor(A.tenant, "admin", A.adminA));
    const seenB = await visiblePatients(sql, claimsFor(A.tenant, "admin", A.adminB));
    expect(seenA.has(A.pSecondaryA)).toBe(true); // matched via patient_2_id
    expect(seenB.has(A.pSecondaryA)).toBe(false); // LocA-only
  });

  /* ---- reception = location-scoped (ALLOWED, unlike clinical) -------- */
  it("reception @ LocA sees LocA patients and NOT LocB-exclusive ones (allowed, not denied)", async () => {
    const seen = await visiblePatients(sql, claimsFor(A.tenant, "reception", A.receptionA));
    expect(seen.has(A.pA)).toBe(true);
    expect(seen.has(A.pBoth)).toBe(true);
    expect(seen.has(A.pApptAfbB)).toBe(true);
    expect(seen.has(A.pSecondaryA)).toBe(true);
    expect(seen.has(A.pB)).toBe(false);
    expect(seen.has(A.pFallbackB)).toBe(false);
    expect(seen.has(A.pUnassigned)).toBe(false);
  });

  /* ---- no-lockout: unassigned admin sees ALL ------------------------- */
  it("an UNASSIGNED admin (no staff_locations) sees ALL in-tenant patients (no lockout), never cross-tenant", async () => {
    const seen = await visiblePatients(sql, claimsFor(A.tenant, "admin", A.unassignedAdmin));
    for (const id of [A.pA, A.pB, A.pBoth, A.pFallbackB, A.pUnassigned, A.pApptAfbB, A.pSecondaryA, A.pCreatedByT]) {
      expect(seen.has(id)).toBe(true);
    }
    expect(seen.has(Z.patient)).toBe(false); // tenant wall still holds
  });

  /* ---- therapist = own patients (created OR treats) ------------------ */
  it("therapist sees a patient they treat and one they created, not others", async () => {
    const seen = await visiblePatients(sql, claimsFor(A.tenant, "therapist", A.therapistT));
    expect(seen.has(A.pA)).toBe(true); // practitioner on pA's appointment
    expect(seen.has(A.pCreatedByT)).toBe(true); // created_by = therapistT
    expect(seen.has(A.pB)).toBe(false);
    expect(seen.has(A.pBoth)).toBe(false);
    expect(seen.has(A.pApptAfbB)).toBe(false);
    expect(seen.has(A.pSecondaryA)).toBe(false); // otherT is practitioner, not T
  });

  it("a therapist with no relationship to any patient sees NONE", async () => {
    const seen = await visiblePatients(sql, claimsFor(A.tenant, "therapist", randomUUID()));
    expect(seen.size).toBe(0);
  });

  /* ---- WRITE: UPDATE gated by the read scope ------------------------- */
  it("reception CAN update an in-location patient; CANNOT update an out-of-location one (0 rows)", async () => {
    const ok = await asRole(sql, "authenticated", claimsFor(A.tenant, "reception", A.receptionA), (tx) =>
      tx<{ id: string }[]>`update patients set full_name = 'Renamed A' where id = ${A.pA} returning id`,
    );
    expect(ok.length).toBe(1);
    const no = await asRole(sql, "authenticated", claimsFor(A.tenant, "reception", A.receptionA), (tx) =>
      tx<{ id: string }[]>`update patients set full_name = 'Nope' where id = ${A.pB} returning id`,
    );
    expect(no.length).toBe(0);
  });

  it("therapist CAN update an own patient; CANNOT update a non-own one (0 rows)", async () => {
    const ok = await asRole(sql, "authenticated", claimsFor(A.tenant, "therapist", A.therapistT), (tx) =>
      tx<{ id: string }[]>`update patients set full_name = 'Renamed T' where id = ${A.pCreatedByT} returning id`,
    );
    expect(ok.length).toBe(1);
    const no = await asRole(sql, "authenticated", claimsFor(A.tenant, "therapist", A.therapistT), (tx) =>
      tx<{ id: string }[]>`update patients set full_name = 'Nope' where id = ${A.pB} returning id`,
    );
    expect(no.length).toBe(0);
  });

  /* ---- WRITE: INSERT ... RETURNING works for every creating role ----- */
  // REGRESSION GUARD: createPatient does `insert into patients ... returning`.
  // The SELECT policy is applied to the RETURNING row, so it MUST be satisfiable
  // by the NEW row's own columns (created_by) without re-reading the patients
  // table — else a therapist / located reception cannot create a patient (this
  // broke consultation-start + booking E2E on the first cut). created_by =
  // auth.uid() guarantees the creator sees their own new row.
  it("therapist can INSERT a location-less patient and RETURNING it (created_by = self)", async () => {
    const inserted = await asRole(sql, "authenticated", claimsFor(A.tenant, "therapist", A.therapistT), (tx) =>
      tx<{ id: string }[]>`insert into patients (tenant_id, full_name, created_by)
        values (${A.tenant}, 'Therapist Stub', ${A.therapistT}) returning id`,
    );
    expect(inserted.length).toBe(1);
  });

  it("reception (located) can INSERT a location-less patient and RETURNING it (created_by = self)", async () => {
    const inserted = await asRole(sql, "authenticated", claimsFor(A.tenant, "reception", A.receptionA), (tx) =>
      tx<{ id: string }[]>`insert into patients (tenant_id, full_name, created_by)
        values (${A.tenant}, 'New Walk-in', ${A.receptionA}) returning id`,
    );
    expect(inserted.length).toBe(1);
  });

  it("admin (located) can INSERT + RETURNING a patient placed at their own location", async () => {
    const inserted = await asRole(sql, "authenticated", claimsFor(A.tenant, "admin", A.adminA), (tx) =>
      tx<{ id: string }[]>`insert into patients (tenant_id, full_name, created_by, primary_location_id)
        values (${A.tenant}, 'Placed at LocA', ${A.adminA}, ${A.locA}) returning id`,
    );
    expect(inserted.length).toBe(1);
  });

  it("a tenant-A admin CANNOT forge a tenant-Z patient (WITH CHECK tenant wall)", async () => {
    await expect(
      asRole(sql, "authenticated", claimsFor(A.tenant, "admin", A.adminA), (tx) =>
        tx`insert into patients (tenant_id, full_name) values (${Z.tenant}, 'Forged')`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  /* ---- cross-tenant fail-closed -------------------------------------- */
  it("tenant-A roles CANNOT see tenant-Z's patient; tenant-Z admin sees only its own", async () => {
    for (const claims of [
      claimsFor(A.tenant, "owner", A.ownerU),
      claimsFor(A.tenant, "admin", A.adminA),
      claimsFor(A.tenant, "reception", A.receptionA),
      claimsFor(A.tenant, "therapist", A.therapistT),
    ]) {
      const seen = await visiblePatients(sql, claims);
      expect(seen.has(Z.patient)).toBe(false);
    }
    const zSees = await visiblePatients(sql, claimsFor(Z.tenant, "admin", Z.admin));
    expect(zSees.has(Z.patient)).toBe(true);
    expect(zSees.has(A.pA)).toBe(false);
  });
});
