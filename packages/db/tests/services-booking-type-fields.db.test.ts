/**
 * services-booking-type-fields.db.test.ts: the five Tipos de Marcacao columns
 * on services (color, vat_rate, vat_exemption_code, follow_up_days,
 * sms_reminders), from the PENDING migration
 * packages/db/migrations-pending/NEXT-AFTER-0109_services_booking_type_fields.sql.
 *
 * THIS FILE ASKS THE DATABASE WHICH SIDE IT IS ON and names it in each title.
 * On a database that has all five columns, every arm runs. On one that has none
 * of them, every arm is skipped, which is what CI's database is while the file
 * is pending (CI builds from supabase/migrations, and a pending file is not
 * there). It THROWS on a database that has some of the five and not the others
 * (the migration is one ALTER TABLE, so that database was built some other
 * way), and from the promotion on it THROWS on a database that has none: once a
 * file in packages/db/migrations adds the columns, a skip is no longer an answer.
 *
 * WHAT IT MEASURES:
 *   - THE COLUMNS: types, nullability and defaults, and each column's comment;
 *     a row written without them reads NULL in the four nullable columns and
 *     TRUE in sms_reminders, which is today's behaviour;
 *   - THE CHECKS, by NAME, with every NOT NULL column filled so no other
 *     constraint can refuse in their place: each listed value admitted, its
 *     neighbours refused (lower-case and short hex, 5 and 22 percent, codes
 *     absent from the list, a follow-up of 1 or 3 days);
 *   - NO NEW PRIVILEGE: every grantee holds on each new column exactly what it
 *     holds on price_cents, and anon holds nothing;
 *   - THE READERS AND WRITERS, under real RLS (`set local role authenticated`
 *     and staff claims, always rolled back): an admin of the tenant reads and
 *     updates its own row's values; an admin of another tenant reads no row and
 *     updates no row, beside reading its own so "nothing" is never a pass on an
 *     empty set.
 *
 * Every id is random per run, and afterAll removes what beforeAll wrote.
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

const COLUMNS = ["color", "follow_up_days", "sms_reminders", "vat_exemption_code", "vat_rate"] as const;
/** The statement only this migration holds. */
const MARKER = "ADD CONSTRAINT services_vat_exemption_code_allowed";

function promotedFiles(): string[] {
  const dir = join(__dirname, "..", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => readFileSync(join(dir, f), "utf8").includes(MARKER));
}

async function columnsState(): Promise<{ applied: boolean; side: string }> {
  if (!live) return { applied: false, side: "no database" };
  const probe = connect();
  try {
    const rows = await probe<{ column_name: string }[]>`
      select column_name::text from information_schema.columns
       where table_schema = 'public' and table_name = 'services'
         and column_name in ${probe(COLUMNS as unknown as string[])}`;
    const present = rows.length;
    if (present !== 0 && present !== COLUMNS.length) {
      throw new Error(
        `THE MIGRATION IS HALF APPLIED: ${present} of ${COLUMNS.length} columns on services. ` +
          "It is one ALTER TABLE, so this database was built some other way. Nothing here was measured.",
      );
    }
    const files = promotedFiles();
    if (files.length > 0 && present === 0) {
      throw new Error(
        `THE MIGRATION IS PROMOTED (${files.join(", ")}) BUT THIS DATABASE DOES NOT HAVE ITS COLUMNS. ` +
          "From the promotion on, a skip is no longer acceptable. Nothing here was measured.",
      );
    }
    return {
      applied: present === COLUMNS.length,
      side:
        present === COLUMNS.length
          ? "COLUMNS PRESENT"
          : "COLUMNS ABSENT on this database (the migration is pending; flips when it is applied)",
    };
  } finally {
    await probe.end({ timeout: 5 });
  }
}

const state = await columnsState();
const SIDE = state.side;
const d = live && state.applied ? describe : describe.skip;

type Refusal = string | null;

d(`Tipos de Marcacao columns on services [${SIDE}]`, () => {
  let sql: Sql;
  const tenant = randomUUID();
  const other = randomUUID();
  const plain = randomUUID();
  const typed = randomUUID();
  const otherSvc = randomUUID();

  beforeAll(async () => {
    sql = connect();
    for (const [id, slug] of [
      [tenant, "types-a"],
      [other, "types-b"],
    ] as const) {
      await sql`insert into tenants (id, name, slug) values (${id}, ${slug}, ${slug + "-" + id.slice(0, 8)})`;
    }
    // A row written as today's app writes it: none of the new columns named.
    await sql`insert into services (id, tenant_id, name, price_cents) values (${plain}, ${tenant}, 'Sem tipo', 5000)`;
    await sql`insert into services (id, tenant_id, name, price_cents, color, vat_rate, vat_exemption_code, follow_up_days, sms_reminders)
      values (${typed}, ${tenant}, 'Com tipo', 7500, '#FEE93D', 0, 'M07', 2, false)`;
    await sql`insert into services (id, tenant_id, name, color, vat_rate)
      values (${otherSvc}, ${other}, 'Outro', '#0080C0', 23)`;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from services where tenant_id in (${tenant}, ${other})`;
    await sql`delete from tenants where id in (${tenant}, ${other})`;
    await sql.end({ timeout: 5 });
  });

  it("the five columns: types, nullability and defaults", async () => {
    const rows = await sql<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }[]>`
      select column_name::text, data_type::text, is_nullable::text, column_default::text
        from information_schema.columns
       where table_schema = 'public' and table_name = 'services'
         and column_name in ${sql(COLUMNS as unknown as string[])}
       order by column_name`;
    expect(rows).toEqual([
      { column_name: "color", data_type: "text", is_nullable: "YES", column_default: null },
      { column_name: "follow_up_days", data_type: "smallint", is_nullable: "YES", column_default: null },
      { column_name: "sms_reminders", data_type: "boolean", is_nullable: "NO", column_default: "true" },
      { column_name: "vat_exemption_code", data_type: "text", is_nullable: "YES", column_default: null },
      { column_name: "vat_rate", data_type: "smallint", is_nullable: "YES", column_default: null },
    ]);
  });

  it("each new column carries its comment", async () => {
    const rows = await sql<{ column_name: string; has_comment: boolean }[]>`
      select a.attname::text as column_name,
             coalesce(length(col_description(a.attrelid, a.attnum)), 0) > 0 as has_comment
        from pg_attribute a
       where a.attrelid = 'public.services'::regclass
         and a.attname in ${sql(COLUMNS as unknown as string[])}
         and not a.attisdropped
       order by a.attname`;
    expect(rows).toEqual(COLUMNS.map((c) => ({ column_name: c, has_comment: true })));
  });

  it("a row written without them reads NULL in the four and TRUE in sms_reminders (today's behaviour)", async () => {
    const rows = await sql<Record<string, unknown>[]>`
      select id::text, color, vat_rate, vat_exemption_code, follow_up_days, sms_reminders
        from services where id in (${plain}, ${typed}) order by name desc`;
    expect(rows).toEqual([
      { id: plain, color: null, vat_rate: null, vat_exemption_code: null, follow_up_days: null, sms_reminders: true },
      { id: typed, color: "#FEE93D", vat_rate: 0, vat_exemption_code: "M07", follow_up_days: 2, sms_reminders: false },
    ]);
  });

  async function refusal(column: string, value: string | number | null): Promise<Refusal> {
    const id = randomUUID();
    try {
      await sql`insert into services (id, tenant_id, name) values (${id}, ${tenant}, ${"probe-" + id.slice(0, 8)})`;
      await sql`update services set ${sql({ [column]: value })} where id = ${id}`;
      return null;
    } catch (e) {
      return (e as { constraint_name?: string }).constraint_name ?? `other:${String(e)}`;
    } finally {
      await sql`delete from services where id = ${id}`;
    }
  }

  it.each([
    ["color", null, null],
    ["color", "#FEE93D", null],
    ["color", "#FFFFFF", null],
    ["color", "#000000", null],
    ["color", "#fee93d", "services_color_hex"],
    ["color", "FEE93D", "services_color_hex"],
    ["color", "#FFF", "services_color_hex"],
    ["color", "#FEE93D0", "services_color_hex"],
    ["color", "", "services_color_hex"],
    ["vat_rate", null, null],
    ["vat_rate", 0, null],
    ["vat_rate", 6, null],
    ["vat_rate", 13, null],
    ["vat_rate", 23, null],
    ["vat_rate", 5, "services_vat_rate_allowed"],
    ["vat_rate", 22, "services_vat_rate_allowed"],
    ["vat_rate", -6, "services_vat_rate_allowed"],
    ["vat_exemption_code", null, null],
    ["vat_exemption_code", "M01", null],
    ["vat_exemption_code", "M07", null],
    ["vat_exemption_code", "M31", null],
    ["vat_exemption_code", "M35", null],
    ["vat_exemption_code", "M99", null],
    ["vat_exemption_code", "M03", "services_vat_exemption_code_allowed"],
    ["vat_exemption_code", "M08", "services_vat_exemption_code_allowed"],
    ["vat_exemption_code", "m07", "services_vat_exemption_code_allowed"],
    ["vat_exemption_code", "M07 - Isento artigo 9.º do CIVA", "services_vat_exemption_code_allowed"],
    ["vat_exemption_code", "", "services_vat_exemption_code_allowed"],
    ["follow_up_days", null, null],
    ["follow_up_days", 2, null],
    ["follow_up_days", 0, "services_follow_up_days_allowed"],
    ["follow_up_days", 1, "services_follow_up_days_allowed"],
    ["follow_up_days", 3, "services_follow_up_days_allowed"],
  ] as const)("the CHECK on %s: %j is refused by %s", async (column, value, refusedBy) => {
    expect(await refusal(column, value)).toBe(refusedBy);
  });

  it("sms_reminders refuses NULL by its NOT NULL", async () => {
    const r = await refusal("sms_reminders", null);
    expect(r).toMatch(/^other:.*sms_reminders/);
  });

  it("no new privilege: every grantee holds on each new column exactly what it holds on price_cents", async () => {
    const rows = await sql<{ column_name: string; grantee: string; privs: string }[]>`
      select column_name::text, grantee::text, string_agg(privilege_type, ',' order by privilege_type) as privs
        from information_schema.column_privileges
       where table_schema = 'public' and table_name = 'services'
         and column_name in ${sql(["price_cents", ...COLUMNS])}
       group by column_name, grantee order by grantee, column_name`;
    const of = (col: string) =>
      Object.fromEntries(rows.filter((r) => r.column_name === col).map((r) => [r.grantee, r.privs]));
    expect(Object.keys(of("price_cents")).length).toBeGreaterThan(0);
    for (const col of COLUMNS) {
      expect(of(col)).toEqual(of("price_cents"));
      expect(of(col)).not.toHaveProperty("anon");
    }
  });

  it("an admin reads its own tenant's values and no row of another tenant", async () => {
    const seen = await asRole(sql, "authenticated", claimsFor(tenant, "admin"), async (tx) =>
      tx<{ id: string; color: string | null; vat_rate: number | null }[]>`
        select id::text, color, vat_rate from services where id in (${typed}, ${otherSvc})`,
    );
    expect(seen).toEqual([{ id: typed, color: "#FEE93D", vat_rate: 0 }]);
  });

  it("an admin updates its own tenant's values and no row of another tenant", async () => {
    const result = await asRole(sql, "authenticated", claimsFor(tenant, "admin"), async (tx) => {
      const own = await tx`
        update services set color = '#0080C0', vat_rate = 23, vat_exemption_code = null,
               follow_up_days = null, sms_reminders = true
         where id = ${typed} returning id`;
      const foreign = await tx`update services set color = '#FF2828' where id = ${otherSvc} returning id`;
      const after = await tx<{ color: string; vat_rate: number; sms_reminders: boolean }[]>`
        select color, vat_rate, sms_reminders from services where id = ${typed}`;
      return { own: own.length, foreign: foreign.length, after };
    });
    expect(result).toEqual({ own: 1, foreign: 0, after: [{ color: "#0080C0", vat_rate: 23, sms_reminders: true }] });
    const [untouched] = await sql<{ color: string }[]>`select color from services where id = ${otherSvc}`;
    expect(untouched).toEqual({ color: "#0080C0" });
  });
});
