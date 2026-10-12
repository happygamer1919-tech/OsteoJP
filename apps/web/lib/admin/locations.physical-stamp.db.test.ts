/**
 * locations.physical-stamp.db.test.ts - S-1012-A1 ruling 4, against a real database.
 *
 * WHY THE FAKE-DATABASE TESTS ARE NOT ENOUGH. ./locations.physical-stamp.test.ts
 * proves what updateLocation ASKS the database to store, and
 * ../clinical/declaracao/physical-stamp.test.ts proves what the generator does
 * with a stored mark. Neither can prove that the write GOES THROUGH: the mark
 * lives on the tenant's row, and that row is written under the tenants UPDATE
 * policy by the session of whoever pressed Save. So this suite runs the real
 * server functions as an admin and as the owner, with row level security on,
 * and then issues the declaration from what the database holds.
 *
 * Every name is invented. The suite owns its tenant and removes it.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("S-1012-A1 ruling 4: the physical-stamp mark, written and read under RLS", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let schema: typeof import("@osteojp/db");
  let updateLocation: typeof import("./locations").updateLocation;
  let listPhysicalStampPlaces: typeof import("./locations").listPhysicalStampPlaces;
  let declaracaoAvailability: typeof import("../clinical/declaracao/generate").declaracaoAvailability;
  let generateDeclaracaoPdf: typeof import("../clinical/declaracao/generate").generateDeclaracaoPdf;

  const tenant = randomUUID();
  const otherTenant = randomUUID();
  const roles = { admin: randomUUID(), owner: randomUUID(), reception: randomUUID() };
  const users = { admin: randomUUID(), owner: randomUUID(), reception: randomUUID() };
  /** The third location: no carimbo image. */
  const third = randomUUID();
  /** A second location with no carimbo image, never marked. */
  const unmarked = randomUUID();
  const patient = randomUUID();

  const NAME = "OsteoJP (Montemor-o-Novo)";
  const ADDRESS = "Rua Horta das Almas 4, 7050-356 Montemor-o-Novo";
  const PHONE = "926 714 926";
  const base = { name: NAME, address: ADDRESS, phone: PHONE };

  const actor = (role: keyof typeof users) => ({ tenantId: tenant, role, userId: users[role] });

  const settingsOf = async (id: string): Promise<Record<string, unknown>> => {
    const { sql } = await import("drizzle-orm");
    const rows = await db.execute<{ settings: Record<string, unknown> }>(
      sql`select settings from public.tenants where id = ${id}`,
    );
    const list = Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? []);
    return (list[0] as { settings: Record<string, unknown> }).settings;
  };

  beforeAll(async () => {
    schema = await import("@osteojp/db");
    db = schema.getDbAdmin();
    ({ updateLocation, listPhysicalStampPlaces } = await import("./locations"));
    ({ declaracaoAvailability, generateDeclaracaoPdf } = await import("../clinical/declaracao/generate"));
    const { sql } = await import("drizzle-orm");
    const slug = (id: string) => `mn01-${id.slice(0, 8)}`;
    // One statement per execute: postgres.js prepares each.
    await db.execute(
      sql`insert into public.tenants (id, name, slug, settings)
          values (${tenant}, 'mn01', ${slug(tenant)},
                  ${JSON.stringify({ contacts: { phone: "210 999 999" }, declaracao: { responsavel: "Dra. Teste" } })}::jsonb)`,
    );
    await db.execute(
      sql`insert into public.tenants (id, name, slug) values (${otherTenant}, 'mn01-other', ${slug(otherTenant)})`,
    );
    for (const r of ["admin", "owner", "reception"] as const) {
      await db.execute(
        sql`insert into public.roles (id, tenant_id, slug, name) values (${roles[r]}, ${tenant}, ${r}, ${r})`,
      );
      await db.execute(
        sql`insert into public.users (id, tenant_id, role_id, email, full_name)
            values (${users[r]}, ${tenant}, ${roles[r]}, ${`${r}-${users[r].slice(0, 8)}@mn01.test`}, ${`Teste ${r}`})`,
      );
    }
    await db.execute(
      sql`insert into public.locations (id, tenant_id, name, address, phone)
          values (${third}, ${tenant}, ${NAME}, ${ADDRESS}, ${PHONE}),
                 (${unmarked}, ${tenant}, 'OsteoJP (Outro Local)', null, null)`,
    );
    await db.execute(
      sql`insert into public.patients (id, tenant_id, full_name) values (${patient}, ${tenant}, 'Paciente Ficticio')`,
    );
  });

  afterAll(async () => {
    const { sql } = await import("drizzle-orm");
    for (const stmt of [
      sql`delete from public.audit_log where tenant_id = ${tenant}`,
      sql`delete from public.patients where tenant_id = ${tenant}`,
      sql`delete from public.locations where tenant_id = ${tenant}`,
      sql`delete from public.users where tenant_id = ${tenant}`,
      sql`delete from public.roles where tenant_id = ${tenant}`,
      sql`delete from public.tenants where id in (${tenant}, ${otherTenant})`,
    ]) {
      await db.execute(stmt);
    }
  });

  const inputs = { patientId: patient, date: "2026-07-12", startTime: "09:30", endTime: "10:30" };

  it("before any mark: the location is refused, as every location with no carimbo is", async () => {
    expect(await declaracaoAvailability(actor("owner"), third)).toBe("no_stamp");
    await expect(generateDeclaracaoPdf(actor("owner"), { ...inputs, locationId: third })).rejects.toMatchObject({
      code: "no_stamp",
    });
  });

  it("an ADMIN marks it: the tenant row holds the mark, and every other setting it held", async () => {
    await updateLocation(actor("admin"), third, {
      ...base,
      physicalStamp: { enabled: true, place: "Montemor-o-Novo" },
    });

    expect(await settingsOf(tenant)).toEqual({
      contacts: { phone: "210 999 999" },
      declaracao: { responsavel: "Dra. Teste", physicalStamp: { [third]: { place: "Montemor-o-Novo" } } },
    });
    expect(await listPhysicalStampPlaces(actor("admin"), [third, unmarked])).toEqual({
      [third]: "Montemor-o-Novo",
    });
    // Another tenant's row is not touched by a write that names no tenant of its own.
    expect(await settingsOf(otherTenant)).toEqual({});
  });

  it("G6 from the database: the declaration is produced for the marked location", async () => {
    expect(await declaracaoAvailability(actor("reception"), third)).toBe("ok");

    const pdf = await generateDeclaracaoPdf(actor("reception"), { ...inputs, locationId: third });

    expect(Buffer.from(pdf.bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("the location next to it, never marked, is still refused", async () => {
    expect(await declaracaoAvailability(actor("owner"), unmarked)).toBe("no_stamp");
  });

  it("the OWNER clears it: the mark is gone, the refusal is back, the other settings stay", async () => {
    await updateLocation(actor("owner"), third, { ...base, physicalStamp: { enabled: false, place: "" } });

    expect(await settingsOf(tenant)).toEqual({
      contacts: { phone: "210 999 999" },
      declaracao: { responsavel: "Dra. Teste", physicalStamp: {} },
    });
    expect(await declaracaoAvailability(actor("owner"), third)).toBe("no_stamp");
  });

  it("the audit trail of the two changes names the field and the location, never the place", async () => {
    const { sql } = await import("drizzle-orm");
    const rows = await db.execute<{ action: string; metadata: Record<string, unknown> }>(
      sql`select action, metadata from public.audit_log
          where tenant_id = ${tenant} and action = 'tenant.update' order by created_at`,
    );
    const list = (Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? [])) as {
      action: string;
      metadata: Record<string, unknown>;
    }[];
    expect(list.map((r) => r.metadata)).toEqual([
      { fields: ["declaracao.physicalStamp"], locationId: third },
      { fields: ["declaracao.physicalStamp"], locationId: third },
    ]);
  });
});
