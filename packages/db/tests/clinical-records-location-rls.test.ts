/**
 * clinical-records-location-rls.test.ts — R16 (migration 0043) clinical_records
 * RLS matrix: STRICT single-location admin, therapist own-patients, admin WRITE
 * removed, owner all-in-tenant, reception denied.
 *
 * This is the comprehensive isolation matrix the R16 tighten requires. The
 * generic per-table cross-tenant baseline (cross-tenant-rls-isolation.test.ts)
 * no longer covers clinical_records because it stopped being a uniform
 * tenant+role gate — this file owns clinical_records isolation end to end,
 * INCLUDING the cross-tenant cases.
 *
 * Model (seeded once, tenant A + a cross-tenant tenant Z):
 *   locations   LocA, LocB, LocC
 *   staff        ownerU (owner), adminA (admin @ LocA), adminB (admin @ LocB),
 *                therapistT (therapist), otherT (therapist), receptionU (reception)
 *   patients     pA         — one appointment at LocA (practitioner therapistT)
 *                pB         — one appointment at LocB (practitioner otherT)
 *                pBoth      — appointments at BOTH LocA and LocB (otherT)
 *                pFallbackB — ZERO appointments, primary_location_id = LocB
 *                pUnassigned— ZERO appointments, primary_location_id = NULL
 *   each patient has one DRAFT clinical_record (rX).
 *
 * Visibility truth table this proves:
 *   record   owner  adminA  adminB  therapistT  reception
 *   rA        ✓      ✓       ✗       ✓ (author)   ✗
 *   rB        ✓      ✗       ✓       ✗            ✗
 *   rBoth     ✓      ✓       ✓       ✗            ✗
 *   rFallback ✓      ✗       ✓(fallback) ✗        ✗
 *   rUnassign ✓      ✗       ✗       ✗            ✗   (unassigned -> owner-only)
 *
 * CORRECTNESS (harness invariant): RLS is ENABLE-not-FORCE, so every assertion
 * runs on the role-switched `authenticated` connection inside a rolled-back
 * transaction — NEVER the owner (which bypasses RLS and would pass for the wrong
 * reason). auth.uid() is pinned per-assertion via the JWT `sub` (claimsFor's 3rd
 * arg). GATING: requires a live privileged DATABASE_URL with 0043 applied;
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
  therapistT: randomUUID(),
  otherT: randomUUID(),
  receptionU: randomUUID(),
  locA: randomUUID(),
  locB: randomUUID(),
  locC: randomUUID(),
  pA: randomUUID(),
  pB: randomUUID(),
  pBoth: randomUUID(),
  pFallbackB: randomUUID(),
  pUnassigned: randomUUID(),
  rA: randomUUID(),
  rB: randomUUID(),
  rBoth: randomUUID(),
  rFallback: randomUUID(),
  rUnassigned: randomUUID(),
};

// Cross-tenant neighbour.
const Z = {
  tenant: randomUUID(),
  admin: randomUUID(),
  loc: randomUUID(),
  patient: randomUUID(),
  record: randomUUID(),
};

const T0 = "2026-03-02T09:00:00Z";
const T1 = "2026-03-02T10:00:00Z";
const T2 = "2026-03-03T09:00:00Z";
const T3 = "2026-03-03T10:00:00Z";

async function seed(p: Sql): Promise<void> {
  // Tenant A ---------------------------------------------------------------
  await p`insert into tenants (id, name, slug) values (${A.tenant}, 'R16 A', ${`r16-a-${A.tenant}`})`;
  await p`insert into users (id, tenant_id, email, full_name) values
    (${A.ownerU},     ${A.tenant}, ${`owner-${A.ownerU}@x.pt`},   'Owner'),
    (${A.adminA},     ${A.tenant}, ${`admA-${A.adminA}@x.pt`},    'Admin A'),
    (${A.adminB},     ${A.tenant}, ${`admB-${A.adminB}@x.pt`},    'Admin B'),
    (${A.therapistT}, ${A.tenant}, ${`ther-${A.therapistT}@x.pt`},'Therapist T'),
    (${A.otherT},     ${A.tenant}, ${`oth-${A.otherT}@x.pt`},     'Other T'),
    (${A.receptionU}, ${A.tenant}, ${`rec-${A.receptionU}@x.pt`}, 'Reception')`;
  await p`insert into locations (id, tenant_id, name) values
    (${A.locA}, ${A.tenant}, 'Loc A'),
    (${A.locB}, ${A.tenant}, 'Loc B'),
    (${A.locC}, ${A.tenant}, 'Loc C')`;
  // Admin <-> location memberships: STRICT single-location.
  await p`insert into staff_locations (tenant_id, user_id, location_id) values
    (${A.tenant}, ${A.adminA}, ${A.locA}),
    (${A.tenant}, ${A.adminB}, ${A.locB})`;

  // Patients (pFallbackB / pUnassigned carry the fallback column state).
  await p`insert into patients (id, tenant_id, full_name) values
    (${A.pA},    ${A.tenant}, 'Patient A'),
    (${A.pB},    ${A.tenant}, 'Patient B'),
    (${A.pBoth}, ${A.tenant}, 'Patient Both')`;
  await p`insert into patients (id, tenant_id, full_name, primary_location_id)
          values (${A.pFallbackB}, ${A.tenant}, 'Patient Fallback B', ${A.locB})`;
  await p`insert into patients (id, tenant_id, full_name, primary_location_id)
          values (${A.pUnassigned}, ${A.tenant}, 'Patient Unassigned', ${null})`;

  // Appointments establish the location basis (location_id is NOT NULL).
  await p`insert into appointments (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at) values
    (${A.tenant}, ${A.pA},    ${A.therapistT}, ${A.locA}, ${T0}, ${T1}),
    (${A.tenant}, ${A.pB},    ${A.otherT},     ${A.locB}, ${T0}, ${T1}),
    (${A.tenant}, ${A.pBoth}, ${A.otherT},     ${A.locA}, ${T0}, ${T1}),
    (${A.tenant}, ${A.pBoth}, ${A.otherT},     ${A.locB}, ${T2}, ${T3})`;

  // One DRAFT clinical_record per patient. rA authored by therapistT.
  await p`insert into clinical_records (id, tenant_id, patient_id, practitioner_id, status) values
    (${A.rA},         ${A.tenant}, ${A.pA},         ${A.therapistT}, 'draft'),
    (${A.rB},         ${A.tenant}, ${A.pB},         ${A.otherT},     'draft'),
    (${A.rBoth},      ${A.tenant}, ${A.pBoth},      ${A.otherT},     'draft'),
    (${A.rFallback},  ${A.tenant}, ${A.pFallbackB}, ${A.otherT},     'draft'),
    (${A.rUnassigned},${A.tenant}, ${A.pUnassigned},${A.otherT},     'draft')`;

  // Tenant Z (cross-tenant neighbour) -------------------------------------
  await p`insert into tenants (id, name, slug) values (${Z.tenant}, 'R16 Z', ${`r16-z-${Z.tenant}`})`;
  await p`insert into users (id, tenant_id, email, full_name)
          values (${Z.admin}, ${Z.tenant}, ${`z-${Z.admin}@x.pt`}, 'Z Admin')`;
  await p`insert into locations (id, tenant_id, name) values (${Z.loc}, ${Z.tenant}, 'Z Loc')`;
  await p`insert into staff_locations (tenant_id, user_id, location_id) values (${Z.tenant}, ${Z.admin}, ${Z.loc})`;
  await p`insert into patients (id, tenant_id, full_name) values (${Z.patient}, ${Z.tenant}, 'Z Patient')`;
  await p`insert into appointments (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at)
          values (${Z.tenant}, ${Z.patient}, ${Z.admin}, ${Z.loc}, ${T0}, ${T1})`;
  await p`insert into clinical_records (id, tenant_id, patient_id, status)
          values (${Z.record}, ${Z.tenant}, ${Z.patient}, 'draft')`;
}

/** Ids of clinical_records visible in a SELECT under the given claims. */
async function visibleRecords(
  sql: Sql,
  claims: string,
): Promise<Set<string>> {
  const rows = await asRole(sql, "authenticated", claims, async (tx) =>
    (await tx`select id::text as id from clinical_records`) as { id: string }[],
  );
  return new Set(rows.map((r) => r.id));
}

describe.skipIf(!live)("R16 clinical_records location/patient RLS matrix", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    await seed(sql);
  });

  afterAll(async () => {
    if (!sql) return;
    // tenant_id FKs cascade — deleting the two tenants cleans the whole graph.
    await sql`delete from tenants where id in (${A.tenant}, ${Z.tenant})`;
    await sql.end();
  });

  /* ---- NEGATIVE CONTROL (proves RLS is actually on) ------------------- */
  it("NEGATIVE CONTROL: owner-connection sees rB; adminA (authenticated) does not", async () => {
    const ownerConn = await sql<{ id: string }[]>`select id from clinical_records where id = ${A.rB}`;
    expect(ownerConn.length).toBe(1);
    const adminASees = await visibleRecords(sql, claimsFor(A.tenant, "admin", A.adminA));
    expect(adminASees.has(A.rB)).toBe(false);
  });

  /* ---- owner = all in-tenant ----------------------------------------- */
  it("owner sees EVERY in-tenant record (incl. the unassigned/NULL-fallback one)", async () => {
    const seen = await visibleRecords(sql, claimsFor(A.tenant, "owner", A.ownerU));
    for (const id of [A.rA, A.rB, A.rBoth, A.rFallback, A.rUnassigned]) {
      expect(seen.has(id)).toBe(true);
    }
    // Tenant wall still holds for owner.
    expect(seen.has(Z.record)).toBe(false);
  });

  /* ---- admin STRICT single-location READ ----------------------------- */
  it("adminA (LocA) sees the LocA-appointment patient, NOT a LocB-exclusive one", async () => {
    const seen = await visibleRecords(sql, claimsFor(A.tenant, "admin", A.adminA));
    expect(seen.has(A.rA)).toBe(true); // pA has a LocA appointment
    expect(seen.has(A.rB)).toBe(false); // pB is LocB-exclusive
    expect(seen.has(A.rFallback)).toBe(false); // fallback is LocB
    expect(seen.has(A.rUnassigned)).toBe(false); // unassigned -> owner-only
  });

  it("adminB (LocB) sees the LocB-appointment patient, NOT a LocA-exclusive one", async () => {
    const seen = await visibleRecords(sql, claimsFor(A.tenant, "admin", A.adminB));
    expect(seen.has(A.rB)).toBe(true);
    expect(seen.has(A.rA)).toBe(false);
  });

  it("a BOTH-clinics patient is visible to BOTH LocA and LocB admins", async () => {
    const seenA = await visibleRecords(sql, claimsFor(A.tenant, "admin", A.adminA));
    const seenB = await visibleRecords(sql, claimsFor(A.tenant, "admin", A.adminB));
    expect(seenA.has(A.rBoth)).toBe(true);
    expect(seenB.has(A.rBoth)).toBe(true);
  });

  /* ---- Fallback column: zero-appointment patients -------------------- */
  it("a ZERO-appointment patient is visible ONLY to its fallback-location admin", async () => {
    const seenB = await visibleRecords(sql, claimsFor(A.tenant, "admin", A.adminB));
    const seenA = await visibleRecords(sql, claimsFor(A.tenant, "admin", A.adminA));
    expect(seenB.has(A.rFallback)).toBe(true); // fallback = LocB -> adminB only
    expect(seenA.has(A.rFallback)).toBe(false);
  });

  it("a ZERO-appointment patient with a NULL fallback is UNASSIGNED -> owner-only (no admin sees it)", async () => {
    const seenA = await visibleRecords(sql, claimsFor(A.tenant, "admin", A.adminA));
    const seenB = await visibleRecords(sql, claimsFor(A.tenant, "admin", A.adminB));
    const seenOwner = await visibleRecords(sql, claimsFor(A.tenant, "owner", A.ownerU));
    expect(seenA.has(A.rUnassigned)).toBe(false);
    expect(seenB.has(A.rUnassigned)).toBe(false);
    expect(seenOwner.has(A.rUnassigned)).toBe(true); // never orphaned
  });

  /* ---- NULL-location-appointment edge (closed) ----------------------- */
  it("EDGE: appointments.location_id is NOT NULL, so a 'null-location-only' patient is unreachable; the fallback guard keys on non-null location", async () => {
    // The fallback branch of clinical_admin_sees_patient() applies only when the
    // patient has NO appointment WITH A NON-NULL location_id. Today that guard is
    // reinforced by the schema: appointments.location_id is NOT NULL, so a patient
    // whose only appointments carry a null location cannot exist — the edge is
    // closed by construction AND by the defensive predicate (future-proof if the
    // column is ever relaxed). We assert the constraint here as the proof.
    const [col] = await sql<{ is_nullable: string }[]>`
      select is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'appointments' and column_name = 'location_id'`;
    expect(col?.is_nullable).toBe("NO");
  });

  /* ---- therapist = OWN patients only --------------------------------- */
  it("therapist sees a record they authored / a patient they treat, not others", async () => {
    const seen = await visibleRecords(sql, claimsFor(A.tenant, "therapist", A.therapistT));
    // rA: therapistT is the record's practitioner AND treats pA (LocA appointment).
    expect(seen.has(A.rA)).toBe(true);
    // rB / rBoth / rFallback / rUnassigned: not authored, not treated, not created.
    expect(seen.has(A.rB)).toBe(false);
    expect(seen.has(A.rBoth)).toBe(false);
    expect(seen.has(A.rFallback)).toBe(false);
    expect(seen.has(A.rUnassigned)).toBe(false);
  });

  it("a therapist with no relationship to any patient sees NO records", async () => {
    // otherT is the practitioner on appointments but NOT the record author for a
    // patient they 'own'; still, otherT treats pB/pBoth/pFallback via appointments,
    // so they DO see those. A brand-new therapist (random uid) sees nothing.
    const stranger = randomUUID();
    const seen = await visibleRecords(sql, claimsFor(A.tenant, "therapist", stranger));
    expect(seen.size).toBe(0);
  });

  /* ---- reception = DENIED (re-proven) -------------------------------- */
  it("reception sees NO clinical records (read denied)", async () => {
    const seen = await visibleRecords(sql, claimsFor(A.tenant, "reception", A.receptionU));
    expect(seen.size).toBe(0);
  });

  it("reception INSERT is rejected by WITH CHECK (write denied)", async () => {
    await expect(
      asRole(sql, "authenticated", claimsFor(A.tenant, "reception", A.receptionU), (tx) =>
        tx`insert into clinical_records (tenant_id, patient_id) values (${A.tenant}, ${A.pA})`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  /* ---- admin WRITE REMOVED (read-only on clinical) ------------------- */
  it("admin cannot INSERT a clinical_record (WITH CHECK rejects even own-location patient)", async () => {
    await expect(
      asRole(sql, "authenticated", claimsFor(A.tenant, "admin", A.adminA), (tx) =>
        tx`insert into clinical_records (tenant_id, patient_id) values (${A.tenant}, ${A.pA})`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("admin UPDATE of an own-location record affects 0 rows (no write path)", async () => {
    const updated = await asRole(sql, "authenticated", claimsFor(A.tenant, "admin", A.adminA), (tx) =>
      tx<{ id: string }[]>`update clinical_records set version = 2 where id = ${A.rA} returning id`,
    );
    expect(updated.length).toBe(0);
  });

  it("admin DELETE of an own-location record affects 0 rows (no write path)", async () => {
    const deleted = await asRole(sql, "authenticated", claimsFor(A.tenant, "admin", A.adminA), (tx) =>
      tx<{ id: string }[]>`delete from clinical_records where id = ${A.rA} returning id`,
    );
    expect(deleted.length).toBe(0);
  });

  /* ---- therapist WRITE scoped to own patients ------------------------ */
  it("therapist CAN update a draft they own; CANNOT update a non-own record (0 rows)", async () => {
    const own = await asRole(sql, "authenticated", claimsFor(A.tenant, "therapist", A.therapistT), (tx) =>
      tx<{ id: string }[]>`update clinical_records set version = 2 where id = ${A.rA} returning id`,
    );
    expect(own.length).toBe(1);

    const notOwn = await asRole(sql, "authenticated", claimsFor(A.tenant, "therapist", A.therapistT), (tx) =>
      tx<{ id: string }[]>`update clinical_records set version = 2 where id = ${A.rB} returning id`,
    );
    expect(notOwn.length).toBe(0);
  });

  it("therapist INSERT for an own patient succeeds; for a non-own patient is rejected", async () => {
    const ok = await asRole(sql, "authenticated", claimsFor(A.tenant, "therapist", A.therapistT), (tx) =>
      tx<{ id: string }[]>`insert into clinical_records (tenant_id, patient_id, practitioner_id, status)
        values (${A.tenant}, ${A.pA}, ${A.therapistT}, 'draft') returning id`,
    );
    expect(ok.length).toBe(1);

    // pB is not therapistT's patient, and practitioner_id is set to otherT, so
    // neither the author clause nor the own-patient clause holds -> WITH CHECK rejects.
    await expect(
      asRole(sql, "authenticated", claimsFor(A.tenant, "therapist", A.therapistT), (tx) =>
        tx`insert into clinical_records (tenant_id, patient_id, practitioner_id, status)
           values (${A.tenant}, ${A.pB}, ${A.otherT}, 'draft')`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  /* ---- owner WRITE = all in-tenant ----------------------------------- */
  it("owner can update ANY in-tenant draft", async () => {
    const updated = await asRole(sql, "authenticated", claimsFor(A.tenant, "owner", A.ownerU), (tx) =>
      tx<{ id: string }[]>`update clinical_records set version = 3 where id = ${A.rB} returning id`,
    );
    expect(updated.length).toBe(1);
  });

  /* ---- cross-tenant fail-closed -------------------------------------- */
  it("tenant-A owner/admin/therapist CANNOT see tenant-Z's record", async () => {
    for (const claims of [
      claimsFor(A.tenant, "owner", A.ownerU),
      claimsFor(A.tenant, "admin", A.adminA),
      claimsFor(A.tenant, "therapist", A.therapistT),
    ]) {
      const seen = await visibleRecords(sql, claims);
      expect(seen.has(Z.record)).toBe(false);
    }
  });

  it("tenant-Z admin CANNOT see tenant-A's records (and its own tenant wall holds)", async () => {
    const seen = await visibleRecords(sql, claimsFor(Z.tenant, "admin", Z.admin));
    expect(seen.has(A.rA)).toBe(false);
    expect(seen.has(A.rB)).toBe(false);
    // Positive control: Z admin DOES see Z's own in-location record.
    expect(seen.has(Z.record)).toBe(true);
  });

  it("tenant-A admin CANNOT forge a tenant-Z record (WITH CHECK), even ignoring the write gate", async () => {
    await expect(
      asRole(sql, "authenticated", claimsFor(A.tenant, "owner", A.ownerU), (tx) =>
        tx`insert into clinical_records (tenant_id, patient_id) values (${Z.tenant}, ${Z.patient})`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});
