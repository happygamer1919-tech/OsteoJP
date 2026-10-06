/**
 * guest-link.db.test.ts - BOOK-CONFIRM, the public-form path, against a REAL
 * Postgres. Strategy dispatch S-1004-A, R40 (owner, 2026-10-04): "public-form
 * requests get linked to the appointment reception books for them, and that
 * link is the approval trigger."
 *
 * GATE G1, the whole chain, each link the real code:
 *
 *   convertGuestRequest      reception resolves the person
 *   createAppointment        reception books; the request id rides the input
 *     -> linkGuestRequestTx  the link column is written, status -> confirmed
 *     -> inngest.send        captured here, the ONE call that leaves the process
 *   dispatchConfirmation     fed the captured event; reads the link row, then
 *                            sends through the two captured send functions
 *
 * and what G1 asks of it: the link column written; EXACTLY ONE send record; an
 * email when the patient has an address; the SMS when not; the approver's
 * notice when neither exists.
 *
 * GATE G3: with the switch off a guest booking sends nothing at all.
 * THE CANARY: a listed patient gets the new behaviour, a non-listed one nothing.
 *
 * runScoped, RLS, the grants on guest_booking_requests, the conflict check and
 * the permission matrix are real. Replaced: the request context, the client IP,
 * `inngest.send` and the two send functions.
 *
 * Fixtures are pinned to Wednesdays in March 2027 at a clinic hour (before the
 * DST change, so UTC is the Lisbon wall clock). Every name is invented.
 *
 * Skipped without DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { bookingDeepLink } from "./guest-convert-handoff";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn(), revalidateTag: vi.fn() }));

type Sent = { templateId: string; to: string; subject?: string; body: string };
const h = vi.hoisted(() => ({
  requireRequestContext: vi.fn(),
  events: [] as { name: string; data: Record<string, unknown> }[],
  email: [] as Sent[],
  sms: [] as Sent[],
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
      h.email.push({ templateId: m.templateId, to: m.to, subject: m.subject, body: m.body });
      return { channel: "email" as const, sandbox: false, id: `guest-test-email-${randomUUID()}` };
    }),
    sendSms: vi.fn(async (m: Parameters<typeof actual.sendSms>[0]) => {
      h.sms.push({ templateId: m.templateId, to: m.to, body: m.body });
      return { channel: "sms" as const, sandbox: false, id: `guest-test-sms-${randomUUID()}` };
    }),
  };
});

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

const CLINIC = { name: "OsteoJP (CB)", address: "Rua de Exemplo 1, 6000-000 Castelo Branco", phone: "+351 272 111 111" };
const TENANT_PHONE = "+351 210 999 999";

d("BOOK-CONFIRM: a public-form request is linked to the appointment booked for it", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let actions: typeof import("./actions");
  let convert: typeof import("./guest-convert").convertGuestRequest;
  let dismiss: typeof import("./guest-convert").dismissGuestRequest;
  let listQueue: typeof import("./guest-requests").listPendingGuestRequests;
  let dispatchConfirmation: typeof import("@/lib/reminders/dispatch").dispatchConfirmation;

  let tenantId: string;
  let otherTenantId: string;
  let receptionId: string;
  let therapistId: string;
  let loc: string;
  let locOutOfScope: string;
  let locNoAddress: string;
  let locNoPhone: string;
  let serviceId: string;

  const at = (day: number, hour: number) => new Date(Date.UTC(2027, 2, day, hour, 0, 0)); // March 2027
  const WED = 10;
  /** Every booking gets its own hour, so nothing here collides with anything. */
  let hour = 8;
  let week = 0;
  const nextSlot = () => {
    if (hour > 18) {
      hour = 8;
      week += 1;
    }
    return at(WED + 7 * week, hour++);
  };

  type Row = Record<string, unknown>;
  async function rows(q: Parameters<typeof sql.execute>[0]): Promise<Row[]> {
    const r = (await sql.execute(q)) as unknown;
    return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Row[];
  }

  const ctx = () => ({ tenantId, role: "reception" as const, userId: receptionId });

  /** A request as the public form writes it: a name and a mobile, nothing else. */
  async function guestRequest(
    over: { locationId?: string; tenant?: string; phone?: string; email?: string | null } = {},
  ) {
    const id = randomUUID();
    // A distinct mobile per request, so no request "possibly matches" another's patient.
    const phone = over.phone ?? `91${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
    // `email` is 0101's column: NULL unless the visitor gave one on the public form (R40).
    await sql.execute(raw`insert into guest_booking_requests
        (id, tenant_id, full_name, phone, service_id, location_id,
         requested_starts_at, requested_ends_at, email)
      values (${id}, ${over.tenant ?? tenantId}, 'Convidada Inventada', ${phone},
              ${serviceId}, ${over.locationId ?? loc},
              '2027-03-10T08:00:00Z'::timestamptz, '2027-03-10T12:00:00Z'::timestamptz, ${over.email ?? null})`);
    return id;
  }

  const requestRow = async (id: string) =>
    (
      await rows(raw`select status, converted_patient_id, converted_appointment_id, handled_at, handled_by
        from guest_booking_requests where id = ${id}`)
    )[0]!;

  /** Reception converts the request into a NEW patient, through the real action. */
  async function converted(over: Parameters<typeof guestRequest>[0] = {}) {
    const requestId = await guestRequest(over);
    const r = await convert(requestId, { kind: "new_patient" });
    if (!r.ok) throw new Error(`convert refused: ${r.error}`);
    return { requestId, patientId: r.data.patientId, prefill: r.data.prefill };
  }

  /** Reception books from the drawer, through the real action. */
  async function book(args: {
    patientId: string;
    guestRequestId?: string | null;
    start?: Date;
    recurrence?: { freq: "weekly"; count: number } | null;
    locationId?: string;
    /** `false` books with no service, as the drawer does when none is chosen. */
    service?: boolean;
  }) {
    const start = args.start ?? nextSlot();
    const result = await actions.createAppointment({
      patientId: args.patientId,
      practitionerId: therapistId,
      locationId: args.locationId ?? loc,
      serviceId: args.service === false ? null : serviceId,
      room: null,
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 45 * 60_000).toISOString(),
      notes: null,
      allowConflict: true,
      recurrence: args.recurrence ?? null,
      guestRequestId: args.guestRequestId,
    });
    if (!result.ok) throw new Error(`booking refused: ${result.error}`);
    return { ...result.data, start };
  }

  /** Deliver every captured confirmation-eligible event to the real dispatch, as Inngest would. */
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

  /** The audit rows the link wrote for one request. */
  const linkAudits = (requestId: string) =>
    rows(raw`select action, entity_type, entity_id, actor_user_id, metadata
      from audit_log where tenant_id = ${tenantId} and action = 'patient.guest_request_booked'
        and metadata->>'guestRequestId' = ${requestId}`);

  const ledger = (appointmentId: string) =>
    rows(raw`select channel, template_id, outcome, suppression_reason
      from reminder_dispatches where appointment_id = ${appointmentId} order by created_at, id`);
  const allSent = () => [...h.email, ...h.sms];

  const saved: Record<string, string | undefined> = {};
  const ENV_KEYS = ["BOOK_CONFIRM_MODE", "BOOK_CONFIRM_CANARY_PATIENT_IDS", "REMINDERS_LIVE_SEND"] as const;

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();
    actions = await import("./actions");
    ({ convertGuestRequest: convert, dismissGuestRequest: dismiss } = await import("./guest-convert"));
    ({ listPendingGuestRequests: listQueue } = await import("./guest-requests"));
    ({ dispatchConfirmation } = await import("@/lib/reminders/dispatch"));

    tenantId = randomUUID();
    otherTenantId = randomUUID();
    await sql.execute(raw`insert into tenants (id, name, slug, settings)
      values (${tenantId}, 'Guest Link Co', ${"gl-" + tenantId.slice(0, 8)},
              ${JSON.stringify({ locale: "pt", contacts: { phone: TENANT_PHONE } })}::jsonb)`);
    await sql.execute(raw`insert into tenants (id, name, slug)
      values (${otherTenantId}, 'Outra Co', ${"gl-" + otherTenantId.slice(0, 8)})`);

    receptionId = randomUUID();
    therapistId = randomUUID();
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active)
      values (${receptionId}, ${tenantId}, ${"r-" + receptionId.slice(0, 8) + "@t.test"}, 'Rececao Ficticia', true)`);
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
      values (${therapistId}, ${tenantId}, ${"t-" + therapistId.slice(0, 8) + "@t.test"}, 'Dr. Teste Ficticio', true, true)`);

    loc = randomUUID();
    locOutOfScope = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name, address, phone)
      values (${loc}, ${tenantId}, ${CLINIC.name}, ${CLINIC.address}, ${CLINIC.phone})`);
    await sql.execute(raw`insert into locations (id, tenant_id, name, address, phone)
      values (${locOutOfScope}, ${tenantId}, 'OsteoJP (LV)', 'Avenida Inventada 10', '+351 210 222 222')`);
    // Two more clinics reception CAN book at, each missing one of the two
    // things the message prints.
    locNoAddress = randomUUID();
    locNoPhone = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name, phone)
      values (${locNoAddress}, ${tenantId}, 'OsteoJP (MN)', '+351 266 333 333')`);
    await sql.execute(raw`insert into locations (id, tenant_id, name, address)
      values (${locNoPhone}, ${tenantId}, 'Montemor-o-Novo', 'Largo Inventado 2')`);
    // Reception is assigned to THREE clinics, so `locOutOfScope` is outside its scope.
    for (const u of [receptionId, therapistId]) {
      for (const l of [loc, locNoAddress, locNoPhone]) {
        await sql.execute(raw`insert into staff_locations (tenant_id, user_id, location_id)
          values (${tenantId}, ${u}, ${l})`);
      }
    }
    // Agendar lote books only inside declared hours: Wednesdays, all day.
    await sql.execute(raw`insert into availability_templates (tenant_id, user_id, location_id, weekday, start_time, end_time)
      values (${tenantId}, ${therapistId}, ${loc}, 3, '08:00', '20:00')`);

    serviceId = randomUUID();
    await sql.execute(raw`insert into services (id, tenant_id, name) values (${serviceId}, ${tenantId}, 'Osteopatia')`);

    h.requireRequestContext.mockResolvedValue(ctx());
  });

  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    h.events.length = 0;
    h.email.length = 0;
    h.sms.length = 0;
    process.env.BOOK_CONFIRM_MODE = "on";
    delete process.env.BOOK_CONFIRM_CANARY_PATIENT_IDS;
    delete process.env.REMINDERS_LIVE_SEND;
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.restoreAllMocks();
    h.requireRequestContext.mockResolvedValue(ctx());
  });

  afterAll(async () => {
    if (!sql) return;
    // Both tenants' requests first: the "another tenant's request" arm points a
    // foreign request at THIS tenant's service and clinic.
    for (const t of [tenantId, otherTenantId]) {
      await sql.execute(raw`delete from guest_booking_requests where tenant_id = ${t}`);
    }
    for (const t of [tenantId, otherTenantId]) {
      await sql.execute(raw`delete from reminder_dispatches where tenant_id = ${t}`);
      await sql.execute(raw`delete from staff_notifications where tenant_id = ${t}`);
      await sql.execute(raw`delete from audit_log where tenant_id = ${t}`);
      await sql.execute(raw`delete from appointment_notes where tenant_id = ${t}`);
      await sql.execute(raw`delete from appointments where tenant_id = ${t}`);
      await sql.execute(raw`delete from patient_care_team where tenant_id = ${t}`).catch(() => {});
      // The convert creates the patient through insertPatientTx, which also
      // writes the patient's clinic row.
      await sql.execute(raw`delete from patient_locations where tenant_id = ${t}`);
      await sql.execute(raw`delete from patients where tenant_id = ${t}`);
      await sql.execute(raw`delete from services where tenant_id = ${t}`);
      await sql.execute(raw`delete from availability_templates where tenant_id = ${t}`);
      await sql.execute(raw`delete from staff_locations where tenant_id = ${t}`);
      await sql.execute(raw`delete from locations where tenant_id = ${t}`);
      await sql.execute(raw`delete from users where tenant_id = ${t}`);
      await sql.execute(raw`delete from tenants where id = ${t}`);
    }
  });

  it("a request nobody has converted yet has no booking link in the queue: there is nobody to book for", async () => {
    const requestId = await guestRequest();
    const queued = (await listQueue(ctx())).find((r) => r.id === requestId);
    expect(queued).toMatchObject({ converted: false, bookingLink: null });
  });

  /* ============================== GATE G1 ============================== */

  it("G1, the usual guest (a mobile, no email): the link is written, the request leaves the queue, and EXACTLY ONE SMS goes", async () => {
    const { requestId, patientId, prefill } = await converted();
    // Before the booking the converted request is still in the queue, and its
    // row carries the SAME deep link the convert redirected to: booked later
    // from "Marcar consulta", it is linked exactly as if booked at once.
    const queued = (await listQueue(ctx())).find((r) => r.id === requestId);
    expect(queued).toBeDefined();
    expect(queued?.bookingLink).toBe(bookingDeepLink(patientId, prefill, requestId));
    expect(queued?.bookingLink).toContain(`pedidoConvidado=${requestId}`);

    const booked = await book({ patientId, guestRequestId: requestId });

    // THE LINK COLUMN, and the status 0063 reserved for "became a booking".
    expect(await requestRow(requestId)).toMatchObject({
      status: "confirmed",
      converted_patient_id: patientId,
      converted_appointment_id: booked.id,
    });
    expect((await listQueue(ctx())).map((r) => r.id)).not.toContain(requestId);
    // A mobile is on file, so nobody needs ringing.
    expect(booked.notice).toBeUndefined();

    // WHO FINISHED WITH IT, AND WHEN: reception, by booking it.
    const linked = await requestRow(requestId);
    expect(linked.handled_by).toBe(receptionId);
    expect(linked.handled_at).not.toBeNull();
    // AND THE AUDIT ROW for the status change: the actor, the patient, ids only.
    expect(await linkAudits(requestId)).toEqual([
      {
        action: "patient.guest_request_booked",
        entity_type: "patient",
        entity_id: patientId,
        actor_user_id: receptionId,
        metadata: { guestRequestId: requestId, appointmentId: booked.id },
      },
    ]);

    // ONE event, marked as a guest link and not as a portal acceptance.
    expect(h.events).toHaveLength(1);
    expect(h.events[0]!.data).toEqual({
      appointmentId: booked.id,
      tenantId,
      startsAt: booked.start.toISOString(),
      confirmationEligible: true,
      acceptedGuestRequest: true,
    });

    expect(await deliver()).toEqual([expect.objectContaining({ dispatched: true })]);

    // EXACTLY ONE SEND RECORD.
    expect(h.email).toEqual([]);
    expect(h.sms).toHaveLength(1);
    expect(h.sms[0]!.templateId).toBe("booking_approved.sms");
    expect(h.sms[0]!.body).toBe(
      `OsteoJP: marcacao confirmada para 10/03 as ${String(booked.start.getUTCHours()).padStart(2, "0")}:00 ` +
        `em ${CLINIC.name}. Duvidas: ${CLINIC.phone}.`,
    );
    expect(h.sms[0]!.body).not.toContain(TENANT_PHONE);
    expect(await ledger(booked.id)).toEqual([
      { channel: "sms", template_id: "booking_approved.sms", outcome: "sent", suppression_reason: null },
    ]);
  });

  it("G1, the patient record HAS an email at booking time: the email, and no SMS", async () => {
    const { requestId, patientId } = await converted();
    await sql.execute(raw`update patients set email = 'convidada@example.test' where id = ${patientId}`);

    const booked = await book({ patientId, guestRequestId: requestId });
    expect(booked.notice).toBeUndefined();
    await deliver();

    expect(h.sms).toEqual([]);
    expect(h.email).toHaveLength(1);
    expect(h.email[0]).toMatchObject({ templateId: "booking_approved.email", to: "convidada@example.test" });
    expect(h.email[0]!.body).toContain(`Local: ${CLINIC.name}, ${CLINIC.address}`);
    expect(h.email[0]!.body).toContain(`contacte a clínica: ${CLINIC.phone}`);
    expect(h.email[0]!.body).toContain("Terapeuta: Dr. Teste Ficticio");
    expect(await ledger(booked.id)).toEqual([
      { channel: "email", template_id: "booking_approved.email", outcome: "sent", suppression_reason: null },
    ]);
  });

  /* ============ R40: THE EMAIL THE VISITOR TYPED ON THE PUBLIC FORM ============ */
  // The arm above puts an address on the patient by hand. These do not: the address
  // is on the REQUEST, as the public form writes it (0101), and only the real
  // convert decides what becomes of it. They follow the whole chain, form row ->
  // convert -> booking -> link -> dispatch, for the three people a request can be:
  // a NEW patient (gets the address and the email confirmation), an EXISTING
  // patient with no email (record untouched, SMS as before the form had the field),
  // and an existing patient with their own email (record untouched, their email).

  it("R40, the visitor GAVE an email on the form: the convert carries it to the new patient, and the EMAIL confirmation goes, not the SMS", async () => {
    const typed = `convidada-${randomUUID().slice(0, 8)}@example.invalid`;
    const { requestId, patientId } = await converted({ email: typed });
    // The patient the convert created holds the address. Nobody wrote it by hand.
    expect((await rows(raw`select email from patients where id = ${patientId}`))[0]).toEqual({ email: typed });

    const booked = await book({ patientId, guestRequestId: requestId });
    expect(booked.notice).toBeUndefined();
    expect(await requestRow(requestId)).toMatchObject({ status: "confirmed", converted_appointment_id: booked.id });
    expect(await deliver()).toEqual([expect.objectContaining({ dispatched: true })]);

    // THE EMAIL, EXACTLY ONE, TO THE ADDRESS THE VISITOR TYPED. And no SMS, though a mobile is on file.
    expect(h.sms).toEqual([]);
    expect(h.email).toHaveLength(1);
    expect(h.email[0]).toMatchObject({ templateId: "booking_approved.email", to: typed });
    expect(await ledger(booked.id)).toEqual([
      { channel: "email", template_id: "booking_approved.email", outcome: "sent", suppression_reason: null },
    ]);
  });

  it("R40, THE CONTROL: the same visitor WITHOUT an email gets the SMS, so the email above is the form's doing", async () => {
    const { requestId, patientId } = await converted({ email: null });
    expect((await rows(raw`select email from patients where id = ${patientId}`))[0]).toEqual({ email: null });
    const booked = await book({ patientId, guestRequestId: requestId });
    await deliver();
    expect(h.email).toEqual([]);
    expect(h.sms).toHaveLength(1);
    expect(await ledger(booked.id)).toEqual([
      { channel: "sms", template_id: "booking_approved.sms", outcome: "sent", suppression_reason: null },
    ]);
  });

  it("R40, THE ABUSE SEQUENCE: the form posted with a PATIENT'S mobile and SOMEBODY ELSE'S email. The patient has no email. Nothing is written to the record, the patient gets the SMS on their own number, and no email goes anywhere", async () => {
    // What an attacker controls: the public form. The mobile is the victim's, the address is theirs.
    const attacker = `outra-pessoa-${randomUUID().slice(0, 8)}@example.invalid`;
    const mobile = `91${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
    const victim = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, phone, email, primary_location_id, created_by)
      values (${victim}, ${tenantId}, 'Cliente Inventada', ${`+351${mobile}`}, null, ${loc}, ${receptionId})`);
    const requestId = await guestRequest({ phone: mobile, email: attacker });

    // Reception picks the patient the number matches, as the dialog invites.
    const r = await convert(requestId, { kind: "existing_patient", patientId: victim });
    expect(r.ok, `convert refused: ${JSON.stringify(r)}`).toBe(true);
    // THE RECORD HOLDS NO ADDRESS, as before the request existed.
    expect((await rows(raw`select email from patients where id = ${victim}`))[0]).toEqual({ email: null });

    const booked = await book({ patientId: victim, guestRequestId: requestId });
    expect(await requestRow(requestId)).toMatchObject({ status: "confirmed", converted_appointment_id: booked.id });
    await deliver();

    // THE CONFIRMATION IS THE SMS, TO THE NUMBER THE CLINIC HOLDS FOR THE PATIENT.
    expect(h.email).toEqual([]);
    expect(h.sms).toHaveLength(1);
    expect(h.sms[0]!.to).toBe(`+351${mobile}`);
    expect(await ledger(booked.id)).toEqual([
      { channel: "sms", template_id: "booking_approved.sms", outcome: "sent", suppression_reason: null },
    ]);
    // The typed address was used for NOTHING, on any channel.
    expect(JSON.stringify(allSent())).not.toContain(attacker);
    expect((await rows(raw`select email from patients where id = ${victim}`))[0]).toEqual({ email: null });
  });

  it("R40, an EXISTING patient who HAS an email: the record is untouched, and their OWN address gets the email confirmation", async () => {
    const typed = `convidada-${randomUUID().slice(0, 8)}@example.invalid`;
    const held = `cliente-${randomUUID().slice(0, 8)}@example.invalid`;
    const mobile = `91${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
    const existing = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, phone, email, primary_location_id, created_by)
      values (${existing}, ${tenantId}, 'Cliente Inventada', ${`+351${mobile}`}, ${held}, ${loc}, ${receptionId})`);
    const requestId = await guestRequest({ phone: mobile, email: typed });
    const r = await convert(requestId, { kind: "existing_patient", patientId: existing });
    expect(r.ok, `convert refused: ${JSON.stringify(r)}`).toBe(true);
    expect((await rows(raw`select email from patients where id = ${existing}`))[0]).toEqual({ email: held });

    await book({ patientId: existing, guestRequestId: requestId });
    await deliver();
    expect(h.sms).toEqual([]);
    expect(h.email).toHaveLength(1);
    expect(h.email[0]!.to).toBe(held);
    // The typed address was used for nothing.
    expect(JSON.stringify(allSent())).not.toContain(typed);
  });

  it("G1, NEITHER an email nor a number the SMS leg can use: the approver's notice, and nothing is sent", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { requestId, patientId } = await converted();
    // The number on file turns out to be a landline.
    await sql.execute(raw`update patients set phone = '272000123' where id = ${patientId}`);

    const booked = await book({ patientId, guestRequestId: requestId });
    expect(booked.notice).toBe("patient_no_email");
    // Still linked: the appointment is real and the request is answered.
    expect((await requestRow(requestId)).converted_appointment_id).toBe(booked.id);

    await deliver();
    expect(allSent()).toEqual([]);
    expect(await ledger(booked.id)).toEqual([
      { channel: "sms", template_id: "booking_approved.sms", outcome: "suppressed", suppression_reason: "landline" },
    ]);
  });

  /* ---- the approver's notice on the guest door: every reason nothing can go ---- */

  it("a mobile and no email, but the PATIENT has SMS switched off: the notice, and nothing is sent", async () => {
    const { requestId, patientId } = await converted();
    await sql.execute(raw`update patients set reminder_sms_enabled = false where id = ${patientId}`);
    const booked = await book({ patientId, guestRequestId: requestId });
    expect(booked.notice).toBe("patient_no_email");
    await deliver();
    expect(allSent()).toEqual([]);
    // The dispatch and the notice agree, because they ask the same function.
    expect(await ledger(booked.id)).toEqual([
      { channel: "sms", template_id: "booking_approved.sms", outcome: "suppressed", suppression_reason: "channels_off" },
    ]);
  });

  it("a mobile and no email, but the CLINIC has SMS switched off: the notice, and nothing is sent", async () => {
    const { requestId, patientId } = await converted();
    const original = (await rows(raw`select settings from tenants where id = ${tenantId}`))[0]!.settings;
    await sql.execute(raw`update tenants set settings = ${JSON.stringify({
      locale: "pt",
      contacts: { phone: TENANT_PHONE },
      reminders: { emailEnabled: true, smsEnabled: false, leadTimeHours: [48, 24] },
    })}::jsonb where id = ${tenantId}`);
    try {
      const booked = await book({ patientId, guestRequestId: requestId });
      expect(booked.notice).toBe("patient_no_email");
      await deliver();
      expect(allSent()).toEqual([]);
      expect((await ledger(booked.id))[0]).toMatchObject({ suppression_reason: "channels_off" });
    } finally {
      await sql.execute(raw`update tenants set settings = ${JSON.stringify(original)}::jsonb where id = ${tenantId}`);
    }
  });

  it.each([
    ["no address", () => locNoAddress],
    ["no phone", () => locNoPhone],
  ] as const)(
    "booked at a location with %s: the SECOND notice, nothing sent on either channel, though the patient has an email",
    async (_label, where) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const { requestId, patientId } = await converted();
      await sql.execute(raw`update patients set email = 'convidada@example.test' where id = ${patientId}`);
      const booked = await book({ patientId, guestRequestId: requestId, locationId: where() });
      expect(booked.notice).toBe("location_contact_missing");
      // Linked all the same: the appointment is real.
      expect((await requestRow(requestId)).converted_appointment_id).toBe(booked.id);
      await deliver();
      expect(allSent()).toEqual([]);
      expect(await ledger(booked.id)).toEqual([
        {
          channel: "email",
          template_id: "booking_approved.email",
          outcome: "suppressed",
          suppression_reason: "location_contact_missing",
        },
      ]);
    },
  );

  it("booked with NO SERVICE for a guest with an email: the THIRD notice, and the email is not sent", async () => {
    const { requestId, patientId } = await converted();
    await sql.execute(raw`update patients set email = 'convidada@example.test' where id = ${patientId}`);
    const booked = await book({ patientId, guestRequestId: requestId, service: false });
    expect(booked.notice).toBe("service_missing");
    // Linked all the same: the appointment is real.
    expect((await requestRow(requestId)).converted_appointment_id).toBe(booked.id);
    await deliver();
    expect(allSent()).toEqual([]);
    expect(await ledger(booked.id)).toEqual([
      {
        channel: "email",
        template_id: "booking_approved.email",
        outcome: "suppressed",
        suppression_reason: "service_missing",
      },
    ]);
  });

  it("booked with NO SERVICE for a guest with a mobile and no email: no notice, and the SMS goes", async () => {
    const { requestId, patientId } = await converted();
    const booked = await book({ patientId, guestRequestId: requestId, service: false });
    expect(booked.notice).toBeUndefined();
    await deliver();
    expect(h.email).toEqual([]);
    expect(h.sms.map((m) => m.templateId)).toEqual(["booking_approved.sms"]);
  });

  it("AGENDAR LOTE for a guest nothing can reach: the notice rides the batch result too", async () => {
    const { requestId, patientId } = await converted();
    await sql.execute(raw`update patients set phone = '272000123' where id = ${patientId}`);
    const s = at(WED + 70, 9);
    const r = await actions.batchScheduleAppointments(
      {
        patientId,
        practitionerId: therapistId,
        locationId: loc,
        serviceId,
        slots: [{ startsAt: s.toISOString(), endsAt: new Date(s.getTime() + 45 * 60_000).toISOString() }],
      },
      { guestRequestId: requestId },
    );
    expect(r).toMatchObject({ ok: true, data: { notice: "patient_no_email" } });
  });

  it("delivered TWICE, the same start: still exactly one send record", async () => {
    const { requestId, patientId } = await converted();
    const booked = await book({ patientId, guestRequestId: requestId });
    await deliver();
    expect(await deliver()).toEqual([{ dispatched: false, reason: "already_sent" }]);
    expect(h.sms).toHaveLength(1);
    expect((await ledger(booked.id)).filter((r) => r.outcome === "sent")).toHaveLength(1);
  });

  /* ====================== the order reception follows ====================== */

  it("DISMISSED before the booking arrives: it still links (a dismiss is not a decline)", async () => {
    const { requestId, patientId } = await converted();
    expect(await dismiss(requestId)).toEqual({ ok: true });
    const dismissed = await requestRow(requestId);
    expect(dismissed.handled_at).not.toBeNull();
    // Somebody else books it afterwards.
    const otherReception = randomUUID();
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active)
      values (${otherReception}, ${tenantId}, ${"r2-" + otherReception.slice(0, 8) + "@t.test"}, 'Rececao Dois', true)`);
    await sql.execute(raw`insert into staff_locations (tenant_id, user_id, location_id)
      values (${tenantId}, ${otherReception}, ${loc})`);
    h.requireRequestContext.mockResolvedValue({ tenantId, role: "reception", userId: otherReception });

    const booked = await book({ patientId, guestRequestId: requestId });
    const after = await requestRow(requestId);
    expect(after).toMatchObject({ status: "confirmed", converted_appointment_id: booked.id });
    // The dismiss's name and instant are KEPT: the link fills them only when empty.
    expect(after.handled_by).toBe(receptionId);
    expect(String(after.handled_at)).toBe(String(dismissed.handled_at));
    // The audit row names who made the booking.
    expect((await linkAudits(requestId)).map((a) => a.actor_user_id)).toEqual([otherReception]);
    await deliver();
    expect(h.sms).toHaveLength(1);
  });

  /* ============================ a series ============================ */

  it("a recurring SERIES booked for a guest: only the FIRST occurrence is linked and confirmed", async () => {
    const { requestId, patientId } = await converted();
    const booked = await book({ patientId, guestRequestId: requestId, recurrence: { freq: "weekly", count: 3 } });

    expect((await requestRow(requestId)).converted_appointment_id).toBe(booked.id);
    expect(h.events).toHaveLength(3);
    const marked = h.events.filter((e) => e.data.acceptedGuestRequest === true);
    expect(marked.map((e) => e.data.appointmentId)).toEqual([booked.id]);
    expect(marked[0]!.data.startsAt).toBe(booked.start.toISOString());
    // The same occurrence is the only one that confirms.
    expect(h.events.filter((e) => e.data.confirmationEligible === true).map((e) => e.data.appointmentId)).toEqual([
      booked.id,
    ]);

    await deliver();
    expect(h.sms).toHaveLength(1);
  });

  it("AGENDAR LOTE for a guest: the earliest booked slot is linked, and only it", async () => {
    const { requestId, patientId } = await converted();
    const first = at(WED + 28, 9);
    const second = at(WED + 35, 9);
    const span = (s: Date) => ({
      startsAt: s.toISOString(),
      endsAt: new Date(s.getTime() + 45 * 60_000).toISOString(),
    });
    const r = await actions.batchScheduleAppointments(
      // Later slot FIRST in the list: the link follows the start, not the order.
      { patientId, practitionerId: therapistId, locationId: loc, serviceId, slots: [span(second), span(first)] },
      { guestRequestId: requestId },
    );
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    expect(r.data.booked).toHaveLength(2);
    const earliest = r.data.booked.find((b) => b.startsAt === first.toISOString())!;

    expect(await requestRow(requestId)).toMatchObject({
      status: "confirmed",
      converted_appointment_id: earliest.appointmentId,
    });
    expect(h.events.filter((e) => e.data.acceptedGuestRequest === true).map((e) => e.data.appointmentId)).toEqual([
      earliest.appointmentId,
    ]);
    await deliver();
    expect(h.sms).toHaveLength(1);
  });

  /* ================= a forged or stale id changes nothing ================= */

  describe("a forged or stale guestRequestId: the booking stands, nothing links, nothing is sent", () => {
    /** Book with a bad id and assert the booking is ordinary in every way. */
    async function expectOrdinaryBooking(patientId: string, guestRequestId: string | null) {
      const auditsBefore = (
        await rows(raw`select count(*)::int as n from audit_log
          where tenant_id = ${tenantId} and action = 'patient.guest_request_booked'`)
      )[0]!.n;
      const booked = await book({ patientId, guestRequestId });
      // A link that did not happen leaves no audit row claiming it did.
      expect(
        (
          await rows(raw`select count(*)::int as n from audit_log
            where tenant_id = ${tenantId} and action = 'patient.guest_request_booked'`)
        )[0]!.n,
      ).toBe(auditsBefore);
      expect(booked.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(booked.notice).toBeUndefined();
      expect(h.events).toHaveLength(1);
      expect("acceptedGuestRequest" in h.events[0]!.data).toBe(false);
      expect(await deliver()).toEqual([{ dispatched: false, reason: "origin" }]);
      expect(allSent()).toEqual([]);
      return booked;
    }

    it("an id nobody issued", async () => {
      const { requestId, patientId } = await converted();
      await expectOrdinaryBooking(patientId, randomUUID());
      // The patient's real request is untouched.
      expect(await requestRow(requestId)).toMatchObject({ status: "pending", converted_appointment_id: null });
    });

    it("a string that is not an id at all", async () => {
      const { patientId } = await converted();
      await expectOrdinaryBooking(patientId, "'; update guest_booking_requests set status = 'confirmed'; --");
    });

    it("ANOTHER TENANT's request", async () => {
      const { patientId } = await converted();
      const foreign = await guestRequest({ tenant: otherTenantId, locationId: loc });
      await sql.execute(raw`update guest_booking_requests set converted_patient_id = ${patientId} where id = ${foreign}`);
      await expectOrdinaryBooking(patientId, foreign);
      expect(await requestRow(foreign)).toMatchObject({ status: "pending", converted_appointment_id: null });
    });

    it("a request converted to a DIFFERENT patient", async () => {
      const mine = await converted();
      const someoneElse = await converted();
      await expectOrdinaryBooking(mine.patientId, someoneElse.requestId);
      expect(await requestRow(someoneElse.requestId)).toMatchObject({
        status: "pending",
        converted_appointment_id: null,
      });
    });

    it("a request that was never converted", async () => {
      const { patientId } = await converted();
      const raw_ = await guestRequest();
      await expectOrdinaryBooking(patientId, raw_);
      expect(await requestRow(raw_)).toMatchObject({ status: "pending", converted_appointment_id: null });
    });

    it("a request that was DECLINED", async () => {
      const { requestId, patientId } = await converted();
      await sql.execute(raw`update guest_booking_requests set status = 'declined' where id = ${requestId}`);
      await expectOrdinaryBooking(patientId, requestId);
      expect(await requestRow(requestId)).toMatchObject({ status: "declined", converted_appointment_id: null });
    });

    it("a request ALREADY linked: the second booking is ordinary and the first link stands", async () => {
      const { requestId, patientId } = await converted();
      const first = await book({ patientId, guestRequestId: requestId });
      h.events.length = 0;
      await expectOrdinaryBooking(patientId, requestId);
      expect((await requestRow(requestId)).converted_appointment_id).toBe(first.id);
    });

    it("a request for a clinic OUTSIDE the actor's scope", async () => {
      // Converted while reception still had that clinic; the assignment is gone
      // by the time the booking is made.
      const requestId = await guestRequest({ locationId: locOutOfScope });
      const patientId = randomUUID();
      await sql.execute(raw`insert into patients (id, tenant_id, full_name, phone)
        values (${patientId}, ${tenantId}, 'Convidada Inventada', '912000777')`);
      await sql.execute(raw`update guest_booking_requests set converted_patient_id = ${patientId} where id = ${requestId}`);
      await expectOrdinaryBooking(patientId, requestId);
      expect(await requestRow(requestId)).toMatchObject({ status: "pending", converted_appointment_id: null });
    });

    it("NO id at all (an ordinary booking for a converted patient): nothing links", async () => {
      const { requestId, patientId } = await converted();
      await expectOrdinaryBooking(patientId, null);
      expect(await requestRow(requestId)).toMatchObject({ status: "pending", converted_appointment_id: null });
    });
  });

  /* ================= the row is the authority, not the event ================= */

  it("a hand-fired event with the marker and NO link row sends nothing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { patientId } = await converted();
    const booked = await book({ patientId, guestRequestId: null });
    expect(
      await dispatchConfirmation(tenantId, booked.id, { acceptedGuestRequest: true }),
    ).toEqual({ dispatched: false, reason: "origin" });
    expect(allSent()).toEqual([]);
  });

  it("the link row is read for THIS patient and THIS tenant", async () => {
    const { requestId, patientId } = await converted();
    const booked = await book({ patientId, guestRequestId: requestId });
    const { isGuestLinkedAppointment } = await import("@/lib/reminders/data");
    expect(await isGuestLinkedAppointment(tenantId, booked.id, patientId)).toBe(true);
    expect(await isGuestLinkedAppointment(tenantId, booked.id, randomUUID())).toBe(false);
    expect(await isGuestLinkedAppointment(tenantId, randomUUID(), patientId)).toBe(false);
    expect(await isGuestLinkedAppointment(otherTenantId, booked.id, patientId)).toBe(false);
    // And only while the request says `confirmed`, the status only the link
    // writes: a request somebody later marks declined no longer admits it.
    await sql.execute(raw`update guest_booking_requests set status = 'declined' where id = ${requestId}`);
    expect(await isGuestLinkedAppointment(tenantId, booked.id, patientId)).toBe(false);
  });

  it("TWO bookings racing for ONE request: exactly one links, and exactly one event is marked", async () => {
    // The read and the write are two statements. Both bookings can read the
    // request as open; the conditional write is what lets only one of them
    // land. Several rounds, because whether the two interleave is timing: the
    // correct code passes every round, and a write without its predicates
    // fails as soon as one round interleaves.
    for (let round = 0; round < 6; round++) {
      h.events.length = 0;
      const { requestId, patientId } = await converted();
      const [a, b] = await Promise.all([
        book({ patientId, guestRequestId: requestId, start: at(WED + 42 + 7 * round, 9) }),
        book({ patientId, guestRequestId: requestId, start: at(WED + 42 + 7 * round, 14) }),
      ]);
      const linkedTo = (await requestRow(requestId)).converted_appointment_id;
      expect([a.id, b.id], `round ${round}`).toContain(linkedTo);
      const marked = h.events.filter((e) => e.data.acceptedGuestRequest === true);
      expect(marked.map((e) => e.data.appointmentId), `round ${round}`).toEqual([linkedTo]);
    }
  });

  it("a booking that reaches the link while ANOTHER link is still uncommitted loses to it", async () => {
    // The deterministic half of the race. Another transaction links the request
    // and holds its row lock. This booking's READ still sees the request as
    // open (the other write is not committed), so only its CONDITIONAL WRITE can
    // stop it: it waits for the lock, re-checks its predicates against the
    // committed row, and updates nothing.
    const { requestId, patientId } = await converted();
    const winner = randomUUID();
    let racing: ReturnType<typeof book> | null = null;
    await sql.transaction(async (tx) => {
      await tx.execute(raw`update guest_booking_requests
        set converted_appointment_id = ${winner}, status = 'confirmed' where id = ${requestId}`);
      racing = book({ patientId, guestRequestId: requestId });
      // Long enough for the booking to reach its link and block on the row.
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    const loser = await racing!;

    // The booking itself stands; the first link stands; nothing is marked.
    expect(loser.id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await requestRow(requestId)).converted_appointment_id).toBe(winner);
    expect(h.events.filter((e) => e.data.acceptedGuestRequest === true)).toEqual([]);
  });

  it("an ORDINARY booking for a patient nothing can reach shows no notice: the notice is the link's", async () => {
    const { requestId, patientId } = await converted();
    await sql.execute(raw`update patients set phone = '272000123' where id = ${patientId}`);
    // No request id on the booking: reception booked this patient by hand.
    const booked = await book({ patientId, guestRequestId: null });
    expect(booked.notice).toBeUndefined();
    expect((await requestRow(requestId)).converted_appointment_id).toBeNull();
  });

  /* ============================== GATE G3 ============================== */

  it.each(["off", "", "true"])("G3, BOOK_CONFIRM_MODE=%j: a guest booking sends NOTHING at all", async (mode) => {
    if (mode === "") delete process.env.BOOK_CONFIRM_MODE;
    else process.env.BOOK_CONFIRM_MODE = mode;
    const { requestId, patientId } = await converted();
    await sql.execute(raw`update patients set email = 'convidada@example.test' where id = ${patientId}`);

    const booked = await book({ patientId, guestRequestId: requestId });
    // The LINK is data, not a message: it is written whatever the switch says,
    // so the request leaves the queue. Nothing is SENT.
    expect((await requestRow(requestId)).converted_appointment_id).toBe(booked.id);
    expect(booked.notice).toBeUndefined();

    expect(await deliver()).toEqual([{ dispatched: false, reason: "origin" }]);
    expect(allSent()).toEqual([]);
    // No row under either booking-approved id; the one row is today's gate.
    expect(await ledger(booked.id)).toEqual([
      { channel: "email", template_id: "confirmation.email", outcome: "suppressed", suppression_reason: "origin" },
    ]);
  });

  it("G3: with the switch off the approver's notice is not shown either, though nothing can reach the patient", async () => {
    process.env.BOOK_CONFIRM_MODE = "off";
    const { requestId, patientId } = await converted();
    await sql.execute(raw`update patients set phone = '272000123' where id = ${patientId}`);
    expect((await book({ patientId, guestRequestId: requestId })).notice).toBeUndefined();
  });

  /* ============================== the canary ============================== */

  it("CANARY, a LISTED patient: the new behaviour", async () => {
    process.env.BOOK_CONFIRM_MODE = "canary";
    const { requestId, patientId } = await converted();
    process.env.BOOK_CONFIRM_CANARY_PATIENT_IDS = `${randomUUID()},${patientId}`;
    await book({ patientId, guestRequestId: requestId });
    await deliver();
    expect(h.sms.map((m) => m.templateId)).toEqual(["booking_approved.sms"]);
  });

  it("CANARY, a NON-LISTED patient: nothing is sent, and no notice", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    process.env.BOOK_CONFIRM_MODE = "canary";
    process.env.BOOK_CONFIRM_CANARY_PATIENT_IDS = randomUUID();
    const { requestId, patientId } = await converted();
    await sql.execute(raw`update patients set phone = '272000123' where id = ${patientId}`);
    const booked = await book({ patientId, guestRequestId: requestId });
    expect(booked.notice).toBeUndefined();
    expect(await deliver()).toEqual([{ dispatched: false, reason: "origin" }]);
    expect(allSent()).toEqual([]);
  });
});
