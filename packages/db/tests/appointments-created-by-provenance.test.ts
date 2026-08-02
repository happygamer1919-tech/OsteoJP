/**
 * appointments-created-by-provenance.test.ts
 *
 * S4: is `created_by IS NULL` a RELIABLE marker for a portal/patient booking?
 *
 * WHY THIS EXISTS. A partial EXCLUDE constraint scoped to portal rows
 * (`WHERE ... AND created_by IS NULL`) is only correct if a STAFF row can never
 * carry a null `created_by`. It was argued that migration 0049's RLS WITH CHECK
 * enforces that, because the policy references `created_by = auth.uid()`.
 *
 * THAT ARGUMENT IS WRONG, and this suite is the exit code that proves it rather
 * than another reading of the policy. 0049's WITH CHECK is a DISJUNCTION:
 *
 *     created_by = auth.uid()
 *     OR jwt_role() = 'owner'
 *     OR (jwt_role() = 'therapist' AND practitioner_id/practitioner_2_id = auth.uid())
 *     OR (jwt_role() IN ('admin','reception') AND location in viewer scope)
 *
 * `created_by = auth.uid()` is ONE branch of four. Any staff principal that
 * satisfies a different branch may insert with `created_by` null and the
 * database accepts it. RLS constrains WHO may write and WHICH rows they may
 * see; it does not require this column to be populated.
 *
 * WHAT THAT MEANS FOR CALLERS. `created_by IS NULL` is an APPLICATION
 * CONVENTION, upheld by the three staff write paths that set it
 * (apps/web/lib/scheduling/actions.ts, clone-core.ts, batch.ts) and by the
 * static write-path test, NOT by the database. A partial constraint keyed on it
 * inherits that weakness: a staff path that ever omits created_by would place a
 * staff row inside the constrained set, and a legitimate deliberate
 * double-booking would then be rejected by Postgres.
 *
 * This suite therefore asserts the behaviour that ACTUALLY holds. If someone
 * later adds real enforcement (a NOT NULL default, a trigger, or a WITH CHECK
 * that requires the column), these tests go RED — which is the correct signal,
 * because at that point `created_by IS NULL` WOULD be a database guarantee and
 * this file's conclusion would need revisiting.
 *
 * CORRECTNESS. RLS is ENABLE-not-FORCE, so every assertion runs on the
 * role-switched `authenticated` connection via asRole (never the owner, which
 * BYPASSes RLS). asRole always rolls back, so nothing here persists. A negative
 * control (a cross-tenant insert IS refused) makes a vacuous pass impossible: if
 * RLS were silently off, that control would fail and the rest would be
 * meaningless.
 *
 * GATING: requires a live privileged DATABASE_URL with migrations applied.
 * Skipped without one, identical to the other packages/db suites.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

type Ids = {
  tenant: string;
  role: string;
  user: string;
  location: string;
  service: string;
  patient: string;
};

const newIds = (): Ids => ({
  tenant: randomUUID(),
  role: randomUUID(),
  user: randomUUID(),
  location: randomUUID(),
  service: randomUUID(),
  patient: randomUUID(),
});

const A = newIds();
const B = newIds();

const START = "2026-10-05T09:00:00Z";
const END = "2026-10-05T10:00:00Z";

async function seed(sql: Sql, x: Ids): Promise<void> {
  await sql`insert into tenants (id, name, slug)
            values (${x.tenant}, 'Provenance Gate', ${`prov-gate-${x.tenant}`})`;
  await sql`insert into roles (id, tenant_id, slug, name)
            values (${x.role}, ${x.tenant}, 'therapist', 'Therapist')`;
  await sql`insert into users (id, tenant_id, role_id, email, full_name)
            values (${x.user}, ${x.tenant}, ${x.role}, ${`p-${x.user}@example.pt`}, 'Seed Therapist')`;
  await sql`insert into locations (id, tenant_id, name)
            values (${x.location}, ${x.tenant}, 'Linda-a-Velha')`;
  await sql`insert into services (id, tenant_id, location_id, name)
            values (${x.service}, ${x.tenant}, ${x.location}, 'Consulta')`;
  await sql`insert into patients (id, tenant_id, full_name)
            values (${x.patient}, ${x.tenant}, 'Seed Patient')`;
}

/** Insert one appointment with an explicit created_by (may be null). */
async function insertAppointment(
  tx: Parameters<Parameters<typeof asRole>[3]>[0],
  x: Ids,
  createdBy: string | null,
): Promise<string[]> {
  const rows = await tx`
    insert into appointments
      (tenant_id, patient_id, practitioner_id, location_id, service_id,
       starts_at, ends_at, status, created_by)
    values
      (${x.tenant}, ${x.patient}, ${x.user}, ${x.location}, ${x.service},
       ${START}, ${END}, 'scheduled', ${createdBy})
    returning id`;
  return rows.map((r) => r.id as string);
}

describe.skipIf(!live)("S4 — created_by provenance is NOT database-enforced", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    await seed(sql, A);
    await seed(sql, B);
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from tenants where id in (${A.tenant}, ${B.tenant})`;
    await sql.end();
  });

  it("NEGATIVE CONTROL: RLS is actually in force (cross-tenant insert is refused)", async () => {
    // If this passes vacuously, every other assertion here is worthless.
    await expect(
      asRole(sql, "authenticated", claimsFor(B.tenant, "owner", B.user), (tx) =>
        // Claims say tenant B; the row says tenant A. WITH CHECK must refuse it.
        insertAppointment(tx, A, A.user),
      ),
    ).rejects.toThrow();
  });

  it("POSITIVE CONTROL: a well-formed staff insert with created_by set succeeds", async () => {
    const ids = await asRole(
      sql,
      "authenticated",
      claimsFor(A.tenant, "owner", A.user),
      (tx) => insertAppointment(tx, A, A.user),
    );
    expect(ids).toHaveLength(1);
  });

  it("an OWNER may insert with created_by NULL — the database does NOT refuse it", async () => {
    // Satisfies WITH CHECK via `jwt_role() = 'owner'`, never touching created_by.
    const ids = await asRole(
      sql,
      "authenticated",
      claimsFor(A.tenant, "owner", A.user),
      (tx) => insertAppointment(tx, A, null),
    );
    expect(ids).toHaveLength(1);
  });

  it("an ADMIN with no location assignment may insert with created_by NULL", async () => {
    // Satisfies WITH CHECK via the admin/reception branch
    // (NOT viewer_has_location_assignment()), never touching created_by.
    const ids = await asRole(
      sql,
      "authenticated",
      claimsFor(A.tenant, "admin", A.user),
      (tx) => insertAppointment(tx, A, null),
    );
    expect(ids).toHaveLength(1);
  });

  it("a RECEPTION user with no location assignment may insert with created_by NULL", async () => {
    const ids = await asRole(
      sql,
      "authenticated",
      claimsFor(A.tenant, "reception", A.user),
      (tx) => insertAppointment(tx, A, null),
    );
    expect(ids).toHaveLength(1);
  });

  it("a THERAPIST self-booking may insert with created_by NULL", async () => {
    // Satisfies WITH CHECK via `practitioner_id = auth.uid()`. A.user is both the
    // acting subject and the practitioner on the row.
    const ids = await asRole(
      sql,
      "authenticated",
      claimsFor(A.tenant, "therapist", A.user),
      (tx) => insertAppointment(tx, A, null),
    );
    expect(ids).toHaveLength(1);
  });

  it("CONCLUSION: no staff role is forced to populate created_by", async () => {
    // Restates the four cases above as one explicit finding, so a reader of the
    // report does not have to assemble it from individual test names.
    const roles = ["owner", "admin", "reception", "therapist"] as const;
    const accepted: string[] = [];
    for (const role of roles) {
      const ids = await asRole(
        sql,
        "authenticated",
        claimsFor(A.tenant, role, A.user),
        (tx) => insertAppointment(tx, A, null),
      );
      if (ids.length === 1) accepted.push(role);
    }
    // All four accepted => created_by IS NULL cannot distinguish a portal row
    // from a staff row at the database level.
    expect(accepted).toEqual(["owner", "admin", "reception", "therapist"]);
  });
});
