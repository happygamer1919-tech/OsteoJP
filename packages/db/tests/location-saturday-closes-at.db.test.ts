/**
 * location-saturday-closes-at.db.test.ts: HOR-02, one nullable Saturday closing
 * time per clinic (packages/db/migrations/0109_location_saturday_closes_at.sql).
 *
 * The file is in packages/db/migrations, so every database these suites run on
 * (CI's db-tests applies supabase/migrations, its mirror) must have the column.
 * A database without it FAILS here rather than skipping: the staff app reads the
 * column by name once it exists, and "absent" is only acceptable on a database
 * built before this migration, which is not what this suite is for.
 *
 * WHAT IT MEASURES:
 *   - THE COLUMN: `time`, nullable, no default, and a clinic written without it
 *     reads NULL (no Saturday hours recorded);
 *   - THE CHECK, by its NAME (locations_saturday_after_open), with every NOT
 *     NULL column filled so no other constraint can refuse in its place: a
 *     closing time at or before `opens_at` is refused, a later one and NULL are
 *     admitted;
 *   - NO NEW PRIVILEGE: every grantee holds on the new column exactly what it
 *     holds on `opens_at`, so the column is read and written by the roles that
 *     already read and write the clinic's hours, and by nobody else;
 *   - THE READERS, under real RLS (`set local role authenticated` and staff
 *     claims, always rolled back): staff of the clinic's tenant read the value,
 *     staff of another tenant read no row of it, beside reading their own
 *     tenant's row so "nothing" is never a pass on an empty set.
 *
 * Every id is random per run, and afterAll removes what beforeAll wrote.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

const CHECK_NAME = "locations_saturday_after_open";
const d = live ? describe : describe.skip;

d("HOR-02: locations.saturday_closes_at", () => {
  let sql: Sql;
  const tenant = randomUUID();
  const other = randomUUID();
  const withSat = randomUUID();
  const withoutSat = randomUUID();
  const otherLoc = randomUUID();

  beforeAll(async () => {
    sql = connect();
    for (const [id, slug] of [
      [tenant, "hor02-a"],
      [other, "hor02-b"],
    ] as const) {
      await sql`insert into tenants (id, name, slug) values (${id}, ${slug}, ${slug + "-" + id.slice(0, 8)})`;
    }
    await sql`insert into locations (id, tenant_id, name, opens_at, closes_at, saturday_closes_at)
      values (${withSat}, ${tenant}, 'Com sabado', '08:00', '21:00', '13:00')`;
    await sql`insert into locations (id, tenant_id, name, opens_at, closes_at)
      values (${withoutSat}, ${tenant}, 'Sem sabado', '08:00', '21:00')`;
    await sql`insert into locations (id, tenant_id, name, opens_at, closes_at, saturday_closes_at)
      values (${otherLoc}, ${other}, 'Outra', '08:00', '21:00', '14:00')`;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from locations where tenant_id in (${tenant}, ${other})`;
    await sql`delete from tenants where id in (${tenant}, ${other})`;
    await sql.end({ timeout: 5 });
  });

  it("the column is a nullable time with no default", async () => {
    const rows = await sql<{ data_type: string; is_nullable: string; column_default: string | null }[]>`
      select data_type, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'locations' and column_name = 'saturday_closes_at'`;
    expect(rows).toEqual([{ data_type: "time without time zone", is_nullable: "YES", column_default: null }]);
  });

  it("a clinic written without it reads NULL, and one written with it reads the value", async () => {
    const rows = await sql<{ id: string; sat: string | null }[]>`
      select id::text, saturday_closes_at::text as sat from locations
       where id in (${withSat}, ${withoutSat}) order by name`;
    expect(Object.fromEntries(rows.map((r) => [r.id, r.sat]))).toEqual({
      [withSat]: "13:00:00",
      [withoutSat]: null,
    });
  });

  it.each([
    ["before opening", "07:00", false],
    ["at opening", "08:00", false],
    ["after opening", "08:30", true],
    ["NULL", null, true],
  ] as const)("the CHECK: a Saturday closing time %s is %s", async (_label, value, admitted) => {
    const id = randomUUID();
    let refusedBy: string | null = null;
    try {
      await sql`insert into locations (id, tenant_id, name, opens_at, closes_at, saturday_closes_at)
        values (${id}, ${tenant}, ${"probe-" + id.slice(0, 8)}, '08:00', '21:00', ${value}::time)`;
    } catch (e) {
      refusedBy = (e as { constraint_name?: string }).constraint_name ?? `other:${String(e)}`;
    } finally {
      await sql`delete from locations where id = ${id}`;
    }
    expect(refusedBy).toBe(admitted ? null : CHECK_NAME);
  });

  it("no new privilege: every grantee holds on it exactly what it holds on opens_at", async () => {
    const rows = await sql<{ column_name: string; grantee: string; privs: string }[]>`
      select column_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
        from information_schema.column_privileges
       where table_schema = 'public' and table_name = 'locations'
         and column_name in ('opens_at', 'saturday_closes_at')
       group by column_name, grantee order by grantee, column_name`;
    const of = (col: string) =>
      Object.fromEntries(rows.filter((r) => r.column_name === col).map((r) => [r.grantee, r.privs]));
    expect(Object.keys(of("opens_at")).length).toBeGreaterThan(0);
    expect(of("saturday_closes_at")).toEqual(of("opens_at"));
    expect(of("saturday_closes_at")).not.toHaveProperty("anon");
  });

  it("staff read their own tenant's value and no row of another tenant", async () => {
    const seen = await asRole(sql, "authenticated", claimsFor(tenant, "reception"), async (tx) =>
      tx<{ id: string; sat: string | null }[]>`
        select id::text, saturday_closes_at::text as sat from locations
         where id in (${withSat}, ${otherLoc})`,
    );
    expect(seen).toEqual([{ id: withSat, sat: "13:00:00" }]);
  });
});
