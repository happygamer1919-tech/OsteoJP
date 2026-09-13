/**
 * estado-correction.db.test.ts — SCHED-28, against a real database.
 *
 * "Corrigir estado" moved a Cancelada row to Concluída over a booking made after
 * the cancel, and the database accepted it: 0061 only refuses two CONFIRMED rows,
 * and this door ran no check. The e2e proves the screen; this proves the ACTION,
 * with runScoped kept real so RLS and appointment_conflicts run as they do on
 * production. Only the auth seam is mocked, exactly as pedido-confirm.db.test.ts
 * does it.
 *
 * Each case seeds its own rows in the SAME window and afterEach removes them, so
 * no case can pass on another's leftovers.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn(), revalidateTag: vi.fn() }));

const h = vi.hoisted(() => ({ requireRequestContext: vi.fn() }));
vi.mock("@/lib/auth/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/context")>();
  return { ...actual, requireRequestContext: h.requireRequestContext };
});
vi.mock("@osteojp/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@osteojp/auth")>();
  return { ...actual, assertCan: vi.fn() }; // capability granted; RLS still real
});
vi.mock("./actor", () => ({ clientIp: vi.fn(async () => null) }));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("SCHED-28: Corrigir estado into Concluída re-checks the slot", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let correct: typeof import("./actions").correctAppointmentEstadoAction;

  let tenantId: string;
  let receptionId: string;
  let practitionerId: string;
  let locationId: string;
  let patientA: string;
  let patientB: string;

  const START = new Date(Date.now() + 120 * 60 * 60 * 1000);
  const END = new Date(START.getTime() + 45 * 60 * 1000);

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();
    ({ correctAppointmentEstadoAction: correct } = await import("./actions"));

    tenantId = randomUUID();
    await sql.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'Correcao Co', ${"sched28-" + tenantId.slice(0, 8)})`);

    receptionId = randomUUID();
    practitionerId = randomUUID();
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active)
      values (${receptionId}, ${tenantId}, ${"r-" + receptionId.slice(0, 8) + "@t.test"}, 'Rececao', true)`);
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
      values (${practitionerId}, ${tenantId}, ${"p-" + practitionerId.slice(0, 8) + "@t.test"}, 'Dra Teste', true, true)`);

    locationId = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name) values (${locationId}, ${tenantId}, 'Sede')`);

    patientA = randomUUID();
    patientB = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name) values (${patientA}, ${tenantId}, 'Paciente A')`);
    await sql.execute(raw`insert into patients (id, tenant_id, full_name) values (${patientB}, ${tenantId}, 'Paciente B')`);

    h.requireRequestContext.mockResolvedValue({ tenantId, role: "reception", userId: receptionId });
  });

  afterEach(async () => {
    await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from users where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  type Row = Record<string, unknown>;
  async function rows(q: Parameters<typeof sql.execute>[0]): Promise<Row[]> {
    const r = (await sql.execute(q)) as unknown;
    return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Row[];
  }

  async function seed(patientId: string, status: string): Promise<string> {
    const id = randomUUID();
    await sql.execute(raw`insert into appointments
        (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, created_by)
      values (${id}, ${tenantId}, ${patientId}, ${practitionerId}, ${locationId},
              ${START.toISOString()}::timestamptz, ${END.toISOString()}::timestamptz,
              ${status}::appointment_status, ${receptionId})`);
    return id;
  }

  async function statusOf(id: string): Promise<string> {
    const [r] = await rows(raw`select status::text as status from appointments where id = ${id}`);
    return String(r?.status);
  }

  it("Cancelada to Concluída over a slot booked since is REFUSED as a conflict, and nothing is written", async () => {
    const a = await seed(patientA, "cancelled");
    const b = await seed(patientB, "scheduled");

    const r = await correct(a, "completed");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("conflict");
    expect((r.conflicts ?? []).map((c) => c.id)).toContain(b);
    expect(await statusOf(a)).toBe("cancelled");
    const audit = await rows(raw`select 1 from audit_log where tenant_id = ${tenantId} and entity_id = ${a}`);
    expect(audit).toHaveLength(0);
  });

  it("Guardar mesmo assim writes it, and the audit row says the override was used", async () => {
    const a = await seed(patientA, "cancelled");
    await seed(patientB, "scheduled");

    const r = await correct(a, "completed", { allowConflict: true });

    expect(r.ok).toBe(true);
    expect(await statusOf(a)).toBe("completed");
    const [audit] = await rows(raw`select action, metadata from audit_log
      where tenant_id = ${tenantId} and entity_id = ${a}`);
    expect(audit?.action).toBe("appointment.estado_correction");
    expect((audit?.metadata as Record<string, unknown>).allowConflict).toBe(true);
  });

  it("a free slot corrects to Concluída with no refusal", async () => {
    const a = await seed(patientA, "cancelled");

    const r = await correct(a, "completed");

    expect(r.ok).toBe(true);
    expect(await statusOf(a)).toBe("completed");
  });

  it("Falta to Concluída over a booking is refused too", async () => {
    const a = await seed(patientA, "no_show");
    await seed(patientB, "scheduled");

    const r = await correct(a, "completed");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("conflict");
    expect(await statusOf(a)).toBe("no_show");
  });

  it("Cancelada to Falta runs no check: it leaves the slot released", async () => {
    const a = await seed(patientA, "cancelled");
    await seed(patientB, "scheduled");

    const r = await correct(a, "no_show");

    expect(r.ok).toBe(true);
    expect(await statusOf(a)).toBe("no_show");
  });
});
