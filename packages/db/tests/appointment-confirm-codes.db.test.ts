/**
 * MIGRATION 0072 — appointment_confirm_codes, and the ONE door into it.
 * SR-26 as amended by SR-28, SR-29, SR-30.
 *
 * ==========================================================================
 * WHAT THIS FILE PROVES AND WHAT IT DELIBERATELY DOES NOT
 * ==========================================================================
 * SR-30 requires that a CONSUMED code and a FORGED code be indistinguishable
 * "in output AND in timing". That is a property of the ROUTE's response, not of
 * this schema, and it cannot be proved here: `resolve_confirm_code` MUST tell
 * them apart, because the route needs `consumed_at` to decide which of JP's four
 * messages to render. The indistinguishability is created one layer up, by
 * mapping unknown, expired and consumed onto one generic reply.
 *
 * So those two assertions land with the route, in the CONFIRM-01 TASK 4 work,
 * and saying so here is the point rather than an omission: a test file that
 * claimed to prove them would be proving something else.
 *
 * WHAT IS PROVED HERE is the half a migration can own: the shape, the
 * constraint, the one-live-code rule, and — the reason SR-29 exists — that the
 * table is reachable from exactly one place and that `anon` and `patient` cannot
 * touch it at all.
 *
 * GATING: needs a live privileged DATABASE_URL with 0072 applied.
 */
import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

const F = {
  tenant: randomUUID(),
  otherTenant: randomUUID(),
  userU: randomUUID(),
  loc: randomUUID(),
  patient: randomUUID(),
  appt: randomUUID(),
  apptTwo: randomUUID(),
};

/**
 * The stored value is an HMAC in production; any 64-hex string satisfies the
 * CHECK. What matters here is that it is RUN-SCOPED.
 *
 * THE FIRST VERSION OF THIS HELPER HASHED THE LABEL ALONE and collided with
 * itself on the second run: `code_hash` is the PRIMARY KEY and was therefore
 * identical across runs while every other fixture id was `randomUUID()`. A run
 * whose afterAll did not complete left rows behind, and the next run failed in
 * beforeAll on `duplicate key value violates unique constraint
 * appointment_confirm_codes_pkey` - which reads like a defect in the migration
 * and is not.
 *
 * That is the same class as LE-db-test-fixture-ids-collide, written into a new
 * file the same day the card was raised. Salting with the run's own tenant is
 * the construction fix: identity means RUN-SCOPED identity, never a shared
 * fixture's name.
 */
const hashOf = (code: string) =>
  createHash("sha256").update(`${F.tenant}:${code}`).digest("hex");
const LIVE_CODE = hashOf("live-code");
const SPENT_CODE = hashOf("spent-code");
const FORGED = hashOf("never-issued");

const T0 = "2026-06-06T09:00:00Z";
const T1 = "2026-06-06T10:00:00Z";

async function seed(p: Sql): Promise<void> {
  await p`insert into tenants (id, name, slug) values (${F.tenant}, 'C0072', ${`c0072-${F.tenant}`})`;
  await p`insert into users (id, tenant_id, email, full_name)
          values (${F.userU}, ${F.tenant}, ${`u-${F.userU}@x.pt`}, 'U')`;
  await p`insert into locations (id, tenant_id, name) values (${F.loc}, ${F.tenant}, 'L')`;
  await p`insert into patients (id, tenant_id, full_name) values (${F.patient}, ${F.tenant}, 'P')`;
  await p`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at)
          values (${F.appt},    ${F.tenant}, ${F.patient}, ${F.userU}, ${F.loc}, ${T0}, ${T1}),
                 (${F.apptTwo}, ${F.tenant}, ${F.patient}, ${F.userU}, ${F.loc}, ${T0}, ${T1})`;
  await p`insert into appointment_confirm_codes (code_hash, tenant_id, appointment_id)
          values (${LIVE_CODE}, ${F.tenant}, ${F.appt})`;
  await p`insert into appointment_confirm_codes (code_hash, tenant_id, appointment_id, consumed_at)
          values (${SPENT_CODE}, ${F.tenant}, ${F.apptTwo}, now())`;
}

describe.skipIf(!live)("0072 appointment_confirm_codes", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    await seed(sql);
  });

  afterAll(async () => {
    await sql`delete from appointment_confirm_codes where tenant_id = ${F.tenant}`;
    await sql`delete from appointments where tenant_id = ${F.tenant}`;
    await sql`delete from patients where tenant_id = ${F.tenant}`;
    await sql`delete from locations where tenant_id = ${F.tenant}`;
    await sql`delete from users where tenant_id = ${F.tenant}`;
    await sql`delete from tenants where id = ${F.tenant}`;
    await sql.end();
  });

  /* ================================================================ */
  /* THE SHAPE                                                         */
  /* ================================================================ */

  it("rejects a code_hash that is not 64 hex characters", async () => {
    for (const bad of ["", "not-hex", LIVE_CODE.slice(0, 63), LIVE_CODE.toUpperCase()]) {
      await expect(
        sql`insert into appointment_confirm_codes (code_hash, tenant_id, appointment_id)
            values (${bad}, ${F.tenant}, ${F.appt})`,
      ).rejects.toThrow();
    }
  });

  it("has NO expires_at column - expiry is read from the appointment", async () => {
    // SR-28, and it is the W13-01 defect generalised: never store a copy of a
    // value another row owns and can change. A reschedule moves starts_at, and a
    // stored expiry would then outlive the appointment it belongs to.
    const [row] = (await sql`
      select count(*)::int as n from information_schema.columns
       where table_name = 'appointment_confirm_codes' and column_name = 'expires_at'`) as {
      n: number;
    }[];
    expect(row!.n).toBe(0);
  });

  it("allows only ONE LIVE code per appointment, and a spent one does not block a new one", async () => {
    // A retried reminder send must not mint a second live code.
    await expect(
      sql`insert into appointment_confirm_codes (code_hash, tenant_id, appointment_id)
          values (${hashOf("second-live")}, ${F.tenant}, ${F.appt})`,
    ).rejects.toThrow();

    // But apptTwo's code is CONSUMED, so a fresh one is permitted - that is what
    // makes the index PARTIAL rather than plain.
    const fresh = hashOf("after-consumption");
    await sql`insert into appointment_confirm_codes (code_hash, tenant_id, appointment_id)
              values (${fresh}, ${F.tenant}, ${F.apptTwo})`;
    await sql`delete from appointment_confirm_codes where code_hash = ${fresh}`;
  });

  it("cascades when the appointment is deleted, leaving no orphan code", async () => {
    const a = randomUUID();
    const c = hashOf("cascade-me");
    await sql`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at)
              values (${a}, ${F.tenant}, ${F.patient}, ${F.userU}, ${F.loc}, ${T0}, ${T1})`;
    await sql`insert into appointment_confirm_codes (code_hash, tenant_id, appointment_id)
              values (${c}, ${F.tenant}, ${a})`;
    await sql`delete from appointments where id = ${a}`;
    const rows = await sql`select 1 from appointment_confirm_codes where code_hash = ${c}`;
    expect(rows).toHaveLength(0);
  });

  /* ================================================================ */
  /* SR-29 — THE TABLE IS REACHABLE FROM EXACTLY ONE PLACE             */
  /* ================================================================ */

  it("RLS is enabled on the table", async () => {
    const [row] = (await sql`
      select relrowsecurity from pg_class where relname = 'appointment_confirm_codes'`) as {
      relrowsecurity: boolean;
    }[];
    expect(row!.relrowsecurity).toBe(true);
  });

  for (const role of ["patient", "authenticated"] as const) {
    it(`direct SELECT on the table is REFUSED for ${role}`, async () => {
      // The grants are revoked, so this fails at the table gate before RLS is
      // even consulted. Both locks, and this asserts the outer one.
      await expect(
        asRole(sql, role, claimsFor(F.tenant, "reception", F.userU), (tx) =>
          tx`select code_hash from appointment_confirm_codes`,
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    it(`direct INSERT on the table is REFUSED for ${role}`, async () => {
      await expect(
        asRole(sql, role, claimsFor(F.tenant, "reception", F.userU), (tx) =>
          tx`insert into appointment_confirm_codes (code_hash, tenant_id, appointment_id)
             values (${hashOf("smuggled")}, ${F.tenant}, ${F.appt})`,
        ),
      ).rejects.toThrow(/permission denied/i);
    });
  }

  it("anon cannot read the table either", async () => {
    // `anon` is not in asRole's union because nothing else in this schema uses
    // it, so the role switch is done directly. It is the role an unauthenticated
    // Supabase request would arrive as, which is exactly the threat SR-29 names.
    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe("set local role anon");
        return tx`select code_hash from appointment_confirm_codes`;
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  /* ================================================================ */
  /* THE ONE DOOR                                                      */
  /* ================================================================ */

  it("resolve_confirm_code returns EXACTLY three columns, and not the table rowtype", async () => {
    // Returning the rowtype would mean a column added to the table later silently
    // widens what an unauthenticated route can see. The signature is the guard.
    const rows = (await sql`
      select unnest(proargnames) as name from pg_proc
       where proname = 'resolve_confirm_code'`) as { name: string }[];
    const outs = rows.map((r) => r.name).filter((n) => n !== "p_code_hash");
    expect(outs).toEqual(["tenant_id", "appointment_id", "consumed_at"]);
  });

  it("is SECURITY DEFINER, STABLE, and owned by postgres", async () => {
    const [row] = (await sql`
      select p.prosecdef, p.provolatile, r.rolname as owner
        from pg_proc p join pg_roles r on r.oid = p.proowner
       where p.proname = 'resolve_confirm_code'`) as {
      prosecdef: boolean;
      provolatile: string;
      owner: string;
    }[];
    expect(row!.prosecdef).toBe(true);
    expect(row!.provolatile).toBe("s"); // STABLE: a read can never spend a code
    expect(row!.owner).toBe("postgres");
  });

  it("resolves a live code through the function, under a role with NO table access", async () => {
    // The whole design in one assertion: `authenticated` cannot read the table
    // (asserted above) and CAN read this row through the function.
    const rows = await asRole(sql, "authenticated", null, (tx) =>
      tx`select tenant_id::text, appointment_id::text, consumed_at
           from resolve_confirm_code(${LIVE_CODE})`,
    );
    expect(rows).toHaveLength(1);
    expect((rows[0] as { tenant_id: string }).tenant_id).toBe(F.tenant);
    expect((rows[0] as { appointment_id: string }).appointment_id).toBe(F.appt);
    expect((rows[0] as { consumed_at: Date | null }).consumed_at).toBeNull();
  });

  it("returns NO ROW for a code that was never issued", async () => {
    const rows = await asRole(sql, "authenticated", null, (tx) =>
      tx`select * from resolve_confirm_code(${FORGED})`,
    );
    expect(rows).toHaveLength(0);
  });

  it("returns the row WITH consumed_at set for a spent code", async () => {
    // The function MUST distinguish spent from unknown - the route needs it to
    // pick between JP's messages. Making the two indistinguishable is the
    // ROUTE's job (SR-30) and is asserted with the route, not here.
    const rows = await asRole(sql, "authenticated", null, (tx) =>
      tx`select consumed_at from resolve_confirm_code(${SPENT_CODE})`,
    );
    expect(rows).toHaveLength(1);
    expect((rows[0] as { consumed_at: Date | null }).consumed_at).not.toBeNull();
  });

  it("anon holds NO EXECUTE on the function - the PostgREST RPC hole", async () => {
    // FOUND BY RUNNING THE APPLY RECEIPT'S OWN POST-CHECK, not by reading the
    // migration. Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on a new
    // function to `anon`, and `REVOKE ... FROM PUBLIC` does NOT touch a
    // privilege held by a NAMED role. The function was therefore callable as
    // /rest/v1/rpc/resolve_confirm_code by an unauthenticated request, which
    // would let anyone enumerate codes WITHOUT passing the application's rate
    // limiter - the one control this design leans on.
    //
    // ==========================================================================
    // THE PRIVILEGE IS ASSERTED, NOT THE ATTEMPT, AND THAT IS NOT A SHORTCUT.
    // ==========================================================================
    // `set local role anon; select public.resolve_confirm_code(...)` SEGFAULTS
    // the backend on supabase/postgres:17.6.1.106 - signal 11, the database
    // enters recovery and every connection is dropped. It is NOT this function:
    // a bare `CREATE FUNCTION f(text) RETURNS text LANGUAGE sql` reproduces it
    // identically, while the SAME call as `authenticated` returns a clean
    // "permission denied for function" and as `anon` WITH the grant returns
    // normally. It is the `anon` role on that image.
    //
    // So attempting the call here would assert nothing and would take the test
    // database down with it. The GRANT is the property; the attempt was only
    // ever a way of observing it.
    const rows = (await sql`
      select grantee from information_schema.role_routine_grants
       where routine_name = 'resolve_confirm_code'`) as { grantee: string }[];
    const grantees = rows.map((r) => r.grantee);
    expect(grantees).not.toContain("anon");
    expect(grantees).not.toContain("patient");
    expect(grantees).not.toContain("PUBLIC");
    // And the one role that must have it, does.
    expect(grantees).toContain("authenticated");
  });

  it("patient cannot execute it either", async () => {
    await expect(
      asRole(sql, "patient", null, (tx) => tx`select * from resolve_confirm_code(${LIVE_CODE})`),
    ).rejects.toThrow(/permission denied/i);
  });

  it("cannot be steered: it takes a hash and returns rows only for an exact match", async () => {
    // No LIKE, no prefix, no wildcard. A partial hash resolves nothing.
    for (const probe of [LIVE_CODE.slice(0, 32), "%", "_".repeat(64)]) {
      const rows = await asRole(sql, "authenticated", null, (tx) =>
        tx`select * from resolve_confirm_code(${probe})`,
      );
      expect(rows).toHaveLength(0);
    }
  });

  it("does not leak across tenants by itself - the CALLER must scope what follows", async () => {
    // Stated as a test because it is the one thing the SECURITY DEFINER crossing
    // gives up: the function answers for ANY tenant, by design, because the
    // route cannot know the tenant before it asks. What it returns is the
    // tenant_id the caller must then enter RLS with, and nothing else about the
    // appointment. Three columns is the whole of the exposure.
    const rows = (await asRole(sql, "authenticated", claimsFor(F.otherTenant, "reception", F.userU), (tx) =>
      tx`select tenant_id::text from resolve_confirm_code(${LIVE_CODE})`,
    )) as { tenant_id: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tenant_id).toBe(F.tenant);
    expect(rows[0]!.tenant_id).not.toBe(F.otherTenant);
  });
});
