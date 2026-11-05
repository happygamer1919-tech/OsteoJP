/**
 * location-closed-days.db.test.ts: the isolation proof for
 * public.location_closed_days, from the PENDING migration
 * packages/db/migrations-pending/NEXT-AFTER-0113_location_closed_days.sql.
 *
 * THIS FILE ASKS THE DATABASE WHICH SIDE IT IS ON and names it in each title.
 * On a database that has the table, every arm runs. On one that does not, every
 * arm is skipped, which is what CI's database is while the file is pending (CI
 * builds from supabase/migrations, and a pending file is not there). From the
 * promotion on it THROWS on a database without the table: once a file in
 * packages/db/migrations creates it, a skip is no longer an answer.
 *
 * WHAT IT MEASURES:
 *   - THE TABLE: columns, every CHECK and the dedupe key, BY NAME, each with
 *     every other constraint satisfied so nothing else can refuse in its place;
 *   - THE GATES: has_table_privilege for every role that matters, so an UPDATE
 *     grant, or any grant to anon, patient or service_role, shows up here;
 *   - THE POLICIES, under real RLS (`set local role authenticated` and staff
 *     claims, always rolled back):
 *       isolation: an admin reads its tenant's closures and not the other
 *       tenant's, beside the other tenant's admin reading its own;
 *       the role matrix: owner, admin and reception write; a therapist reads
 *       and cannot write or delete; the creator must be the caller;
 *       a location of another tenant is refused, with a control showing the
 *       owner connection (no RLS) would accept that row;
 *       no UPDATE for anybody; delete of a closure that has started is
 *       refused, a future one is deleted; no claims read nothing; the patient
 *       role is denied at the table gate;
 *   - THE CASCADE: deleting a clinic takes its closures with it.
 *
 * Every id is random per run, and afterAll removes what beforeAll wrote.
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Sql, TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

const TABLE = "public.location_closed_days";
/** The statement only this migration holds. */
const MARKER = "CREATE TABLE public.location_closed_days";

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

d(`location_closed_days: table, gates and policies [${SIDE}]`, () => {
  let sql: Sql;
  const tenant = randomUUID();
  const other = randomUUID();
  const owner = randomUUID();
  const admin = randomUUID();
  const reception = randomUUID();
  const therapist = randomUUID();
  const otherAdmin = randomUUID();
  const clinic = randomUUID();
  const clinicTwo = randomUUID();
  const otherClinic = randomUUID();
  const doomedClinic = randomUUID();
  const past = randomUUID();
  const future = randomUUID();
  const futureTwo = randomUUID();
  const theirs = randomUUID();

  beforeAll(async () => {
    sql = connect();
    for (const [id, slug] of [
      [tenant, "lcd-a"],
      [other, "lcd-b"],
    ] as const) {
      await sql`insert into tenants (id, name, slug) values (${id}, ${slug}, ${slug + "-" + id.slice(0, 8)})`;
    }
    const person = (id: string, t: string, name: string) =>
      sql`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
          values (${id}, ${t}, ${"lcd-" + id.slice(0, 8) + "@t.test"}, ${name}, true, false)`;
    await person(owner, tenant, "Dono LCD");
    await person(admin, tenant, "Admin LCD");
    await person(reception, tenant, "Rececao LCD");
    await person(therapist, tenant, "Terapeuta LCD");
    await person(otherAdmin, other, "Admin Outra");
    for (const [id, t, name] of [
      [clinic, tenant, "Clinica A"],
      [clinicTwo, tenant, "Clinica A2"],
      [doomedClinic, tenant, "Clinica a fechar"],
      [otherClinic, other, "Clinica B"],
    ] as const) {
      await sql`insert into locations (id, tenant_id, name) values (${id}, ${t}, ${name})`;
    }
    // Seeded as the owner connection (bypasses RLS): the rows the policies are
    // then measured against. `past` started yesterday; `future` starts in ten
    // days; both on the Lisbon calendar the delete policy reads.
    await sql`insert into location_closed_days (id, tenant_id, location_id, starts_on, ends_on, kind, label, created_by)
              values
                (${past}, ${tenant}, ${clinic},
                 (now() at time zone 'Europe/Lisbon')::date - 1, (now() at time zone 'Europe/Lisbon')::date + 1,
                 'encerramento', 'Obras', ${admin}),
                (${future}, ${tenant}, ${clinic},
                 (now() at time zone 'Europe/Lisbon')::date + 10, (now() at time zone 'Europe/Lisbon')::date + 10,
                 'feriado_nacional', 'Feriado', ${admin}),
                (${futureTwo}, ${tenant}, ${clinicTwo},
                 (now() at time zone 'Europe/Lisbon')::date + 20, (now() at time zone 'Europe/Lisbon')::date + 21,
                 'outro', null, ${admin}),
                (${theirs}, ${other}, ${otherClinic},
                 (now() at time zone 'Europe/Lisbon')::date + 10, (now() at time zone 'Europe/Lisbon')::date + 10,
                 'feriado_nacional', null, ${otherAdmin})`;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from location_closed_days where tenant_id in (${tenant}, ${other})`;
    await sql`delete from locations where tenant_id in (${tenant}, ${other})`;
    await sql`delete from users where tenant_id in (${tenant}, ${other})`;
    await sql`delete from tenants where id in (${tenant}, ${other})`;
    await sql.end({ timeout: 5 });
  });

  it("the columns: types and nullability", async () => {
    const rows = await sql<{ column_name: string; data_type: string; is_nullable: string }[]>`
      select column_name::text, data_type::text, is_nullable::text
        from information_schema.columns
       where table_schema = 'public' and table_name = 'location_closed_days'
       order by column_name`;
    expect(rows).toEqual([
      { column_name: "closed_from", data_type: "time without time zone", is_nullable: "YES" },
      { column_name: "closed_to", data_type: "time without time zone", is_nullable: "YES" },
      { column_name: "created_at", data_type: "timestamp with time zone", is_nullable: "NO" },
      { column_name: "created_by", data_type: "uuid", is_nullable: "YES" },
      { column_name: "ends_on", data_type: "date", is_nullable: "NO" },
      { column_name: "id", data_type: "uuid", is_nullable: "NO" },
      { column_name: "kind", data_type: "text", is_nullable: "NO" },
      { column_name: "label", data_type: "text", is_nullable: "YES" },
      { column_name: "location_id", data_type: "uuid", is_nullable: "NO" },
      { column_name: "starts_on", data_type: "date", is_nullable: "NO" },
      { column_name: "tenant_id", data_type: "uuid", is_nullable: "NO" },
    ]);
  });

  it("RLS is enabled and not forced; exactly three policies, one per command", async () => {
    const [rel] = await sql<{ rls: boolean; forced: boolean }[]>`
      select relrowsecurity as rls, relforcerowsecurity as forced
        from pg_class where oid = to_regclass(${TABLE})`;
    expect(rel).toEqual({ rls: true, forced: false });
    const pols = await sql<{ polname: string; cmd: string; permissive: string; roles: string[] }[]>`
      select policyname::text as polname, cmd::text as cmd, permissive::text as permissive, roles::text[] as roles
        from pg_policies where schemaname = 'public' and tablename = 'location_closed_days'
       order by policyname`;
    expect(pols).toEqual([
      { polname: "location_closed_days_staff_delete", cmd: "DELETE", permissive: "PERMISSIVE", roles: ["authenticated"] },
      { polname: "location_closed_days_staff_insert", cmd: "INSERT", permissive: "PERMISSIVE", roles: ["authenticated"] },
      { polname: "location_closed_days_staff_select", cmd: "SELECT", permissive: "PERMISSIVE", roles: ["authenticated"] },
    ]);
  });

  it("the constraints refuse by name, with everything else satisfied", async () => {
    type Row = { starts: string; ends: string; from?: string | null; to?: string | null; kind?: string; label?: string | null };
    const insertAs = async (r: Row): Promise<string | null> => {
      try {
        await sql.begin(async (tx) => {
          await tx`insert into location_closed_days (tenant_id, location_id, starts_on, ends_on, closed_from, closed_to, kind, label)
                   values (${tenant}, ${clinicTwo}, ${r.starts}, ${r.ends}, ${r.from ?? null}, ${r.to ?? null},
                           ${r.kind ?? "encerramento"}, ${r.label === undefined ? null : r.label})`;
          throw new Error("ROLLBACK-OK");
        });
        return null;
      } catch (e) {
        if ((e as Error).message === "ROLLBACK-OK") return "ok";
        return (e as { constraint_name?: string }).constraint_name ?? (e as Error).message;
      }
    };
    expect(await insertAs({ starts: "2030-12-25", ends: "2030-12-25" })).toBe("ok");
    expect(await insertAs({ starts: "2030-12-24", ends: "2030-12-24", from: "13:00", to: "20:00", label: "Natal" })).toBe("ok");
    expect(await insertAs({ starts: "2030-01-01", ends: "2030-04-03" })).toBe("ok"); // 92 days apart
    expect(await insertAs({ starts: "2030-01-01", ends: "2030-04-04" })).toBe("location_closed_days_range_length");
    expect(await insertAs({ starts: "2030-12-26", ends: "2030-12-25" })).toBe("location_closed_days_range_order");
    expect(await insertAs({ starts: "2030-12-25", ends: "2030-12-25", from: "13:00", to: null })).toBe("location_closed_days_hours_pair");
    expect(await insertAs({ starts: "2030-12-25", ends: "2030-12-25", from: "14:00", to: "13:00" })).toBe("location_closed_days_hours_order");
    expect(await insertAs({ starts: "2030-12-25", ends: "2030-12-25", from: "13:00", to: "13:00" })).toBe("location_closed_days_hours_order");
    expect(await insertAs({ starts: "2030-12-25", ends: "2030-12-25", kind: "feriado" })).toBe("location_closed_days_kind_check");
    expect(await insertAs({ starts: "2030-12-25", ends: "2030-12-25", label: "   " })).toBe("location_closed_days_label_check");
    expect(await insertAs({ starts: "2030-12-25", ends: "2030-12-25", label: "x".repeat(81) })).toBe("location_closed_days_label_check");
    expect(await insertAs({ starts: "2030-12-25", ends: "2030-12-25", label: "x".repeat(80) })).toBe("ok");
  });

  it("the dedupe key treats two whole-day rows for the same dates as the same closure (NULLS NOT DISTINCT)", async () => {
    const code = await (async () => {
      try {
        await sql.begin(async (tx) => {
          await tx`insert into location_closed_days (tenant_id, location_id, starts_on, ends_on, kind)
                   values (${tenant}, ${clinicTwo}, '2031-01-01', '2031-01-01', 'feriado_nacional')`;
          await tx`insert into location_closed_days (tenant_id, location_id, starts_on, ends_on, kind)
                   values (${tenant}, ${clinicTwo}, '2031-01-01', '2031-01-01', 'outro')`;
        });
        return "accepted";
      } catch (e) {
        return (e as { constraint_name?: string }).constraint_name ?? "error";
      }
    })();
    expect(code).toBe("location_closed_days_dedupe_uq");
    // Rolled back by the failed transaction: nothing left behind.
    const left = await sql`select 1 from location_closed_days where location_id = ${clinicTwo} and starts_on = '2031-01-01'`;
    expect(left).toHaveLength(0);
  });

  it("the table gates: authenticated SELECT/INSERT/DELETE only; service_role, anon and patient nothing", async () => {
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
    expect(await read("service_role")).toEqual([]);
    expect(await read("anon")).toEqual([]);
    expect(await read("patient")).toEqual([]);
  });

  it("isolation: an admin reads its tenant's closures and not the other tenant's; the other admin reads its own", async () => {
    const mine = await asRole(sql, "authenticated", claimsFor(tenant, "admin", admin), (tx) =>
      tx<{ id: string }[]>`select id from location_closed_days`,
    );
    expect(mine.map((r) => r.id).sort()).toEqual([past, future, futureTwo].sort());
    const theirRows = await asRole(sql, "authenticated", claimsFor(other, "admin", otherAdmin), (tx) =>
      tx<{ id: string }[]>`select id from location_closed_days`,
    );
    expect(theirRows.map((r) => r.id)).toEqual([theirs]);
  });

  it("every staff role READS the tenant's closures (every booking reads them)", async () => {
    for (const [role, uid] of [
      ["owner", owner],
      ["therapist", therapist],
      ["reception", reception],
    ] as const) {
      const rows = await asRole(sql, "authenticated", claimsFor(tenant, role, uid), (tx) =>
        tx<{ id: string }[]>`select id from location_closed_days`,
      );
      expect(rows.map((r) => r.id).sort(), role).toEqual([past, future, futureTwo].sort());
    }
  });

  it("no claims read nothing, beside a claimed read that finds rows", async () => {
    const none = await asRole(sql, "authenticated", null, (tx) => tx`select id from location_closed_days`);
    expect(none).toHaveLength(0);
    const some = await asRole(sql, "authenticated", claimsFor(tenant, "admin", admin), (tx) =>
      tx`select id from location_closed_days`,
    );
    expect(some.length).toBeGreaterThan(0);
  });

  it("the role matrix on INSERT: owner, admin and reception write naming themselves; a therapist is refused", async () => {
    const write = (role: "owner" | "admin" | "reception" | "therapist", uid: string, day: string) =>
      asRole(sql, "authenticated", claimsFor(tenant, role, uid), (tx) =>
        refusal(tx, (sp) =>
          sp`insert into location_closed_days (tenant_id, location_id, starts_on, ends_on, kind, created_by)
             values (${tenant}, ${clinic}, ${day}, ${day}, 'encerramento', ${uid})`,
        ),
      );
    expect(await write("owner", owner, "2032-01-02")).toBeNull();
    expect(await write("admin", admin, "2032-01-03")).toBeNull();
    expect(await write("reception", reception, "2032-01-04")).toBeNull();
    expect(await write("therapist", therapist, "2032-01-05")).toBe("42501");
  });

  it("INSERT without RETURNING isolates the INSERT policy: another creator, no creator, another tenant are refused", async () => {
    const out = await asRole(sql, "authenticated", claimsFor(tenant, "reception", reception), async (tx) => ({
      otherCreator: await refusal(tx, (sp) =>
        sp`insert into location_closed_days (tenant_id, location_id, starts_on, ends_on, kind, created_by)
           values (${tenant}, ${clinic}, '2032-02-01', '2032-02-01', 'outro', ${admin})`,
      ),
      noCreator: await refusal(tx, (sp) =>
        sp`insert into location_closed_days (tenant_id, location_id, starts_on, ends_on, kind)
           values (${tenant}, ${clinic}, '2032-02-02', '2032-02-02', 'outro')`,
      ),
      otherTenant: await refusal(tx, (sp) =>
        sp`insert into location_closed_days (tenant_id, location_id, starts_on, ends_on, kind, created_by)
           values (${other}, ${otherClinic}, '2032-02-03', '2032-02-03', 'outro', ${reception})`,
      ),
      // The row is in reception's OWN tenant but names another tenant's
      // clinic: only the locations-of-this-tenant clause refuses it (the
      // foreign key alone accepts any locations row).
      otherTenantsLocation: await refusal(tx, (sp) =>
        sp`insert into location_closed_days (tenant_id, location_id, starts_on, ends_on, kind, created_by)
           values (${tenant}, ${otherClinic}, '2032-02-04', '2032-02-04', 'outro', ${reception})`,
      ),
    }));
    expect(out).toEqual({ otherCreator: "42501", noCreator: "42501", otherTenant: "42501", otherTenantsLocation: "42501" });
  });

  it("CONTROL for the other-tenant location arm: the owner connection (no RLS) accepts that row", async () => {
    const code = await (async () => {
      try {
        await sql.begin(async (tx) => {
          await tx`insert into location_closed_days (tenant_id, location_id, starts_on, ends_on, kind, created_by)
                   values (${tenant}, ${otherClinic}, '2032-02-04', '2032-02-04', 'outro', ${reception})`;
          throw new Error("ROLLBACK-OK");
        });
        return "committed";
      } catch (e) {
        return (e as Error).message === "ROLLBACK-OK" ? "accepted" : ((e as { code?: string }).code ?? "error");
      }
    })();
    expect(code).toBe("accepted");
  });

  it("nobody updates a closure: the gate refuses before any policy is read", async () => {
    for (const [role, uid] of [
      ["owner", owner],
      ["admin", admin],
      ["reception", reception],
      ["therapist", therapist],
    ] as const) {
      const code = await asRole(sql, "authenticated", claimsFor(tenant, role, uid), (tx) =>
        refusal(tx, (sp) => sp`update location_closed_days set label = 'x' where id = ${future}`),
      );
      expect(code, role).toBe("42501");
    }
  });

  it("delete: a closure that has STARTED is refused; a future one is deleted; the other tenant's is out of reach", async () => {
    const out = await asRole(sql, "authenticated", claimsFor(tenant, "reception", reception), async (tx) => ({
      started: (await tx`delete from location_closed_days where id = ${past} returning id`).length,
      theirs: (await tx`delete from location_closed_days where id = ${theirs} returning id`).length,
      upcoming: (await tx`delete from location_closed_days where id = ${future} returning id`).length,
    }));
    expect(out).toEqual({ started: 0, theirs: 0, upcoming: 1 });
  });

  it("delete: a therapist deletes nothing, even a future closure", async () => {
    const n = await asRole(sql, "authenticated", claimsFor(tenant, "therapist", therapist), async (tx) =>
      (await tx`delete from location_closed_days where id = ${futureTwo} returning id`).length,
    );
    expect(n).toBe(0);
  });

  it("CONTROL for the started arm: the same admin deletes a future closure, so the zero above is the date clause", async () => {
    const n = await asRole(sql, "authenticated", claimsFor(tenant, "admin", admin), async (tx) => ({
      started: (await tx`delete from location_closed_days where id = ${past} returning id`).length,
      upcoming: (await tx`delete from location_closed_days where id = ${futureTwo} returning id`).length,
    }));
    expect(n).toEqual({ started: 0, upcoming: 1 });
  });

  it("the patient role is denied at the table gate", async () => {
    const code = await asRole(sql, "patient", JSON.stringify({ tenant_id: tenant, patient_id: randomUUID() }), (tx) =>
      refusal(tx, (sp) => sp`select id from location_closed_days`),
    );
    expect(code).toBe("42501");
  });

  it("deleting a clinic takes its closures with it (ON DELETE CASCADE)", async () => {
    await sql`insert into location_closed_days (tenant_id, location_id, starts_on, ends_on, kind)
              values (${tenant}, ${doomedClinic}, '2033-01-01', '2033-01-01', 'outro')`;
    expect(await sql`select 1 from location_closed_days where location_id = ${doomedClinic}`).toHaveLength(1);
    await sql`delete from locations where id = ${doomedClinic}`;
    expect(await sql`select 1 from location_closed_days where location_id = ${doomedClinic}`).toHaveLength(0);
  });
});
