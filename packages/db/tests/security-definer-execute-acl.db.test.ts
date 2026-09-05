/**
 * security-definer-execute-acl.db.test.ts — 0079's gate.
 *
 * ==========================================================================
 * IT ASKS `has_function_privilege`, NOT "is there a service_role= ACLITEM"
 * ==========================================================================
 * This is the whole point of the file, and 0079's first draft is why it is
 * stated this loudly.
 *
 * The rule everybody in this repo already knows, from 0075's header and from
 * the card 0079 closes, is:
 *
 *     REVOKE ... FROM PUBLIC does not remove a privilege a NAMED role holds.
 *
 * So 0079 was first written to revoke `service_role` BY NAME on all twenty
 * functions, and a catalogue read that looked for a `service_role=` grantee
 * reported all twenty clean. IT WAS WRONG ON ELEVEN OF THEM. Those eleven also
 * carried `=X/postgres` — an EMPTY grantee before the `=` is PUBLIC — and every
 * role is a member of PUBLIC, so `service_role` could still execute every one.
 * The converse rule is equally true and was nowhere written down:
 *
 *     REVOKE ... FROM A NAMED ROLE does not remove a privilege PUBLIC holds.
 *
 * A CHECK THAT LOOKS FOR A GRANTEE BY NAME CANNOT SEE A GRANT MADE TO EVERYBODY.
 * `has_function_privilege(role, oid, 'EXECUTE')` answers the question actually
 * being asked — CAN this role execute this function — and does not care which
 * side of the ACL the privilege arrived on. Every assertion below is phrased
 * that way for that reason.
 *
 * ==========================================================================
 * THE PRIVILEGE IS READ, NEVER EXERCISED
 * ==========================================================================
 * There is no `set role service_role; select f()` here and there must not be.
 * On Supabase's Postgres a role calling a SECURITY DEFINER function it lacks
 * EXECUTE on has been observed to take the backend down rather than raise
 * `permission denied`, so a suite that proved the revoke by attempting the call
 * would be a suite that crashes the database it is asserting about. The
 * catalogue is the safe oracle and it is also the exact one: EXECUTE is a
 * property of the ACL, not of a call's outcome.
 *
 * ==========================================================================
 * BOTH DIRECTIONS, BECAUSE A REVOKE-EVERYTHING MIGRATION WOULD PASS HALF
 * ==========================================================================
 * "service_role can execute none" and "anon can execute none" are satisfied
 * perfectly by a migration that revokes EXECUTE from every role on earth — and
 * that migration takes the clinic's own application down. So the roles that
 * MUST keep their access are asserted in the same file: `authenticated` on the
 * twenty, `patient` on the three the portal needs, and `supabase_auth_admin` on
 * the token hook it is the only caller of.
 */
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connect, live } from "./rls-harness";

const d = live ? describe : describe.skip;

/**
 * The three the PORTAL reaches as the login-less `patient` role. They are named
 * rather than counted because losing one is a silent portal outage: the policies
 * that call them are the portal's own, and a patient with no EXECUTE sees an
 * empty page rather than an error.
 */
const PORTAL_FUNCTIONS = ["jwt_tenant_id", "jwt_patient_id", "is_unconfirmed_pedido"];

d("0079: no untrusted role can execute a SECURITY DEFINER function", () => {
  let sql: Sql;

  beforeAll(() => {
    sql = connect();
  });
  afterAll(async () => {
    await sql.end();
  });

  /** Every SECURITY DEFINER function in `public`, with one role's effective EXECUTE. */
  async function canExecute(role: string): Promise<{ name: string; allowed: boolean }[]> {
    const rows = await sql<{ name: string; allowed: boolean }[]>`
      select p.proname as name,
             has_function_privilege(${role}, p.oid, 'EXECUTE') as allowed
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
       order by p.proname`;
    return rows;
  }

  /**
   * The set is not empty. Without this every assertion below passes vacuously
   * against a database where the functions were never created — the failure
   * mode ACC-vacuous-guard-sweep exists for.
   */
  it("there are SECURITY DEFINER functions to talk about", async () => {
    const rows = await canExecute("authenticated");
    expect(rows.length).toBeGreaterThanOrEqual(21);
  });

  for (const role of ["service_role", "anon"]) {
    it(`${role} can execute NONE of them`, async () => {
      const rows = await canExecute(role);
      // The NAMES of the offenders, not a count: a bare number sends the next
      // reader back to the catalogue to find out which function regressed.
      expect(rows.filter((r) => r.allowed).map((r) => r.name)).toEqual([]);
    });
  }

  /**
   * A NULL `proacl` is the built-in default, under which PUBLIC — and therefore
   * every role — has EXECUTE and nothing was ever revoked. A REVOKE cannot
   * produce that state, but a later CREATE FUNCTION that forgets its grants can,
   * and the two roles above would then both regress at once.
   */
  it("no SECURITY DEFINER function is left on the built-in default ACL", async () => {
    const rows = await sql<{ name: string }[]>`
      select p.proname as name
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef and p.proacl is null
       order by p.proname`;
    expect(rows.map((r) => r.name)).toEqual([]);
  });

  it("authenticated keeps every one except the token hook and the trigger", async () => {
    const rows = await canExecute("authenticated");
    const denied = rows.filter((r) => !r.allowed).map((r) => r.name).sort();
    /**
     * The TWO exceptions, asserted as an equality so a third cannot appear
     * quietly — and asserted at all because "no untrusted role can execute
     * anything" is satisfied perfectly by a migration that takes the clinic's
     * own application down with it.
     *
     *   custom_access_token_hook  0002 revokes it from authenticated by name.
     *                             supabase_auth_admin is its only caller.
     *   assign_patient_number     a TRIGGER function, which needs no EXECUTE at
     *                             fire time. No migration ever granted it to
     *                             anybody.
     *   jwt_patient_id            a PORTAL helper. Every policy that calls it is
     *                             scoped TO patient, and such a policy is never
     *                             evaluated for an authenticated session.
     *
     * All three are revoked from `authenticated` by 0079 rather than left to
     * whatever the CREATE-time default privilege happened to do, so this list is
     * the same on CI, on a lane and on production.
     */
    expect(denied).toEqual([
      "assign_patient_number",
      "custom_access_token_hook",
      "jwt_patient_id",
    ]);
  });

  it("patient keeps the three the portal runs on", async () => {
    const rows = await canExecute("patient");
    const allowed = rows.filter((r) => r.allowed).map((r) => r.name).sort();
    expect(allowed).toEqual([...PORTAL_FUNCTIONS].sort());
  });

  it("supabase_auth_admin keeps the token hook it is the only caller of", async () => {
    const [row] = await sql<{ allowed: boolean }[]>`
      select has_function_privilege('supabase_auth_admin', p.oid, 'EXECUTE') as allowed
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'custom_access_token_hook'`;
    expect(row?.allowed).toBe(true);
  });
});
