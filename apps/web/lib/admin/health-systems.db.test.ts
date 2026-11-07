/**
 * health-systems.db.test.ts: the Sistemas / SubSistemas server functions
 * (lib/admin/health-systems.ts) against a real Postgres, through runScoped, so
 * every read and write runs under the real RLS policies of health_systems and
 * tenants with the claims the application sets.
 *
 * THE TABLE COMES FROM A PENDING MIGRATION
 * (packages/db/migrations-pending/NEXT-AFTER-0109_sistemas_subsistemas.sql).
 * This file asks the database first: with no table it skips every arm (CI's
 * database while the file is pending); with the table every arm runs.
 *
 * WHAT IT PROVES:
 *   - an admin adds a Sistema, normalized, and the add is audited;
 *   - a case or whitespace variant of an ACTIVE name is refused (name_taken);
 *     of a SWITCHED-OFF one, it is switched back on, nothing new inserted;
 *   - switching off and on is audited; the ficha dropdown lists active entries
 *     plus the patient's own switched-off one;
 *   - reception may read the dropdown and may not write (settings:manage);
 *   - another tenant's admin reads none of it and switches none of it;
 *   - the price-table switch reads OFF by default, keeps every other key of
 *     tenants.settings when saved, and is audited;
 *   - the patient write's check (healthSystemSelectable): active yes, another
 *     tenant's no, switched-off only when it is the patient's current value;
 *   - ACCENTS FOLD (ruling Q12): the application's key equals the unique
 *     index's expression read from the catalogue on a table of names, and
 *     "Medis" after "Médis" is name_taken, or reactivates it when switched off.
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { RequestContext } from "@osteojp/auth";

const live = Boolean(process.env.DATABASE_URL);

/** The statement only the Sistemas migration holds. */
const MARKER = "CREATE TABLE public.health_systems";

/** Numbered migration files that carry the Sistemas migration (none while it is pending). */
function promotedFiles(): string[] {
  const dir = join(__dirname, "..", "..", "..", "..", "packages", "db", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => readFileSync(join(dir, f), "utf8").includes(MARKER));
}

/**
 * Whether the table is here. Skips are allowed only while the migration is
 * PENDING: once a file in packages/db/migrations creates the table, a database
 * without it THROWS, so a skip can never stand in for a run after promotion
 * (the same branch as packages/db/tests/health-systems-rls.db.test.ts).
 */
async function tablePresent(): Promise<boolean> {
  if (!live) return false;
  const { getDbAdmin } = await import("@osteojp/db");
  const rows = (await getDbAdmin().execute(
    raw`select to_regclass('public.health_systems') is not null as present`,
  )) as unknown as { present: boolean }[];
  const present = rows[0]?.present === true;
  const files = promotedFiles();
  if (!present && files.length > 0) {
    throw new Error(
      `THE MIGRATION IS PROMOTED (${files.join(", ")}) BUT THIS DATABASE DOES NOT HAVE ITS TABLE. ` +
        "From the promotion on, a skip is no longer acceptable. Nothing here was measured.",
    );
  }
  return present;
}

const present = await tablePresent();
const d = live && present ? describe : describe.skip;
const SIDE = present ? "TABLE PRESENT" : "TABLE ABSENT (pending migration)";

d(`Sistemas / SubSistemas server functions [${SIDE}]`, () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let lib: typeof import("./health-systems");
  let runScoped: typeof import("@/lib/auth/context").runScoped;

  const A = { tenant: randomUUID(), admin: randomUUID(), reception: randomUUID() };
  const B = { tenant: randomUUID(), admin: randomUUID() };
  const adminA: RequestContext = { tenantId: A.tenant, role: "admin", userId: A.admin };
  const receptionA: RequestContext = { tenantId: A.tenant, role: "reception", userId: A.reception };
  const adminB: RequestContext = { tenantId: B.tenant, role: "admin", userId: B.admin };

  const auditCount = async (action: string, entityId?: string): Promise<number> => {
    const rows = (await db.execute(
      entityId
        ? raw`select count(*)::int as n from audit_log where tenant_id = ${A.tenant}::uuid and action = ${action} and entity_id = ${entityId}::uuid`
        : raw`select count(*)::int as n from audit_log where tenant_id = ${A.tenant}::uuid and action = ${action}`,
    )) as unknown as { n: number }[];
    return rows[0]!.n;
  };

  const errCode = async (p: Promise<unknown>): Promise<string> =>
    p.then(
      () => "accepted",
      (e: { code?: string; name?: string }) => e.code ?? e.name ?? "unknown",
    );

  beforeAll(async () => {
    const schema = await import("@osteojp/db");
    db = schema.getDbAdmin();
    lib = await import("./health-systems");
    ({ runScoped } = await import("@/lib/auth/context"));
    for (const [t, users, label] of [
      [A.tenant, [[A.admin, "admin"], [A.reception, "reception"]], "a"],
      [B.tenant, [[B.admin, "admin"]], "b"],
    ] as const) {
      await db.execute(
        raw`insert into tenants (id, name, slug, settings)
            values (${t}::uuid, ${"HS lib " + label}, ${"hsl-" + label + "-" + t.slice(0, 8)},
                    ${JSON.stringify({ contacts: { email: "x@example.pt" }, billing: { vatRate: 23 } })}::jsonb)`,
      );
      for (const [id, role] of users) {
        const roleId = randomUUID();
        await db.execute(raw`insert into roles (id, tenant_id, slug, name) values (${roleId}::uuid, ${t}::uuid, ${role}, ${role})`);
        await db.execute(
          raw`insert into users (id, tenant_id, role_id, email, full_name)
              values (${id}::uuid, ${t}::uuid, ${roleId}::uuid, ${"hsl-" + id + "@example.pt"}, ${"HS " + role})`,
        );
      }
    }
  });

  afterAll(async () => {
    if (!db) return;
    for (const t of [A.tenant, B.tenant]) {
      await db.execute(raw`delete from audit_log where tenant_id = ${t}::uuid`);
      await db.execute(raw`delete from health_systems where tenant_id = ${t}::uuid`);
      await db.execute(raw`delete from users where tenant_id = ${t}::uuid`);
      await db.execute(raw`delete from roles where tenant_id = ${t}::uuid`);
      await db.execute(raw`delete from tenants where id = ${t}::uuid`);
    }
  });

  it("an admin adds a Sistema, stored normalized, audited, naming its creator", async () => {
    expect(await lib.createHealthSystem(adminA, "  ADSE   Direção  ")).toBe("created");
    const list = await lib.listHealthSystems(adminA);
    expect(list.map((h) => [h.name, h.active])).toEqual([["ADSE Direção", true]]);
    const rows = (await db.execute(
      raw`select created_by from health_systems where tenant_id = ${A.tenant}::uuid`,
    )) as unknown as { created_by: string }[];
    expect(rows[0]!.created_by).toBe(A.admin);
    expect(await auditCount("health_system.create", list[0]!.id)).toBe(1);
  });

  it("a variant of an ACTIVE name is refused, and nothing is inserted", async () => {
    expect(await errCode(lib.createHealthSystem(adminA, "adse direção"))).toBe("name_taken");
    expect((await lib.listHealthSystems(adminA)).length).toBe(1);
  });

  it("a blank or over-long name is refused as invalid", async () => {
    expect(await errCode(lib.createHealthSystem(adminA, "   "))).toBe("invalid");
    expect(await errCode(lib.createHealthSystem(adminA, "x".repeat(121)))).toBe("invalid");
  });

  it("switch off, then a variant of the name switches it back on instead of inserting", async () => {
    const [h] = await lib.listHealthSystems(adminA);
    await lib.setHealthSystemActive(adminA, h!.id, false);
    expect(await auditCount("health_system.archive", h!.id)).toBe(1);
    expect((await lib.listHealthSystemOptions(receptionA)).map((o) => o.id)).toEqual([]);
    expect((await lib.listHealthSystemOptions(receptionA, h!.id)).map((o) => o.id)).toEqual([h!.id]);
    expect(await lib.createHealthSystem(adminA, "ADSE DIREÇÃO")).toBe("reactivated");
    const after = await lib.listHealthSystems(adminA);
    expect(after.map((x) => [x.id, x.active])).toEqual([[h!.id, true]]);
    expect(await auditCount("health_system.restore", h!.id)).toBe(1);
  });

  it("reception reads the dropdown but may not add, switch or set the price switch", async () => {
    expect((await lib.listHealthSystemOptions(receptionA)).length).toBe(1);
    const [h] = await lib.listHealthSystems(adminA);
    expect(await errCode(lib.createHealthSystem(receptionA, "SAMS"))).toBe("ForbiddenError");
    expect(await errCode(lib.setHealthSystemActive(receptionA, h!.id, false))).toBe("ForbiddenError");
    expect(await errCode(lib.setHealthSystemsPriceTable(receptionA, true))).toBe("ForbiddenError");
    expect(await errCode(lib.listHealthSystems(receptionA))).toBe("ForbiddenError");
  });

  it("another tenant's admin reads none of A's entries and switches none of them", async () => {
    const [h] = await lib.listHealthSystems(adminA);
    expect(await lib.listHealthSystems(adminB)).toEqual([]);
    expect(await lib.listHealthSystemOptions(adminB)).toEqual([]);
    expect(await errCode(lib.setHealthSystemActive(adminB, h!.id, false))).toBe("not_found");
    expect((await lib.listHealthSystems(adminA))[0]!.active).toBe(true);
    // B may hold the same name.
    expect(await lib.createHealthSystem(adminB, "ADSE Direção")).toBe("created");
  });

  it("the price-table switch: OFF by default, saved without touching other settings keys, audited", async () => {
    expect(await lib.getHealthSystemsPriceTable(adminA)).toBe(false);
    await lib.setHealthSystemsPriceTable(adminA, true);
    expect(await lib.getHealthSystemsPriceTable(adminA)).toBe(true);
    expect(await lib.getHealthSystemsPriceTable(adminB)).toBe(false);
    const rows = (await db.execute(
      raw`select settings from tenants where id = ${A.tenant}::uuid`,
    )) as unknown as { settings: Record<string, unknown> }[];
    expect(rows[0]!.settings).toEqual({
      contacts: { email: "x@example.pt" },
      billing: { vatRate: 23 },
      healthSystems: { priceTableEnabled: true },
    });
    expect(await auditCount("tenant.update")).toBe(1);
    await lib.setHealthSystemsPriceTable(adminA, false);
    expect(await lib.getHealthSystemsPriceTable(adminA)).toBe(false);
  });

  it("the patient write's check: active yes, another tenant's no, switched-off only as the current value", async () => {
    const [mine] = await lib.listHealthSystems(adminA);
    const [theirs] = await lib.listHealthSystems(adminB);
    await lib.createHealthSystem(adminA, "SAMS");
    const sams = (await lib.listHealthSystems(adminA)).find((h) => h.name === "SAMS")!;
    await lib.setHealthSystemActive(adminA, sams.id, false);
    const verdicts = await runScoped(receptionA, async (tx) => ({
      active: await lib.healthSystemSelectable(tx, mine!.id, null),
      foreign: await lib.healthSystemSelectable(tx, theirs!.id, null),
      offNew: await lib.healthSystemSelectable(tx, sams.id, null),
      offCurrent: await lib.healthSystemSelectable(tx, sams.id, sams.id),
      unknown: await lib.healthSystemSelectable(tx, randomUUID(), null),
    }));
    expect(verdicts).toEqual({ active: true, foreign: false, offNew: false, offCurrent: true, unknown: false });
  });

  /* Ruling Q12 (2026-11-04): accents fold, in the index and in the pre-check. */

  it("the application's key equals the unique index's own expression, read from the catalogue, on a table of names", async () => {
    const { healthSystemNameKey } = await import("./health-systems-core");
    const [def] = (await db.execute(
      raw`select pg_get_indexdef('public.health_systems_tenant_name_key'::regclass, 2, false) as e`,
    )) as unknown as { e: string }[];
    const names = [
      "Médis",
      "Medis",
      "MEDIS",
      " médis ",
      "MÉDIS",
      "Saúde",
      "Saude",
      "Ç",
      "C",
      "Açoreana  Saúde",
      "ÀÁÂÃÄ èéêëẽ ìíîïĩ òóôõö ùúûüũ ñ",
      "Sub \t Sistema\nX",
      "Medis Plus",
      "Fidelidade Saúde",
    ];
    // The column is called name, so the catalogue's text runs unchanged.
    const rows = (await db.execute(
      raw`select name, ${raw.raw(def!.e)} as key
            from jsonb_array_elements_text(${JSON.stringify(names)}::jsonb) with ordinality as u(name, ord)
           order by ord`,
    )) as unknown as { name: string; key: string }[];
    expect(rows.map((r) => [r.name, r.key])).toEqual(names.map((n) => [n, healthSystemNameKey(n)]));
    // And the table is not vacuous: the accent pairs share a key, the near names do not.
    const key = new Map(rows.map((r) => [r.name, r.key]));
    expect(key.get("Médis")).toBe(key.get("Medis"));
    expect(key.get("Saúde")).toBe(key.get("Saude"));
    expect(key.get("Ç")).toBe(key.get("C"));
    expect(key.get("Médis")).not.toBe(key.get("Medis Plus"));
  });

  it("'Medis' after an ACTIVE 'Médis' is name_taken; once switched off, 'MEDIS' switches it back on", async () => {
    expect(await lib.createHealthSystem(adminA, "Médis")).toBe("created");
    const medis = (await lib.listHealthSystems(adminA)).find((h) => h.name === "Médis")!;
    expect(await errCode(lib.createHealthSystem(adminA, "Medis"))).toBe("name_taken");
    expect(await errCode(lib.createHealthSystem(adminA, " médis "))).toBe("name_taken");
    await lib.setHealthSystemActive(adminA, medis.id, false);
    expect(await lib.createHealthSystem(adminA, "MEDIS")).toBe("reactivated");
    const after = (await lib.listHealthSystems(adminA)).filter((h) => healthKeyIsMedis(h.name));
    expect(after.map((h) => [h.id, h.name, h.active])).toEqual([[medis.id, "Médis", true]]);
    // Another clinic may hold the same name.
    expect(await lib.createHealthSystem(adminB, "Medis")).toBe("created");
  });
});

function healthKeyIsMedis(name: string): boolean {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() === "medis";
}
