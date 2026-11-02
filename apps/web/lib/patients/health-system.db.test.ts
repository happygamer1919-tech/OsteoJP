/**
 * health-system.db.test.ts: the ficha's "Sistema/SubSistema" and "Nº da
 * Entidade / Subsistema" through the real createPatient and updatePatient
 * actions, under real RLS, against a real Postgres.
 *
 * The columns come from a PENDING migration
 * (packages/db/migrations-pending/NEXT-AFTER-0109_sistemas_subsistemas.sql), so
 * this file asks the database first and skips every arm when health_systems is
 * absent (CI's database while the file is pending).
 *
 * WHAT IT PROVES: a ficha is created and edited with an active Sistema of its
 * own tenant and a number; another tenant's Sistema is refused on the
 * healthSystemId field (never a raw key error); a switched-off Sistema is
 * refused as a new choice but a ficha that already names it saves unchanged;
 * clearing both works; the patient.update audit row names the two fields, and
 * health_insurance_numbers is untouched by any of it.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  updateTag: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

const acting = vi.hoisted(() => ({
  ctx: null as { tenantId: string; role: string; userId: string } | null,
}));
vi.mock("@/lib/auth/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/context")>();
  return {
    ...actual,
    requireRequestContext: async () => {
      if (!acting.ctx) throw new Error("no acting principal");
      return acting.ctx;
    },
  };
});

const live = Boolean(process.env.DATABASE_URL);

async function tablePresent(): Promise<boolean> {
  if (!live) return false;
  const { getDbAdmin } = await import("@osteojp/db");
  const rows = (await getDbAdmin().execute(
    raw`select to_regclass('public.health_systems') is not null as present`,
  )) as unknown as { present: boolean }[];
  return rows[0]?.present === true;
}

const present = await tablePresent();
const d = live && present ? describe : describe.skip;
const SIDE = present ? "TABLE PRESENT" : "TABLE ABSENT (pending migration)";

d(`the ficha's Sistema/SubSistema through createPatient and updatePatient [${SIDE}]`, () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let actions: typeof import("./actions");
  let nifWithCheckDigit: typeof import("./nif").nifWithCheckDigit;

  const tenant = randomUUID();
  const other = randomUUID();
  const reception = randomUUID();
  const adse = randomUUID();
  const off = randomUUID();
  const foreign = randomUUID();
  let patientId = "";

  const asReception = async <T,>(fn: () => Promise<T>): Promise<T> => {
    acting.ctx = { tenantId: tenant, role: "reception", userId: reception };
    try {
      return await fn();
    } finally {
      acting.ctx = null;
    }
  };

  const stored = async () => {
    const rows = (await db.execute(
      raw`select health_system_id, health_system_number, health_insurance_numbers
            from patients where id = ${patientId}::uuid`,
    )) as unknown as {
      health_system_id: string | null;
      health_system_number: string | null;
      health_insurance_numbers: unknown;
    }[];
    return rows[0]!;
  };

  beforeAll(async () => {
    db = (await import("@osteojp/db")).getDbAdmin();
    actions = await import("./actions");
    ({ nifWithCheckDigit } = await import("./nif"));
    for (const [t, label] of [
      [tenant, "a"],
      [other, "b"],
    ] as const) {
      await db.execute(
        raw`insert into tenants (id, name, slug) values (${t}::uuid, ${"HS ficha " + label}, ${"hsf-" + label + "-" + t.slice(0, 8)})`,
      );
    }
    const roleId = randomUUID();
    await db.execute(raw`insert into roles (id, tenant_id, slug, name) values (${roleId}::uuid, ${tenant}::uuid, 'reception', 'Rececao')`);
    await db.execute(
      raw`insert into users (id, tenant_id, role_id, email, full_name)
          values (${reception}::uuid, ${tenant}::uuid, ${roleId}::uuid, ${"hsf-" + reception + "@example.pt"}, 'HS Rececao')`,
    );
    await db.execute(
      raw`insert into health_systems (id, tenant_id, name, active)
          values (${adse}::uuid, ${tenant}::uuid, 'ADSE', true),
                 (${off}::uuid, ${tenant}::uuid, 'Antigo', false),
                 (${foreign}::uuid, ${other}::uuid, 'Outro', true)`,
    );
  });

  afterAll(async () => {
    if (!db) return;
    for (const t of [tenant, other]) {
      await db.execute(raw`delete from audit_log where tenant_id = ${t}::uuid`);
      await db.execute(raw`delete from patient_locations where tenant_id = ${t}::uuid`);
      await db.execute(raw`delete from patients where tenant_id = ${t}::uuid`);
      await db.execute(raw`delete from health_systems where tenant_id = ${t}::uuid`);
      await db.execute(raw`delete from users where tenant_id = ${t}::uuid`);
      await db.execute(raw`delete from roles where tenant_id = ${t}::uuid`);
      await db.execute(raw`delete from tenants where id = ${t}::uuid`);
    }
  });

  it("create with an active Sistema of the tenant and a number", async () => {
    const res = await asReception(() =>
      actions.createPatient({
        fullName: "Paciente Sistema",
        nif: nifWithCheckDigit("21234567"),
        healthSystemId: adse,
        healthSystemNumber: " 123456 ",
        healthInsuranceNumbers: [{ insurer: "Médis", number: "77" }],
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    patientId = res.patient.id;
    expect(await stored()).toEqual({
      health_system_id: adse,
      health_system_number: "123456",
      health_insurance_numbers: [{ insurer: "Médis", number: "77" }],
    });
  });

  it("create with another tenant's Sistema is refused on the healthSystemId field", async () => {
    const res = await asReception(() =>
      actions.createPatient({ fullName: "X", nif: nifWithCheckDigit("21234568"), healthSystemId: foreign }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.field).toBe("healthSystemId");
  });

  it("update to a switched-off Sistema is refused; to another tenant's too", async () => {
    for (const id of [off, foreign]) {
      const res = await asReception(() => actions.updatePatient(patientId, { healthSystemId: id }));
      expect(res.ok, id).toBe(false);
      if (!res.ok) expect(res.error.field).toBe("healthSystemId");
    }
    expect((await stored()).health_system_id).toBe(adse);
  });

  it("a ficha that already names a switched-off Sistema saves unchanged", async () => {
    await db.execute(raw`update patients set health_system_id = ${off}::uuid where id = ${patientId}::uuid`);
    const res = await asReception(() =>
      actions.updatePatient(patientId, { healthSystemId: off, healthSystemNumber: "999" }),
    );
    expect(res.ok).toBe(true);
    expect((await stored()).health_system_number).toBe("999");
  });

  it("clearing both stores NULL, the audit row names the fields, and the insurance list is untouched", async () => {
    const res = await asReception(() =>
      actions.updatePatient(patientId, { healthSystemId: "", healthSystemNumber: "" }),
    );
    expect(res.ok).toBe(true);
    expect(await stored()).toEqual({
      health_system_id: null,
      health_system_number: null,
      health_insurance_numbers: [{ insurer: "Médis", number: "77" }],
    });
    const audits = (await db.execute(
      raw`select metadata from audit_log where tenant_id = ${tenant}::uuid and action = 'patient.update'
           and entity_id = ${patientId}::uuid order by created_at desc limit 1`,
    )) as unknown as { metadata: { fields: string[] } }[];
    expect(audits[0]!.metadata.fields.sort()).toEqual(["healthSystemId", "healthSystemNumber"]);
  });
});
