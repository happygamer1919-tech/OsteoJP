/**
 * book-confirm.db.test.ts - BOOK-CONFIRM, against a REAL Postgres.
 *
 * WHAT IT PROVES, and why each arm needs a database:
 *
 *   1. The row the dispatch READS is the real joined read (`loadReminderData`,
 *      under the reminder job's tenant context and RLS): the appointment's own
 *      LOCATION row supplies the address and the phone, and its service
 *      supplies the name. Two locations, two appointments, and each message
 *      carries its own location's address and phone and not the other's.
 *   2. Every outcome lands in `reminder_dispatches` through the real INSERT
 *      policy and past 0075's CHECKs, including the reasons this change
 *      introduces. A reason the table refused would lose the row silently
 *      (`recordDispatch` never throws), so the rows are read back.
 *   3. "One message per appointment AND start" is a real write and a real
 *      read: the hand-over is an audit row carrying the start (the ledger has
 *      no column for it), written and read under the reminder job's tenant
 *      context, and the predicate is SQL over jsonb that a unit test cannot run.
 *
 * The two SEND functions are the only seam replaced: they capture the whole
 * message, so its body can be read. One arm hands the sends back to the real
 * notify gate, with live send off, to prove the sandbox row and that it counts
 * as the one message.
 *
 * Its own tenant, built here and removed afterwards. Every name, address and
 * phone number is invented.
 *
 * Skipped without DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, lisbonDateTimeToUtc, todayInLisbon } from "../scheduling/time";
import { formatDateLong, formatTime } from "./locale";

vi.mock("server-only", () => ({}));

type Sent = { templateId: string; to: string; subject?: string; body: string };
const h = vi.hoisted(() => ({
  email: [] as Sent[],
  sms: [] as Sent[],
  realGate: false,
}));

vi.mock("./clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clients")>();
  return {
    ...actual,
    sendEmail: vi.fn(async (m: Parameters<typeof actual.sendEmail>[0]) => {
      if (h.realGate) return actual.sendEmail(m);
      h.email.push({ templateId: m.templateId, to: m.to, subject: m.subject, body: m.body });
      return { channel: "email" as const, sandbox: false, id: `db-test-email-${randomUUID()}` };
    }),
    sendSms: vi.fn(async (m: Parameters<typeof actual.sendSms>[0]) => {
      if (h.realGate) return actual.sendSms(m);
      h.sms.push({ templateId: m.templateId, to: m.to, body: m.body });
      return { channel: "sms" as const, sandbox: false, id: `db-test-sms-${randomUUID()}` };
    }),
  };
});

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

const LV = {
  name: "Clinica Norte",
  address: "Avenida Inventada 10, 2795-000 Linda-a-Velha",
  phone: "+351 210 222 222",
};
const CB = {
  name: "Clinica Sul",
  address: "Rua de Exemplo 1, 6000-000 Castelo Branco",
  phone: "+351 272 111 111",
};
const TENANT_PHONE = "+351 210 999 999";

d("BOOK-CONFIRM: the booking-approved dispatch against a real database", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let dispatchConfirmation: typeof import("./dispatch").dispatchConfirmation;
  let tenantId: string;
  let otherTenantId: string;
  let therapistId: string;
  let serviceId: string;
  const loc = { lv: "", cb: "", bare: "" };
  const patient = { withEmail: "", noEmail: "", noContact: "" };

  /** Ten days out at a pinned hour: far outside both reminder offsets. */
  const day = addDays(todayInLisbon(), 10);
  let slot = 0;

  type Row = Record<string, unknown>;
  async function rows(q: Parameters<typeof sql.execute>[0]): Promise<Row[]> {
    const r = (await sql.execute(q)) as unknown;
    return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Row[];
  }

  /** An online request, in whatever state the arm needs. Each gets its own hour. */
  async function request(args: {
    patientId: string;
    locationId: string;
    status?: string;
    origin?: string;
    withService?: boolean;
  }): Promise<string> {
    const id = randomUUID();
    // One hour each, twelve to a day: no two of this suite's rows overlap, so
    // 0061's no-double-confirmed constraint has nothing to refuse.
    const i = slot++;
    const hour = String(8 + (i % 12)).padStart(2, "0");
    const startsAt = lisbonDateTimeToUtc(addDays(day, Math.floor(i / 12)), `${hour}:00`);
    const endsAt = new Date(startsAt.getTime() + 45 * 60_000);
    await sql.execute(raw`insert into appointments
      (id, tenant_id, patient_id, practitioner_id, location_id, service_id, starts_at, ends_at, status, origin)
      values (${id}, ${tenantId}, ${args.patientId}, ${therapistId}, ${args.locationId},
              ${args.withService === false ? null : serviceId},
              ${startsAt.toISOString()}, ${endsAt.toISOString()},
              ${args.status ?? "confirmed"}, ${args.origin ?? "patient_portal"})`);
    return id;
  }

  const ledger = (appointmentId: string) =>
    rows(raw`select channel, template_id, outcome, suppression_reason
      from reminder_dispatches where appointment_id = ${appointmentId} order by created_at, id`);

  const saved: Record<string, string | undefined> = {};
  const ENV_KEYS = [
    "BOOK_CONFIRM_MODE",
    "BOOK_CONFIRM_CANARY_PATIENT_IDS",
    "REMINDERS_LIVE_SEND",
    "REMINDERS_LINK_SECRET",
    "REMINDERS_RESCHEDULE_BASE_URL",
  ] as const;

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();
    ({ dispatchConfirmation } = await import("./dispatch"));

    tenantId = randomUUID();
    otherTenantId = randomUUID();
    // A tenant-level phone that DIFFERS from both locations', so any use shows.
    await sql.execute(raw`insert into tenants (id, name, slug, settings)
      values (${tenantId}, 'Book Confirm Co', ${"bc-" + tenantId.slice(0, 8)},
              ${JSON.stringify({ locale: "pt", contacts: { phone: TENANT_PHONE } })}::jsonb)`);
    await sql.execute(raw`insert into tenants (id, name, slug)
      values (${otherTenantId}, 'Outra Co', ${"bc-" + otherTenantId.slice(0, 8)})`);

    therapistId = randomUUID();
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
      values (${therapistId}, ${tenantId}, ${"t-" + therapistId.slice(0, 8) + "@t.test"}, 'Dra Inventada', true, true)`);

    loc.lv = randomUUID();
    loc.cb = randomUUID();
    loc.bare = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name, address, phone)
      values (${loc.lv}, ${tenantId}, ${LV.name}, ${LV.address}, ${LV.phone})`);
    await sql.execute(raw`insert into locations (id, tenant_id, name, address, phone)
      values (${loc.cb}, ${tenantId}, ${CB.name}, ${CB.address}, ${CB.phone})`);
    // A location with a phone and NO address.
    await sql.execute(raw`insert into locations (id, tenant_id, name, phone)
      values (${loc.bare}, ${tenantId}, 'Clinica Sem Morada', '+351 210 333 333')`);

    serviceId = randomUUID();
    await sql.execute(raw`insert into services (id, tenant_id, name)
      values (${serviceId}, ${tenantId}, 'Osteopatia')`);

    patient.withEmail = randomUUID();
    patient.noEmail = randomUUID();
    patient.noContact = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, email, phone)
      values (${patient.withEmail}, ${tenantId}, 'Madalena Inventada', 'madalena@example.test', '912000001')`);
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, phone)
      values (${patient.noEmail}, ${tenantId}, 'Rui Inventado', '912000002')`);
    await sql.execute(raw`insert into patients (id, tenant_id, full_name)
      values (${patient.noContact}, ${tenantId}, 'Ines Inventada')`);
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.execute(raw`delete from reminder_dispatches where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from services where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from users where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from tenants where id in (${tenantId}, ${otherTenantId})`);
  });

  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    h.email.length = 0;
    h.sms.length = 0;
    h.realGate = false;
    process.env.BOOK_CONFIRM_MODE = "on";
    delete process.env.BOOK_CONFIRM_CANARY_PATIENT_IDS;
    delete process.env.REMINDERS_LIVE_SEND;
    process.env.REMINDERS_LINK_SECRET = "test-only-link-secret-not-prod";
    process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://app.example.test";
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.restoreAllMocks();
  });

  const ACCEPTED = { acceptedPedido: true } as const;

  it("each location's approval carries THAT location's address and phone, read from its own row", async () => {
    const atLv = await request({ patientId: patient.withEmail, locationId: loc.lv });
    const atCb = await request({ patientId: patient.withEmail, locationId: loc.cb });

    expect(await dispatchConfirmation(tenantId, atLv, ACCEPTED)).toMatchObject({ dispatched: true });
    expect(await dispatchConfirmation(tenantId, atCb, ACCEPTED)).toMatchObject({ dispatched: true });

    expect(h.sms).toEqual([]);
    expect(h.email).toHaveLength(2);
    const [first, second] = h.email as [Sent, Sent];
    for (const m of [first, second]) {
      expect(m.templateId).toBe("booking_approved.email");
      expect(m.to).toBe("madalena@example.test");
      expect(m.body).not.toMatch(/[{}]/);
      expect(m.body).toContain("Olá Madalena,");
      expect(m.body).toContain("Serviço: Osteopatia");
      expect(m.body).toContain("Terapeuta: Dra Inventada");
      expect(m.body).not.toContain(TENANT_PHONE);
    }
    expect(first.body).toContain(`Local: ${LV.name}, ${LV.address}`);
    expect(first.body).toContain(`contacte a clínica: ${LV.phone}`);
    expect(first.body).not.toContain(CB.address);
    expect(first.body).not.toContain(CB.phone);
    expect(second.body).toContain(`Local: ${CB.name}, ${CB.address}`);
    expect(second.body).toContain(`contacte a clínica: ${CB.phone}`);
    expect(second.body).not.toContain(LV.address);
    expect(second.body).not.toContain(LV.phone);

    expect(await ledger(atLv)).toEqual([
      { channel: "email", template_id: "booking_approved.email", outcome: "sent", suppression_reason: null },
    ]);
    expect(await ledger(atCb)).toEqual([
      { channel: "email", template_id: "booking_approved.email", outcome: "sent", suppression_reason: null },
    ]);
  });

  it("approving the same request twice sends ONE message: the real ledger read stops the second", async () => {
    const id = await request({ patientId: patient.withEmail, locationId: loc.lv });
    expect(await dispatchConfirmation(tenantId, id, ACCEPTED)).toMatchObject({ dispatched: true });
    expect(await dispatchConfirmation(tenantId, id, ACCEPTED)).toEqual({
      dispatched: false,
      reason: "already_sent",
    });
    expect(h.email).toHaveLength(1);
    expect(await ledger(id)).toEqual([
      { channel: "email", template_id: "booking_approved.email", outcome: "sent", suppression_reason: null },
      {
        channel: "email",
        template_id: "booking_approved.email",
        outcome: "suppressed",
        suppression_reason: "already_sent",
      },
    ]);
  });

  /* ------------- one message per appointment AND start ------------- */
  // Lead's decision, 2026-10-03. The start is not a ledger column, so the
  // hand-over is written as an audit row that carries it and read back for one
  // start. Everything here is the real write and the real read, under the
  // reminder job's own tenant context and audit_log's own policies.

  const startOf = async (id: string) =>
    new Date(String((await rows(raw`select starts_at from appointments where id = ${id}`))[0]?.starts_at));
  /** Reception moves the appointment. Written directly: the mover is not under test here. */
  const moveTo = async (id: string, to: Date) => {
    await sql.execute(raw`update appointments
      set starts_at = ${to.toISOString()}::timestamptz,
          ends_at = ${new Date(to.getTime() + 45 * 60_000).toISOString()}::timestamptz
      where id = ${id}`);
  };
  const handOvers = (id: string) =>
    rows(raw`select action, entity_type, actor_user_id, metadata
      from audit_log where entity_id = ${id} and action = 'appointment.booking_approved_handed_over'
      order by created_at, id`);

  it("the hand-over is recorded with its start, and read back for THAT start only", async () => {
    const id = await request({ patientId: patient.withEmail, locationId: loc.lv });
    const start = await startOf(id);
    await dispatchConfirmation(tenantId, id, ACCEPTED);

    expect(await handOvers(id)).toEqual([
      {
        action: "appointment.booking_approved_handed_over",
        entity_type: "appointment",
        actor_user_id: null,
        metadata: { source: "book-confirm", startsAt: start.toISOString(), channel: "email" },
      },
    ]);

    const { hasBookingApprovedHandOver } = await import("./dispatch-ledger");
    expect(await hasBookingApprovedHandOver({ tenantId, appointmentId: id, startsAt: start })).toBe(true);
    // A different start: no hand-over for it.
    const other = new Date(start.getTime() + 24 * 3600_000);
    expect(await hasBookingApprovedHandOver({ tenantId, appointmentId: id, startsAt: other })).toBe(false);
    // Another appointment at the same start: none.
    expect(
      await hasBookingApprovedHandOver({ tenantId, appointmentId: randomUUID(), startsAt: start }),
    ).toBe(false);
    // Another tenant asking about this appointment reads nothing.
    expect(
      await hasBookingApprovedHandOver({ tenantId: otherTenantId, appointmentId: id, startsAt: start }),
    ).toBe(false);
  });

  it("reception's own reschedule audit row carries a start too, and is NOT a hand-over", async () => {
    // `appointment.reschedule` records the new start in its metadata under the
    // same key. Without the action in the predicate, moving an accepted
    // appointment would read as "already told" and the new message would never go.
    const id = await request({ patientId: patient.withEmail, locationId: loc.lv });
    const start = await startOf(id);
    await sql.execute(raw`insert into audit_log (tenant_id, action, entity_type, entity_id, metadata)
      values (${tenantId}, 'appointment.reschedule', 'appointment', ${id},
              ${JSON.stringify({ startsAt: start.toISOString(), scope: "one" })}::jsonb)`);
    const { hasBookingApprovedHandOver } = await import("./dispatch-ledger");
    expect(await hasBookingApprovedHandOver({ tenantId, appointmentId: id, startsAt: start })).toBe(false);
    // And so the acceptance sends.
    expect(await dispatchConfirmation(tenantId, id, ACCEPTED)).toMatchObject({ dispatched: true });
  });

  it("accepted at T1, moved to T2, accepted again: ONE NEW message that says T2; a third at T2 sends nothing", async () => {
    const id = await request({ patientId: patient.withEmail, locationId: loc.lv });
    const t1 = await startOf(id);
    const t2 = lisbonDateTimeToUtc(addDays(day, 5), "16:00");

    expect(await dispatchConfirmation(tenantId, id, ACCEPTED)).toMatchObject({ dispatched: true });
    // Same start again: nothing.
    expect(await dispatchConfirmation(tenantId, id, ACCEPTED)).toEqual({
      dispatched: false,
      reason: "already_sent",
    });

    await moveTo(id, t2);
    expect(await dispatchConfirmation(tenantId, id, ACCEPTED)).toMatchObject({ dispatched: true });
    expect(h.email).toHaveLength(2);
    expect(h.email[0]!.body).toContain("Hora: " + formatTime(t1, "pt"));
    expect(h.email[1]!.subject).toBe(
      `Consulta confirmada: ${formatDateLong(t2, "pt")} às ${formatTime(t2, "pt")}`,
    );
    expect(h.email[1]!.body).toContain(`Data: ${formatDateLong(t2, "pt")}`);
    expect(h.email[1]!.body).toContain("Hora: 16:00");

    // A third acceptance, still at T2: nothing more.
    expect(await dispatchConfirmation(tenantId, id, ACCEPTED)).toEqual({
      dispatched: false,
      reason: "already_sent",
    });
    // Moved BACK to T1 and accepted: nothing, the patient already holds T1.
    await moveTo(id, t1);
    expect(await dispatchConfirmation(tenantId, id, ACCEPTED)).toEqual({
      dispatched: false,
      reason: "already_sent",
    });
    expect(h.email).toHaveLength(2);

    expect((await handOvers(id)).map((r) => (r.metadata as { startsAt: string }).startsAt)).toEqual([
      t1.toISOString(),
      t2.toISOString(),
    ]);
    expect((await ledger(id)).map((r) => [r.outcome, r.suppression_reason])).toEqual([
      ["sent", null],
      ["suppressed", "already_sent"],
      ["sent", null],
      ["suppressed", "already_sent"],
      ["suppressed", "already_sent"],
    ]);
  });

  it("the SMS fallback follows the same rule: a moved start earns one new SMS", async () => {
    const id = await request({ patientId: patient.noEmail, locationId: loc.cb });
    await dispatchConfirmation(tenantId, id, ACCEPTED);
    await dispatchConfirmation(tenantId, id, ACCEPTED);
    expect(h.sms).toHaveLength(1);
    await moveTo(id, lisbonDateTimeToUtc(addDays(day, 6), "17:00"));
    expect(await dispatchConfirmation(tenantId, id, ACCEPTED)).toMatchObject({ dispatched: true });
    expect(h.sms).toHaveLength(2);
    expect(h.sms[1]!.body).toContain("as 17:00");
  });

  it("today's confirmation writes no hand-over record", async () => {
    const id = await request({ patientId: patient.withEmail, locationId: loc.cb });
    await dispatchConfirmation(tenantId, id);
    expect(await handOvers(id)).toEqual([]);
  });

  it("a patient with NO email gets the SMS fallback with the location's phone, and no email", async () => {
    const id = await request({ patientId: patient.noEmail, locationId: loc.cb });
    expect(await dispatchConfirmation(tenantId, id, ACCEPTED)).toMatchObject({ dispatched: true });
    expect(h.email).toEqual([]);
    expect(h.sms).toHaveLength(1);
    expect(h.sms[0]!.templateId).toBe("booking_approved.sms");
    expect(h.sms[0]!.body).toContain(`em ${CB.name}. Duvidas: ${CB.phone}.`);
    expect(h.sms[0]!.body).not.toContain("Remarcar");
    expect(h.sms[0]!.body).not.toContain(TENANT_PHONE);
    expect(await ledger(id)).toEqual([
      { channel: "sms", template_id: "booking_approved.sms", outcome: "sent", suppression_reason: null },
    ]);
  });

  it("a patient with neither an email nor a phone gets nothing, and the ledger says no_contact", async () => {
    const id = await request({ patientId: patient.noContact, locationId: loc.cb });
    expect(await dispatchConfirmation(tenantId, id, ACCEPTED)).toEqual({
      dispatched: false,
      reason: "no_contact",
    });
    expect([...h.email, ...h.sms]).toEqual([]);
    expect(await ledger(id)).toEqual([
      {
        channel: "email",
        template_id: "booking_approved.email",
        outcome: "suppressed",
        suppression_reason: "no_contact",
      },
    ]);
  });

  it("a REJECTED request sends nothing, and the ledger says status", async () => {
    const id = await request({ patientId: patient.withEmail, locationId: loc.lv, status: "cancelled" });
    expect(await dispatchConfirmation(tenantId, id, ACCEPTED)).toEqual({
      dispatched: false,
      reason: "status",
    });
    expect([...h.email, ...h.sms]).toEqual([]);
    expect(await ledger(id)).toEqual([
      {
        channel: "email",
        template_id: "booking_approved.email",
        outcome: "suppressed",
        suppression_reason: "status",
      },
    ]);
  });

  it.each([
    ["an email on file", () => patient.withEmail, "email", "booking_approved.email"],
    ["no email, a mobile on file", () => patient.noEmail, "sms", "booking_approved.sms"],
  ] as const)(
    "a location with NO ADDRESS (%s): nothing on either channel, nothing from the tenant, and a row says why",
    async (_label, who, channel, templateId) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const id = await request({ patientId: who(), locationId: loc.bare });
      expect(await dispatchConfirmation(tenantId, id, ACCEPTED)).toEqual({
        dispatched: false,
        reason: "location_contact_missing",
      });
      expect([...h.email, ...h.sms]).toEqual([]);
      expect(await ledger(id)).toEqual([
        {
          channel,
          template_id: templateId,
          outcome: "suppressed",
          suppression_reason: "location_contact_missing",
        },
      ]);
    },
  );

  it("a SUPPRESSED attempt is not a hand-over: once the location has an address, approving again sends", async () => {
    // Found by the mutation sweep: a ledger read that counted ANY suppression
    // as a hand-over left every test green. This is the arm that refuses it,
    // against the real predicate.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fixable = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name, phone)
      values (${fixable}, ${tenantId}, 'Clinica Por Completar', '+351 210 444 444')`);
    const id = await request({ patientId: patient.withEmail, locationId: fixable });

    expect(await dispatchConfirmation(tenantId, id, ACCEPTED)).toMatchObject({
      dispatched: false,
      reason: "location_contact_missing",
    });
    await sql.execute(raw`update locations set address = 'Travessa Inventada 3, 1000-000 Lisboa'
      where id = ${fixable}`);
    expect(await dispatchConfirmation(tenantId, id, ACCEPTED)).toMatchObject({ dispatched: true });

    expect(h.email).toHaveLength(1);
    expect(h.email[0]!.body).toContain("Local: Clinica Por Completar, Travessa Inventada 3, 1000-000 Lisboa");
    expect((await ledger(id)).map((r) => [r.outcome, r.suppression_reason])).toEqual([
      ["suppressed", "location_contact_missing"],
      ["sent", null],
    ]);
  });

  it("an appointment with no service: the LEFT join still reads it, and the email is refused as service_missing", async () => {
    const id = await request({ patientId: patient.withEmail, locationId: loc.lv, withService: false });
    expect(await dispatchConfirmation(tenantId, id, ACCEPTED)).toEqual({
      dispatched: false,
      reason: "service_missing",
    });
    expect(h.email).toEqual([]);
    expect((await ledger(id))[0]).toMatchObject({ suppression_reason: "service_missing" });
  });

  it("live send OFF, through the real gate: the row says live_send_disabled, and it still counts as the one message", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    h.realGate = true;
    const id = await request({ patientId: patient.withEmail, locationId: loc.lv });
    expect(await dispatchConfirmation(tenantId, id, ACCEPTED)).toMatchObject({
      dispatched: true,
      channels: [{ channel: "email", sandbox: true }],
    });
    expect(await dispatchConfirmation(tenantId, id, ACCEPTED)).toEqual({
      dispatched: false,
      reason: "already_sent",
    });
    expect(await ledger(id)).toEqual([
      {
        channel: "email",
        template_id: "booking_approved.email",
        outcome: "suppressed",
        suppression_reason: "live_send_disabled",
      },
      {
        channel: "email",
        template_id: "booking_approved.email",
        outcome: "suppressed",
        suppression_reason: "already_sent",
      },
    ]);
  });

  /* ---------------- today's confirmation, now on the ledger ---------------- */

  it("switch OFF: an acceptance sends today's two messages, and each now leaves a row", async () => {
    process.env.BOOK_CONFIRM_MODE = "off";
    const id = await request({ patientId: patient.withEmail, locationId: loc.lv });
    expect(await dispatchConfirmation(tenantId, id, ACCEPTED)).toMatchObject({ dispatched: true });
    expect(h.email.map((m) => m.templateId)).toEqual(["confirmation.email"]);
    expect(h.sms.map((m) => m.templateId)).toEqual(["confirmation.sms"]);
    expect(h.email[0]!.body).toContain("A sua marcação está confirmada:");
    expect(await ledger(id)).toEqual([
      { channel: "email", template_id: "confirmation.email", outcome: "sent", suppression_reason: null },
      { channel: "sms", template_id: "confirmation.sms", outcome: "sent", suppression_reason: null },
    ]);
  });

  it("switch ON: a RESCHEDULE (no marker) still sends today's two messages", async () => {
    const id = await request({ patientId: patient.withEmail, locationId: loc.cb });
    expect(await dispatchConfirmation(tenantId, id)).toMatchObject({ dispatched: true });
    expect(h.email.map((m) => m.templateId)).toEqual(["confirmation.email"]);
    expect(h.sms.map((m) => m.templateId)).toEqual(["confirmation.sms"]);
  });

  it.each([
    ["origin", { origin: "staff" }],
    ["unconfirmed", { status: "scheduled" }],
    ["status", { status: "cancelled" }],
  ] as const)("today's gate %s: nothing is sent and one row says why", async (reason, over) => {
    const id = await request({ patientId: patient.withEmail, locationId: loc.lv, ...over });
    expect(await dispatchConfirmation(tenantId, id)).toEqual({ dispatched: false, reason });
    expect([...h.email, ...h.sms]).toEqual([]);
    expect(await ledger(id)).toEqual([
      { channel: "email", template_id: "confirmation.email", outcome: "suppressed", suppression_reason: reason },
    ]);
  });

  it("an appointment that does not exist: not_found, and NO row (0075's foreign key refuses one)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const missing = randomUUID();
    expect(await dispatchConfirmation(tenantId, missing)).toEqual({ dispatched: false, reason: "not_found" });
    expect(await ledger(missing)).toEqual([]);
    // The failed write is logged, ids only, and never thrown into the run.
    expect(spy.mock.calls.flat().join(" ")).toContain("dispatch ledger write FAILED");
  });
});
