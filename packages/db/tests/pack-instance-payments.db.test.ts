/**
 * pack-instance-payments.db.test.ts: the isolation proof for pack payments,
 * from the PENDING migration
 * packages/db/migrations-pending/NEXT-AFTER-0114_pack_payments.sql
 * (public.pack_instance_agreed_prices and public.pack_instance_payments).
 *
 * THIS FILE ASKS THE DATABASE WHICH SIDE IT IS ON and names it in each title.
 * On a database that has the tables, every arm runs. On one that does not,
 * every arm is skipped, which is what CI's database is while the file is
 * pending (CI builds from supabase/migrations, and a pending file is not
 * there). From the promotion on it THROWS on a database without the tables:
 * once a file in packages/db/migrations creates them, a skip is no longer an
 * answer.
 *
 * WHAT IT MEASURES, under real RLS (`set local role authenticated` and staff
 * claims, always rolled back):
 *   - THE SHAPE: columns, nullability, RLS on and not forced, the policies by
 *     name and command, and patient_pack_instances' own grants and policies
 *     left exactly as 0037 made them;
 *   - THE GATES, read with has_table_privilege, never an aclitem grep;
 *   - ISOLATION: tenant A's admin reads A's rows and not B's, beside B's admin
 *     reading B's (never a pass on an empty set);
 *   - THE ROLE MATRIX: owner, admin and reception read and record; a therapist
 *     reads NO price and NO line and records none (P4); a correcao by owner or
 *     admin only; the creator, the instance and the clinic are the caller's own;
 *   - APPEND ONLY: UPDATE, DELETE and TRUNCATE refused at the gate on both
 *     tables for every staff role;
 *   - SET ONCE: a second price for the same instance is a primary key violation;
 *   - THE CONSTRAINTS by name, each with everything else satisfied;
 *   - STRATEGY 2026-11-06: nothing reaches anyone through PUBLIC on the
 *     instance table or either money table (SR-52, SR-56), with a control that
 *     grants to PUBLIC in a rolled-back transaction; the live census of
 *     UPDATE writers of patient_pack_instances (no user trigger, no function
 *     body, no referential action; the static half is
 *     scripts/pack-instances-update-census.test.mjs); and the set-once
 *     mechanism named, with controls that drop the primary key, and add an
 *     UPDATE grant and policy, inside rolled-back transactions.
 *   Each refusal that could be the fixture's fault has a control showing the
 *   owning connection accepts the same row.
 *
 * Every id is random per run, and afterAll removes what beforeAll wrote.
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Sql, TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live, Rollback } from "./rls-harness";

const PAYMENTS = "public.pack_instance_payments";
const PRICES = "public.pack_instance_agreed_prices";
const INSTANCES = "public.patient_pack_instances";
/** The statement only this migration holds. */
const MARKER = "CREATE TABLE public.pack_instance_payments";

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
    const [row] = await probe<{ present: boolean }[]>`
      select (to_regclass(${PAYMENTS}) is not null and to_regclass(${PRICES}) is not null) as present`;
    const present = row?.present === true;
    const files = promotedFiles();
    if (files.length > 0 && !present) {
      throw new Error(
        `THE MIGRATION IS PROMOTED (${files.join(", ")}) BUT THIS DATABASE HAS NO PACK MONEY TABLES. ` +
          "From the promotion on, a skip is no longer acceptable. Nothing here was measured.",
      );
    }
    return {
      applied: present,
      side: present
        ? "TABLES PRESENT"
        : "TABLES ABSENT on this database (the migration is pending; flips when it is applied)",
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

/** Run fn as the owning connection in a transaction that is always rolled back. */
async function ownerTry(sql: Sql, fn: (tx: TransactionSql) => Promise<unknown>): Promise<string> {
  try {
    await sql.begin(async (tx) => {
      await fn(tx);
      throw new Error("ROLLBACK-OK");
    });
    return "committed";
  } catch (e) {
    if ((e as Error).message === "ROLLBACK-OK") return "ok";
    return (e as { constraint_name?: string }).constraint_name ?? (e as { code?: string }).code ?? (e as Error).message;
  }
}

/**
 * Run each DDL statement as the owning connection, then `set local role
 * authenticated` with the claims, then fn; ALWAYS rolled back, so a control
 * that removes or adds a mechanism never outlives its transaction.
 */
async function ddlThenAs<T>(sql: Sql, ddl: string[], claims: string, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  try {
    await sql.begin(async (tx) => {
      for (const stmt of ddl) await tx.unsafe(stmt);
      await tx.unsafe("set local role authenticated");
      await tx`select set_config('request.jwt.claims', ${claims}, true)`;
      throw new Rollback(await fn(tx));
    });
    throw new Error("unreachable: transaction committed without rollback");
  } catch (err) {
    if (err instanceof Rollback) return err.value as T;
    throw err;
  }
}

/** An SQL UPDATE of patient_pack_instances, as a Postgres regular expression. */
const UPDATES_INSTANCES = String.raw`update\s+(only\s+)?("?public"?\.)?"?patient_pack_instances\M`;

d(`pack payments: shape, gates, policies, set once [${SIDE}]`, () => {
  let sql: Sql;
  const tenant = randomUUID();
  const other = randomUUID();
  const owner = randomUUID();
  const admin = randomUUID();
  const reception = randomUUID();
  const therapist = randomUUID();
  const otherAdmin = randomUUID();
  const loc = randomUUID();
  const otherLoc = randomUUID();
  const patient = randomUUID();
  const otherPatient = randomUUID();
  let pack = "";
  let otherPack = "";
  const inst = randomUUID(); // no agreed price
  const priced = randomUUID(); // agreed price set
  const otherInst = randomUUID(); // other tenant, priced
  const otherBare = randomUUID(); // other tenant, NO price: the cross-tenant price arm and its control
  const lineA = randomUUID();
  const lineA2 = randomUUID();
  const lineB = randomUUID();

  beforeAll(async () => {
    sql = connect();
    for (const [id, slug] of [
      [tenant, "pp-a"],
      [other, "pp-b"],
    ] as const) {
      await sql`insert into tenants (id, name, slug) values (${id}, ${slug}, ${slug + "-" + id.slice(0, 8)})`;
    }
    const person = (id: string, t: string, name: string) =>
      sql`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
          values (${id}, ${t}, ${"pp-" + id.slice(0, 8) + "@t.test"}, ${name}, true, true)`;
    await person(owner, tenant, "Owner PP");
    await person(admin, tenant, "Admin PP");
    await person(reception, tenant, "Rececao PP");
    await person(therapist, tenant, "Terapeuta PP");
    await person(otherAdmin, other, "Admin Outra PP");
    await sql`insert into locations (id, tenant_id, name) values (${loc}, ${tenant}, 'PP clinica A'), (${otherLoc}, ${other}, 'PP clinica B')`;
    const [svcA] = await sql<{ id: string }[]>`insert into services (tenant_id, name) values (${tenant}, 'PP svc') returning id`;
    const [svcB] = await sql<{ id: string }[]>`insert into services (tenant_id, name) values (${other}, 'PP svc') returning id`;
    const [pA] = await sql<{ id: string }[]>`
      insert into service_packs (tenant_id, base_service_id, name, session_count, price_cents)
      values (${tenant}, ${svcA!.id}, 'PP pack', 10, 45000) returning id`;
    const [pB] = await sql<{ id: string }[]>`
      insert into service_packs (tenant_id, base_service_id, name, session_count, price_cents)
      values (${other}, ${svcB!.id}, 'PP pack', 10, 45000) returning id`;
    pack = pA!.id;
    otherPack = pB!.id;
    await sql`insert into patients (id, tenant_id, full_name) values (${patient}, ${tenant}, 'PP utente A'), (${otherPatient}, ${other}, 'PP utente B')`;
    // Seeded as the owning connection (bypasses RLS). The instance INSERT must
    // name sessions_remaining: NOT NULL with no default (the frozen-column guard
    // allow-lists this file for that reason only; nothing here updates or reads it).
    await sql`insert into patient_pack_instances (id, tenant_id, patient_id, pack_id, sessions_total, sessions_remaining)
              values (${inst}, ${tenant}, ${patient}, ${pack}, 10, 10),
                     (${priced}, ${tenant}, ${patient}, ${pack}, 10, 10),
                     (${otherInst}, ${other}, ${otherPatient}, ${otherPack}, 10, 10),
                     (${otherBare}, ${other}, ${otherPatient}, ${otherPack}, 10, 10)`;
    await sql`insert into pack_instance_agreed_prices (pack_instance_id, tenant_id, agreed_price_cents, created_by)
              values (${priced}, ${tenant}, 40000, ${reception}), (${otherInst}, ${other}, 30000, ${otherAdmin})`;
    await sql`insert into pack_instance_payments (id, tenant_id, pack_instance_id, location_id, kind, amount_cents, received_on, method, stylus_ref, created_by)
              values (${lineA}, ${tenant}, ${priced}, ${loc}, 'pagamento', 20000, '2026-11-02', 'mbway', 'FR 1E/1', ${reception}),
                     (${lineA2}, ${tenant}, ${priced}, ${loc}, 'pagamento', 5000, '2026-11-03', 'numerario', null, ${reception}),
                     (${lineB}, ${other}, ${otherInst}, ${otherLoc}, 'pagamento', 9000, '2026-11-02', 'cartao', null, ${otherAdmin})`;
  });

  afterAll(async () => {
    if (!sql) return;
    // The money rows first: their keys to tenants, instances and locations are
    // NO ACTION, so the deletes below would refuse while they exist.
    await sql`delete from pack_instance_payments where tenant_id in (${tenant}, ${other})`;
    await sql`delete from pack_instance_agreed_prices where tenant_id in (${tenant}, ${other})`;
    await sql`delete from patient_pack_instances where tenant_id in (${tenant}, ${other})`;
    await sql`delete from service_packs where tenant_id in (${tenant}, ${other})`;
    await sql`delete from services where tenant_id in (${tenant}, ${other})`;
    await sql`delete from patients where tenant_id in (${tenant}, ${other})`;
    await sql`delete from locations where tenant_id in (${tenant}, ${other})`;
    await sql`delete from users where tenant_id in (${tenant}, ${other})`;
    await sql`delete from tenants where id in (${tenant}, ${other})`;
    await sql.end({ timeout: 5 });
  });

  const lineCols = (over: Record<string, unknown> = {}) => ({
    tenant_id: tenant,
    pack_instance_id: inst,
    location_id: loc,
    kind: "pagamento",
    amount_cents: 1000,
    received_on: "2026-11-04",
    method: "numerario",
    ...over,
  });

  it("the columns of both tables: types and nullability", async () => {
    const cols = (t: string) => sql<{ column_name: string; data_type: string; is_nullable: string }[]>`
      select column_name::text, data_type::text, is_nullable::text
        from information_schema.columns
       where table_schema = 'public' and table_name = ${t}
       order by column_name`;
    expect(await cols("pack_instance_payments")).toEqual([
      { column_name: "amount_cents", data_type: "integer", is_nullable: "NO" },
      { column_name: "corrects_id", data_type: "uuid", is_nullable: "YES" },
      { column_name: "created_at", data_type: "timestamp with time zone", is_nullable: "NO" },
      { column_name: "created_by", data_type: "uuid", is_nullable: "YES" },
      { column_name: "id", data_type: "uuid", is_nullable: "NO" },
      { column_name: "kind", data_type: "text", is_nullable: "NO" },
      { column_name: "location_id", data_type: "uuid", is_nullable: "NO" },
      { column_name: "method", data_type: "text", is_nullable: "YES" },
      { column_name: "pack_instance_id", data_type: "uuid", is_nullable: "NO" },
      { column_name: "reason", data_type: "text", is_nullable: "YES" },
      { column_name: "received_on", data_type: "date", is_nullable: "NO" },
      { column_name: "stylus_ref", data_type: "text", is_nullable: "YES" },
      { column_name: "tenant_id", data_type: "uuid", is_nullable: "NO" },
    ]);
    expect(await cols("pack_instance_agreed_prices")).toEqual([
      { column_name: "agreed_price_cents", data_type: "integer", is_nullable: "NO" },
      { column_name: "created_at", data_type: "timestamp with time zone", is_nullable: "NO" },
      { column_name: "created_by", data_type: "uuid", is_nullable: "YES" },
      { column_name: "pack_instance_id", data_type: "uuid", is_nullable: "NO" },
      { column_name: "tenant_id", data_type: "uuid", is_nullable: "NO" },
    ]);
  });

  it("RLS on both tables is enabled and not forced; the four policies by name and command", async () => {
    for (const t of [PAYMENTS, PRICES]) {
      const [rel] = await sql<{ rls: boolean; forced: boolean }[]>`
        select relrowsecurity as rls, relforcerowsecurity as forced from pg_class where oid = to_regclass(${t})`;
      expect(rel, t).toEqual({ rls: true, forced: false });
    }
    const pols = await sql<{ table: string; name: string; cmd: string; permissive: string; roles: string[] }[]>`
      select tablename::text as table, policyname::text as name, cmd::text as cmd, permissive::text as permissive, roles::text[] as roles
        from pg_policies
       where schemaname = 'public' and tablename in ('pack_instance_payments', 'pack_instance_agreed_prices')
       order by tablename, policyname`;
    expect(pols).toEqual([
      { table: "pack_instance_agreed_prices", name: "pack_instance_agreed_prices_staff_insert", cmd: "INSERT", permissive: "PERMISSIVE", roles: ["authenticated"] },
      { table: "pack_instance_agreed_prices", name: "pack_instance_agreed_prices_staff_select", cmd: "SELECT", permissive: "PERMISSIVE", roles: ["authenticated"] },
      { table: "pack_instance_payments", name: "pack_instance_payments_staff_insert", cmd: "INSERT", permissive: "PERMISSIVE", roles: ["authenticated"] },
      { table: "pack_instance_payments", name: "pack_instance_payments_staff_select", cmd: "SELECT", permissive: "PERMISSIVE", roles: ["authenticated"] },
    ]);
  });

  it("patient_pack_instances is untouched: 0037's one policy, and authenticated keeps SELECT, INSERT, UPDATE, DELETE", async () => {
    const pols = await sql<{ name: string; cmd: string; permissive: string }[]>`
      select policyname::text as name, cmd::text as cmd, permissive::text as permissive
        from pg_policies where schemaname = 'public' and tablename = 'patient_pack_instances' order by policyname`;
    expect(pols).toEqual([{ name: "patient_pack_instances_tenant_isolation", cmd: "ALL", permissive: "PERMISSIVE" }]);
    for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      const [r] = await sql<{ ok: boolean }[]>`select has_table_privilege('authenticated', ${INSTANCES}, ${p}) as ok`;
      expect(r!.ok, p).toBe(true);
    }
    const [col] = await sql<{ n: number }[]>`
      select count(*)::int as n from information_schema.columns
       where table_schema = 'public' and table_name = 'patient_pack_instances' and column_name = 'agreed_price_cents'`;
    expect(col!.n).toBe(0);
  });

  it("the gates on both tables: authenticated SELECT and INSERT only; service_role, anon and patient nothing", async () => {
    const privs = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
    for (const t of [PAYMENTS, PRICES]) {
      const read = async (role: string) => {
        const out: string[] = [];
        for (const p of privs) {
          const [r] = await sql<{ ok: boolean }[]>`select has_table_privilege(${role}, ${t}, ${p}) as ok`;
          if (r?.ok) out.push(p);
        }
        return out;
      };
      expect(await read("authenticated"), t).toEqual(["SELECT", "INSERT"]);
      expect(await read("service_role"), t).toEqual([]);
      expect(await read("anon"), t).toEqual([]);
      expect(await read("patient"), t).toEqual([]);
    }
  });

  it("isolation: an admin reads its tenant's prices and lines and not the other tenant's; the other admin reads its own", async () => {
    const read = (t: string, uid: string) =>
      asRole(sql, "authenticated", claimsFor(t, "admin", uid), async (tx) => ({
        lines: (await tx<{ id: string }[]>`select id from pack_instance_payments`).map((r) => r.id).sort(),
        prices: (await tx<{ id: string }[]>`select pack_instance_id as id from pack_instance_agreed_prices`).map((r) => r.id),
      }));
    expect(await read(tenant, admin)).toEqual({ lines: [lineA, lineA2].sort(), prices: [priced] });
    expect(await read(other, otherAdmin)).toEqual({ lines: [lineB], prices: [otherInst] });
  });

  it("owner and reception read every price and line of their tenant", async () => {
    for (const [role, uid] of [
      ["owner", owner],
      ["reception", reception],
    ] as const) {
      const out = await asRole(sql, "authenticated", claimsFor(tenant, role, uid), async (tx) => ({
        lines: (await tx`select id from pack_instance_payments`).length,
        prices: (await tx`select 1 from pack_instance_agreed_prices`).length,
      }));
      expect(out, role).toEqual({ lines: 2, prices: 1 });
    }
  });

  it("a THERAPIST reads no price and no line, beside reception reading them in the same tenant (P4)", async () => {
    const t = await asRole(sql, "authenticated", claimsFor(tenant, "therapist", therapist), async (tx) => ({
      lines: (await tx`select id from pack_instance_payments`).length,
      prices: (await tx`select 1 from pack_instance_agreed_prices`).length,
      // The instance itself is still readable, as on main (0037).
      instances: (await tx`select id from patient_pack_instances where id in (${inst}, ${priced})`).length,
    }));
    expect(t).toEqual({ lines: 0, prices: 0, instances: 2 });
  });

  it("no claims read nothing, beside a claimed read that finds rows", async () => {
    const none = await asRole(sql, "authenticated", null, async (tx) => ({
      lines: (await tx`select id from pack_instance_payments`).length,
      prices: (await tx`select 1 from pack_instance_agreed_prices`).length,
    }));
    expect(none).toEqual({ lines: 0, prices: 0 });
    const some = await asRole(sql, "authenticated", claimsFor(tenant, "owner", owner), (tx) =>
      tx`select id from pack_instance_payments`,
    );
    expect(some.length).toBeGreaterThan(0);
  });

  it("the payment INSERT matrix: who records, naming whom, for which instance and clinic", async () => {
    const asIns = (role: "owner" | "admin" | "reception" | "therapist", uid: string, over: Record<string, unknown>) =>
      asRole(sql, "authenticated", claimsFor(tenant, role, uid), (tx) =>
        refusal(tx, (sp) => sp`insert into pack_instance_payments ${sp(lineCols(over))}`),
      );
    expect(await asIns("reception", reception, { created_by: reception })).toBeNull();
    expect(await asIns("admin", admin, { created_by: admin })).toBeNull();
    expect(await asIns("owner", owner, { created_by: owner })).toBeNull();
    expect(await asIns("therapist", therapist, { created_by: therapist })).toBe("42501");
    expect(await asIns("reception", reception, { created_by: admin })).toBe("42501");
    expect(await asIns("reception", reception, {})).toBe("42501");
    expect(await asIns("reception", reception, { tenant_id: other, pack_instance_id: otherInst, location_id: otherLoc, created_by: reception })).toBe("42501");
    expect(await asIns("reception", reception, { pack_instance_id: otherInst, created_by: reception })).toBe("42501");
    expect(await asIns("reception", reception, { location_id: otherLoc, created_by: reception })).toBe("42501");
    const corr = { kind: "correcao", amount_cents: -500, method: null, reason: "Acerto com o Stylus" };
    expect(await asIns("reception", reception, { ...corr, created_by: reception })).toBe("42501");
    expect(await asIns("admin", admin, { ...corr, created_by: admin })).toBeNull();
    expect(await asIns("owner", owner, { ...corr, created_by: owner })).toBeNull();
    expect(await asIns("reception", reception, { kind: "reembolso", amount_cents: -1000, reason: "Desistência", created_by: reception })).toBeNull();
  });

  it("the price INSERT matrix, and SET ONCE by the primary key", async () => {
    const row = (over: Record<string, unknown>) => ({ pack_instance_id: inst, tenant_id: tenant, agreed_price_cents: 45000, ...over });
    const asIns = (role: "owner" | "admin" | "reception" | "therapist", uid: string, over: Record<string, unknown>) =>
      asRole(sql, "authenticated", claimsFor(tenant, role, uid), (tx) =>
        refusal(tx, (sp) => sp`insert into pack_instance_agreed_prices ${sp(row(over))}`),
      );
    expect(await asIns("reception", reception, { created_by: reception })).toBeNull();
    expect(await asIns("admin", admin, { created_by: admin })).toBeNull();
    expect(await asIns("owner", owner, { created_by: owner, agreed_price_cents: 0 })).toBeNull();
    expect(await asIns("therapist", therapist, { created_by: therapist })).toBe("42501");
    expect(await asIns("reception", reception, { created_by: admin })).toBe("42501");
    expect(await asIns("reception", reception, {})).toBe("42501");
    // Another tenant's instance, named from inside the caller's tenant.
    expect(await asIns("reception", reception, { pack_instance_id: otherBare, created_by: reception })).toBe("42501");
    // SET ONCE: the instance that already has a price.
    expect(await asIns("reception", reception, { pack_instance_id: priced, created_by: reception })).toBe("23505");
    // Two in one transaction: the second is the key violation.
    const twice = await asRole(sql, "authenticated", claimsFor(tenant, "reception", reception), async (tx) => {
      await tx`insert into pack_instance_agreed_prices ${tx(row({ created_by: reception }))}`;
      return refusal(tx, (sp) => sp`insert into pack_instance_agreed_prices ${sp(row({ created_by: reception, agreed_price_cents: 1 }))}`);
    });
    expect(twice).toBe("23505");
  });

  it("CONTROL for the cross-tenant arms: the owning connection accepts those rows, so the refusals are the policies'", async () => {
    expect(await ownerTry(sql, (tx) => tx`insert into pack_instance_payments ${tx(lineCols({ pack_instance_id: otherInst }))}`)).toBe("ok");
    expect(await ownerTry(sql, (tx) => tx`insert into pack_instance_payments ${tx(lineCols({ location_id: otherLoc }))}`)).toBe("ok");
    expect(
      // The same row the price matrix's cross-tenant arm sends (the other
      // tenant's UNPRICED instance, named under this tenant): the owning
      // connection accepts it, so that arm's 42501 is the policy's.
      await ownerTry(sql, (tx) => tx`insert into pack_instance_agreed_prices (pack_instance_id, tenant_id, agreed_price_cents) values (${otherBare}, ${tenant}, 1)`),
    ).toBe("ok");
  });

  it("APPEND ONLY: UPDATE, DELETE and TRUNCATE refused at the gate on both tables for every staff role", async () => {
    for (const [role, uid] of [
      ["owner", owner],
      ["admin", admin],
      ["reception", reception],
      ["therapist", therapist],
    ] as const) {
      const out = await asRole(sql, "authenticated", claimsFor(tenant, role, uid), async (tx) => ({
        updLine: await refusal(tx, (sp) => sp`update pack_instance_payments set amount_cents = 1 where id = ${lineA}`),
        delLine: await refusal(tx, (sp) => sp`delete from pack_instance_payments where id = ${lineA}`),
        truncLines: await refusal(tx, (sp) => sp`truncate pack_instance_payments`),
        updPrice: await refusal(tx, (sp) => sp`update pack_instance_agreed_prices set agreed_price_cents = 1 where pack_instance_id = ${priced}`),
        delPrice: await refusal(tx, (sp) => sp`delete from pack_instance_agreed_prices where pack_instance_id = ${priced}`),
        truncPrices: await refusal(tx, (sp) => sp`truncate pack_instance_agreed_prices`),
      }));
      expect(out, role).toEqual({
        updLine: "42501",
        delLine: "42501",
        truncLines: "42501",
        updPrice: "42501",
        delPrice: "42501",
        truncPrices: "42501",
      });
    }
  });

  it("the constraints refuse by name, with everything else satisfied", async () => {
    const tryLine = (over: Record<string, unknown>) =>
      ownerTry(sql, (tx) => tx`insert into pack_instance_payments ${tx(lineCols(over))}`);
    expect(await tryLine({})).toBe("ok");
    // An unknown kind also fails the sign rule (which names the three kinds), and
    // Postgres reports whichever it checks first, so either name is the answer;
    // the kind rule's own text is read from the catalogue beside it.
    expect(await tryLine({ kind: "sinal" })).toMatch(/^pack_instance_payments_(kind_known|amount_sign)$/);
    const [kindRule] = await sql<{ def: string }[]>`
      select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'pack_instance_payments_kind_known'`;
    expect(kindRule!.def).toMatch(/'pagamento'.*'reembolso'.*'correcao'/);
    expect(await tryLine({ amount_cents: 0 })).toBe("pack_instance_payments_amount_sign");
    expect(await tryLine({ amount_cents: -100 })).toBe("pack_instance_payments_amount_sign");
    expect(await tryLine({ kind: "reembolso", amount_cents: 100, reason: "x" })).toBe("pack_instance_payments_amount_sign");
    expect(await tryLine({ kind: "correcao", amount_cents: 0, method: null, reason: "x" })).toBe("pack_instance_payments_amount_sign");
    expect(await tryLine({ amount_cents: 10000001 })).toBe("pack_instance_payments_amount_bounded");
    expect(await tryLine({ method: "cheque" })).toBe("pack_instance_payments_method_known");
    expect(await tryLine({ method: null })).toBe("pack_instance_payments_method_required");
    expect(await tryLine({ kind: "correcao", amount_cents: 50, method: null, reason: "Acerto" })).toBe("ok");
    expect(await tryLine({ kind: "reembolso", amount_cents: -100 })).toBe("pack_instance_payments_reason_required");
    expect(await tryLine({ kind: "correcao", amount_cents: 100, method: null })).toBe("pack_instance_payments_reason_required");
    expect(await tryLine({ reason: "   " })).toBe("pack_instance_payments_reason_shape");
    expect(await tryLine({ reason: "x".repeat(501) })).toBe("pack_instance_payments_reason_shape");
    expect(await tryLine({ reason: "x".repeat(500) })).toBe("ok");
    expect(await tryLine({ received_on: "2019-12-31" })).toBe("pack_instance_payments_received_on_floor");
    expect(await tryLine({ received_on: "2020-01-01" })).toBe("ok");
    expect(await tryLine({ stylus_ref: "  " })).toBe("pack_instance_payments_stylus_ref_shape");
    expect(await tryLine({ stylus_ref: "x".repeat(41) })).toBe("pack_instance_payments_stylus_ref_shape");
    expect(await tryLine({ stylus_ref: "x".repeat(40) })).toBe("ok");
    expect(await tryLine({ corrects_id: lineA2 })).toBe("pack_instance_payments_payment_answers_nothing");
    expect(await tryLine({ pack_instance_id: priced, kind: "reembolso", amount_cents: -100, reason: "x", corrects_id: lineA })).toBe("ok");
    expect(await tryLine({ kind: "reembolso", amount_cents: -100, reason: "x", corrects_id: lineA })).toBe("pack_instance_payments_corrects_fkey");
    const tryPrice = (cents: number) =>
      ownerTry(sql, (tx) => tx`insert into pack_instance_agreed_prices (pack_instance_id, tenant_id, agreed_price_cents) values (${inst}, ${tenant}, ${cents})`);
    expect(await tryPrice(-1)).toBe("pack_instance_agreed_prices_amount_range");
    expect(await tryPrice(10000001)).toBe("pack_instance_agreed_prices_amount_range");
    expect(await tryPrice(0)).toBe("ok");
  });

  it("an instance with a price or money history cannot be deleted (NO ACTION), beside one without that can", async () => {
    expect(await ownerTry(sql, (tx) => tx`delete from patient_pack_instances where id = ${priced}`)).toMatch(/^pack_instance_(payments|agreed_prices)_pack_instance_id_fkey$/);
    expect(await ownerTry(sql, (tx) => tx`delete from patient_pack_instances where id = ${inst}`)).toBe("ok");
  });

  // ======================================================================
  // STRATEGY, 2026-11-06: the census, PUBLIC, and the set-once mechanism.
  // ======================================================================

  it("PUBLIC (SR-52, SR-56): nothing reaches anyone through PUBLIC on patient_pack_instances or either money table; anon holds no UPDATE on any column; authenticated's UPDATE on instances is its own 0037 grant; no column UPDATE on the money tables", async () => {
    const probe = async (q: Sql | TransactionSql, t: string) => {
      const name = t.replace(/^public\./, "");
      const [r] = await q<
        {
          public_table: number;
          public_columns: number;
          public_info_schema: number;
          anon_table_update: boolean;
          anon_any_column_update: boolean;
          anon_each_column_update: boolean;
          auth_any_column_update: boolean;
          auth_update_granted_by_name: boolean;
        }[]
      >`
        select
          (select count(*)::int from pg_class c, aclexplode(c.relacl) a where c.oid = to_regclass(${t}) and a.grantee = 0) as public_table,
          (select count(*)::int from pg_attribute att, aclexplode(att.attacl) a where att.attrelid = to_regclass(${t}) and a.grantee = 0) as public_columns,
          ((select count(*) from information_schema.table_privileges where table_schema = 'public' and table_name = ${name} and grantee = 'PUBLIC')
           + (select count(*) from information_schema.column_privileges where table_schema = 'public' and table_name = ${name} and grantee = 'PUBLIC'))::int as public_info_schema,
          has_table_privilege('anon', to_regclass(${t}), 'UPDATE') as anon_table_update,
          has_any_column_privilege('anon', to_regclass(${t}), 'UPDATE') as anon_any_column_update,
          coalesce((select bool_or(has_column_privilege('anon', to_regclass(${t}), att.attname, 'UPDATE'))
                      from pg_attribute att where att.attrelid = to_regclass(${t}) and att.attnum > 0 and not att.attisdropped), false) as anon_each_column_update,
          has_any_column_privilege('authenticated', to_regclass(${t}), 'UPDATE') as auth_any_column_update,
          exists (select 1 from pg_class c, aclexplode(c.relacl) a
                   where c.oid = to_regclass(${t}) and a.privilege_type = 'UPDATE' and a.grantee = 'authenticated'::regrole) as auth_update_granted_by_name`;
      return r!;
    };
    const none = {
      public_table: 0,
      public_columns: 0,
      public_info_schema: 0,
      anon_table_update: false,
      anon_any_column_update: false,
      anon_each_column_update: false,
    };
    // patient_pack_instances after 0115: as on main. authenticated's UPDATE is
    // 0037's grant BY NAME, and nothing arrives through PUBLIC.
    expect(await probe(sql, INSTANCES)).toEqual({ ...none, auth_any_column_update: true, auth_update_granted_by_name: true });
    for (const t of [PAYMENTS, PRICES]) {
      expect(await probe(sql, t), t).toEqual({ ...none, auth_any_column_update: false, auth_update_granted_by_name: false });
    }
    // CONTROL: the same probes, inside a rolled-back transaction that grants
    // UPDATE to PUBLIC (the table on instances, one column on prices), read the
    // grant from every angle, so the zeros above are measurements, not a probe
    // that cannot see PUBLIC.
    const seen = await sql
      .begin(async (tx) => {
        await tx.unsafe("grant update on public.patient_pack_instances to public");
        await tx.unsafe("grant update (agreed_price_cents) on public.pack_instance_agreed_prices to public");
        throw new Rollback({ inst: await probe(tx, INSTANCES), prices: await probe(tx, PRICES) });
      })
      .catch((e) => {
        if (e instanceof Rollback) return e.value as { inst: Awaited<ReturnType<typeof probe>>; prices: Awaited<ReturnType<typeof probe>> };
        throw e;
      });
    expect(seen.inst.public_table).toBeGreaterThan(0);
    expect(seen.inst.public_info_schema).toBeGreaterThan(0);
    expect(seen.inst.anon_table_update).toBe(true);
    expect(seen.inst.anon_each_column_update).toBe(true);
    expect(seen.prices.public_columns).toBeGreaterThan(0);
    expect(seen.prices.public_info_schema).toBeGreaterThan(0);
    expect(seen.prices.anon_any_column_update).toBe(true);
    expect(seen.prices.auth_any_column_update).toBe(true);
    // And the grants did not outlive the control.
    expect(await probe(sql, INSTANCES)).toEqual({ ...none, auth_any_column_update: true, auth_update_granted_by_name: true });
    expect((await probe(sql, PRICES)).public_columns).toBe(0);
  });

  it("the live census: patient_pack_instances has no user trigger, no function body UPDATEs it, no foreign key action rewrites it, and the one function naming it is 0108's read", async () => {
    const triggers = await sql<{ name: string }[]>`
      select tgname::text as name from pg_trigger where tgrelid = to_regclass(${INSTANCES}) and not tgisinternal`;
    expect(triggers).toEqual([]);
    const updaters = await sql<{ fn: string }[]>`
      select p.oid::regprocedure::text as fn from pg_proc p where p.prosrc ~* ${UPDATES_INSTANCES}`;
    expect(updaters).toEqual([]);
    const namers = await sql<{ fn: string; definer: boolean }[]>`
      select n.nspname || '.' || p.proname as fn, p.prosecdef as definer
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.prosrc ~* 'patient_pack_instances' order by 1`;
    expect(namers).toEqual([{ fn: "public.pack_instance_consuming_sessions", definer: true }]);
    // Its keys to other tables: no ON UPDATE action and no SET NULL / SET
    // DEFAULT on delete, so no referential action UPDATEs an instance row.
    const fks = await sql<{ name: string; upd: string; del: string }[]>`
      select conname::text as name, confupdtype::text as upd, confdeltype::text as del
        from pg_constraint where conrelid = to_regclass(${INSTANCES}) and contype = 'f' order by 1`;
    expect(fks.length).toBe(3);
    for (const fk of fks) {
      expect(["a", "r"], fk.name).toContain(fk.upd);
      expect(["a", "r", "c"], fk.name).toContain(fk.del);
    }
    // CONTROL: the pattern matches the statement shapes it must catch.
    const [ctl] = await sql<{ a: boolean; b: boolean; c: boolean; clean: boolean }[]>`
      select 'UPDATE public.patient_pack_instances SET legacy_consumed = 0' ~* ${UPDATES_INSTANCES} as a,
             'update "patient_pack_instances" set x = 1' ~* ${UPDATES_INSTANCES} as b,
             'update only public."patient_pack_instances" set x = 1' ~* ${UPDATES_INSTANCES} as c,
             'update patient_pack_instances_archive set x = 1' ~* ${UPDATES_INSTANCES} as clean`;
    expect(ctl).toEqual({ a: true, b: true, c: true, clean: false });
  });

  it("SET ONCE, the mechanism: the agreed price lives in pack_instance_agreed_prices, whose PRIMARY KEY refuses a second set as reception with tenant claims (23505); CONTROL: with that key dropped inside a rolled-back transaction, the same second set is accepted", async () => {
    const claims = claimsFor(tenant, "reception", reception);
    const row = (cents: number) => ({ pack_instance_id: inst, tenant_id: tenant, agreed_price_cents: cents, created_by: reception });
    const twice = (ddl: string[]) =>
      ddlThenAs(sql, ddl, claims, async (tx) => {
        const first = await refusal(tx, (sp) => sp`insert into pack_instance_agreed_prices ${sp(row(45000))}`);
        let second: string | null = null;
        try {
          await tx.savepoint((sp) => sp`insert into pack_instance_agreed_prices ${sp(row(1))}`);
        } catch (e) {
          second = `${(e as { code?: string }).code}:${(e as { constraint_name?: string }).constraint_name}`;
        }
        const rows = (
          await tx<{ c: number }[]>`
            select agreed_price_cents as c from pack_instance_agreed_prices where pack_instance_id = ${inst} order by agreed_price_cents`
        ).map((r) => r.c);
        return { first, second, rows };
      });
    expect(await twice([])).toEqual({ first: null, second: "23505:pack_instance_agreed_prices_pkey", rows: [45000] });
    expect(await twice(["alter table public.pack_instance_agreed_prices drop constraint pack_instance_agreed_prices_pkey"])).toEqual({
      first: null,
      second: null,
      rows: [1, 45000],
    });
    // The key did not outlive the control.
    const [pk] = await sql<{ n: number }[]>`
      select count(*)::int as n from pg_constraint where conname = 'pack_instance_agreed_prices_pkey' and contype = 'p'`;
    expect(pk!.n).toBe(1);
  });

  it("SET ONCE against UPDATE: refused at the table gate (42501), and behind the gate there is no UPDATE policy; CONTROLS: a column grant alone changes no row, a grant plus an UPDATE policy changes the price", async () => {
    const claims = claimsFor(tenant, "reception", reception);
    const upd = (ddl: string[]) =>
      ddlThenAs(sql, ddl, claims, async (tx) => ({
        code: await refusal(tx, (sp) => sp`update pack_instance_agreed_prices set agreed_price_cents = 1 where pack_instance_id = ${priced}`),
        price: (await tx<{ c: number }[]>`select agreed_price_cents as c from pack_instance_agreed_prices where pack_instance_id = ${priced}`)[0]?.c,
      }));
    const grant = "grant update (agreed_price_cents) on public.pack_instance_agreed_prices to authenticated";
    expect(await upd([])).toEqual({ code: "42501", price: 40000 });
    expect(await upd([grant])).toEqual({ code: null, price: 40000 });
    expect(
      await upd([grant, "create policy pp_ctl_update on public.pack_instance_agreed_prices for update to authenticated using (true) with check (true)"]),
    ).toEqual({ code: null, price: 1 });
    const [left] = await sql<{ grants: boolean; pols: number }[]>`
      select has_any_column_privilege('authenticated', to_regclass(${PRICES}), 'UPDATE') as grants,
             (select count(*)::int from pg_policies where tablename = 'pack_instance_agreed_prices' and cmd = 'UPDATE') as pols`;
    expect(left).toEqual({ grants: false, pols: 0 });
  });

  it("the patient role is denied at the table gate on both tables", async () => {
    for (const t of ["pack_instance_payments", "pack_instance_agreed_prices"] as const) {
      const code = await asRole(sql, "patient", JSON.stringify({ tenant_id: tenant, patient_id: patient }), (tx) =>
        refusal(tx, (sp) => (t === "pack_instance_payments" ? sp`select 1 from pack_instance_payments` : sp`select 1 from pack_instance_agreed_prices`)),
      );
      expect(code, t).toBe("42501");
    }
  });
});
