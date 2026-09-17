/**
 * SEC-storage-bucket-scope — the DATABASE half of the clinical-attachments
 * verdict, pinned so it cannot move without somebody noticing.
 *
 * ==========================================================================
 * WHAT THIS PROTECTS, AND WHY IT IS NOT AN APPLICATION TEST
 * ==========================================================================
 * The application guard on the attachments bucket is a tenant-prefix test
 * (`path.startsWith(`${ctx.tenantId}/`)`): it is not patient-scoped and not
 * record-scoped. PURPLE measured production on 2026-09-16 and the verdict was
 * NOT EXPOSED anyway — but the reason is entirely in the DATABASE, not in that
 * guard:
 *
 *   1. role `patient` has NO USAGE on schema `storage`, so a portal session is
 *      refused before storage-api ever authorises anything;
 *   2. `storage.objects` has RLS ENABLED with ZERO policies, which is deny-all
 *      for every role that does not hold BYPASSRLS — `authenticated` and `anon`
 *      hold SELECT, reach the RLS decision, and are denied;
 *   3. only `service_role` carries BYPASSRLS, and it is the server's own client.
 *
 * Each of those three is a property of the database that NOTHING in this repo
 * creates. They arrive with the Supabase storage schema, which means no
 * migration diff and no code review would show them changing. A policy added to
 * `storage.objects` by a dashboard click, or a USAGE grant to `patient` made to
 * "fix" a portal download, would silently convert a deny-all into an allow-some
 * and every test in this repository would stay green.
 *
 * ==========================================================================
 * ANY CHANGE HERE REQUIRES AN OWNER RULING (card SEC-storage-bucket-scope)
 * ==========================================================================
 * If one of these assertions goes red, the correct first move is NOT to update
 * the expectation. It is to stop: the access rule on patient documents has
 * changed shape, and that is an owner decision recorded on the card, not a test
 * maintenance chore. The card is open on purpose and names the two facts that
 * are still unruled — that the patient refusal currently rides on an internal
 * storage-api error path, and that a signed URL is a bearer token.
 *
 * ==========================================================================
 * IT ASSERTS THE TABLE EXISTS FIRST, SO IT CANNOT PASS VACUOUSLY
 * ==========================================================================
 * CI boots Supabase with `-x ...,storage,...`, which the CLI REJECTS as an
 * invalid container name (it prints a warning and starts storage-api anyway), so
 * `storage.objects` is present on the CI database today. That is a fact about a
 * typo, and typos get fixed. If storage-api ever really is excluded, the first
 * `it` goes red with a legible message instead of the rest quietly asserting
 * nothing about a table that is not there.
 */
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connect, live } from "./rls-harness";

describe.skipIf(!live)("storage.objects is deny-by-default, and `patient` cannot reach schema storage", () => {
  let sql: Sql;

  beforeAll(() => {
    sql = connect();
  });

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
  });

  it("storage.objects EXISTS on this database — every assertion below is about a real table", async () => {
    const rows = await sql<{ objects: string | null }[]>`
      select to_regclass('storage.objects')::text as objects`;
    expect(
      rows[0]?.objects,
      "storage.objects is absent: storage-api did not run, so the three assertions below would prove nothing",
    ).toBe("storage.objects");
  });

  it("role `patient` holds NO USAGE on schema storage — the portal is refused before RLS is even consulted", async () => {
    const rows = await sql<{ usage: boolean }[]>`
      select has_schema_privilege('patient', 'storage', 'USAGE') as usage`;
    expect(rows[0]?.usage).toBe(false);
  });

  it("RLS is ENABLED on storage.objects", async () => {
    const rows = await sql<{ enabled: boolean }[]>`
      select relrowsecurity as enabled from pg_class where oid = 'storage.objects'::regclass`;
    expect(rows[0]?.enabled).toBe(true);
  });

  it("storage.objects carries ZERO policies — RLS with no policy is deny-all, and that IS the access rule", async () => {
    const rows = await sql<{ n: string }[]>`
      select count(*)::text as n from pg_policies
       where schemaname = 'storage' and tablename = 'objects'`;
    expect(
      Number(rows[0]?.n),
      "a policy on storage.objects grants access that nothing in this repo reviews",
    ).toBe(0);
  });
});
