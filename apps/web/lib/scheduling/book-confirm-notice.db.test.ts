/**
 * book-confirm-notice.db.test.ts - BOOK-CONFIRM, the approver's notice on the
 * two doors reception uses most, against a REAL Postgres.
 *
 *   the Pedidos queue      confirmAppointmentRequest
 *   the Estado selector    updateAppointment(status: "confirmed")
 *
 * (The SMS review queue's arms are in lib/reminders/inbound-store.db.test.ts and
 * the guest booking's in ./guest-link.db.test.ts. The patient's own SMS reply
 * has no approver to tell.)
 *
 * THE RULE (lead's decision, 2026-10-04): the approver is told whenever the new
 * behaviour applies to this patient and NO message can go, for a reason
 * knowable at approval time. Every such reason is an arm here, on each door,
 * and beside each is what the DISPATCH then does for the same appointment,
 * because the notice and the send asking one set of predicates is the
 * property: before this change they did not, and a patient with SMS switched
 * off, or at a location with no address, got nothing while nobody was told.
 *
 * Why a database: the notice is a read under the ACTOR's own scope across five
 * tables (appointment, patient, location, tenant, and the service by a LEFT
 * join), and the tenant's SMS switch is a jsonb column read through 0094's
 * policy. A unit test hands the helper the rows; only here are they read.
 *
 * Replaced: the request context, the client IP, `inngest.send` and the two
 * send functions. Fixtures are pinned to January 2027 at a clinic hour. Names
 * are invented.
 *
 * Skipped without DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn(), revalidateTag: vi.fn() }));

type Sent = { templateId: string; to: string; body: string };
const h = vi.hoisted(() => ({
  requireRequestContext: vi.fn(),
  events: [] as { name: string; data: Record<string, unknown> }[],
  sent: [] as Sent[],
}));

vi.mock("@/lib/auth/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/context")>();
  return { ...actual, requireRequestContext: h.requireRequestContext };
});
vi.mock("./actor", () => ({ clientIp: vi.fn(async () => null) }));
vi.mock("@/lib/reminders/inngest/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/reminders/inngest/client")>(
    "@/lib/reminders/inngest/client",
  );
  return {
    ...actual,
    inngest: {
      ...actual.inngest,
      send: vi.fn(async (e: { name: string; data: Record<string, unknown> }) => {
        h.events.push(e);
      }),
      createFunction: actual.inngest.createFunction.bind(actual.inngest),
    },
  };
});
vi.mock("@/lib/reminders/clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reminders/clients")>();
  return {
    ...actual,
    sendEmail: vi.fn(async (m: Parameters<typeof actual.sendEmail>[0]) => {
      h.sent.push({ templateId: m.templateId, to: m.to, body: m.body });
      return { channel: "email" as const, sandbox: false, id: `notice-test-email-${randomUUID()}` };
    }),
    sendSms: vi.fn(async (m: Parameters<typeof actual.sendSms>[0]) => {
      h.sent.push({ templateId: m.templateId, to: m.to, body: m.body });
      return { channel: "sms" as const, sandbox: false, id: `notice-test-sms-${randomUUID()}` };
    }),
  };
});

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("BOOK-CONFIRM: the approver is told whenever no message can go", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let actions: typeof import("./actions");
  let dispatchConfirmation: typeof import("@/lib/reminders/dispatch").dispatchConfirmation;

  let tenantId: string;
  let receptionId: string;
  let therapistId: string;
  let serviceId: string;
  const loc = { full: "", noAddress: "", noPhone: "" };

  let slot = 0;
  /** One hour each from 08:00, twelve to a day, on consecutive January days. */
  const nextStart = () => {
    const i = slot++;
    return new Date(Date.UTC(2027, 0, 11 + Math.floor(i / 12), 8 + (i % 12), 0, 0));
  };

  type Row = Record<string, unknown>;
  async function rows(q: Parameters<typeof sql.execute>[0]): Promise<Row[]> {
    const r = (await sql.execute(q)) as unknown;
    return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Row[];
  }

  type PatientShape = {
    email?: string | null;
    phone?: string | null;
    smsEnabled?: boolean;
  };

  /**
   * An unaccepted online request for a patient of the given shape, at the given
   * location. `service: false` leaves `appointments.service_id` null.
   */
  async function pedido(p: PatientShape, locationId = loc.full, service = true) {
    const patientId = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, email, phone, reminder_sms_enabled)
      values (${patientId}, ${tenantId}, 'Paciente Inventado', ${p.email ?? null}, ${p.phone ?? null},
              ${p.smsEnabled ?? true})`);
    const id = randomUUID();
    const startsAt = nextStart();
    await sql.execute(raw`insert into appointments
        (id, tenant_id, patient_id, practitioner_id, location_id, service_id, starts_at, ends_at, status, origin)
      values (${id}, ${tenantId}, ${patientId}, ${therapistId}, ${locationId}, ${service ? serviceId : null},
              ${startsAt.toISOString()}::timestamptz,
              ${new Date(startsAt.getTime() + 45 * 60_000).toISOString()}::timestamptz,
              'scheduled', 'patient_portal')`);
    // The request notification the Pedidos queue's action requires.
    await sql.execute(raw`insert into staff_notifications
        (tenant_id, recipient_user_id, kind, appointment_id, patient_id,
         previous_starts_at, new_starts_at, occurred_at)
      values (${tenantId}, ${receptionId}, 'appointment_request', ${id}, ${patientId},
              ${startsAt.toISOString()}::timestamptz, ${startsAt.toISOString()}::timestamptz, now())`);
    return id;
  }

  const DOORS = [
    ["the Pedidos queue", (id: string) => actions.confirmAppointmentRequest(id)],
    ["the Estado selector", (id: string) => actions.updateAppointment(id, { status: "confirmed" })],
  ] as const;

  /** Deliver the captured acceptance event to the real dispatch. */
  async function deliver() {
    const outcomes = [];
    for (const e of h.events) {
      if (e.name !== "appointment/scheduled" || e.data.confirmationEligible !== true) continue;
      outcomes.push(
        await dispatchConfirmation(String(e.data.tenantId), String(e.data.appointmentId), {
          acceptedPedido: e.data.acceptedPedido === true,
          acceptedGuestRequest: e.data.acceptedGuestRequest === true,
        }),
      );
    }
    return outcomes;
  }

  const tenantSettings = (smsEnabled: boolean) =>
    sql.execute(raw`update tenants set settings = ${JSON.stringify({
      locale: "pt",
      reminders: { emailEnabled: true, smsEnabled, leadTimeHours: [48, 24] },
    })}::jsonb where id = ${tenantId}`);

  const saved: Record<string, string | undefined> = {};
  const ENV_KEYS = ["BOOK_CONFIRM_MODE", "BOOK_CONFIRM_CANARY_PATIENT_IDS", "REMINDERS_LIVE_SEND"] as const;

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();
    actions = await import("./actions");
    ({ dispatchConfirmation } = await import("@/lib/reminders/dispatch"));

    tenantId = randomUUID();
    await sql.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'Notice Co', ${"bcn-" + tenantId.slice(0, 8)})`);
    receptionId = randomUUID();
    therapistId = randomUUID();
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active)
      values (${receptionId}, ${tenantId}, ${"r-" + receptionId.slice(0, 8) + "@t.test"}, 'Rececao Ficticia', true)`);
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
      values (${therapistId}, ${tenantId}, ${"t-" + therapistId.slice(0, 8) + "@t.test"}, 'Dr. Teste Ficticio', true, true)`);
    loc.full = randomUUID();
    loc.noAddress = randomUUID();
    loc.noPhone = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name, address, phone)
      values (${loc.full}, ${tenantId}, 'OsteoJP (CB)', 'Rua de Exemplo 1', '+351 272 111 111')`);
    await sql.execute(raw`insert into locations (id, tenant_id, name, phone)
      values (${loc.noAddress}, ${tenantId}, 'OsteoJP (MN)', '+351 266 333 333')`);
    await sql.execute(raw`insert into locations (id, tenant_id, name, address)
      values (${loc.noPhone}, ${tenantId}, 'OsteoJP (LV)', 'Avenida Inventada 10')`);
    serviceId = randomUUID();
    await sql.execute(raw`insert into services (id, tenant_id, name) values (${serviceId}, ${tenantId}, 'Osteopatia')`);

    h.requireRequestContext.mockResolvedValue({ tenantId, role: "reception", userId: receptionId });
  });

  beforeEach(async () => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    h.events.length = 0;
    h.sent.length = 0;
    process.env.BOOK_CONFIRM_MODE = "on";
    delete process.env.BOOK_CONFIRM_CANARY_PATIENT_IDS;
    delete process.env.REMINDERS_LIVE_SEND;
    await tenantSettings(true);
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.execute(raw`delete from reminder_dispatches where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from staff_notifications where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from services where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from users where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  describe.each(DOORS)("%s", (_door, accept) => {
    /** Accept, and return the notice the approver was given (undefined for none). */
    async function noticeFor(id: string) {
      const r = await accept(id);
      if (!r.ok) throw new Error(`acceptance refused: ${r.error}`);
      return r.data.notice;
    }

    /* ---------------- a message CAN go: no notice ---------------- */

    it("an email on file: no notice, and the email goes", async () => {
      const id = await pedido({ email: "a@example.test", phone: "912000001" });
      expect(await noticeFor(id)).toBeUndefined();
      await deliver();
      expect(h.sent.map((m) => m.templateId)).toEqual(["booking_approved.email"]);
    });

    it("no email, a mobile: no notice, and the SMS goes", async () => {
      const id = await pedido({ phone: "912000002" });
      expect(await noticeFor(id)).toBeUndefined();
      await deliver();
      expect(h.sent.map((m) => m.templateId)).toEqual(["booking_approved.sms"]);
    });

    it("an email on file and SMS switched off everywhere: no notice, the email is transactional", async () => {
      await tenantSettings(false);
      const id = await pedido({ email: "a@example.test", phone: "912000003", smsEnabled: false });
      expect(await noticeFor(id)).toBeUndefined();
      await deliver();
      expect(h.sent.map((m) => m.templateId)).toEqual(["booking_approved.email"]);
    });

    /* ------- (a) no email AND the SMS leg cannot send: the first sentence ------- */

    it.each([
      ["neither an email nor a phone", { phone: null }, "no_contact"],
      ["a LANDLINE", { phone: "272000123" }, "landline"],
      ["a number that does not normalise", { phone: "12" }, "invalid_phone"],
      ["a mobile, but the PATIENT has SMS switched off", { phone: "912000004", smsEnabled: false }, "channels_off"],
    ] as const)("no email, %s: the notice, and the dispatch sends nothing (%s)", async (_l, shape, reason) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const id = await pedido(shape);
      expect(await noticeFor(id)).toBe("patient_no_email");
      await deliver();
      expect(h.sent).toEqual([]);
      const ledger = await rows(raw`select suppression_reason from reminder_dispatches where appointment_id = ${id}`);
      expect(ledger.map((r) => r.suppression_reason)).toEqual([reason]);
    });

    it("no email, a mobile, but the CLINIC has SMS switched off: the notice, and the dispatch sends nothing", async () => {
      await tenantSettings(false);
      const id = await pedido({ phone: "912000005" });
      expect(await noticeFor(id)).toBe("patient_no_email");
      await deliver();
      expect(h.sent).toEqual([]);
      const ledger = await rows(raw`select suppression_reason from reminder_dispatches where appointment_id = ${id}`);
      expect(ledger.map((r) => r.suppression_reason)).toEqual(["channels_off"]);
    });

    /* ------- (b) the location has no address or no phone: the second sentence ------- */

    it.each([
      ["no address", () => loc.noAddress],
      ["no phone", () => loc.noPhone],
    ] as const)(
      "an email on file, the location has %s: the SECOND notice, and nothing goes on either channel",
      async (_l, where) => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const id = await pedido({ email: "a@example.test", phone: "912000006" }, where());
        expect(await noticeFor(id)).toBe("location_contact_missing");
        await deliver();
        expect(h.sent).toEqual([]);
        const ledger = await rows(raw`select suppression_reason from reminder_dispatches where appointment_id = ${id}`);
        expect(ledger.map((r) => r.suppression_reason)).toEqual(["location_contact_missing"]);
      },
    );

    it("no email, a mobile, the location has no address: the SECOND notice", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const id = await pedido({ phone: "912000007" }, loc.noAddress);
      expect(await noticeFor(id)).toBe("location_contact_missing");
    });

    it("nobody to reach AND no location contact: the patient's notice, the order the dispatch checks in", async () => {
      const id = await pedido({ phone: null }, loc.noAddress);
      expect(await noticeFor(id)).toBe("patient_no_email");
      await deliver();
      const ledger = await rows(raw`select suppression_reason from reminder_dispatches where appointment_id = ${id}`);
      expect(ledger.map((r) => r.suppression_reason)).toEqual(["no_contact"]);
    });

    /* ------- (c) the email is the channel and there is no service: the third sentence ------- */

    it("an email on file, the appointment has NO SERVICE: the THIRD notice, and the dispatch sends nothing", async () => {
      const id = await pedido({ email: "a@example.test", phone: "912000009" }, loc.full, false);
      expect(await noticeFor(id)).toBe("service_missing");
      await deliver();
      expect(h.sent).toEqual([]);
      const ledger = await rows(raw`select suppression_reason from reminder_dispatches where appointment_id = ${id}`);
      expect(ledger.map((r) => r.suppression_reason)).toEqual(["service_missing"]);
    });

    it("no email, a mobile, no service: NO notice, because the SMS names no service and goes", async () => {
      const id = await pedido({ phone: "912000010" }, loc.full, false);
      expect(await noticeFor(id)).toBeUndefined();
      await deliver();
      expect(h.sent.map((m) => m.templateId)).toEqual(["booking_approved.sms"]);
    });

    it("no location address AND no service: the SECOND notice, the order the dispatch checks in", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const id = await pedido({ email: "a@example.test", phone: "912000011" }, loc.noAddress, false);
      expect(await noticeFor(id)).toBe("location_contact_missing");
      await deliver();
      expect(h.sent).toEqual([]);
      const ledger = await rows(raw`select suppression_reason from reminder_dispatches where appointment_id = ${id}`);
      expect(ledger.map((r) => r.suppression_reason)).toEqual(["location_contact_missing"]);
    });

    it("nobody to reach AND no service: the patient's notice", async () => {
      const id = await pedido({ phone: null }, loc.full, false);
      expect(await noticeFor(id)).toBe("patient_no_email");
      await deliver();
      const ledger = await rows(raw`select suppression_reason from reminder_dispatches where appointment_id = ${id}`);
      expect(ledger.map((r) => r.suppression_reason)).toEqual(["no_contact"]);
    });

    /* ---------------- the switch in front of all of it ---------------- */

    it("switch OFF: no notice for any of them", async () => {
      process.env.BOOK_CONFIRM_MODE = "off";
      expect(await noticeFor(await pedido({ phone: null }))).toBeUndefined();
      expect(await noticeFor(await pedido({ email: "a@example.test" }, loc.noAddress))).toBeUndefined();
      expect(await noticeFor(await pedido({ email: "a@example.test" }, loc.full, false))).toBeUndefined();
    });

    it("CANARY, a patient NOT on the list: no notice for any reason", async () => {
      vi.spyOn(console, "info").mockImplementation(() => {});
      process.env.BOOK_CONFIRM_MODE = "canary";
      process.env.BOOK_CONFIRM_CANARY_PATIENT_IDS = randomUUID();
      expect(await noticeFor(await pedido({ phone: null }))).toBeUndefined();
      expect(await noticeFor(await pedido({ email: "a@example.test" }, loc.noPhone))).toBeUndefined();
      expect(await noticeFor(await pedido({ email: "a@example.test" }, loc.full, false))).toBeUndefined();
    });

    /* ---------------- send-time only: no notice, by decision ---------------- */

    it("a location NAME the SMS cannot carry is a send-time refusal: NO notice, and a body_refused row", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const accented = randomUUID();
      await sql.execute(raw`insert into locations (id, tenant_id, name, address, phone)
        values (${accented}, ${tenantId}, 'Clínica do Coração', 'Rua de Exemplo 3', '+351 272 444 444')`);
      const id = await pedido({ phone: "912000008" }, accented);
      expect(await noticeFor(id)).toBeUndefined();
      expect(await deliver()).toEqual([expect.objectContaining({ dispatched: false, reason: "body_refused" })]);
      expect(h.sent).toEqual([]);
      const ledger = await rows(raw`select suppression_reason from reminder_dispatches where appointment_id = ${id}`);
      expect(ledger.map((r) => r.suppression_reason)).toEqual(["body_refused"]);
    });
  });

  /* ------------- an actor who cannot read the patient learns nothing ------------- */

  it("the read runs under the ACTOR's scope: another tenant's actor gets no notice about this appointment", async () => {
    const id = await pedido({ phone: null });
    const { approvalNoticeAfterAccept } = await import("./book-confirm-notice");
    // The tenant's own reception is told.
    expect(
      await approvalNoticeAfterAccept({ tenantId, role: "reception", userId: receptionId }, [id]),
    ).toBe("patient_no_email");
    // An actor of another tenant reads no row, so learns nothing: not "no email".
    const foreign = randomUUID();
    expect(
      await approvalNoticeAfterAccept({ tenantId: foreign, role: "admin", userId: randomUUID() }, [id]),
    ).toBeNull();
  });
});
