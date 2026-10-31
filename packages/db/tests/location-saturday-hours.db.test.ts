/**
 * location-saturday-hours.db.test.ts: HOR-02, a Saturday opening AND closing
 * time per clinic (packages/db/migrations/0109_location_saturday_hours.sql).
 *
 * WHY TWO COLUMNS. The owner answered on 2026-10-31: "Saturday hours per
 * clinic: 9am to 1pm, sunday closed", while every clinic opens at 08:00 on
 * weekdays. A Saturday therefore has its own opening time, never the weekday
 * one.
 *
 * The file is in packages/db/migrations, so every database these suites run on
 * (CI's db-tests applies supabase/migrations, its mirror) must have the columns.
 * A database without them FAILS here rather than skipping: the staff app reads
 * the columns by name once both exist, and "absent" is only acceptable on a
 * database built before this migration, which is not what this suite is for.
 *
 * WHAT IT MEASURES:
 *   - THE COLUMNS: both `time`, nullable, no default, and a clinic written
 *     without them reads NULL in both (no Saturday hours recorded);
 *   - THE CHECK, by its NAME (locations_saturday_hours_valid), with every NOT
 *     NULL column filled so no other constraint can refuse in its place: both
 *     NULL and both set (closing after opening) are admitted; one end alone,
 *     closing at opening and closing before opening are refused. One arm closes
 *     after the WEEKDAY opening but before the Saturday one, which a CHECK
 *     against the weekday opening time would admit;
 *   - NO NEW PRIVILEGE: every grantee holds on each new column exactly what it
 *     holds on the weekday `opens_at` column, so the columns are read and
 *     written by the roles that already read and write the clinic's hours,
 *     and by nobody else;
 *   - THE READERS, under real RLS (`set local role authenticated` and staff
 *     claims, always rolled back): staff of the clinic's tenant read the values,
 *     staff of another tenant read no row of them, beside reading their own
 *     tenant's row so "nothing" is never a pass on an empty set.
 *
 * Every id is random per run, and afterAll removes what beforeAll wrote.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

const CHECK_NAME = "locations_saturday_hours_valid";
const d = live ? describe : describe.skip;

d("HOR-02: locations.saturday_opens_at and locations.saturday_closes_at", () => {
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
    await sql`insert into locations (id, tenant_id, name, opens_at, closes_at, saturday_opens_at, saturday_closes_at)
      values (${withSat}, ${tenant}, 'Com sabado', '08:00', '21:00', '09:00', '13:00')`;
    await sql`insert into locations (id, tenant_id, name, opens_at, closes_at)
      values (${withoutSat}, ${tenant}, 'Sem sabado', '08:00', '21:00')`;
    await sql`insert into locations (id, tenant_id, name, opens_at, closes_at, saturday_opens_at, saturday_closes_at)
      values (${otherLoc}, ${other}, 'Outra', '08:00', '21:00', '09:00', '14:00')`;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from locations where tenant_id in (${tenant}, ${other})`;
    await sql`delete from tenants where id in (${tenant}, ${other})`;
    await sql.end({ timeout: 5 });
  });

  it("both columns are a nullable time with no default", async () => {
    const rows = await sql<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }[]>`
      select column_name::text, data_type::text, is_nullable::text, column_default::text from information_schema.columns
       where table_schema = 'public' and table_name = 'locations'
         and column_name in ('saturday_opens_at', 'saturday_closes_at')
       order by column_name`;
    expect(rows).toEqual([
      { column_name: "saturday_closes_at", data_type: "time without time zone", is_nullable: "YES", column_default: null },
      { column_name: "saturday_opens_at", data_type: "time without time zone", is_nullable: "YES", column_default: null },
    ]);
  });

  it("a clinic written without them reads NULL in both, and one written with them reads the values", async () => {
    const rows = await sql<{ id: string; opens: string | null; closes: string | null }[]>`
      select id::text, saturday_opens_at::text as opens, saturday_closes_at::text as closes from locations
       where id in (${withSat}, ${withoutSat})`;
    expect(Object.fromEntries(rows.map((r) => [r.id, [r.opens, r.closes]]))).toEqual({
      [withSat]: ["09:00:00", "13:00:00"],
      [withoutSat]: [null, null],
    });
  });

  it.each([
    ["both NULL", null, null, true],
    ["both set, the owner's 09:00 to 13:00", "09:00", "13:00", true],
    // Independent of the weekday pair: a Saturday may open before the
    // weekday opening time.
    ["both set, opening before the weekday opening time", "07:30", "12:00", true],
    ["only the opening time", "09:00", null, false],
    ["only the closing time", null, "13:00", false],
    ["closing AT opening", "09:00", "09:00", false],
    ["closing before opening", "13:00", "09:00", false],
    // After the weekday opening time (08:00) but before the Saturday opening:
    // a CHECK written against the weekday opening time would admit this one.
    ["closing after the weekday opening time but before the Saturday opening", "10:00", "09:00", false],
  ] as const)("the CHECK: %s is admitted=%s", async (_label, opens, closes, admitted) => {
    const id = randomUUID();
    let refusedBy: string | null = null;
    try {
      await sql`insert into locations (id, tenant_id, name, opens_at, closes_at, saturday_opens_at, saturday_closes_at)
        values (${id}, ${tenant}, ${"probe-" + id.slice(0, 8)}, '08:00', '21:00', ${opens}::time, ${closes}::time)`;
    } catch (e) {
      refusedBy = (e as { constraint_name?: string }).constraint_name ?? `other:${String(e)}`;
    } finally {
      await sql`delete from locations where id = ${id}`;
    }
    expect(refusedBy).toBe(admitted ? null : CHECK_NAME);
  });

  it("the CHECK also refuses an UPDATE that would leave one end alone", async () => {
    let refusedBy: string | null = null;
    try {
      await sql.begin(async (tx) => {
        await tx`update locations set saturday_opens_at = null where id = ${withSat}`;
      });
    } catch (e) {
      refusedBy = (e as { constraint_name?: string }).constraint_name ?? `other:${String(e)}`;
    }
    expect(refusedBy).toBe(CHECK_NAME);
    const [row] = await sql<{ opens: string | null }[]>`
      select saturday_opens_at::text as opens from locations where id = ${withSat}`;
    expect(row).toEqual({ opens: "09:00:00" });
  });

  it("no new privilege: every grantee holds on each new column exactly what it holds on the weekday opens_at column", async () => {
    const rows = await sql<{ column_name: string; grantee: string; privs: string }[]>`
      select column_name::text, grantee::text, string_agg(privilege_type, ',' order by privilege_type) as privs
        from information_schema.column_privileges
       where table_schema = 'public' and table_name = 'locations'
         and column_name in ('opens_at', 'saturday_opens_at', 'saturday_closes_at')
       group by column_name, grantee order by grantee, column_name`;
    const of = (col: string) =>
      Object.fromEntries(rows.filter((r) => r.column_name === col).map((r) => [r.grantee, r.privs]));
    expect(Object.keys(of("opens_at")).length).toBeGreaterThan(0);
    for (const col of ["saturday_opens_at", "saturday_closes_at"]) {
      expect(of(col)).toEqual(of("opens_at"));
      expect(of(col)).not.toHaveProperty("anon");
    }
  });

  it("staff read their own tenant's values and no row of another tenant", async () => {
    const seen = await asRole(sql, "authenticated", claimsFor(tenant, "reception"), async (tx) =>
      tx<{ id: string; opens: string | null; closes: string | null }[]>`
        select id::text, saturday_opens_at::text as opens, saturday_closes_at::text as closes from locations
         where id in (${withSat}, ${otherLoc})`,
    );
    expect(seen).toEqual([{ id: withSat, opens: "09:00:00", closes: "13:00:00" }]);
  });
});
