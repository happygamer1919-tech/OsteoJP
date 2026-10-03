/**
 * pedido-move-emits.db.test.ts - against a REAL Postgres: a move or an un-cancel
 * of an UNACCEPTED online request emits nothing, and everything else emits as
 * before.
 *
 * WHY A DATABASE. The decision is `public.is_unconfirmed_pedido`, a SECURITY
 * DEFINER function over the row's status, its origin and its request
 * notification. The unit suite (pedido-move-emits.test.ts) answers it from a
 * list; only here is the real function asked, inside the real transaction, at
 * the two moments that matter: BEFORE a move's write, and AFTER an un-cancel's
 * (where it must read this transaction's own status change).
 *
 * runScoped, RLS, the conflict check, the clinic hours and the permission
 * matrix are all real. Only the request context, the client IP and the reminder
 * enqueue are replaced; the enqueue is a spy, so what each action WOULD emit is
 * read exactly.
 *
 * Fixtures are pinned to a wall-clock hour in January (WET = UTC), inside the
 * default 08:00-20:00 clinic day, for the reason estado-uncancel.db.test.ts
 * gives at length: a seed derived from the time the suite runs goes red every
 * evening. Names are invented.
 *
 * Skipped without DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn(), revalidateTag: vi.fn() }));

const h = vi.hoisted(() => ({
  requireRequestContext: vi.fn(),
  // Typed, so `mock.calls[n][1]` below is the target list and not `undefined`.
  enqueueRemindersAfterCommit: vi.fn<(tenantId: string, targets: unknown[]) => Promise<void>>(
    async () => {},
  ),
  enqueueStatusNotificationsAfterCommit: vi.fn(async () => {}),
}));
vi.mock("@/lib/auth/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/context")>();
  return { ...actual, requireRequestContext: h.requireRequestContext };
});
vi.mock("./actor", () => ({ clientIp: vi.fn(async () => null) }));
vi.mock("./reminders", () => ({
  enqueueRemindersAfterCommit: h.enqueueRemindersAfterCommit,
  enqueueStatusNotificationsAfterCommit: h.enqueueStatusNotificationsAfterCommit,
}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("a move or an un-cancel of an unaccepted request emits nothing", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let actions: typeof import("./actions");

  let tenantId: string;
  let receptionId: string;
  let practitionerId: string;
  let locationId: string;
  let serviceId: string;
  let patientId: string;

  const at = (day: number, hour: number) => new Date(Date.UTC(2027, 0, day, hour, 0, 0));
  const D1 = at(13, 11);
  const D2 = at(14, 11);
  const D3 = at(15, 15);
  const plus45 = (dte: Date) => new Date(dte.getTime() + 45 * 60_000);

  type Row = Record<string, unknown>;
  async function rows(q: Parameters<typeof sql.execute>[0]): Promise<Row[]> {
    const r = (await sql.execute(q)) as unknown;
    return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Row[];
  }

  async function seed(args: {
    status: string;
    origin: "patient_portal" | "staff";
    startsAt?: Date;
    /** A staff-origin row that still carries a request notification (a legacy pedido). */
    requestNotification?: boolean;
  }): Promise<string> {
    const id = randomUUID();
    const startsAt = args.startsAt ?? D1;
    await sql.execute(raw`insert into appointments
        (id, tenant_id, patient_id, practitioner_id, location_id, service_id, starts_at, ends_at, status, origin)
      values (${id}, ${tenantId}, ${patientId}, ${practitionerId}, ${locationId}, ${serviceId},
              ${startsAt.toISOString()}::timestamptz, ${plus45(startsAt).toISOString()}::timestamptz,
              ${args.status}::appointment_status, ${args.origin})`);
    if (args.requestNotification) {
      await sql.execute(raw`insert into staff_notifications
          (tenant_id, recipient_user_id, kind, appointment_id, patient_id,
           previous_starts_at, new_starts_at, occurred_at)
        values (${tenantId}, ${receptionId}, 'appointment_request', ${id}, ${patientId},
                ${startsAt.toISOString()}::timestamptz, ${startsAt.toISOString()}::timestamptz, now())`);
    }
    return id;
  }

  /**
   * The database's own answer, asked AS RECEPTION inside the tenant context.
   * The function is tenant-scoped through the caller's claims, so the admin
   * handle (no claims) would answer false for every row and the control below
   * would control nothing.
   */
  const isPedido = async (id: string) => {
    const { runScoped } = await import("@/lib/auth/context");
    const { unconfirmedPedidoIdsAmong } = await import("./pedido-acceptance");
    const ids = await runScoped({ tenantId, role: "reception", userId: receptionId }, (tx) =>
      unconfirmedPedidoIdsAmong(tx, [id]),
    );
    return ids.has(id);
  };
  const startOf = async (id: string) =>
    new Date(String((await rows(raw`select starts_at from appointments where id = ${id}`))[0]?.starts_at));
  const statusOf = async (id: string) =>
    String((await rows(raw`select status::text as s from appointments where id = ${id}`))[0]?.s);

  const move = (id: string, to: Date) =>
    actions.rescheduleAppointment(id, {
      startsAt: to.toISOString(),
      endsAt: plus45(to).toISOString(),
      practitionerId,
      locationId,
    });

  /** Every target handed to the enqueue so far. */
  const emitted = () => h.enqueueRemindersAfterCommit.mock.calls.flatMap((c) => c[1]);

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();
    actions = await import("./actions");

    tenantId = randomUUID();
    await sql.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'Move Emits Co', ${"pme-" + tenantId.slice(0, 8)})`);
    receptionId = randomUUID();
    practitionerId = randomUUID();
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active)
      values (${receptionId}, ${tenantId}, ${"r-" + receptionId.slice(0, 8) + "@t.test"}, 'Rececao', true)`);
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
      values (${practitionerId}, ${tenantId}, ${"p-" + practitionerId.slice(0, 8) + "@t.test"}, 'Dra Teste', true, true)`);
    locationId = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name) values (${locationId}, ${tenantId}, 'Sede')`);
    serviceId = randomUUID();
    await sql.execute(raw`insert into services (id, tenant_id, name) values (${serviceId}, ${tenantId}, 'Osteopatia')`);
    patientId = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name) values (${patientId}, ${tenantId}, 'Paciente Inventado')`);

    h.requireRequestContext.mockResolvedValue({ tenantId, role: "reception", userId: receptionId });
  });

  afterEach(async () => {
    h.enqueueRemindersAfterCommit.mockClear();
    await sql.execute(raw`delete from staff_notifications where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.execute(raw`delete from staff_notifications where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from services where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from users where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  /* ------------------------------- the move ------------------------------- */

  it("an UNACCEPTED request moved once: the move is written and NOTHING is emitted", async () => {
    const id = await seed({ status: "scheduled", origin: "patient_portal" });
    // The control: the database calls this row an unaccepted pedido.
    expect(await isPedido(id)).toBe(true);

    expect(await move(id, D2)).toEqual({ ok: true, data: { id } });
    expect((await startOf(id)).toISOString()).toBe(D2.toISOString());
    expect(emitted()).toEqual([]);
  });

  it("moved TWICE, then accepted: nothing before the acceptance, and ONE marked target at the FINAL start", async () => {
    const id = await seed({ status: "scheduled", origin: "patient_portal" });
    expect((await move(id, D2)).ok).toBe(true);
    expect((await move(id, D3)).ok).toBe(true);
    expect(emitted()).toEqual([]);

    // Accepted through the Estado door.
    expect((await actions.updateAppointment(id, { status: "confirmed" })).ok).toBe(true);
    expect(await statusOf(id)).toBe("confirmed");
    expect(emitted()).toEqual([{ appointmentId: id, startsAt: D3, acceptedPedido: true }]);
  });

  it("moved, then accepted from the PEDIDOS QUEUE: the same, through the other door", async () => {
    const id = await seed({ status: "scheduled", origin: "patient_portal", requestNotification: true });
    expect((await move(id, D2)).ok).toBe(true);
    expect(emitted()).toEqual([]);

    expect((await actions.confirmAppointmentRequest(id)).ok).toBe(true);
    expect(emitted()).toEqual([{ appointmentId: id, startsAt: D2, acceptedPedido: true }]);
  });

  it("an ACCEPTED request moved: emits its new start, unmarked, exactly as before", async () => {
    const id = await seed({ status: "confirmed", origin: "patient_portal" });
    expect(await isPedido(id)).toBe(false);

    expect((await move(id, D2)).ok).toBe(true);
    expect(emitted()).toEqual([{ appointmentId: id, startsAt: D2 }]);
  });

  it("a STAFF booking that is still Agendada, moved: emits, because it is not a pedido", async () => {
    const id = await seed({ status: "scheduled", origin: "staff" });
    expect(await isPedido(id)).toBe(false);

    expect((await move(id, D2)).ok).toBe(true);
    expect(emitted()).toEqual([{ appointmentId: id, startsAt: D2 }]);
  });

  it("a LEGACY pedido (staff origin, a request notification) moved: nothing, by the database's own definition", async () => {
    const id = await seed({ status: "scheduled", origin: "staff", requestNotification: true });
    expect(await isPedido(id)).toBe(true);

    expect((await move(id, D2)).ok).toBe(true);
    expect(emitted()).toEqual([]);
  });

  /* ------------------------------ the un-cancel ------------------------------ */

  it("an online request brought back to AGENDADA is unaccepted again: NOTHING is emitted", async () => {
    const id = await seed({ status: "cancelled", origin: "patient_portal" });
    // Before the write it is `cancelled`, so the function says no. The decision
    // has to be read AFTER the write, inside the same transaction.
    expect(await isPedido(id)).toBe(false);

    expect((await actions.updateAppointment(id, { status: "scheduled" })).ok).toBe(true);
    expect(await statusOf(id)).toBe("scheduled");
    expect(await isPedido(id)).toBe(true);
    expect(emitted()).toEqual([]);
  });

  it("and when reception then accepts it: ONE marked target", async () => {
    const id = await seed({ status: "cancelled", origin: "patient_portal" });
    expect((await actions.updateAppointment(id, { status: "scheduled" })).ok).toBe(true);
    expect((await actions.updateAppointment(id, { status: "confirmed" })).ok).toBe(true);
    expect(emitted()).toEqual([{ appointmentId: id, startsAt: D1, acceptedPedido: true }]);
  });

  it("an online request brought back straight to CONFIRMADA emits, unmarked, as before", async () => {
    const id = await seed({ status: "cancelled", origin: "patient_portal" });
    expect((await actions.updateAppointment(id, { status: "confirmed" })).ok).toBe(true);
    expect(emitted()).toEqual([{ appointmentId: id, startsAt: D1 }]);
  });

  it("a STAFF booking brought back to Agendada emits, so its reminders exist again", async () => {
    const id = await seed({ status: "cancelled", origin: "staff" });
    expect((await actions.updateAppointment(id, { status: "scheduled" })).ok).toBe(true);
    expect(await isPedido(id)).toBe(false);
    expect(emitted()).toEqual([{ appointmentId: id, startsAt: D1 }]);
  });
});
