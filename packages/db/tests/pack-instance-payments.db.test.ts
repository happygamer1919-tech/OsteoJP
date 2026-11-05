/**
 * pack-instance-payments.db.test.ts: the isolation proof for pack payments,
 * from the PENDING migration
 * packages/db/migrations-pending/NEXT-AFTER-0114_pack_payments.sql
 * (public.pack_instance_payments and patient_pack_instances.agreed_price_cents).
 *
 * THIS FILE ASKS THE DATABASE WHICH SIDE IT IS ON and names it in each title.
 * On a database that has the table, every arm runs. On one that does not, every
 * arm is skipped, which is what CI's database is while the file is pending (CI
 * builds from supabase/migrations, and a pending file is not there). From the
 * promotion on it THROWS on a database without the table: once a file in
 * packages/db/migrations creates it, a skip is no longer an answer.
 *
 * WHAT IT MEASURES, under real RLS (`set local role authenticated` and staff
 * claims, always rolled back):
 *   - THE SHAPE: columns, nullability, no default on the agreed price, RLS on
 *     and not forced, the policies by name and kind;
 *   - THE GATES, read with has_table_privilege / has_column_privilege, never an
 *     aclitem grep, and in BOTH directions (what must be gone, what must stay);
 *   - ISOLATION: tenant A's admin reads A's lines and not B's, beside B's admin
 *     reading B's (never a pass on an empty set);
 *   - THE ROLE MATRIX: owner, admin and reception read and record; a therapist
 *     reads NO line and records none (P4: therapists see no amounts); a
 *     correcao by owner or admin only; the creator, the instance and the clinic
 *     are the caller's own;
 *   - APPEND ONLY: UPDATE, DELETE and TRUNCATE refused at the gate for every
 *     staff role;
 *   - THE CONSTRAINTS by name, each with everything else satisfied;
 *   - THE AGREED PRICE, SET ONCE: NULL to a value by owner, admin or reception;
 *     never value to value, never back to NULL, never by a therapist; no other
 *     column of an instance is writable; a price on INSERT by the money roles
 *     only, and a booking-shaped INSERT (no price) still works for a therapist.
 *     Each 0-row answer has a control showing the owning connection can do it,
 *     so the 0 is the policy's and not a fixture that matched nothing.
 *
 * Every id is random per run, and afterAll removes what beforeAll wrote.
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Sql, TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

const TABLE = "public.pack_instance_payments";
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

d(`pack payments: shape, gates, policies and the set-once price [${SIDE}]`, () => {
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
  const priced = randomUUID(); // agreed price already set
  const otherInst = randomUUID();
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
                     (${otherInst}, ${other}, ${otherPatient}, ${otherPack}, 10, 10)`;
    await sql`insert into patient_pack_instances (id, tenant_id, patient_id, pack_id, sessions_total, sessions_remaining, agreed_price_cents)
              values (${priced}, ${tenant}, ${patient}, ${pack}, 10, 10, 40000)`;
    await sql`insert into pack_instance_payments (id, tenant_id, pack_instance_id, location_id, kind, amount_cents, received_on, method, stylus_ref, created_by)
              values (${lineA}, ${tenant}, ${priced}, ${loc}, 'pagamento', 20000, '2026-11-02', 'mbway', 'FR 1E/1', ${reception}),
                     (${lineA2}, ${tenant}, ${priced}, ${loc}, 'pagamento', 5000, '2026-11-03', 'numerario', null, ${reception}),
                     (${lineB}, ${other}, ${otherInst}, ${otherLoc}, 'pagamento', 9000, '2026-11-02', 'cartao', null, ${otherAdmin})`;
  });

  afterAll(async () => {
    if (!sql) return;
    // Payment lines first: their keys to tenants, instances and locations are
    // NO ACTION, so the tenant delete below would refuse while they exist.
    await sql`delete from pack_instance_payments where tenant_id in (${tenant}, ${other})`;
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

  it("the columns: types, nullability, and NO default on the agreed price", async () => {
    const rows = await sql<{ column_name: string; data_type: string; is_nullable: string }[]>`
      select column_name::text, data_type::text, is_nullable::text
        from information_schema.columns
       where table_schema = 'public' and table_name = 'pack_instance_payments'
       order by column_name`;
    expect(rows).toEqual([
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
    const [agreed] = await sql<{ data_type: string; is_nullable: string; column_default: string | null }[]>`
      select data_type::text, is_nullable::text, column_default::text
        from information_schema.columns
       where table_schema = 'public' and table_name = 'patient_pack_instances' and column_name = 'agreed_price_cents'`;
    expect(agreed).toEqual({ data_type: "integer", is_nullable: "YES", column_default: null });
  });

  it("RLS on the new table is enabled and not forced; the policies by name, kind and command", async () => {
    const [rel] = await sql<{ rls: boolean; forced: boolean }[]>`
      select relrowsecurity as rls, relforcerowsecurity as forced from pg_class where oid = to_regclass(${TABLE})`;
    expect(rel).toEqual({ rls: true, forced: false });
    const pols = await sql<{ table: string; name: string; cmd: string; permissive: string }[]>`
      select tablename::text as table, policyname::text as name, cmd::text as cmd, permissive::text as permissive
        from pg_policies
       where schemaname = 'public'
         and (tablename = 'pack_instance_payments' or policyname like 'patient_pack_instances_agreed_price%')
       order by tablename, policyname`;
    expect(pols).toEqual([
      { table: "pack_instance_payments", name: "pack_instance_payments_staff_insert", cmd: "INSERT", permissive: "PERMISSIVE" },
      { table: "pack_instance_payments", name: "pack_instance_payments_staff_select", cmd: "SELECT", permissive: "PERMISSIVE" },
      { table: "patient_pack_instances", name: "patient_pack_instances_agreed_price_on_insert", cmd: "INSERT", permissive: "RESTRICTIVE" },
      { table: "patient_pack_instances", name: "patient_pack_instances_agreed_price_set_once", cmd: "UPDATE", permissive: "RESTRICTIVE" },
    ]);
  });

  it("the gates on the payment table: authenticated SELECT and INSERT only; service_role, anon and patient nothing", async () => {
    const privs = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
    const read = async (role: string) => {
      const out: string[] = [];
      for (const p of privs) {
        const [r] = await sql<{ ok: boolean }[]>`select has_table_privilege(${role}, ${TABLE}, ${p}) as ok`;
        if (r?.ok) out.push(p);
      }
      return out;
    };
    expect(await read("authenticated")).toEqual(["SELECT", "INSERT"]);
    expect(await read("service_role")).toEqual([]);
    expect(await read("anon")).toEqual([]);
    expect(await read("patient")).toEqual([]);
  });

  it("the gates on the instances: no table UPDATE for anyone; two columns for authenticated; SELECT, INSERT, DELETE kept", async () => {
    const tbl = async (role: string, p: string) =>
      (await sql<{ ok: boolean }[]>`select has_table_privilege(${role}, ${INSTANCES}, ${p}) as ok`)[0]!.ok;
    const col = async (role: string, c: string) =>
      (await sql<{ ok: boolean }[]>`select has_column_privilege(${role}, ${INSTANCES}, ${c}, 'UPDATE') as ok`)[0]!.ok;
    for (const role of ["authenticated", "service_role", "anon", "patient"]) {
      expect(await tbl(role, "UPDATE"), `${role} table UPDATE`).toBe(false);
    }
    expect(await col("authenticated", "agreed_price_cents")).toBe(true);
    expect(await col("authenticated", "updated_at")).toBe(true);
    for (const c of ["status", "sessions_remaining", "sessions_total", "legacy_consumed", "switch_amount_cents", "switch_reason", "pack_id", "patient_id", "tenant_id", "purchased_at"]) {
      expect(await col("authenticated", c), `authenticated UPDATE (${c})`).toBe(false);
    }
    // THE OTHER DIRECTION: what the booking path and the reads still need.
    for (const p of ["SELECT", "INSERT", "DELETE"]) expect(await tbl("authenticated", p), `authenticated ${p}`).toBe(true);
  });

  it("isolation: an admin reads its tenant's lines and not the other tenant's; the other admin reads its own", async () => {
    const mine = await asRole(sql, "authenticated", claimsFor(tenant, "admin", admin), (tx) =>
      tx<{ id: string }[]>`select id from pack_instance_payments`,
    );
    expect(mine.map((r) => r.id).sort()).toEqual([lineA, lineA2].sort());
    const theirs = await asRole(sql, "authenticated", claimsFor(other, "admin", otherAdmin), (tx) =>
      tx<{ id: string }[]>`select id from pack_instance_payments`,
    );
    expect(theirs.map((r) => r.id)).toEqual([lineB]);
  });

  it("owner and reception read every line of their tenant", async () => {
    for (const [role, uid] of [
      ["owner", owner],
      ["reception", reception],
    ] as const) {
      const rows = await asRole(sql, "authenticated", claimsFor(tenant, role, uid), (tx) =>
        tx<{ id: string }[]>`select id from pack_instance_payments`,
      );
      expect(rows.map((r) => r.id).sort(), role).toEqual([lineA, lineA2].sort());
    }
  });

  it("a THERAPIST reads no line, beside reception reading two in the same tenant (P4)", async () => {
    const t = await asRole(sql, "authenticated", claimsFor(tenant, "therapist", therapist), (tx) =>
      tx`select id from pack_instance_payments`,
    );
    expect(t).toHaveLength(0);
    const r = await asRole(sql, "authenticated", claimsFor(tenant, "reception", reception), (tx) =>
      tx`select id from pack_instance_payments`,
    );
    expect(r).toHaveLength(2);
  });

  it("KNOWN LIMIT, pinned: a therapist can read agreed_price_cents on the instance (tenant FOR ALL of 0037); the screens never show it", async () => {
    // Pinned so a change here is deliberate. Hiding it in the database needs a
    // column-level SELECT split of patient_pack_instances, which this item did
    // not take on; the PR body lists it as an open question.
    const rows = await asRole(sql, "authenticated", claimsFor(tenant, "therapist", therapist), (tx) =>
      tx<{ p: number | null }[]>`select agreed_price_cents as p from patient_pack_instances where id = ${priced}`,
    );
    expect(rows).toEqual([{ p: 40000 }]);
  });

  it("no claims read nothing, beside a claimed read that finds rows", async () => {
    const none = await asRole(sql, "authenticated", null, (tx) => tx`select id from pack_instance_payments`);
    expect(none).toHaveLength(0);
    const some = await asRole(sql, "authenticated", claimsFor(tenant, "owner", owner), (tx) =>
      tx`select id from pack_instance_payments`,
    );
    expect(some.length).toBeGreaterThan(0);
  });

  it("the INSERT matrix: who records, naming whom, for which instance and clinic", async () => {
    const ins = (sp: TransactionSql, over: Record<string, unknown>) =>
      sp`insert into pack_instance_payments ${sp(lineCols(over))}`;
    const asIns = (role: "owner" | "admin" | "reception" | "therapist", uid: string, over: Record<string, unknown>) =>
      asRole(sql, "authenticated", claimsFor(tenant, role, uid), (tx) => refusal(tx, (sp) => ins(sp, over)));

    expect(await asIns("reception", reception, { created_by: reception })).toBeNull();
    expect(await asIns("admin", admin, { created_by: admin })).toBeNull();
    expect(await asIns("owner", owner, { created_by: owner })).toBeNull();
    // A therapist records nothing.
    expect(await asIns("therapist", therapist, { created_by: therapist })).toBe("42501");
    // The creator is the caller, and is named.
    expect(await asIns("reception", reception, { created_by: admin })).toBe("42501");
    expect(await asIns("reception", reception, {})).toBe("42501");
    // Another tenant's row, instance or clinic.
    expect(await asIns("reception", reception, { tenant_id: other, pack_instance_id: otherInst, location_id: otherLoc, created_by: reception })).toBe("42501");
    expect(await asIns("reception", reception, { pack_instance_id: otherInst, created_by: reception })).toBe("42501");
    expect(await asIns("reception", reception, { location_id: otherLoc, created_by: reception })).toBe("42501");
    // A correcao: owner and admin only.
    const corr = { kind: "correcao", amount_cents: -500, method: null, reason: "Acerto com o Stylus" };
    expect(await asIns("reception", reception, { ...corr, created_by: reception })).toBe("42501");
    expect(await asIns("admin", admin, { ...corr, created_by: admin })).toBeNull();
    expect(await asIns("owner", owner, { ...corr, created_by: owner })).toBeNull();
    // A reembolso: the recording roles, reception included.
    expect(await asIns("reception", reception, { kind: "reembolso", amount_cents: -1000, reason: "Desistência", created_by: reception })).toBeNull();
  });

  it("CONTROL for the cross-tenant instance and clinic arms: the owning connection accepts those rows, so the refusals are the policy's", async () => {
    expect(await ownerTry(sql, (tx) => tx`insert into pack_instance_payments ${tx(lineCols({ pack_instance_id: otherInst }))}`)).toBe("ok");
    expect(await ownerTry(sql, (tx) => tx`insert into pack_instance_payments ${tx(lineCols({ location_id: otherLoc }))}`)).toBe("ok");
  });

  it("APPEND ONLY: UPDATE, DELETE and TRUNCATE refused at the gate for every staff role", async () => {
    for (const [role, uid] of [
      ["owner", owner],
      ["admin", admin],
      ["reception", reception],
      ["therapist", therapist],
    ] as const) {
      const out = await asRole(sql, "authenticated", claimsFor(tenant, role, uid), async (tx) => ({
        update: await refusal(tx, (sp) => sp`update pack_instance_payments set amount_cents = 1 where id = ${lineA}`),
        delete: await refusal(tx, (sp) => sp`delete from pack_instance_payments where id = ${lineA}`),
        truncate: await refusal(tx, (sp) => sp`truncate pack_instance_payments`),
      }));
      expect(out, role).toEqual({ update: "42501", delete: "42501", truncate: "42501" });
    }
  });

  it("the constraints refuse by name, with everything else satisfied", async () => {
    const tryLine = (over: Record<string, unknown>) =>
      ownerTry(sql, (tx) => tx`insert into pack_instance_payments ${tx(lineCols(over))}`);
    expect(await tryLine({})).toBe("ok");
    expect(await tryLine({ kind: "sinal" })).toBe("pack_instance_payments_kind_known");
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
    expect(await tryLine({ reason: "   " })).toBe("pack_instance_payments_reason_nonblank");
    expect(await tryLine({ stylus_ref: "  " })).toBe("pack_instance_payments_stylus_ref_shape");
    expect(await tryLine({ stylus_ref: "x".repeat(41) })).toBe("pack_instance_payments_stylus_ref_shape");
    expect(await tryLine({ stylus_ref: "x".repeat(40) })).toBe("ok");
    expect(await tryLine({ corrects_id: lineA2 })).toBe("pack_instance_payments_payment_answers_nothing");
    // A refund may answer a line of its OWN instance only (the composite key).
    expect(await tryLine({ pack_instance_id: priced, kind: "reembolso", amount_cents: -100, reason: "x", corrects_id: lineA })).toBe("ok");
    expect(await tryLine({ kind: "reembolso", amount_cents: -100, reason: "x", corrects_id: lineA })).toBe("pack_instance_payments_corrects_fkey");
  });

  it("an instance with money history cannot be deleted (NO ACTION), beside one without that can", async () => {
    expect(await ownerTry(sql, (tx) => tx`delete from patient_pack_instances where id = ${priced}`)).toBe("pack_instance_payments_pack_instance_id_fkey");
    expect(await ownerTry(sql, (tx) => tx`delete from patient_pack_instances where id = ${inst}`)).toBe("ok");
  });

  it("THE AGREED PRICE IS SET ONCE: NULL to a value by the money roles; never changed, never cleared, never by a therapist", async () => {
    for (const [role, uid] of [
      ["owner", owner],
      ["admin", admin],
      ["reception", reception],
    ] as const) {
      const n = await asRole(sql, "authenticated", claimsFor(tenant, role, uid), async (tx) =>
        (await tx`update patient_pack_instances set agreed_price_cents = 45000, updated_at = now() where id = ${inst}`).count,
      );
      expect(n, `${role} NULL -> value`).toBe(1);
    }
    const out = await asRole(sql, "authenticated", claimsFor(tenant, "reception", reception), async (tx) => ({
      change: (await tx`update patient_pack_instances set agreed_price_cents = 1 where id = ${priced}`).count,
      clear: (await tx`update patient_pack_instances set agreed_price_cents = null where id = ${priced}`).count,
      // NULL to NULL: the old row passes USING, the new row fails WITH CHECK.
      stayNull: await refusal(tx, (sp) => sp`update patient_pack_instances set updated_at = now() where id = ${inst}`),
      // Any other column: refused at the column gate before any policy.
      status: await refusal(tx, (sp) => sp`update patient_pack_instances set status = 'closed' where id = ${inst}`),
      switchAmount: await refusal(tx, (sp) => sp`update patient_pack_instances set switch_amount_cents = 1, switch_reason = 'x' where id = ${inst}`),
    }));
    expect(out).toEqual({ change: 0, clear: 0, stayNull: "42501", status: "42501", switchAmount: "42501" });
    const t = await asRole(sql, "authenticated", claimsFor(tenant, "therapist", therapist), async (tx) =>
      (await tx`update patient_pack_instances set agreed_price_cents = 45000, updated_at = now() where id = ${inst}`).count,
    );
    expect(t, "therapist NULL -> value").toBe(0);
  });

  it("CONTROL for the 0-row answers: the owning connection does change, clear and set those rows, so the 0 is the policy's", async () => {
    expect(await ownerTry(sql, (tx) => tx`update patient_pack_instances set agreed_price_cents = 1 where id = ${priced}`)).toBe("ok");
    const [n] = await sql<{ n: number }[]>`select count(*)::int as n from patient_pack_instances where id in (${priced}, ${inst})`;
    expect(n!.n).toBe(2);
    const [p] = await sql<{ p: number | null }[]>`select agreed_price_cents as p from patient_pack_instances where id = ${priced}`;
    expect(p!.p).toBe(40000);
  });

  it("PINNED CONSEQUENCE: a row lock on an instance is bound by the set-once USING (the header says why nothing locks today)", async () => {
    const rows = async (role: "reception" | "therapist", uid: string, id: string) =>
      asRole(sql, "authenticated", claimsFor(tenant, role, uid), async (tx) =>
        (await tx`select id from patient_pack_instances where id = ${id} for update`).length,
      );
    expect(await rows("reception", reception, inst)).toBe(1);
    expect(await rows("reception", reception, priced)).toBe(0);
    expect(await rows("therapist", therapist, inst)).toBe(0);
    // Beside a plain read of the same rows, which still finds them.
    const plain = await asRole(sql, "authenticated", claimsFor(tenant, "therapist", therapist), (tx) =>
      tx`select id from patient_pack_instances where id in (${inst}, ${priced})`,
    );
    expect(plain).toHaveLength(2);
  });

  it("a price on INSERT by the money roles only; a booking-shaped INSERT (no price) still works for a therapist", async () => {
    const row = (price: number | null) => ({
      tenant_id: tenant,
      patient_id: patient,
      pack_id: pack,
      sessions_total: 10,
      sessions_remaining: 10,
      ...(price === null ? {} : { agreed_price_cents: price }),
    });
    const tryAs = (role: "owner" | "admin" | "reception" | "therapist", uid: string, price: number | null) =>
      asRole(sql, "authenticated", claimsFor(tenant, role, uid), (tx) =>
        refusal(tx, (sp) => sp`insert into patient_pack_instances ${sp(row(price))}`),
      );
    expect(await tryAs("reception", reception, 45000)).toBeNull();
    expect(await tryAs("admin", admin, 45000)).toBeNull();
    expect(await tryAs("owner", owner, 0)).toBeNull();
    expect(await tryAs("therapist", therapist, 45000)).toBe("42501");
    expect(await tryAs("therapist", therapist, null)).toBeNull();
    expect(await ownerTry(sql, (tx) => tx`insert into patient_pack_instances ${tx(row(-1))}`)).toBe("patient_pack_instances_agreed_price_nonneg");
  });

  it("the patient role is denied at the table gate", async () => {
    const code = await asRole(sql, "patient", JSON.stringify({ tenant_id: tenant, patient_id: patient }), (tx) =>
      refusal(tx, (sp) => sp`select id from pack_instance_payments`),
    );
    expect(code).toBe("42501");
  });
});
