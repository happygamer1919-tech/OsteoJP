/**
 * therapist-weekly-blocks.db.test.ts: the isolation proof for
 * public.therapist_weekly_blocks, from the PENDING migration
 * packages/db/migrations-pending/NEXT-AFTER-0109_weekly_blocks.sql.
 *
 * THIS FILE ASKS THE DATABASE WHICH SIDE IT IS ON and names it in each title.
 * On a database that has the table, every arm runs. On one that does not, every
 * arm is skipped, which is what CI's database is while the file is pending (CI
 * builds from supabase/migrations, and a pending file is not there). From the
 * promotion on it THROWS on a database without the table: once a file in
 * packages/db/migrations creates it, a skip is no longer an answer.
 *
 * WHAT IT MEASURES:
 *   - THE TABLE: columns, the two CHECKs and the dedupe key, BY NAME, each with
 *     every other constraint satisfied so nothing else can refuse in its place;
 *   - THE GATES: has_table_privilege for every role that matters, so an UPDATE
 *     grant, an anon or patient grant, or a service_role write shows up here;
 *   - THE POLICIES, under real RLS (`set local role authenticated` and staff
 *     claims, always rolled back):
 *       an admin of the tenant reads its rows and not the other tenant's,
 *       beside the other tenant's admin reading its own (never a pass on an
 *       empty set);
 *       reception writes a rule for any therapist of the tenant, naming itself
 *       as creator; naming anybody else, or another tenant, is refused;
 *       a therapist writes and deletes their OWN rules and not a colleague's;
 *       nobody updates; no claims read nothing; the patient role is denied at
 *       the table gate;
 *   - THE CASCADE: deleting a therapist's users row takes their rules with it.
 *
 * Every id is random per run, and afterAll removes what beforeAll wrote.
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Sql, TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

const TABLE = "public.therapist_weekly_blocks";
/** The statement only this migration holds. */
const MARKER = "CREATE TABLE public.therapist_weekly_blocks";

function promotedFiles(): string[] {
  const dir = join(__dirname, "..", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => readFileSync(join(dir, f), "utf8").includes(MARKER));
}

async function tableState(): Promise<{ applied: boolean; side: string }> {
  if (!live) return { applied: false, side: "no database" };
  const probe = connect();
  try {
    const [row] = await probe<{ present: boolean }[]>`select to_regclass(${TABLE}) is not null as present`;
    const present = row?.present === true;
    const files = promotedFiles();
    if (files.length > 0 && !present) {
      throw new Error(
        `THE MIGRATION IS PROMOTED (${files.join(", ")}) BUT THIS DATABASE HAS NO ${TABLE}. ` +
          "From the promotion on, a skip is no longer acceptable. Nothing here was measured.",
      );
    }
    return {
      applied: present,
      side: present
        ? "TABLE PRESENT"
        : "TABLE ABSENT on this database (the migration is pending; flips when it is applied)",
    };
  } finally {
    await probe.end({ timeout: 5 });
  }
}

const state = await tableState();
const SIDE = state.side;
const d = live && state.applied ? describe : describe.skip;

/** Run fn in a savepoint and return the SQLSTATE it raised, or null. */
async function refusal(tx: TransactionSql, fn: (sp: TransactionSql) => Promise<unknown>): Promise<string | null> {
  try {
    await tx.savepoint(async (sp) => {
      await fn(sp);
    });
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "unknown";
  }
}

d(`therapist_weekly_blocks: table, gates and policies [${SIDE}]`, () => {
  let sql: Sql;
  const tenant = randomUUID();
  const other = randomUUID();
  const admin = randomUUID();
  const reception = randomUUID();
  const therapist = randomUUID();
  const colleague = randomUUID();
  const otherAdmin = randomUUID();
  const leaver = randomUUID();
  const ruleTherapist = randomUUID();
  const ruleColleague = randomUUID();
  const ruleOther = randomUUID();

  beforeAll(async () => {
    sql = connect();
    for (const [id, slug] of [
      [tenant, "wb-a"],
      [other, "wb-b"],
    ] as const) {
      await sql`insert into tenants (id, name, slug) values (${id}, ${slug}, ${slug + "-" + id.slice(0, 8)})`;
    }
    const person = (id: string, t: string, name: string) =>
      sql`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
          values (${id}, ${t}, ${"wb-" + id.slice(0, 8) + "@t.test"}, ${name}, true, true)`;
    await person(admin, tenant, "Admin WB");
    await person(reception, tenant, "Rececao WB");
    await person(therapist, tenant, "Terapeuta WB");
    await person(colleague, tenant, "Colega WB");
    await person(leaver, tenant, "Sai WB");
    await person(otherAdmin, other, "Admin Outra");
    // Seeded as the owner connection (bypasses RLS): the rows the policies
    // are then measured against.
    await sql`insert into therapist_weekly_blocks (id, tenant_id, user_id, weekday, start_time, end_time, created_by)
              values (${ruleTherapist}, ${tenant}, ${therapist}, 1, '08:00', '11:00', ${admin}),
                     (${ruleColleague}, ${tenant}, ${colleague}, 3, '14:00', '18:00', ${admin}),
                     (${ruleOther}, ${other}, ${otherAdmin}, 1, '08:00', '11:00', ${otherAdmin})`;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from therapist_weekly_blocks where tenant_id in (${tenant}, ${other})`;
    await sql`delete from users where tenant_id in (${tenant}, ${other})`;
    await sql`delete from tenants where id in (${tenant}, ${other})`;
    await sql.end({ timeout: 5 });
  });

  it("the columns: types and nullability", async () => {
    const rows = await sql<{ column_name: string; data_type: string; is_nullable: string }[]>`
      select column_name::text, data_type::text, is_nullable::text
        from information_schema.columns
       where table_schema = 'public' and table_name = 'therapist_weekly_blocks'
       order by column_name`;
    expect(rows).toEqual([
      { column_name: "created_at", data_type: "timestamp with time zone", is_nullable: "NO" },
      { column_name: "created_by", data_type: "uuid", is_nullable: "YES" },
      { column_name: "end_time", data_type: "time without time zone", is_nullable: "NO" },
      { column_name: "id", data_type: "uuid", is_nullable: "NO" },
      { column_name: "start_time", data_type: "time without time zone", is_nullable: "NO" },
      { column_name: "tenant_id", data_type: "uuid", is_nullable: "NO" },
      { column_name: "user_id", data_type: "uuid", is_nullable: "NO" },
      { column_name: "weekday", data_type: "smallint", is_nullable: "NO" },
    ]);
  });

  it("RLS is enabled and not forced; exactly three policies, one per command", async () => {
    const [rel] = await sql<{ rls: boolean; forced: boolean }[]>`
      select relrowsecurity as rls, relforcerowsecurity as forced
        from pg_class where oid = to_regclass(${TABLE})`;
    expect(rel).toEqual({ rls: true, forced: false });
    const pols = await sql<{ polname: string; cmd: string; permissive: string; roles: string[] }[]>`
      select policyname::text as polname, cmd::text as cmd, permissive::text as permissive, roles::text[] as roles
        from pg_policies where schemaname = 'public' and tablename = 'therapist_weekly_blocks'
       order by policyname`;
    expect(pols).toEqual([
      { polname: "therapist_weekly_blocks_staff_delete", cmd: "DELETE", permissive: "PERMISSIVE", roles: ["authenticated"] },
      { polname: "therapist_weekly_blocks_staff_insert", cmd: "INSERT", permissive: "PERMISSIVE", roles: ["authenticated"] },
      { polname: "therapist_weekly_blocks_staff_select", cmd: "SELECT", permissive: "PERMISSIVE", roles: ["authenticated"] },
    ]);
  });

  it("the constraints refuse by name, with everything else satisfied", async () => {
    const insertAs = async (weekday: number, start: string, end: string): Promise<string | null> => {
      try {
        await sql.begin(async (tx) => {
          await tx`insert into therapist_weekly_blocks (tenant_id, user_id, weekday, start_time, end_time)
                   values (${tenant}, ${colleague}, ${weekday}, ${start}, ${end})`;
          throw new Error("ROLLBACK-OK");
        });
        return null;
      } catch (e) {
        if ((e as Error).message === "ROLLBACK-OK") return "ok";
        return (e as { constraint_name?: string }).constraint_name ?? (e as Error).message;
      }
    };
    expect(await insertAs(0, "08:00", "09:00")).toBe("ok");
    expect(await insertAs(6, "05:00", "23:55")).toBe("ok");
    expect(await insertAs(7, "08:00", "09:00")).toBe("therapist_weekly_blocks_weekday_range");
    expect(await insertAs(-1, "08:00", "09:00")).toBe("therapist_weekly_blocks_weekday_range");
    expect(await insertAs(2, "09:00", "09:00")).toBe("therapist_weekly_blocks_start_before_end");
    expect(await insertAs(2, "10:00", "09:00")).toBe("therapist_weekly_blocks_start_before_end");
    // The seeded colleague rule is (3, 14:00, 18:00): the same five values again.
    expect(await insertAs(3, "14:00", "18:00")).toBe("therapist_weekly_blocks_dedupe_uq");
    // A rule that merely OVERLAPS it is allowed (the readers take the union).
    expect(await insertAs(3, "15:00", "19:00")).toBe("ok");
  });

  it("the table gates: authenticated SELECT/INSERT/DELETE only, service_role SELECT only, anon and patient nothing", async () => {
    const privs = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
    const read = async (role: string) => {
      const out: string[] = [];
      for (const p of privs) {
        const [r] = await sql<{ ok: boolean }[]>`select has_table_privilege(${role}, ${TABLE}, ${p}) as ok`;
        if (r?.ok) out.push(p);
      }
      return out;
    };
    expect(await read("authenticated")).toEqual(["SELECT", "INSERT", "DELETE"]);
    expect(await read("service_role")).toEqual(["SELECT"]);
    expect(await read("anon")).toEqual([]);
    expect(await read("patient")).toEqual([]);
  });

  it("an admin reads its tenant's rules and not the other tenant's; the other admin reads its own", async () => {
    const mine = await asRole(sql, "authenticated", claimsFor(tenant, "admin", admin), (tx) =>
      tx<{ id: string }[]>`select id from therapist_weekly_blocks order by id`,
    );
    expect(mine.map((r) => r.id).sort()).toEqual([ruleTherapist, ruleColleague].sort());
    const theirs = await asRole(sql, "authenticated", claimsFor(other, "admin", otherAdmin), (tx) =>
      tx<{ id: string }[]>`select id from therapist_weekly_blocks`,
    );
    expect(theirs.map((r) => r.id)).toEqual([ruleOther]);
  });

  it("a therapist and reception both READ every rule of their tenant (a booking reads the named therapist's)", async () => {
    for (const [role, uid] of [
      ["therapist", therapist],
      ["reception", reception],
    ] as const) {
      const rows = await asRole(sql, "authenticated", claimsFor(tenant, role, uid), (tx) =>
        tx<{ id: string }[]>`select id from therapist_weekly_blocks`,
      );
      expect(rows.map((r) => r.id).sort()).toEqual([ruleTherapist, ruleColleague].sort());
    }
  });

  it("no claims read nothing, beside a claimed read that finds rows", async () => {
    const none = await asRole(sql, "authenticated", null, (tx) => tx`select id from therapist_weekly_blocks`);
    expect(none).toHaveLength(0);
    const some = await asRole(sql, "authenticated", claimsFor(tenant, "admin", admin), (tx) =>
      tx`select id from therapist_weekly_blocks`,
    );
    expect(some.length).toBeGreaterThan(0);
  });

  it("reception writes a rule for any therapist of its tenant, naming itself; any other creator or tenant is refused", async () => {
    const out = await asRole(sql, "authenticated", claimsFor(tenant, "reception", reception), async (tx) => ({
      ok: await refusal(tx, (sp) =>
        sp`insert into therapist_weekly_blocks (tenant_id, user_id, weekday, start_time, end_time, created_by)
           values (${tenant}, ${colleague}, 5, '12:00', '13:00', ${reception})`,
      ),
      otherCreator: await refusal(tx, (sp) =>
        sp`insert into therapist_weekly_blocks (tenant_id, user_id, weekday, start_time, end_time, created_by)
           values (${tenant}, ${colleague}, 5, '13:00', '14:00', ${admin})`,
      ),
      noCreator: await refusal(tx, (sp) =>
        sp`insert into therapist_weekly_blocks (tenant_id, user_id, weekday, start_time, end_time)
           values (${tenant}, ${colleague}, 5, '14:00', '15:00')`,
      ),
      otherTenant: await refusal(tx, (sp) =>
        sp`insert into therapist_weekly_blocks (tenant_id, user_id, weekday, start_time, end_time, created_by)
           values (${other}, ${otherAdmin}, 5, '12:00', '13:00', ${reception})`,
      ),
    }));
    expect(out).toEqual({ ok: null, otherCreator: "42501", noCreator: "42501", otherTenant: "42501" });
  });

  it("a therapist writes and deletes their OWN rules, and not a colleague's", async () => {
    const out = await asRole(sql, "authenticated", claimsFor(tenant, "therapist", therapist), async (tx) => {
      const own = await refusal(tx, (sp) =>
        sp`insert into therapist_weekly_blocks (tenant_id, user_id, weekday, start_time, end_time, created_by)
           values (${tenant}, ${therapist}, 2, '08:00', '09:00', ${therapist})`,
      );
      const colleagues = await refusal(tx, (sp) =>
        sp`insert into therapist_weekly_blocks (tenant_id, user_id, weekday, start_time, end_time, created_by)
           values (${tenant}, ${colleague}, 2, '08:00', '09:00', ${therapist})`,
      );
      const delColleague = await tx<{ id: string }[]>`
        delete from therapist_weekly_blocks where id = ${ruleColleague} returning id`;
      const delOwn = await tx<{ id: string }[]>`
        delete from therapist_weekly_blocks where id = ${ruleTherapist} returning id`;
      return { own, colleagues, delColleague: delColleague.length, delOwn: delOwn.length };
    });
    expect(out).toEqual({ own: null, colleagues: "42501", delColleague: 0, delOwn: 1 });
  });

  it("an admin deletes a rule of its tenant and cannot reach the other tenant's", async () => {
    const out = await asRole(sql, "authenticated", claimsFor(tenant, "admin", admin), async (tx) => ({
      mine: (await tx`delete from therapist_weekly_blocks where id = ${ruleColleague} returning id`).length,
      theirs: (await tx`delete from therapist_weekly_blocks where id = ${ruleOther} returning id`).length,
    }));
    expect(out).toEqual({ mine: 1, theirs: 0 });
  });

  it("nobody updates a rule: the gate refuses before any policy is read", async () => {
    for (const [role, uid] of [
      ["owner", admin],
      ["admin", admin],
      ["reception", reception],
      ["therapist", therapist],
    ] as const) {
      const code = await asRole(sql, "authenticated", claimsFor(tenant, role, uid), (tx) =>
        refusal(tx, (sp) => sp`update therapist_weekly_blocks set end_time = '12:00' where id = ${ruleTherapist}`),
      );
      expect(code).toBe("42501");
    }
  });

  it("the patient role is denied at the table gate", async () => {
    const code = await asRole(sql, "patient", JSON.stringify({ tenant_id: tenant, patient_id: randomUUID() }), (tx) =>
      refusal(tx, (sp) => sp`select id from therapist_weekly_blocks`),
    );
    expect(code).toBe("42501");
  });

  it("deleting a therapist's users row takes their rules with it (ON DELETE CASCADE)", async () => {
    await sql`insert into therapist_weekly_blocks (tenant_id, user_id, weekday, start_time, end_time)
              values (${tenant}, ${leaver}, 4, '08:00', '09:00')`;
    const before = await sql`select 1 from therapist_weekly_blocks where user_id = ${leaver}`;
    expect(before).toHaveLength(1);
    await sql`delete from users where id = ${leaver}`;
    const after = await sql`select 1 from therapist_weekly_blocks where user_id = ${leaver}`;
    expect(after).toHaveLength(0);
  });
});
