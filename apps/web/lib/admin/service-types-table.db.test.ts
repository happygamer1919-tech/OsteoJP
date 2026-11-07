/**
 * service-types-table.db.test.ts - the Tipos de Marcacao table's one save
 * button (`saveServiceTypesTable`) and its new-type row (`createService`), run
 * as the real server functions against a real database.
 *
 * THE COLUMNS ARE PENDING. They come from
 * packages/db/migrations-pending/NEXT-AFTER-0109_services_booking_type_fields.sql,
 * so this file asks the database which side it is on, as
 * packages/db/tests/services-booking-type-fields.db.test.ts does: every arm runs
 * where the five columns exist, every arm is skipped where none does, and once a
 * promoted file in packages/db/migrations adds them a database without them
 * THROWS here instead of skipping.
 *
 * WHAT IT PROVES:
 *   - one save writes every column of every row, and writes an audit row per
 *     changed type naming the changed FIELDS (never the values); an untouched
 *     row writes nothing;
 *   - the switch and the AGENDA tag keep the existing audit actions
 *     (service.archive / service.restore, service.patient_bookable_on/off);
 *   - the switch off on a type a pacote is bound to refuses the WHOLE save
 *     (PACK-04), naming the pacote, and nothing of the table moved;
 *   - a page drawn BEFORE somebody else's save is refused (`stale`) and does
 *     not revert their change, nor audit anything in this admin's name;
 *   - "Sem cor" clears a colour, and white can be set on a type that had none;
 *   - a row of another tenant is not_found, and nothing moved;
 *   - the new-type row creates a type with Fisiozero's five fields.
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);
const COLUMNS = ["color", "follow_up_days", "sms_reminders", "vat_exemption_code", "vat_rate"];
const MARKER = "ADD CONSTRAINT services_vat_exemption_code_allowed";

type Db = ReturnType<typeof import("@osteojp/db").getDbAdmin>;
type Query = Parameters<Db["execute"]>[0];

async function rowsOf<T>(db: Db, query: Query): Promise<T[]> {
  const res = await db.execute(query);
  return (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as T[];
}

async function columnsApplied(): Promise<boolean> {
  if (!live) return false;
  const { getDbAdmin } = await import("@osteojp/db");
  const { sql } = await import("drizzle-orm");
  const [row] = await rowsOf<{ n: number }>(
    getDbAdmin(),
    sql`select count(*)::int as n from information_schema.columns
         where table_schema = 'public' and table_name = 'services'
           and column_name in ('color', 'follow_up_days', 'sms_reminders', 'vat_exemption_code', 'vat_rate')`,
  );
  const n = row?.n ?? -1;
  if (n !== 0 && n !== COLUMNS.length) {
    throw new Error(`HALF APPLIED: ${n} of ${COLUMNS.length} columns on services. Nothing here was measured.`);
  }
  const dir = join(__dirname, "..", "..", "..", "..", "packages", "db", "migrations");
  const promoted = readdirSync(dir).some(
    (f) => f.endsWith(".sql") && readFileSync(join(dir, f), "utf8").includes(MARKER),
  );
  if (promoted && n === 0) {
    throw new Error(
      "THE MIGRATION IS PROMOTED BUT THIS DATABASE DOES NOT HAVE ITS COLUMNS. A skip is no longer acceptable.",
    );
  }
  return n === COLUMNS.length;
}

const applied = await columnsApplied();
const d = applied ? describe : describe.skip;

type Row = {
  name: string;
  price_cents: number | null;
  duration_min: number;
  is_active: boolean;
  patient_bookable: boolean;
  color: string | null;
  vat_rate: number | null;
  vat_exemption_code: string | null;
  follow_up_days: number | null;
  sms_reminders: boolean;
};

d(`Tipos de Marcacao: the table save and the new-type row [${applied ? "COLUMNS PRESENT" : "COLUMNS ABSENT"}]`, () => {
  let db: Db;
  let sql: typeof import("drizzle-orm").sql;
  let saveServiceTypesTable: typeof import("./services").saveServiceTypesTable;
  let createService: typeof import("./services").createService;

  const tenant = randomUUID();
  const other = randomUUID();
  const role = randomUUID();
  const admin = randomUUID();
  const location = randomUUID();
  const svcA = randomUUID();
  const svcB = randomUUID();
  const packed = randomUUID();
  const foreign = randomUUID();
  const pack = randomUUID();

  const actor = () => ({ tenantId: tenant, role: "admin" as const, userId: admin });

  const read = async (id: string): Promise<Row> => {
    const [r] = await rowsOf<Row>(
      db,
      sql`select name, price_cents, duration_min, is_active, patient_bookable, color, vat_rate,
                 vat_exemption_code, follow_up_days, sms_reminders
            from public.services where id = ${id}`,
    );
    if (!r) throw new Error("row missing");
    return r;
  };

  /** The row's updated_at in milliseconds, as the page renders it (a JS Date). */
  const seenMs = async (id: string): Promise<number> => {
    const [r] = await rowsOf<{ ms: string }>(
      db,
      sql`select floor(extract(epoch from updated_at) * 1000)::bigint::text as ms from public.services where id = ${id}`,
    );
    if (!r) throw new Error("row missing");
    return Number(r.ms);
  };

  /** The row as the page posts it back untouched, with what the page saw. */
  const unchanged = async (id: string, r: Row) => ({
    id,
    name: r.name,
    priceCents: r.price_cents,
    vatRate: r.vat_rate as 0 | 6 | 13 | 23 | null,
    vatExemptionCode: r.vat_exemption_code as "M07" | null,
    isActive: r.is_active,
    color: r.color,
    smsReminders: r.sms_reminders,
    patientBookable: r.patient_bookable,
    durationMin: r.duration_min,
    seenUpdatedAtMs: await seenMs(id),
  });

  beforeAll(async () => {
    const schema = await import("@osteojp/db");
    db = schema.getDbAdmin();
    ({ sql } = await import("drizzle-orm"));
    ({ saveServiceTypesTable, createService } = await import("./services"));
    // One statement per execute: postgres.js prepares each.
    for (const stmt of [
      sql`insert into public.tenants (id, name, slug) values (${tenant}, 'types-ui-a', ${`types-ui-a-${tenant.slice(0, 8)}`})`,
      sql`insert into public.tenants (id, name, slug) values (${other}, 'types-ui-b', ${`types-ui-b-${other.slice(0, 8)}`})`,
      sql`insert into public.roles (id, tenant_id, slug, name) values (${role}, ${tenant}, 'admin', 'Admin')`,
      sql`insert into public.users (id, tenant_id, role_id, email, full_name)
          values (${admin}, ${tenant}, ${role}, ${`a-${admin.slice(0, 8)}@types.test`}, 'Admin')`,
      sql`insert into public.locations (id, tenant_id, name) values (${location}, ${tenant}, 'LV')`,
      sql`insert into public.services (id, tenant_id, name, price_cents, duration_min)
          values (${svcA}, ${tenant}, 'Fisioterapia', 5000, 45),
                 (${svcB}, ${tenant}, 'Reavaliação', 7000, 60),
                 (${packed}, ${tenant}, 'NESA', 5000, 30)`,
      sql`insert into public.services (id, tenant_id, name) values (${foreign}, ${other}, 'Outro')`,
      sql`insert into public.service_packs (id, tenant_id, base_service_id, location_id, name, session_count, price_cents)
          values (${pack}, ${tenant}, ${packed}, ${location}, 'Nesa pack 10', 10, 39000)`,
    ]) {
      await db.execute(stmt);
    }
  });

  afterAll(async () => {
    if (!db) return;
    for (const stmt of [
      sql`delete from public.audit_log where tenant_id in (${tenant}, ${other})`,
      sql`delete from public.service_packs where tenant_id = ${tenant}`,
      sql`delete from public.services where tenant_id in (${tenant}, ${other})`,
      sql`delete from public.locations where tenant_id = ${tenant}`,
      sql`delete from public.users where tenant_id = ${tenant}`,
      sql`delete from public.roles where tenant_id = ${tenant}`,
      sql`delete from public.tenants where id in (${tenant}, ${other})`,
    ]) {
      await db.execute(stmt);
    }
  });

  it("one save writes every column of every row and audits the changed field NAMES only", async () => {
    // Q9 (strategy, 2026-11-04): FollowUP is off the screen and the save never
    // writes it, so a value already stored survives the save untouched.
    await db.execute(sql`update public.services set follow_up_days = 2 where id = ${svcA}`);
    const a0 = await read(svcA);
    const b0 = await read(svcB);
    await saveServiceTypesTable(actor(), [
      {
        ...(await unchanged(svcA, a0)),
        name: "Fisioterapia geral",
        priceCents: 5500,
        vatRate: 0,
        vatExemptionCode: "M07",
        color: "#C27E3A",
        smsReminders: false,
        durationMin: 50,
      },
      await unchanged(svcB, b0),
    ]);
    expect(await read(svcA)).toEqual({
      name: "Fisioterapia geral",
      price_cents: 5500,
      duration_min: 50,
      is_active: true,
      patient_bookable: false,
      color: "#C27E3A",
      vat_rate: 0,
      vat_exemption_code: "M07",
      follow_up_days: 2,
      sms_reminders: false,
    });
    expect(await read(svcB)).toEqual(b0);
    const audits = await rowsOf<{ entity_id: string; metadata: { fields: string[] } }>(
      db,
      sql`select entity_id::text, metadata from public.audit_log
           where tenant_id = ${tenant} and action = 'service.update'`,
    );
    expect(audits).toEqual([
      {
        entity_id: svcA,
        metadata: {
          fields: ["name", "priceCents", "durationMin", "vatRate", "vatExemptionCode", "smsReminders", "color"],
        },
      },
    ]);
  });

  it("the switch and the AGENDA tag keep their own audit actions", async () => {
    const actionsOfB = async () =>
      (
        await rowsOf<{ action: string }>(
          db,
          sql`select action from public.audit_log where tenant_id = ${tenant} and entity_id = ${svcB}`,
        )
      )
        .map((r) => r.action)
        .sort();
    const b0 = await read(svcB);
    await saveServiceTypesTable(actor(), [{ ...(await unchanged(svcB, b0)), isActive: false, patientBookable: true }]);
    const b1 = await read(svcB);
    expect([b1.is_active, b1.patient_bookable]).toEqual([false, true]);
    expect(await actionsOfB()).toEqual(["service.archive", "service.patient_bookable_on"]);
    await saveServiceTypesTable(actor(), [{ ...(await unchanged(svcB, b1)), isActive: true, patientBookable: false }]);
    expect(await actionsOfB()).toEqual([
      "service.archive",
      "service.patient_bookable_off",
      "service.patient_bookable_on",
      "service.restore",
    ]);
  });

  it("switching off a type a pacote is bound to refuses the WHOLE save, naming the pacote, and nothing moves", async () => {
    const a0 = await read(svcA);
    const p0 = await read(packed);
    await expect(
      saveServiceTypesTable(actor(), [
        { ...(await unchanged(svcA, a0)), name: "Mudou" },
        { ...(await unchanged(packed, p0)), isActive: false },
      ]),
    ).rejects.toMatchObject({ code: "has_packs", message: "Nesa pack 10" });
    expect(await read(svcA)).toEqual(a0);
    expect(await read(packed)).toEqual(p0);
  });

  it("'Sem cor' clears a colour, and white can be set on a type that had none", async () => {
    const a0 = await read(svcA);
    const b0 = await read(svcB);
    expect([a0.color, b0.color]).toEqual(["#C27E3A", null]);
    await saveServiceTypesTable(actor(), [
      { ...(await unchanged(svcA, a0)), color: null },
      { ...(await unchanged(svcB, b0)), color: "#FFFFFF" },
    ]);
    expect([(await read(svcA)).color, (await read(svcB)).color]).toEqual([null, "#FFFFFF"]);
  });

  it("a page drawn before somebody else's save is refused (stale): their change stays, nothing is audited in this name", async () => {
    // Both admins open the page: each posts the same updated_at back.
    const b0 = await read(svcB);
    const stalePage = await unchanged(svcB, b0);
    // The other admin saves first.
    await saveServiceTypesTable(actor(), [{ ...stalePage, priceCents: 9900 }]);
    const afterOther = await read(svcB);
    expect(afterOther.price_cents).toBe(9900);
    const auditsBefore = await rowsOf<{ n: number }>(
      db,
      sql`select count(*)::int as n from public.audit_log where tenant_id = ${tenant}`,
    );
    // This admin's page still shows the old row and saves a different field.
    await expect(
      saveServiceTypesTable(actor(), [{ ...stalePage, smsReminders: !stalePage.smsReminders }]),
    ).rejects.toMatchObject({ code: "stale" });
    expect(await read(svcB)).toEqual(afterOther);
    const auditsAfter = await rowsOf<{ n: number }>(
      db,
      sql`select count(*)::int as n from public.audit_log where tenant_id = ${tenant}`,
    );
    expect(auditsAfter).toEqual(auditsBefore);
  });

  it("a row of another tenant is not_found, and nothing moved", async () => {
    const a0 = await read(svcA);
    const f0 = await read(foreign);
    await expect(
      saveServiceTypesTable(actor(), [
        { ...(await unchanged(svcA, a0)), name: "Outra vez" },
        { ...(await unchanged(foreign, f0)), name: "Alheio" },
      ]),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(await read(svcA)).toEqual(a0);
    expect(await read(foreign)).toEqual(f0);
  });

  it("the new-type row creates a type with Fisiozero's five fields and the duration", async () => {
    await createService(actor(), {
      name: "Pilates",
      durationMin: 55,
      priceCents: 5000,
      followUpDays: null,
      vatRate: 0,
      vatExemptionCode: "M07",
    });
    const [r] = await rowsOf<Row>(
      db,
      sql`select name, price_cents, duration_min, is_active, patient_bookable, color, vat_rate,
                 vat_exemption_code, follow_up_days, sms_reminders
            from public.services where tenant_id = ${tenant} and name = 'Pilates'`,
    );
    expect(r).toEqual({
      name: "Pilates",
      price_cents: 5000,
      duration_min: 55,
      is_active: true,
      patient_bookable: false,
      color: null,
      vat_rate: 0,
      vat_exemption_code: "M07",
      follow_up_days: null,
      sms_reminders: true,
    });
  });
});
