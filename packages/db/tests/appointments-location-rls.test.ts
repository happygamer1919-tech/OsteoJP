/**
 * appointments-location-rls.test.ts — PL-09 Phase 2b (migration 0048).
 *
 * Two things:
 *  1. The appointments RLS matrix: owner all / therapist own (primary OR secondary
 *     practitioner) / admin + reception their-location / unassigned -> all
 *     (no-lockout) / cross-tenant denied. Read + write (FOR ALL).
 *  2. public.appointment_conflicts (SECURITY DEFINER): booking's double-booking
 *     check must see conflicts the caller's scoped RLS would hide — a ROOM clash
 *     across therapists, a THERAPIST clash across locations, and (the 0047 fix) a
 *     conflict whose PATIENT the caller cannot see. Proven by calling it under a
 *     therapist/reception role and asserting the hidden conflict is still returned.
 *
 * Harness invariant: every assertion runs on the role-switched `authenticated`
 * connection inside a rolled-back tx (never the owner, which bypasses RLS).
 * auth.uid() is pinned via claimsFor's 3rd arg. Skipped without a live DATABASE_URL.
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
  unassignedAdmin: randomUUID(),
  locA: randomUUID(),
  locB: randomUUID(),
  pX: randomUUID(),
  pOther: randomUUID(), // NOT therapistT's patient (created by otherT, treated by otherT)
  apA: randomUUID(), // LocA, practitioner therapistT
  apB: randomUUID(), // LocB, practitioner otherT
  apTlocB: randomUUID(), // LocB, practitioner therapistT (T works multi-location)
  apSecondary: randomUUID(), // LocA, practitioner otherT, practitioner_2 therapistT
  apRoom: randomUUID(), // LocA, practitioner otherT, room 'Sala 1', patient pOther
};

const Z = { tenant: randomUUID(), admin: randomUUID(), loc: randomUUID(), appt: randomUUID(), patient: randomUUID() };

// Booking window that overlaps apRoom / apA (all seeded 09:00–10:00 on this day).
const W0 = "2026-05-04T09:00:00Z";
const W1 = "2026-05-04T10:00:00Z";
const T2 = "2026-05-05T09:00:00Z";
const T3 = "2026-05-05T10:00:00Z";

async function seed(p: Sql): Promise<void> {
  await p`insert into tenants (id, name, slug) values (${A.tenant}, 'PL09b A', ${`pl09b-a-${A.tenant}`})`;
  await p`insert into users (id, tenant_id, email, full_name) values
    (${A.ownerU},          ${A.tenant}, ${`o-${A.ownerU}@x.pt`},   'Owner'),
    (${A.adminA},          ${A.tenant}, ${`aa-${A.adminA}@x.pt`},  'Admin A'),
    (${A.adminB},          ${A.tenant}, ${`ab-${A.adminB}@x.pt`},  'Admin B'),
    (${A.receptionA},      ${A.tenant}, ${`r-${A.receptionA}@x.pt`},'Reception A'),
    (${A.therapistT},      ${A.tenant}, ${`t-${A.therapistT}@x.pt`},'Therapist T'),
    (${A.otherT},          ${A.tenant}, ${`ot-${A.otherT}@x.pt`},  'Other T'),
    (${A.unassignedAdmin}, ${A.tenant}, ${`u-${A.unassignedAdmin}@x.pt`}, 'Unassigned Admin')`;
  await p`insert into locations (id, tenant_id, name) values
    (${A.locA}, ${A.tenant}, 'Loc A'), (${A.locB}, ${A.tenant}, 'Loc B')`;
  await p`insert into staff_locations (tenant_id, user_id, location_id) values
    (${A.tenant}, ${A.adminA},     ${A.locA}),
    (${A.tenant}, ${A.receptionA}, ${A.locA}),
    (${A.tenant}, ${A.adminB},     ${A.locB})`;
  // pOther is created by + treated by otherT, so therapistT can NOT see it (0047).
  await p`insert into patients (id, tenant_id, full_name, created_by) values
    (${A.pX},     ${A.tenant}, 'Patient X',     ${A.otherT}),
    (${A.pOther}, ${A.tenant}, 'Patient Other', ${A.otherT})`;
  await p`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at) values
    (${A.apA},    ${A.tenant}, ${A.pX}, ${A.therapistT}, ${A.locA}, ${W0}, ${W1}),
    (${A.apB},    ${A.tenant}, ${A.pX}, ${A.otherT},     ${A.locB}, ${W0}, ${W1}),
    (${A.apTlocB},${A.tenant}, ${A.pX}, ${A.therapistT}, ${A.locB}, ${W0}, ${W1})`;
  // Secondary-practitioner appointment: therapistT is practitioner_2.
  await p`insert into appointments (id, tenant_id, patient_id, practitioner_id, practitioner_2_id, location_id, starts_at, ends_at)
          values (${A.apSecondary}, ${A.tenant}, ${A.pX}, ${A.otherT}, ${A.therapistT}, ${A.locA}, ${T2}, ${T3})`;
  // Room appointment at LocA for pOther (invisible to therapistT under patients RLS).
  await p`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id, room, starts_at, ends_at)
          values (${A.apRoom}, ${A.tenant}, ${A.pOther}, ${A.otherT}, ${A.locA}, 'Sala 1', ${W0}, ${W1})`;

  // Cross-tenant neighbour.
  await p`insert into tenants (id, name, slug) values (${Z.tenant}, 'PL09b Z', ${`pl09b-z-${Z.tenant}`})`;
  await p`insert into users (id, tenant_id, email, full_name) values (${Z.admin}, ${Z.tenant}, ${`z-${Z.admin}@x.pt`}, 'Z Admin')`;
  await p`insert into locations (id, tenant_id, name) values (${Z.loc}, ${Z.tenant}, 'Z Loc')`;
  await p`insert into staff_locations (tenant_id, user_id, location_id) values (${Z.tenant}, ${Z.admin}, ${Z.loc})`;
  await p`insert into patients (id, tenant_id, full_name) values (${Z.patient}, ${Z.tenant}, 'Z Patient')`;
  await p`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at)
          values (${Z.appt}, ${Z.tenant}, ${Z.patient}, ${Z.admin}, ${Z.loc}, ${W0}, ${W1})`;
}

async function visible(sql: Sql, claims: string): Promise<Set<string>> {
  const rows = await asRole(sql, "authenticated", claims, async (tx) =>
    (await tx`select id::text as id from appointments`) as { id: string }[],
  );
  return new Set(rows.map((r) => r.id));
}

describe.skipIf(!live)("PL-09 appointments location RLS matrix", () => {
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

  it("NEGATIVE CONTROL: owner-conn sees apB; adminA (authenticated) does not", async () => {
    const own = await sql<{ id: string }[]>`select id from appointments where id = ${A.apB}`;
    expect(own.length).toBe(1);
    const adminASees = await visible(sql, claimsFor(A.tenant, "admin", A.adminA));
    expect(adminASees.has(A.apB)).toBe(false);
  });

  it("owner sees every in-tenant appointment, never cross-tenant", async () => {
    const seen = await visible(sql, claimsFor(A.tenant, "owner", A.ownerU));
    for (const id of [A.apA, A.apB, A.apTlocB, A.apSecondary, A.apRoom]) expect(seen.has(id)).toBe(true);
    expect(seen.has(Z.appt)).toBe(false);
  });

  it("therapist sees OWN appointments (primary + secondary practitioner), across locations, not others'", async () => {
    const seen = await visible(sql, claimsFor(A.tenant, "therapist", A.therapistT));
    expect(seen.has(A.apA)).toBe(true); // primary @ LocA
    expect(seen.has(A.apTlocB)).toBe(true); // primary @ LocB (own, cross-location)
    expect(seen.has(A.apSecondary)).toBe(true); // secondary practitioner
    expect(seen.has(A.apB)).toBe(false); // otherT's
    expect(seen.has(A.apRoom)).toBe(false); // otherT's
  });

  it("adminA (LocA) sees LocA appointments only; adminB (LocB) sees LocB only", async () => {
    const a = await visible(sql, claimsFor(A.tenant, "admin", A.adminA));
    expect(a.has(A.apA)).toBe(true);
    expect(a.has(A.apSecondary)).toBe(true);
    expect(a.has(A.apRoom)).toBe(true);
    expect(a.has(A.apB)).toBe(false);
    expect(a.has(A.apTlocB)).toBe(false);
    const b = await visible(sql, claimsFor(A.tenant, "admin", A.adminB));
    expect(b.has(A.apB)).toBe(true);
    expect(b.has(A.apTlocB)).toBe(true);
    expect(b.has(A.apA)).toBe(false);
  });

  it("reception @ LocA sees LocA appointments (allowed, location-scoped)", async () => {
    const r = await visible(sql, claimsFor(A.tenant, "reception", A.receptionA));
    expect(r.has(A.apA)).toBe(true);
    expect(r.has(A.apRoom)).toBe(true);
    expect(r.has(A.apB)).toBe(false);
    expect(r.has(A.apTlocB)).toBe(false);
  });

  it("an UNASSIGNED admin sees ALL in-tenant appointments (no lockout), not cross-tenant", async () => {
    const seen = await visible(sql, claimsFor(A.tenant, "admin", A.unassignedAdmin));
    for (const id of [A.apA, A.apB, A.apTlocB, A.apSecondary, A.apRoom]) expect(seen.has(id)).toBe(true);
    expect(seen.has(Z.appt)).toBe(false);
  });

  /* ---- WRITE (PL-11, migration 0049: the created_by author escape) ----
   *
   * Owner ruling 2026-07-30: "all active staff roles may create and edit
   * appointments." 0048 shipped without the `created_by = auth.uid()` branch
   * the patients policy (0047) already has, so a LOCATION-SCOPED admin/reception
   * saving OUTSIDE their location failed WITH CHECK -> createAppointment threw ->
   * "save blocked". These assertions stamp `created_by` exactly as
   * createAppointment does (`createdBy: actor.userId`); the pre-0049 policy
   * rejects them, 0049 lets the author's own new row through.
   */
  it("PL-11 REPRO: a located reception CAN save an appointment they AUTHOR at ANOTHER location (created_by = self)", async () => {
    // Lurdes's condition: reception assigned to LocA books at LocB. Fails on 0048
    // (no author escape) -> passes on 0049.
    const ok = await asRole(sql, "authenticated", claimsFor(A.tenant, "reception", A.receptionA), (tx) =>
      tx<{ id: string }[]>`insert into appointments (tenant_id, patient_id, practitioner_id, location_id, created_by, starts_at, ends_at)
        values (${A.tenant}, ${A.pX}, ${A.therapistT}, ${A.locB}, ${A.receptionA}, ${T2}, ${T3}) returning id`,
    );
    expect(ok.length).toBe(1);
  });

  it("PL-11: a located admin CAN save an appointment they AUTHOR at another location (created_by = self)", async () => {
    const ok = await asRole(sql, "authenticated", claimsFor(A.tenant, "admin", A.adminA), (tx) =>
      tx<{ id: string }[]>`insert into appointments (tenant_id, patient_id, practitioner_id, location_id, created_by, starts_at, ends_at)
        values (${A.tenant}, ${A.pX}, ${A.otherT}, ${A.locB}, ${A.adminA}, ${T2}, ${T3}) returning id`,
    );
    expect(ok.length).toBe(1);
  });

  it("PL-11: a therapist CAN author an appointment for ANOTHER practitioner (created_by = self)", async () => {
    // App-layer PL-10 self-locks the therapist create form; RLS no longer blocks
    // the write itself (create is an authored action, not a read-scope one).
    const ok = await asRole(sql, "authenticated", claimsFor(A.tenant, "therapist", A.therapistT), (tx) =>
      tx<{ id: string }[]>`insert into appointments (tenant_id, patient_id, practitioner_id, location_id, created_by, starts_at, ends_at)
        values (${A.tenant}, ${A.pX}, ${A.otherT}, ${A.locA}, ${A.therapistT}, ${T2}, ${T3}) returning id`,
    );
    expect(ok.length).toBe(1);
  });

  it("reception CAN still insert at their OWN location without an explicit author stamp (location scope intact)", async () => {
    const ok = await asRole(sql, "authenticated", claimsFor(A.tenant, "reception", A.receptionA), (tx) =>
      tx<{ id: string }[]>`insert into appointments (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at)
        values (${A.tenant}, ${A.pX}, ${A.therapistT}, ${A.locA}, ${T2}, ${T3}) returning id`,
    );
    expect(ok.length).toBe(1);
  });

  it("PL-11: the author escape is AUTHOR-specific — you cannot write a row stamped as authored by someone else, out of your scope", async () => {
    // Reception A (LocA) stamping created_by = adminB (not self) at LocB is still
    // rejected: the escape only covers YOUR OWN authored rows; defense preserved.
    await expect(
      asRole(sql, "authenticated", claimsFor(A.tenant, "reception", A.receptionA), (tx) =>
        tx`insert into appointments (tenant_id, patient_id, practitioner_id, location_id, created_by, starts_at, ends_at)
           values (${A.tenant}, ${A.pX}, ${A.therapistT}, ${A.locB}, ${A.adminB}, ${T2}, ${T3})`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("tenant-A roles CANNOT see tenant-Z appointments; tenant-Z admin sees only its own", async () => {
    for (const claims of [
      claimsFor(A.tenant, "owner", A.ownerU),
      claimsFor(A.tenant, "reception", A.receptionA),
      claimsFor(A.tenant, "therapist", A.therapistT),
    ]) {
      expect((await visible(sql, claims)).has(Z.appt)).toBe(false);
    }
    const z = await visible(sql, claimsFor(Z.tenant, "admin", Z.admin));
    expect(z.has(Z.appt)).toBe(true);
    expect(z.has(A.apA)).toBe(false);
  });

  /* ---- CONFLICT FUNCTION (the booking-correctness fix) ---- */
  async function conflicts(
    claims: string,
    args: { practitioner: string; location: string; room: string | null; starts: string; ends: string },
  ): Promise<{ id: string; kind: string }[]> {
    return asRole(sql, "authenticated", claims, async (tx) =>
      (await tx`select id::text as id, kind from public.appointment_conflicts(
        ${args.practitioner}::uuid, ${args.location}::uuid, ${args.room}::text,
        ${args.starts}::timestamptz, ${args.ends}::timestamptz, null::uuid[])`) as { id: string; kind: string }[],
    );
  }

  it("appointment_conflicts finds a ROOM clash across therapists even when the caller can't see that patient (0047 fix)", async () => {
    // therapistT books Sala 1 @ LocA; apRoom is otherT's appointment there for a
    // patient therapistT cannot see. The scoped INNER-JOIN query would drop it;
    // the SECURITY DEFINER function still returns it.
    const found = await conflicts(claimsFor(A.tenant, "therapist", A.therapistT), {
      practitioner: A.therapistT,
      location: A.locA,
      room: "Sala 1",
      starts: W0,
      ends: W1,
    });
    expect(found.some((c) => c.id === A.apRoom && c.kind === "room")).toBe(true);
  });

  it("appointment_conflicts finds a THERAPIST clash at ANOTHER location for a location-scoped reception", async () => {
    // Reception @ LocA books therapistT; therapistT already has apTlocB @ LocB in
    // the same window. Reception cannot see LocB rows, but the check must catch it
    // (a therapist can't be in two clinics at once).
    const found = await conflicts(claimsFor(A.tenant, "reception", A.receptionA), {
      practitioner: A.therapistT,
      location: A.locA,
      room: null,
      starts: W0,
      ends: W1,
    });
    expect(found.some((c) => c.id === A.apTlocB && c.kind === "therapist")).toBe(true);
  });

  it("appointment_conflicts is tenant-walled (no cross-tenant conflicts)", async () => {
    const found = await conflicts(claimsFor(A.tenant, "owner", A.ownerU), {
      practitioner: Z.admin,
      location: Z.loc,
      room: null,
      starts: W0,
      ends: W1,
    });
    expect(found.some((c) => c.id === Z.appt)).toBe(false);
  });
});
