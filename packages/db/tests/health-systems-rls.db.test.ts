/**
 * health-systems-rls.db.test.ts: Sistemas / SubSistemas, from the PENDING
 * migration packages/db/migrations-pending/NEXT-AFTER-0109_sistemas_subsistemas.sql
 * (the table public.health_systems, and patients.health_system_id and
 * patients.health_system_number).
 *
 * THIS IS THE TABLE'S RLS ISOLATION TEST (CLAUDE.md: every migration adding a
 * domain table ships one in the same pull request), AND ITS PER-ROLE POLICY
 * TEST.
 *
 * IT ASKS THE DATABASE WHICH SIDE IT IS ON and names it in each title. On a
 * database that has the table and both columns, every arm runs. On one that has
 * none of the three, every arm is skipped: that is CI's database while the file
 * is pending (CI builds from supabase/migrations, and a pending file is not
 * there). It THROWS on a database that has some of the three and not the others
 * (the migration is one transaction, so that database was built some other way),
 * and from the promotion on it THROWS on a database that has none: once a file
 * in packages/db/migrations creates the table, a skip is no longer an answer.
 *
 * WHAT IS PROVEN, AND AS WHOM. Every arm about access runs as the real
 * principal under real RLS (`set local role authenticated`, `patient` or
 * `anon`, with the claims the app sets), inside a transaction that always rolls
 * back. Both ways: what is allowed is shown to succeed, and what is refused is
 * shown to fail with the server's own error code, beside a control that reads a
 * row so "nothing" is never a pass on an empty set.
 *   - SELECT: owner, admin, therapist and reception of tenant A read A's rows
 *     and none of B's;
 *   - INSERT: owner and admin of A insert a row of A naming themselves; a
 *     therapist and a reception are refused; an admin is refused a row of B, and
 *     a row that names another creator or none;
 *   - UPDATE: owner and admin change name and active of A's rows; a therapist
 *     and a reception reach no row; an admin of B reaches none of A's; nobody
 *     may change tenant_id or created_by (no column grant);
 *   - DELETE: refused to every staff role (no grant);
 *   - patient, anon and service_role: refused every read;
 *   - ONE NAME PER CLINIC, normalized: case and whitespace variants are refused
 *     in the same tenant and accepted in another;
 *   - ACCENTS FOLD TOO (ruling Q12, 2026-11-04): "Medis" after "Médis" is
 *     refused in the same tenant and accepted in another, the index expression
 *     read from the catalogue maps a table of names to the expected keys, and a
 *     CONTROL shows the same inserts pass under the old expression (case and
 *     whitespace only), so the arm is proven to detect a missing fold;
 *   - patients: a ficha names a Sistema of its own tenant only (the composite
 *     key refuses another tenant's, even on the owner connection that bypasses
 *     RLS), and an admin sets and clears both fields through RLS.
 *
 * The owner connection seeds, cleans and tests the constraints (it bypasses RLS,
 * which is what makes those arms a test of the constraints and of nothing else).
 * Every id is random per run, and afterAll removes what beforeAll wrote.
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Sql, TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type AppRole, asRole, claimsFor, connect, live, patientClaims } from "./rls-harness";

/** The statement only this migration holds. */
const MARKER = "CREATE TABLE public.health_systems";

function promotedFiles(): string[] {
  const dir = join(__dirname, "..", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => readFileSync(join(dir, f), "utf8").includes(MARKER));
}

async function migrationState(): Promise<{ applied: boolean; side: string }> {
  if (!live) return { applied: false, side: "no database" };
  const probe = connect();
  try {
    const [row] = await probe<{ table_present: boolean; cols: number }[]>`
      select to_regclass('public.health_systems') is not null as table_present,
             (select count(*)::int from information_schema.columns
               where table_schema = 'public' and table_name = 'patients'
                 and column_name in ('health_system_id', 'health_system_number')) as cols`;
    const present = (row!.table_present ? 1 : 0) + row!.cols;
    if (present !== 0 && present !== 3) {
      throw new Error(
        `THE MIGRATION IS HALF APPLIED: ${present} of 3 objects (the table and two patients columns). ` +
          "It is one transaction, so this database was built some other way. Nothing here was measured.",
      );
    }
    const files = promotedFiles();
    if (files.length > 0 && present === 0) {
      throw new Error(
        `THE MIGRATION IS PROMOTED (${files.join(", ")}) BUT THIS DATABASE DOES NOT HAVE ITS TABLE. ` +
          "From the promotion on, a skip is no longer acceptable. Nothing here was measured.",
      );
    }
    return {
      applied: present === 3,
      side:
        present === 3
          ? "TABLE PRESENT"
          : "TABLE ABSENT on this database (the migration is pending; flips when it is applied)",
    };
  } finally {
    await probe.end({ timeout: 5 });
  }
}

const state = await migrationState();
const SIDE = state.side;
const d = live && state.applied ? describe : describe.skip;

/** The server's error code for one statement run as a principal, or null when it was accepted. */
async function refusal(
  sql: Sql,
  role: "authenticated" | "patient" | "service_role",
  claims: string | null,
  fn: (tx: TransactionSql) => Promise<unknown>,
): Promise<string | null> {
  try {
    await asRole(sql, role, claims, fn);
    return null;
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === undefined) throw err;
    return e.code;
  }
}

const RLS_REFUSED = "42501"; // new row violates row-level security policy, and permission denied
const UNIQUE = "23505";
const CHECK = "23514";
const FOREIGN_KEY = "23503";

d(`Sistemas / SubSistemas: health_systems and the two patients columns [${SIDE}]`, () => {
  let sql: Sql;
  const A = { tenant: randomUUID(), sys: randomUUID(), sysOff: randomUUID(), patient: randomUUID() };
  const B = { tenant: randomUUID(), sys: randomUUID(), patient: randomUUID() };
  const users: Record<"A" | "B", Record<AppRole, string>> = {
    A: { owner: randomUUID(), admin: randomUUID(), therapist: randomUUID(), reception: randomUUID() },
    B: { owner: randomUUID(), admin: randomUUID(), therapist: randomUUID(), reception: randomUUID() },
  };
  const STAFF: AppRole[] = ["owner", "admin", "therapist", "reception"];
  const as = (side: "A" | "B", role: AppRole) =>
    claimsFor(side === "A" ? A.tenant : B.tenant, role, users[side][role]);

  beforeAll(async () => {
    sql = connect();
    for (const [side, t] of [
      ["A", A.tenant],
      ["B", B.tenant],
    ] as const) {
      await sql`insert into tenants (id, name, slug) values (${t}, ${`HS ${side}`}, ${`hs-${side.toLowerCase()}-${t.slice(0, 8)}`})`;
      for (const role of STAFF) {
        const roleId = randomUUID();
        await sql`insert into roles (id, tenant_id, slug, name) values (${roleId}, ${t}, ${role}, ${role})`;
        await sql`insert into users (id, tenant_id, role_id, email, full_name)
                  values (${users[side][role]}, ${t}, ${roleId}, ${`hs-${users[side][role]}@example.pt`}, ${`HS ${role}`})`;
      }
    }
    await sql`insert into health_systems (id, tenant_id, name, created_by)
              values (${A.sys}, ${A.tenant}, 'ADSE', ${users.A.owner}),
                     (${A.sysOff}, ${A.tenant}, 'SAMS', ${users.A.owner}),
                     (${B.sys}, ${B.tenant}, 'Medis', ${users.B.owner})`;
    await sql`update health_systems set active = false where id = ${A.sysOff}`;
    await sql`insert into patients (id, tenant_id, full_name) values (${A.patient}, ${A.tenant}, 'HS Paciente A'),
                                                                   (${B.patient}, ${B.tenant}, 'HS Paciente B')`;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from patients where tenant_id in (${A.tenant}, ${B.tenant})`;
    await sql`delete from health_systems where tenant_id in (${A.tenant}, ${B.tenant})`;
    await sql`delete from users where tenant_id in (${A.tenant}, ${B.tenant})`;
    await sql`delete from roles where tenant_id in (${A.tenant}, ${B.tenant})`;
    await sql`delete from tenants where id in (${A.tenant}, ${B.tenant})`;
    await sql.end({ timeout: 5 });
  });

  /* ------------------------------------------------------------------ */
  /* The shape, read from the catalogue (the cross-check, not the proof) */
  /* ------------------------------------------------------------------ */

  it("the table: columns, nullability and defaults", async () => {
    const rows = await sql<{ c: string }[]>`
      select column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, '-') as c
        from information_schema.columns
       where table_schema = 'public' and table_name = 'health_systems'
       order by ordinal_position`;
    expect(rows.map((r) => r.c)).toEqual([
      "id:uuid:NO:gen_random_uuid()",
      "tenant_id:uuid:NO:-",
      "name:text:NO:-",
      "active:boolean:NO:true",
      "created_at:timestamp with time zone:NO:now()",
      "created_by:uuid:YES:-",
    ]);
  });

  it("RLS is enabled, not forced, and there are exactly three policies, one per command", async () => {
    const [cls] = await sql<{ on: boolean; forced: boolean }[]>`
      select relrowsecurity as on, relforcerowsecurity as forced from pg_class where oid = 'public.health_systems'::regclass`;
    expect(cls).toEqual({ on: true, forced: false });
    const pols = await sql<{ p: string }[]>`
      select policyname || ':' || cmd || ':' || permissive || ':' || array_to_string(roles, '+') as p
        from pg_policies where schemaname = 'public' and tablename = 'health_systems' order by policyname`;
    expect(pols.map((r) => r.p)).toEqual([
      "health_systems_manager_insert:INSERT:PERMISSIVE:authenticated",
      "health_systems_manager_update:UPDATE:PERMISSIVE:authenticated",
      "health_systems_staff_select:SELECT:PERMISSIVE:authenticated",
    ]);
  });

  it("the grants: authenticated holds SELECT, INSERT and UPDATE of name and active only; nobody else holds anything", async () => {
    const table = await sql<{ g: string }[]>`
      select grantee || ':' || privilege_type as g from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'health_systems' and grantee <> 'postgres'
       order by grantee, privilege_type`;
    expect(table.map((r) => r.g)).toEqual(["authenticated:INSERT", "authenticated:SELECT"]);
    const updates = await sql<{ g: string }[]>`
      select grantee || ':' || column_name as g from information_schema.column_privileges
       where table_schema = 'public' and table_name = 'health_systems' and grantee <> 'postgres'
         and privilege_type = 'UPDATE'
       order by grantee, column_name`;
    expect(updates.map((r) => r.g)).toEqual(["authenticated:active", "authenticated:name"]);
    const [pub] = await sql<{ n: number }[]>`
      select count(*)::int as n from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'health_systems' and grantee = 'PUBLIC'`;
    expect(pub!.n).toBe(0);
  });

  it("the two patients columns: nullable, no default, with the privileges every role holds on nif", async () => {
    const rows = await sql<{ c: string }[]>`
      select column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, '-') as c
        from information_schema.columns
       where table_schema = 'public' and table_name = 'patients'
         and column_name in ('health_system_id', 'health_system_number')
       order by column_name`;
    expect(rows.map((r) => r.c)).toEqual(["health_system_id:uuid:YES:-", "health_system_number:text:YES:-"]);
    const diff = await sql<{ d: string }[]>`
      select r || ':' || p || ':' || c as d
        from unnest(array['anon', 'authenticated', 'patient', 'service_role']) r,
             unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) p,
             unnest(array['health_system_id', 'health_system_number']) c
       where has_column_privilege(r, 'public.patients', c, p) <> has_column_privilege(r, 'public.patients', 'nif', p)`;
    expect(diff).toEqual([]);
  });

  /* ------------------------------------------------------------------ */
  /* SELECT                                                              */
  /* ------------------------------------------------------------------ */

  for (const role of ["owner", "admin", "therapist", "reception"] as const) {
    it(`SELECT as ${role} of A: A's two rows, active and inactive, and none of B's`, async () => {
      const ids = await asRole(sql, "authenticated", as("A", role), async (tx) =>
        (await tx<{ id: string }[]>`select id from health_systems where tenant_id in (${A.tenant}, ${B.tenant}) order by name`).map(
          (r) => r.id,
        ),
      );
      expect(ids).toEqual([A.sys, A.sysOff]);
    });
  }

  it("SELECT as admin of B: B's row, and none of A's, even asked by id", async () => {
    const ids = await asRole(sql, "authenticated", as("B", "admin"), async (tx) =>
      (await tx<{ id: string }[]>`select id from health_systems where id in (${A.sys}, ${A.sysOff}, ${B.sys})`).map((r) => r.id),
    );
    expect(ids).toEqual([B.sys]);
  });

  it("SELECT with a tenant claim but no staff role reads nothing (control: the owner of A reads A's row)", async () => {
    const control = await asRole(sql, "authenticated", as("A", "owner"), async (tx) =>
      (await tx`select id from health_systems where id = ${A.sys}`).length,
    );
    expect(control).toBe(1);
    const roleless = JSON.stringify({ tenant_id: A.tenant, sub: users.A.owner });
    const n = await asRole(sql, "authenticated", roleless, async (tx) =>
      (await tx`select id from health_systems where id = ${A.sys}`).length,
    );
    expect(n).toBe(0);
  });

  it("patient, service_role and anon are refused every read of the table", async () => {
    expect(
      await refusal(sql, "patient", patientClaims(A.tenant, A.patient), (tx) => tx`select id from health_systems`),
    ).toBe(RLS_REFUSED);
    expect(await refusal(sql, "service_role", null, (tx) => tx`select id from health_systems`)).toBe(RLS_REFUSED);
    const anon = await sql
      .begin(async (tx) => {
        await tx.unsafe("set local role anon");
        await tx`select id from health_systems`;
      })
      .then(
        () => null,
        (e: { code?: string }) => e.code ?? "no code",
      );
    expect(anon).toBe(RLS_REFUSED);
  });

  /* ------------------------------------------------------------------ */
  /* INSERT                                                              */
  /* ------------------------------------------------------------------ */

  for (const role of ["owner", "admin"] as const) {
    it(`INSERT as ${role} of A: a row of A naming its creator is accepted and reads back`, async () => {
      const name = `Novo ${role} ${randomUUID().slice(0, 6)}`;
      const back = await asRole(sql, "authenticated", as("A", role), async (tx) => {
        await tx`insert into health_systems (tenant_id, name, created_by) values (${A.tenant}, ${name}, ${users.A[role]})`;
        return tx<{ name: string; active: boolean; created_by: string }[]>`
          select name, active, created_by from health_systems where tenant_id = ${A.tenant} and name = ${name}`;
      });
      expect(back).toEqual([{ name, active: true, created_by: users.A[role] }]);
    });
  }

  for (const role of ["therapist", "reception"] as const) {
    it(`INSERT as ${role} of A is refused by the policy`, async () => {
      expect(
        await refusal(sql, "authenticated", as("A", role), (tx) =>
          tx`insert into health_systems (tenant_id, name, created_by) values (${A.tenant}, 'Nao pode', ${users.A[role]})`,
        ),
      ).toBe(RLS_REFUSED);
    });
  }

  it("INSERT as admin of B of a row of tenant A is refused (cross-tenant)", async () => {
    expect(
      await refusal(sql, "authenticated", as("B", "admin"), (tx) =>
        tx`insert into health_systems (tenant_id, name, created_by) values (${A.tenant}, 'Intruso', ${users.B.admin})`,
      ),
    ).toBe(RLS_REFUSED);
  });

  it("INSERT as admin of A naming another creator, or none, is refused", async () => {
    expect(
      await refusal(sql, "authenticated", as("A", "admin"), (tx) =>
        tx`insert into health_systems (tenant_id, name, created_by) values (${A.tenant}, 'Outro autor', ${users.A.owner})`,
      ),
    ).toBe(RLS_REFUSED);
    expect(
      await refusal(sql, "authenticated", as("A", "admin"), (tx) =>
        tx`insert into health_systems (tenant_id, name) values (${A.tenant}, 'Sem autor')`,
      ),
    ).toBe(RLS_REFUSED);
  });

  /* ------------------------------------------------------------------ */
  /* UPDATE and DELETE                                                   */
  /* ------------------------------------------------------------------ */

  for (const role of ["owner", "admin"] as const) {
    it(`UPDATE as ${role} of A: name and active change on A's row`, async () => {
      const back = await asRole(sql, "authenticated", as("A", role), async (tx) => {
        const hit = await tx`update health_systems set name = 'ADSE (Direcao-Geral)', active = false where id = ${A.sys} returning id`;
        const [row] = await tx<{ name: string; active: boolean }[]>`select name, active from health_systems where id = ${A.sys}`;
        return { hit: hit.length, row };
      });
      expect(back).toEqual({ hit: 1, row: { name: "ADSE (Direcao-Geral)", active: false } });
    });
  }

  for (const role of ["therapist", "reception"] as const) {
    it(`UPDATE as ${role} of A reaches no row (control: the same session reads it)`, async () => {
      const back = await asRole(sql, "authenticated", as("A", role), async (tx) => {
        const seen = (await tx`select id from health_systems where id = ${A.sys}`).length;
        const hit = (await tx`update health_systems set active = false where id = ${A.sys} returning id`).length;
        return { seen, hit };
      });
      expect(back).toEqual({ seen: 1, hit: 0 });
    });
  }

  it("UPDATE as admin of B reaches none of A's rows (cross-tenant)", async () => {
    const hit = await asRole(sql, "authenticated", as("B", "admin"), async (tx) =>
      (await tx`update health_systems set active = false where id in (${A.sys}, ${A.sysOff}) returning id`).length,
    );
    expect(hit).toBe(0);
  });

  it("UPDATE as admin of B with no WHERE and no RETURNING reaches B's one row only (the UPDATE policy's own tenant key)", async () => {
    // With a WHERE or a RETURNING, the SELECT policy also filters the rows an
    // UPDATE reaches, so the arm above would pass on the SELECT policy alone. A
    // bare UPDATE is filtered by the UPDATE policy's USING and nothing else. Its
    // SET is a constant: a SET that reads a column brings the SELECT policy in.
    const count = await asRole(sql, "authenticated", as("B", "admin"), async (tx) => {
      const res = await tx`update health_systems set active = false`;
      return res.count;
    });
    expect(count).toBe(1);
  });

  it("UPDATE of tenant_id or created_by is refused to the owner of A (no column grant)", async () => {
    expect(
      await refusal(sql, "authenticated", as("A", "owner"), (tx) =>
        tx`update health_systems set tenant_id = ${B.tenant} where id = ${A.sys}`,
      ),
    ).toBe(RLS_REFUSED);
    expect(
      await refusal(sql, "authenticated", as("A", "owner"), (tx) =>
        tx`update health_systems set created_by = ${users.A.admin} where id = ${A.sys}`,
      ),
    ).toBe(RLS_REFUSED);
  });

  for (const role of ["owner", "admin", "therapist", "reception"] as const) {
    it(`DELETE as ${role} of A is refused (no grant)`, async () => {
      expect(
        await refusal(sql, "authenticated", as("A", role), (tx) => tx`delete from health_systems where id = ${A.sys}`),
      ).toBe(RLS_REFUSED);
    });
  }

  /* ------------------------------------------------------------------ */
  /* The constraints (owner connection: RLS out of the way)              */
  /* ------------------------------------------------------------------ */

  it("one name per clinic: case and whitespace variants are refused in A and accepted in B", async () => {
    for (const variant of ["ADSE", "adse", "  Adse  ", "ADSE\n"]) {
      const code = await sql
        .begin(async (tx) => {
          await tx`insert into health_systems (tenant_id, name) values (${A.tenant}, ${variant})`;
        })
        .then(
          () => null,
          (e: { code?: string }) => e.code ?? "no code",
        );
      expect(code, variant).toBe(UNIQUE);
    }
    // Internal runs of whitespace read as one space.
    await sql`insert into health_systems (tenant_id, name) values (${A.tenant}, 'Sub Sistema X')`;
    const internal = await sql
      .begin(async (tx) => {
        await tx`insert into health_systems (tenant_id, name) values (${A.tenant}, ${"sub   sistema\tx"})`;
      })
      .then(
        () => null,
        (e: { code?: string }) => e.code ?? "no code",
      );
    expect(internal).toBe(UNIQUE);
    // The inactive row's name counts too.
    const inactive = await sql
      .begin(async (tx) => {
        await tx`insert into health_systems (tenant_id, name) values (${A.tenant}, 'sams')`;
      })
      .then(
        () => null,
        (e: { code?: string }) => e.code ?? "no code",
      );
    expect(inactive).toBe(UNIQUE);
    // Another clinic may hold the same name.
    const other = await sql
      .begin(async (tx) => {
        await tx`insert into health_systems (tenant_id, name) values (${B.tenant}, 'ADSE')`;
        throw new Error("rollback");
      })
      .then(
        () => "committed",
        (e: { code?: string; message?: string }) => e.code ?? e.message,
      );
    expect(other).toBe("rollback");
    await sql`delete from health_systems where tenant_id = ${A.tenant} and name = 'Sub Sistema X'`;
  });

  /* ------------------------------------------------------------------ */
  /* Accents fold (ruling Q12, 2026-11-04)                               */
  /* ------------------------------------------------------------------ */

  /** The index's name expression, read from the catalogue (its second column). */
  const indexExpression = async (): Promise<string> => {
    const [row] = await sql<{ e: string }[]>`
      select pg_get_indexdef('public.health_systems_tenant_name_key'::regclass, 2, false) as e`;
    return row!.e;
  };

  /** The expression before Q12: case and whitespace only. The CONTROL. */
  const OLD_EXPRESSION = "lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g')))";

  /** Insert two names, in order, into the same tenant; the error code of the second, or null. */
  const secondInsert = async (tx: TransactionSql, table: string, first: string, second: string) => {
    const t = randomUUID();
    await tx.unsafe(`insert into ${table} (tenant_id, name) values ($1, $2)`, [t, first]);
    try {
      await tx.savepoint((sp) => sp.unsafe(`insert into ${table} (tenant_id, name) values ($1, $2)`, [t, second]));
      return null;
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === undefined) throw err;
      return e.code;
    }
  };

  it("the index folds accents: its catalogue expression maps a table of names to the expected keys", async () => {
    const expr = await indexExpression();
    expect(expr).toContain("translate(lower(btrim(regexp_replace(name");
    const table: [string, string][] = [
      ["Médis", "medis"],
      ["Medis", "medis"],
      ["MEDIS", "medis"],
      [" médis ", "medis"],
      ["MÉDIS", "medis"],
      ["Saúde", "saude"],
      ["Saude", "saude"],
      ["Ç", "c"],
      ["C", "c"],
      ["Açoreana  Saúde", "acoreana saude"],
      ["ÀÁÂÃÄ èéêëẽ ìíîïĩ òóôõö ùúûüũ ñ", "aaaaa eeeee iiiii ooooo uuuuu n"],
      ["Medis Plus", "medis plus"],
      ["Fidelidade Saúde", "fidelidade saude"],
    ];
    // The column is called name, so the catalogue's text runs unchanged.
    const keys = await sql.unsafe<{ name: string; key: string }[]>(
      `select name, ${expr} as key from unnest($1::text[]) with ordinality as u(name, ord) order by ord`,
      [table.map(([n]) => n)],
    );
    expect(keys.map((r) => [r.name, r.key])).toEqual(table);
  });

  it("'Medis' after 'Médis' is refused in the same tenant (and MEDIS, ' médis '), accepted in another; two names stay distinct", async () => {
    await sql`insert into health_systems (tenant_id, name) values (${A.tenant}, 'Médis'), (${A.tenant}, 'Saúde Prime')`;
    try {
      for (const variant of ["Medis", "MEDIS", " médis ", "MÉDIS", "Saude Prime", "SAUDE  PRIME"]) {
        const code = await sql
          .begin(async (tx) => {
            await tx`insert into health_systems (tenant_id, name) values (${A.tenant}, ${variant})`;
          })
          .then(
            () => null,
            (e: { code?: string }) => e.code ?? "no code",
          );
        expect(code, variant).toBe(UNIQUE);
      }
      // Another clinic may hold the folded name: B already holds 'Medis' (seed),
      // and 'Saude Prime' is accepted there.
      const other = await sql
        .begin(async (tx) => {
          await tx`insert into health_systems (tenant_id, name) values (${B.tenant}, 'Saude Prime')`;
          throw new Error("rollback");
        })
        .then(
          () => "committed",
          (e: { code?: string; message?: string }) => e.code ?? e.message,
        );
      expect(other).toBe("rollback");
      const [seedB] = await sql<{ n: number }[]>`
        select count(*)::int as n from health_systems where tenant_id = ${B.tenant} and name = 'Medis'`;
      expect(seedB!.n).toBe(1);
      // Two names that must stay distinct in the same tenant.
      for (const distinct of ["Medis Plus", "Saúde Primeira"]) {
        const code = await sql
          .begin(async (tx) => {
            await tx`insert into health_systems (tenant_id, name) values (${A.tenant}, ${distinct})`;
            throw new Error("rollback");
          })
          .then(
            () => "committed",
            (e: { code?: string; message?: string }) => e.code ?? e.message,
          );
        expect(code, distinct).toBe("rollback");
      }
    } finally {
      await sql`delete from health_systems where tenant_id = ${A.tenant} and name in ('Médis', 'Saúde Prime')`;
    }
  });

  it("CONTROL: under the old expression the same accent inserts are NOT refused; under the catalogue's they are", async () => {
    const expr = await indexExpression();
    expect(expr.replace(/::text/g, "")).not.toBe(OLD_EXPRESSION);
    const verdicts = await sql
      .begin(async (tx) => {
        await tx.unsafe("create temp table hs_q12_old (tenant_id uuid not null, name text not null) on commit drop");
        await tx.unsafe(`create unique index on hs_q12_old (tenant_id, ${OLD_EXPRESSION})`);
        await tx.unsafe("create temp table hs_q12_new (tenant_id uuid not null, name text not null) on commit drop");
        await tx.unsafe(`create unique index on hs_q12_new (tenant_id, ${expr})`);
        const out = {
          oldAccent: await secondInsert(tx, "hs_q12_old", "Médis", "Medis"),
          oldCase: await secondInsert(tx, "hs_q12_old", "ADSE", " adse "),
          newAccent: await secondInsert(tx, "hs_q12_new", "Médis", "Medis"),
          newCase: await secondInsert(tx, "hs_q12_new", "ADSE", " adse "),
        };
        throw Object.assign(new Error("rollback"), { out });
      })
      .catch((e: { out?: unknown }) => {
        if (e.out === undefined) throw e;
        return e.out;
      });
    // The old expression refuses the case variant (it works) but lets the
    // accent variant in: the defect Q12 names. The catalogue's refuses both.
    expect(verdicts).toEqual({ oldAccent: null, oldCase: UNIQUE, newAccent: UNIQUE, newCase: UNIQUE });
  });

  it("a name must not be blank and is at most 120 characters", async () => {
    for (const [name, want] of [
      ["", CHECK],
      ["   ", CHECK],
      ["x".repeat(121), CHECK],
      ["x".repeat(120), "rollback"],
    ] as const) {
      const code = await sql
        .begin(async (tx) => {
          await tx`insert into health_systems (tenant_id, name) values (${B.tenant}, ${name})`;
          throw new Error("rollback");
        })
        .then(
          () => "committed",
          (e: { code?: string; message?: string }) => e.code ?? e.message,
        );
      expect(code, `length ${name.length}`).toBe(want);
    }
  });

  /* ------------------------------------------------------------------ */
  /* patients                                                            */
  /* ------------------------------------------------------------------ */

  it("a ficha names a Sistema of its own tenant only, even on the owner connection", async () => {
    const cross = await sql
      .begin(async (tx) => {
        await tx`update patients set health_system_id = ${B.sys} where id = ${A.patient}`;
      })
      .then(
        () => null,
        (e: { code?: string }) => e.code ?? "no code",
      );
    expect(cross).toBe(FOREIGN_KEY);
    const own = await sql
      .begin(async (tx) => {
        await tx`update patients set health_system_id = ${A.sys} where id = ${A.patient}`;
        throw new Error("rollback");
      })
      .then(
        () => "committed",
        (e: { code?: string; message?: string }) => e.code ?? e.message,
      );
    expect(own).toBe("rollback");
  });

  it("the number must not be blank and is at most 64 characters", async () => {
    for (const [n, want] of [
      ["", CHECK],
      [" ", CHECK],
      ["9".repeat(65), CHECK],
      ["9".repeat(64), "rollback"],
    ] as const) {
      const code = await sql
        .begin(async (tx) => {
          await tx`update patients set health_system_number = ${n} where id = ${A.patient}`;
          throw new Error("rollback");
        })
        .then(
          () => "committed",
          (e: { code?: string; message?: string }) => e.code ?? e.message,
        );
      expect(code, `length ${n.length}`).toBe(want);
    }
  });

  for (const role of ["admin", "reception"] as const) {
    it(`as ${role} of A, through RLS: set both fields on A's patient, read them back, clear them`, async () => {
      const back = await asRole(sql, "authenticated", as("A", role), async (tx) => {
        const set = await tx`update patients set health_system_id = ${A.sys}, health_system_number = '123456789'
                             where id = ${A.patient} returning id`;
        const [row] = await tx<{ health_system_id: string | null; health_system_number: string | null }[]>`
          select health_system_id, health_system_number from patients where id = ${A.patient}`;
        await tx`update patients set health_system_id = null, health_system_number = null where id = ${A.patient}`;
        const [cleared] = await tx<{ health_system_id: string | null; health_system_number: string | null }[]>`
          select health_system_id, health_system_number from patients where id = ${A.patient}`;
        return { set: set.length, row, cleared };
      });
      expect(back).toEqual({
        set: 1,
        row: { health_system_id: A.sys, health_system_number: "123456789" },
        cleared: { health_system_id: null, health_system_number: null },
      });
    });
  }

  it("as admin of A, through RLS: B's Sistema is refused on A's patient", async () => {
    expect(
      await refusal(sql, "authenticated", as("A", "admin"), (tx) =>
        tx`update patients set health_system_id = ${B.sys} where id = ${A.patient}`,
      ),
    ).toBe(FOREIGN_KEY);
  });
});
