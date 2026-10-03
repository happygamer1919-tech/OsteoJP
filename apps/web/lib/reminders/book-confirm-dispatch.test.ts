/**
 * book-confirm-dispatch.test.ts - BOOK-CONFIRM, the dispatch.
 *
 * Strategy dispatch S-1003-B block 1, amended by the owner on 2026-10-03: when
 * reception accepts an online booking request, the patient gets ONE
 * confirmation, and it REPLACES the one the acceptance sends today.
 *
 * WHAT IS REAL HERE AND WHAT IS NOT. `dispatchConfirmation` and everything it
 * decides is the real code: the switch, the channel choice, the location
 * check, the render. Three seams are replaced, and each is replaced with
 * something that RECORDS rather than something that agrees:
 *
 *   ./data             the row the dispatch reads (a fixture per test)
 *   ./clients          the two send functions, which capture the whole message
 *   ./dispatch-ledger  an in-memory ledger with the same "handed over" rule as
 *                      the real one, so "approve twice" can be driven for real
 *
 * The real ledger read and the real row shape are proven against Postgres in
 * book-confirm.db.test.ts.
 *
 * Every name, address and phone number below is invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Sent = { templateId: string; to: string; subject?: string; body: string };
type LedgerRow = {
  tenantId: string;
  appointmentId: string;
  channel: "sms" | "email";
  templateId: string;
  outcome: "sent" | "suppressed" | "provider_error";
  suppressionReason?: string | null;
  bodyLength?: number | null;
  providerMessageId?: string | null;
  providerErrorCode?: string | null;
};

const h = vi.hoisted(() => ({
  loadReminderData: vi.fn(),
  email: [] as Sent[],
  sms: [] as Sent[],
  ledger: [] as LedgerRow[],
  /** When true the two sends go to the REAL notify gate instead of the capture. */
  realGate: false,
  /** A gate reason to report for the next held-back results, when simulated. */
  simulatedReason: null as string | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("./data", () => ({ loadReminderData: h.loadReminderData }));
vi.mock("./clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clients")>();
  return {
    ...actual,
    // The real side table for real-gate results; the simulated reason otherwise.
    suppressionReasonOf: (r: Parameters<typeof actual.suppressionReasonOf>[0]) =>
      actual.suppressionReasonOf(r) ?? (r.sandbox ? (h.simulatedReason ?? undefined) : undefined),
    sendEmail: vi.fn(async (m: Parameters<typeof actual.sendEmail>[0]) => {
      if (h.realGate) return actual.sendEmail(m);
      h.email.push({ templateId: m.templateId, to: m.to, subject: m.subject, body: m.body });
      return { channel: "email" as const, sandbox: false, id: `test-email-${h.email.length}` };
    }),
    sendSms: vi.fn(async (m: Parameters<typeof actual.sendSms>[0]) => {
      if (h.realGate) return actual.sendSms(m);
      h.sms.push({ templateId: m.templateId, to: m.to, body: m.body });
      return { channel: "sms" as const, sandbox: false, id: `test-sms-${h.sms.length}` };
    }),
  };
});
vi.mock("./dispatch-ledger", () => ({
  recordDispatch: vi.fn(async (row: LedgerRow) => {
    h.ledger.push(row);
  }),
  // The real rule (dispatch-ledger.ts): a `sent` row, or one the gate held
  // back because live send is off.
  hasHandedOverDispatch: vi.fn(
    async (args: { appointmentId: string; templateIds: readonly string[] }) =>
      h.ledger.some(
        (r) =>
          r.appointmentId === args.appointmentId &&
          args.templateIds.includes(r.templateId) &&
          (r.outcome === "sent" ||
            (r.outcome === "suppressed" && r.suppressionReason === "live_send_disabled")),
      ),
  ),
}));

import {
  BOOKING_APPROVED_EMAIL_TEMPLATE_ID,
  BOOKING_APPROVED_SMS_TEMPLATE_ID,
  bookingApprovedLocationContact,
  buildReminderContext,
  dispatchConfirmation,
  planBookingApprovedChannel,
} from "./dispatch";
import { normalizePhonePT } from "@osteojp/notify";
import { webRegistry } from "./notification-registry";
import { formatDateLong, formatDateShort, formatTime } from "./locale";
import { renderConfirmationEmail, renderConfirmationSms } from "./templates";

const TENANT = "11111111-1111-4111-8111-111111111111";
const APPT = "22222222-2222-4222-8222-222222222222";
const PATIENT = "33333333-3333-4333-8333-333333333333";
const OTHER_PATIENT = "44444444-4444-4444-8444-444444444444";

/** Ten days out at a fixed wall-clock hour, so no offset or DST edge is near. */
const STARTS_AT = new Date(Date.UTC(2031, 4, 14, 13, 30, 0));

const LOCATION_PHONE = "+351 272 111 111";
const LOCATION_ADDRESS = "Rua de Exemplo 1, 6000-000 Castelo Branco";
const TENANT_PHONE = "+351 210 999 999";

function row(over: Record<string, unknown> = {}) {
  return {
    appointmentId: APPT,
    startsAt: STARTS_AT,
    // An ACCEPTED pedido: the status has left `scheduled`, the origin is the portal.
    status: "confirmed",
    confirmationState: "pending",
    origin: "patient_portal",
    patientId: PATIENT,
    patientName: "Madalena Sousa",
    patientEmail: "madalena@example.test",
    patientPhone: "+351 912 000 001",
    patientReminderSmsEnabled: true,
    patientReminderEmailEnabled: true,
    patientDeletedAt: null,
    patientHasAcceptedTerms: false,
    practitionerName: "Dr. Joao Pereira",
    locationName: "Castelo Branco",
    locationPhone: LOCATION_PHONE,
    locationAddress: LOCATION_ADDRESS,
    serviceName: "Osteopatia",
    // A tenant-level phone that DIFFERS from the location's, so any use of it shows.
    tenantSettings: { locale: "pt", contacts: { phone: TENANT_PHONE } },
    ...over,
  };
}

const ACCEPTED = { acceptedPedido: true } as const;

/** Every message that left, both channels. */
const allSent = () => [...h.email, ...h.sms];
const everything = () => JSON.stringify({ sent: allSent(), ledger: h.ledger });

const ENV_KEYS = [
  "BOOK_CONFIRM_MODE",
  "BOOK_CONFIRM_CANARY_PATIENT_IDS",
  "REMINDERS_LIVE_SEND",
  "REMINDERS_LINK_SECRET",
  "REMINDERS_RESCHEDULE_BASE_URL",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  h.loadReminderData.mockReset();
  h.email.length = 0;
  h.sms.length = 0;
  h.ledger.length = 0;
  h.realGate = false;
  h.simulatedReason = null;
  delete process.env.BOOK_CONFIRM_MODE;
  delete process.env.BOOK_CONFIRM_CANARY_PATIENT_IDS;
  delete process.env.REMINDERS_LIVE_SEND;
  // The EXISTING confirmation email carries a signed reschedule link.
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

/** What the acceptance sends TODAY: both bodies, rendered by today's code. */
function todaysMessages(data: ReturnType<typeof row>) {
  const ctx = buildReminderContext({ ...data, tenantId: TENANT }, "pt");
  return {
    email: renderConfirmationEmail("pt", ctx),
    sms: renderConfirmationSms("pt", ctx),
  };
}

/** Assert the run sent exactly today's two messages and nothing else. */
function expectTodaysConfirmation(data: ReturnType<typeof row>) {
  const today = todaysMessages(data);
  expect(h.email).toEqual([
    {
      templateId: "confirmation.email",
      to: data.patientEmail,
      subject: today.email.subject,
      body: today.email.body,
    },
  ]);
  expect(h.sms).toEqual([
    // The send path hands the provider the number in E.164, as it always has.
    { templateId: "confirmation.sms", to: normalizePhonePT(data.patientPhone), body: today.sms },
  ]);
  // The messages are today's. What is new is that each one leaves a row.
  expect(h.ledger.map((r) => [r.channel, r.templateId, r.outcome])).toEqual([
    ["email", "confirmation.email", "sent"],
    ["sms", "confirmation.sms", "sent"],
  ]);
}

/* ==================================================================== */
/* 1. THE MODE MATRIX                                                    */
/* ==================================================================== */

describe("the mode matrix, for an ACCEPTANCE", () => {
  it("off: today's two messages, byte for byte", async () => {
    process.env.BOOK_CONFIRM_MODE = "off";
    const data = row();
    h.loadReminderData.mockResolvedValue(data);
    const out = await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    expect(out.dispatched).toBe(true);
    expectTodaysConfirmation(data);
  });

  it("unset: the same as off", async () => {
    const data = row();
    h.loadReminderData.mockResolvedValue(data);
    await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    expectTodaysConfirmation(data);
  });

  it("an unrecognised value: the same as off", async () => {
    process.env.BOOK_CONFIRM_MODE = "true";
    const data = row();
    h.loadReminderData.mockResolvedValue(data);
    await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    expectTodaysConfirmation(data);
  });

  it("canary, patient LISTED: the booking-approved email, and no SMS", async () => {
    process.env.BOOK_CONFIRM_MODE = "canary";
    process.env.BOOK_CONFIRM_CANARY_PATIENT_IDS = `${OTHER_PATIENT},${PATIENT}`;
    h.loadReminderData.mockResolvedValue(row());
    const out = await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    expect(out.dispatched).toBe(true);
    expect(h.email.map((m) => m.templateId)).toEqual([BOOKING_APPROVED_EMAIL_TEMPLATE_ID]);
    expect(h.sms).toEqual([]);
  });

  it("canary, patient NOT listed: today's two messages, and a log line with ids only", async () => {
    process.env.BOOK_CONFIRM_MODE = "canary";
    process.env.BOOK_CONFIRM_CANARY_PATIENT_IDS = OTHER_PATIENT;
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const data = row();
    h.loadReminderData.mockResolvedValue(data);
    await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    expectTodaysConfirmation(data);

    const lines = info.mock.calls.map((c) => c.join(" ")).filter((l) => l.includes("book-confirm canary"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(`tenantId=${TENANT}`);
    expect(lines[0]).toContain(`appointmentId=${APPT}`);
    expect(lines[0]).toContain(`patientId=${PATIENT}`);
    // No personal data: not the name, the address, the email or the phone.
    for (const personal of ["Madalena", "Sousa", data.patientEmail, "912", data.patientPhone]) {
      expect(lines[0]).not.toContain(personal);
    }
  });

  it("canary with an EMPTY list: nobody gets the new message", async () => {
    process.env.BOOK_CONFIRM_MODE = "canary";
    const data = row();
    h.loadReminderData.mockResolvedValue(data);
    vi.spyOn(console, "info").mockImplementation(() => {});
    await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    expectTodaysConfirmation(data);
  });

  it("on: the booking-approved email for a patient on no list at all", async () => {
    process.env.BOOK_CONFIRM_MODE = "on";
    h.loadReminderData.mockResolvedValue(row());
    await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    expect(h.email.map((m) => m.templateId)).toEqual([BOOKING_APPROVED_EMAIL_TEMPLATE_ID]);
    expect(h.sms).toEqual([]);
  });

  it("off writes no canary log line", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    h.loadReminderData.mockResolvedValue(row());
    await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    expect(info.mock.calls.map((c) => c.join(" ")).filter((l) => l.includes("book-confirm"))).toEqual([]);
  });
});

/* ==================================================================== */
/* 2. A RESCHEDULE KEEPS TODAY'S MESSAGE, WHATEVER THE SWITCH SAYS       */
/* ==================================================================== */

describe("an event WITHOUT the acceptance marker keeps today's message", () => {
  it.each(["off", "canary", "on"])(
    "mode %s: a reschedule of a portal appointment sends today's two messages",
    async (mode) => {
      process.env.BOOK_CONFIRM_MODE = mode;
      process.env.BOOK_CONFIRM_CANARY_PATIENT_IDS = PATIENT;
      const data = row();
      h.loadReminderData.mockResolvedValue(data);
      // No options at all: what every caller passed before the marker existed.
      const out = await dispatchConfirmation(TENANT, APPT);
      expect(out.dispatched).toBe(true);
      expectTodaysConfirmation(data);
    },
  );

  it("mode on: an explicit `acceptedPedido: false` is a reschedule too", async () => {
    process.env.BOOK_CONFIRM_MODE = "on";
    const data = row();
    h.loadReminderData.mockResolvedValue(data);
    await dispatchConfirmation(TENANT, APPT, { acceptedPedido: false });
    expectTodaysConfirmation(data);
  });

  it("mode on: only the literal `true` selects the new message", async () => {
    process.env.BOOK_CONFIRM_MODE = "on";
    const data = row();
    h.loadReminderData.mockResolvedValue(data);
    // What a hand-fired event with a string in the field would deliver.
    await dispatchConfirmation(TENANT, APPT, { acceptedPedido: "true" as unknown as boolean });
    expectTodaysConfirmation(data);
  });

  it("the reschedule's message still falls back to the TENANT phone, as today", async () => {
    process.env.BOOK_CONFIRM_MODE = "on";
    const data = row({ locationPhone: null });
    h.loadReminderData.mockResolvedValue(data);
    await dispatchConfirmation(TENANT, APPT);
    expect(h.email[0]!.body).toContain(TENANT_PHONE);
    expect(h.sms[0]!.body).toContain(TENANT_PHONE);
  });
});

/* ==================================================================== */
/* 3. THE CHANNEL DECISION                                               */
/* ==================================================================== */

describe("planBookingApprovedChannel (pure)", () => {
  const on = { tenantSmsEnabled: true, patientSmsEnabled: true };

  it.each([
    // hasEmail, hasPhone, tenantSms, patientSms, expected
    [true, true, true, true, { send: "email" }],
    [true, false, true, true, { send: "email" }],
    // The email is transactional: the SMS switches are irrelevant to it.
    [true, true, false, false, { send: "email" }],
    [false, true, true, true, { send: "sms" }],
    [false, true, false, true, { send: "none", reason: "channels_off", channel: "sms" }],
    [false, true, true, false, { send: "none", reason: "channels_off", channel: "sms" }],
    [false, false, true, true, { send: "none", reason: "no_contact", channel: "email" }],
    [false, false, false, false, { send: "none", reason: "no_contact", channel: "email" }],
  ] as const)(
    "email=%s phone=%s tenantSms=%s patientSms=%s",
    (hasEmail, hasPhone, tenantSmsEnabled, patientSmsEnabled, expected) => {
      expect(
        planBookingApprovedChannel({ hasEmail, hasPhone, tenantSmsEnabled, patientSmsEnabled }),
      ).toEqual(expected);
    },
  );

  it("never plans both channels", () => {
    for (const hasEmail of [true, false]) {
      for (const hasPhone of [true, false]) {
        const plan = planBookingApprovedChannel({ hasEmail, hasPhone, ...on });
        expect(["email", "sms", "none"]).toContain(plan.send);
      }
    }
  });
});

describe("the channel decision, through the dispatch (mode on, an acceptance)", () => {
  beforeEach(() => {
    process.env.BOOK_CONFIRM_MODE = "on";
  });

  it("an email on file: ONE message, the email, and no SMS", async () => {
    h.loadReminderData.mockResolvedValue(row());
    const out = await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    expect(out).toMatchObject({ dispatched: true });
    expect(allSent()).toHaveLength(1);
    expect(h.email[0]).toMatchObject({
      templateId: "booking_approved.email",
      to: "madalena@example.test",
      subject: `Consulta confirmada: ${formatDateLong(STARTS_AT, "pt")} às ${formatTime(STARTS_AT, "pt")}`,
    });
    expect(h.email[0]!.body).toBe(
      [
        "Olá Madalena,",
        "O seu pedido de marcação foi aprovado. A consulta está confirmada:",
        `Data: ${formatDateLong(STARTS_AT, "pt")}`,
        `Hora: ${formatTime(STARTS_AT, "pt")}`,
        "Serviço: Osteopatia",
        "Terapeuta: Dr. Joao Pereira",
        `Local: Castelo Branco, ${LOCATION_ADDRESS}`,
        `Para alterar ou cancelar, contacte a clínica: ${LOCATION_PHONE}`,
        "OsteoJP",
      ].join("\n"),
    );
    expect(h.ledger).toEqual([
      expect.objectContaining({
        appointmentId: APPT,
        channel: "email",
        templateId: "booking_approved.email",
        outcome: "sent",
        providerMessageId: "test-email-1",
      }),
    ]);
  });

  it("the email is TRANSACTIONAL: it goes with the tenant email switch off AND the patient preference off", async () => {
    h.loadReminderData.mockResolvedValue(
      row({
        patientReminderEmailEnabled: false,
        patientReminderSmsEnabled: false,
        tenantSettings: {
          locale: "pt",
          reminders: { emailEnabled: false, smsEnabled: false, leadTimeHours: [48, 24] },
        },
      }),
    );
    const out = await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    expect(out.dispatched).toBe(true);
    expect(h.email.map((m) => m.templateId)).toEqual(["booking_approved.email"]);
    expect(h.sms).toEqual([]);
  });

  it("the SAME switches, without the marker, still silence today's message (the control)", async () => {
    // Proves the fixture above really switches the channels off, so the arm
    // above is the email ignoring them and not the switches being inert.
    h.loadReminderData.mockResolvedValue(
      row({
        patientReminderEmailEnabled: false,
        patientReminderSmsEnabled: false,
      }),
    );
    expect(await dispatchConfirmation(TENANT, APPT)).toEqual({
      dispatched: false,
      reason: "channels_off",
    });
    expect(allSent()).toEqual([]);
  });

  it("no email, a mobile on file: the EXISTING confirmation SMS body as the fallback, and no email", async () => {
    const data = row({ patientEmail: null });
    h.loadReminderData.mockResolvedValue(data);
    const out = await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    expect(out.dispatched).toBe(true);
    expect(h.email).toEqual([]);
    expect(h.sms).toHaveLength(1);
    expect(h.sms[0]!.templateId).toBe("confirmation.sms");
    // The existing body, with the LOCATION's phone on its last line.
    expect(h.sms[0]!.body).toBe(
      renderConfirmationSms("pt", {
        appointmentDateShort: formatDateShort(STARTS_AT),
        appointmentTime: formatTime(STARTS_AT, "pt"),
        clinicLocation: "Castelo Branco",
        clinicPhone: LOCATION_PHONE,
      }),
    );
    expect(h.ledger).toEqual([
      expect.objectContaining({
        channel: "sms",
        templateId: "confirmation.sms",
        outcome: "sent",
        bodyLength: h.sms[0]!.body.length,
      }),
    ]);
  });

  it("a BLANK email is no email: the SMS fallback, not an email to nobody", async () => {
    h.loadReminderData.mockResolvedValue(row({ patientEmail: "   " }));
    await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    expect(h.email).toEqual([]);
    expect(h.sms.map((m) => m.templateId)).toEqual(["confirmation.sms"]);
  });

  it("no email, and the TENANT has SMS switched off: nothing, and the ledger says channels_off", async () => {
    h.loadReminderData.mockResolvedValue(
      row({
        patientEmail: null,
        tenantSettings: {
          locale: "pt",
          reminders: { emailEnabled: true, smsEnabled: false, leadTimeHours: [48, 24] },
        },
      }),
    );
    expect(await dispatchConfirmation(TENANT, APPT, ACCEPTED)).toEqual({
      dispatched: false,
      reason: "channels_off",
    });
    expect(allSent()).toEqual([]);
    expect(h.ledger).toEqual([
      expect.objectContaining({
        channel: "sms",
        templateId: "confirmation.sms",
        outcome: "suppressed",
        suppressionReason: "channels_off",
      }),
    ]);
  });

  it("no email, and the PATIENT has SMS switched off: nothing", async () => {
    h.loadReminderData.mockResolvedValue(row({ patientEmail: null, patientReminderSmsEnabled: false }));
    expect(await dispatchConfirmation(TENANT, APPT, ACCEPTED)).toEqual({
      dispatched: false,
      reason: "channels_off",
    });
    expect(allSent()).toEqual([]);
  });

  it("no email, and the number on file is a LANDLINE: nothing is sent, and the ledger says landline", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    h.loadReminderData.mockResolvedValue(row({ patientEmail: null, patientPhone: "+351 272 000 123" }));
    const out = await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    expect(out).toEqual({ dispatched: true, channels: [] });
    expect(allSent()).toEqual([]);
    expect(h.ledger).toEqual([
      expect.objectContaining({ channel: "sms", outcome: "suppressed", suppressionReason: "landline" }),
    ]);
  });

  it("neither an email nor a phone: nothing, and the ledger says no_contact", async () => {
    h.loadReminderData.mockResolvedValue(row({ patientEmail: null, patientPhone: null }));
    expect(await dispatchConfirmation(TENANT, APPT, ACCEPTED)).toEqual({
      dispatched: false,
      reason: "no_contact",
    });
    expect(allSent()).toEqual([]);
    expect(h.ledger).toEqual([
      expect.objectContaining({ outcome: "suppressed", suppressionReason: "no_contact" }),
    ]);
  });

  it("an email send that FAILS does not turn into an SMS", async () => {
    const clients = await import("./clients");
    vi.mocked(clients.sendEmail).mockRejectedValueOnce(
      new clients.ProviderSendError("email", "validation_error", "reminders/email: Resend send failed"),
    );
    h.loadReminderData.mockResolvedValue(row());
    await expect(dispatchConfirmation(TENANT, APPT, ACCEPTED)).rejects.toThrow(/Resend send failed/);
    expect(h.sms).toEqual([]);
    // The refusal is on the ledger, with the provider's reason class.
    expect(h.ledger).toEqual([
      expect.objectContaining({
        channel: "email",
        templateId: "booking_approved.email",
        outcome: "provider_error",
        providerErrorCode: "validation_error",
      }),
    ]);
  });
});

/* ==================================================================== */
/* 4. THE LOCATION ROW ONLY                                              */
/* ==================================================================== */

describe("bookingApprovedLocationContact (pure)", () => {
  it("returns the location's own address and phone, trimmed", () => {
    expect(
      bookingApprovedLocationContact({ locationAddress: "  Rua A 1 ", locationPhone: " 210 000 000 " }),
    ).toEqual({ address: "Rua A 1", phone: "210 000 000" });
  });

  it.each([
    [null, "210 000 000"],
    ["", "210 000 000"],
    ["   ", "210 000 000"],
    ["Rua A 1", null],
    ["Rua A 1", ""],
    ["Rua A 1", "  "],
    [null, null],
  ])("address=%j phone=%j is missing", (locationAddress, locationPhone) => {
    expect(bookingApprovedLocationContact({ locationAddress, locationPhone })).toBeNull();
  });
});

describe("the address and the phone come from the LOCATION row only (mode on, an acceptance)", () => {
  beforeEach(() => {
    process.env.BOOK_CONFIRM_MODE = "on";
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it.each([
    ["an email on file", {}],
    ["no email, a mobile on file", { patientEmail: null }],
  ])("the location has NO ADDRESS (%s): nothing on either channel", async (_label, over) => {
    h.loadReminderData.mockResolvedValue(row({ ...over, locationAddress: null }));
    expect(await dispatchConfirmation(TENANT, APPT, ACCEPTED)).toEqual({
      dispatched: false,
      reason: "location_contact_missing",
    });
    expect(allSent()).toEqual([]);
    expect(h.ledger).toHaveLength(1);
    expect(h.ledger[0]).toMatchObject({
      outcome: "suppressed",
      suppressionReason: "location_contact_missing",
    });
  });

  it.each([
    ["an email on file", {}],
    ["no email, a mobile on file", { patientEmail: null }],
  ])(
    "the location has NO PHONE (%s): nothing on either channel, and the tenant phone is NOT used",
    async (_label, over) => {
      // The tenant phone IS configured. Today's message would print it.
      h.loadReminderData.mockResolvedValue(row({ ...over, locationPhone: null }));
      expect(await dispatchConfirmation(TENANT, APPT, ACCEPTED)).toEqual({
        dispatched: false,
        reason: "location_contact_missing",
      });
      expect(allSent()).toEqual([]);
      expect(everything()).not.toContain(TENANT_PHONE);
      expect(h.ledger[0]).toMatchObject({
        outcome: "suppressed",
        suppressionReason: "location_contact_missing",
      });
    },
  );

  it("a BLANK address or phone is a missing one", async () => {
    h.loadReminderData.mockResolvedValue(row({ locationAddress: "   " }));
    expect(await dispatchConfirmation(TENANT, APPT, ACCEPTED)).toMatchObject({
      reason: "location_contact_missing",
    });
    h.loadReminderData.mockResolvedValue(row({ locationPhone: " " }));
    expect(await dispatchConfirmation(TENANT, APPT, ACCEPTED)).toMatchObject({
      reason: "location_contact_missing",
    });
    expect(allSent()).toEqual([]);
  });

  it("the skip is logged with ids only", async () => {
    const warn = vi.mocked(console.warn);
    const data = row({ locationAddress: null });
    h.loadReminderData.mockResolvedValue(data);
    await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    const line = warn.mock.calls.map((c) => c.join(" ")).find((l) => l.includes("location_contact_missing"));
    expect(line).toBeDefined();
    expect(line).toContain(`appointmentId=${APPT}`);
    for (const personal of ["Madalena", data.patientEmail, data.patientPhone, LOCATION_PHONE]) {
      expect(line).not.toContain(personal);
    }
  });

  it("the EMAIL carries the location's phone and never the tenant's", async () => {
    h.loadReminderData.mockResolvedValue(row());
    await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    expect(h.email[0]!.body).toContain(LOCATION_PHONE);
    expect(h.email[0]!.body).toContain(LOCATION_ADDRESS);
    expect(everything()).not.toContain(TENANT_PHONE);
  });

  it("the SMS fallback carries the location's phone and never the tenant's", async () => {
    h.loadReminderData.mockResolvedValue(row({ patientEmail: null }));
    await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    expect(h.sms[0]!.body).toContain(LOCATION_PHONE);
    expect(everything()).not.toContain(TENANT_PHONE);
  });

  it("two locations, two messages: each carries ITS OWN address and phone", async () => {
    const lv = {
      locationName: "Linda-a-Velha",
      locationAddress: "Avenida Inventada 10, 2795-000 Linda-a-Velha",
      locationPhone: "+351 210 222 222",
    };
    const cb = {
      locationName: "Castelo Branco",
      locationAddress: LOCATION_ADDRESS,
      locationPhone: LOCATION_PHONE,
    };
    const APPT_2 = "55555555-5555-4555-8555-555555555555";
    h.loadReminderData.mockResolvedValueOnce(row(lv));
    await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    h.loadReminderData.mockResolvedValueOnce(row({ ...cb, appointmentId: APPT_2 }));
    await dispatchConfirmation(TENANT, APPT_2, ACCEPTED);

    expect(h.email).toHaveLength(2);
    const [first, second] = h.email as [Sent, Sent];
    expect(first.body).toContain(`Local: ${lv.locationName}, ${lv.locationAddress}`);
    expect(first.body).toContain(lv.locationPhone);
    expect(first.body).not.toContain(cb.locationAddress);
    expect(first.body).not.toContain(cb.locationPhone);
    expect(second.body).toContain(`Local: ${cb.locationName}, ${cb.locationAddress}`);
    expect(second.body).toContain(cb.locationPhone);
    expect(second.body).not.toContain(lv.locationAddress);
    expect(second.body).not.toContain(lv.locationPhone);
  });
});

/* ==================================================================== */
/* 5. ONCE PER APPROVAL                                                  */
/* ==================================================================== */

describe("once per approval, at the dispatch (mode on)", () => {
  beforeEach(() => {
    process.env.BOOK_CONFIRM_MODE = "on";
  });

  it("the same acceptance dispatched twice sends ONE email", async () => {
    h.loadReminderData.mockResolvedValue(row());
    expect(await dispatchConfirmation(TENANT, APPT, ACCEPTED)).toMatchObject({ dispatched: true });
    expect(await dispatchConfirmation(TENANT, APPT, ACCEPTED)).toEqual({
      dispatched: false,
      reason: "already_sent",
    });
    expect(allSent()).toHaveLength(1);
    expect(h.ledger.map((r) => [r.outcome, r.suppressionReason ?? null])).toEqual([
      ["sent", null],
      ["suppressed", "already_sent"],
    ]);
  });

  it("the same acceptance dispatched twice sends ONE fallback SMS", async () => {
    h.loadReminderData.mockResolvedValue(row({ patientEmail: null }));
    await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    expect(allSent()).toHaveLength(1);
  });

  it("an email added AFTER the SMS went does not earn a second message", async () => {
    h.loadReminderData.mockResolvedValue(row({ patientEmail: null }));
    await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    h.loadReminderData.mockResolvedValue(row());
    expect(await dispatchConfirmation(TENANT, APPT, ACCEPTED)).toMatchObject({
      dispatched: false,
      reason: "already_sent",
    });
    expect(h.sms).toHaveLength(1);
    expect(h.email).toEqual([]);
  });

  it("a SUPPRESSED first attempt is not a hand-over: fixing the location and approving again sends", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    h.loadReminderData.mockResolvedValue(row({ locationAddress: null }));
    expect(await dispatchConfirmation(TENANT, APPT, ACCEPTED)).toMatchObject({
      reason: "location_contact_missing",
    });
    h.loadReminderData.mockResolvedValue(row());
    expect(await dispatchConfirmation(TENANT, APPT, ACCEPTED)).toMatchObject({ dispatched: true });
    expect(h.email).toHaveLength(1);
  });

  it("another appointment's message does not count", async () => {
    const OTHER_APPT = "66666666-6666-4666-8666-666666666666";
    h.loadReminderData.mockResolvedValue(row());
    await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    h.loadReminderData.mockResolvedValue(row({ appointmentId: OTHER_APPT }));
    expect(await dispatchConfirmation(TENANT, OTHER_APPT, ACCEPTED)).toMatchObject({ dispatched: true });
    expect(h.email).toHaveLength(2);
  });
});

/* ==================================================================== */
/* 6. WHAT SENDS NOTHING                                                 */
/* ==================================================================== */

describe("what sends nothing (mode on, an acceptance)", () => {
  beforeEach(() => {
    process.env.BOOK_CONFIRM_MODE = "on";
  });

  it("a REJECTED request is cancelled: nothing, and the ledger says status", async () => {
    h.loadReminderData.mockResolvedValue(row({ status: "cancelled" }));
    expect(await dispatchConfirmation(TENANT, APPT, ACCEPTED)).toEqual({
      dispatched: false,
      reason: "status",
    });
    expect(allSent()).toEqual([]);
    expect(h.ledger).toEqual([
      expect.objectContaining({ outcome: "suppressed", suppressionReason: "status" }),
    ]);
  });

  it("a request nobody has accepted yet: nothing", async () => {
    h.loadReminderData.mockResolvedValue(row({ status: "scheduled" }));
    expect(await dispatchConfirmation(TENANT, APPT, ACCEPTED)).toMatchObject({
      dispatched: false,
      reason: "unconfirmed",
    });
    expect(allSent()).toEqual([]);
  });

  it("an appointment that is not an online request: nothing", async () => {
    h.loadReminderData.mockResolvedValue(row({ origin: "staff" }));
    expect(await dispatchConfirmation(TENANT, APPT, ACCEPTED)).toMatchObject({
      dispatched: false,
      reason: "origin",
    });
    expect(allSent()).toEqual([]);
  });

  it("a soft-deleted patient: nothing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    h.loadReminderData.mockResolvedValue(row({ patientDeletedAt: new Date() }));
    expect(await dispatchConfirmation(TENANT, APPT, ACCEPTED)).toEqual({
      dispatched: false,
      reason: "patient_deleted",
    });
    expect(allSent()).toEqual([]);
  });

  it("an appointment that cannot be read: nothing", async () => {
    h.loadReminderData.mockResolvedValue(null);
    expect(await dispatchConfirmation(TENANT, APPT, ACCEPTED)).toEqual({
      dispatched: false,
      reason: "not_found",
    });
    expect(allSent()).toEqual([]);
  });

  it("an appointment with no service: the email names one, so nothing is sent", async () => {
    h.loadReminderData.mockResolvedValue(row({ serviceName: null }));
    expect(await dispatchConfirmation(TENANT, APPT, ACCEPTED)).toEqual({
      dispatched: false,
      reason: "service_missing",
    });
    expect(allSent()).toEqual([]);
    expect(h.ledger).toEqual([
      expect.objectContaining({ channel: "email", suppressionReason: "service_missing" }),
    ]);
  });

  it("the SMS fallback does not need a service: its body names none", async () => {
    h.loadReminderData.mockResolvedValue(row({ patientEmail: null, serviceName: null }));
    expect(await dispatchConfirmation(TENANT, APPT, ACCEPTED)).toMatchObject({ dispatched: true });
    expect(h.sms).toHaveLength(1);
  });

  it("an SMS body that would not fit one segment is an outcome with a row, not a thrown run", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.loadReminderData.mockResolvedValue(
      row({ patientEmail: null, locationName: "Clinica ".repeat(30).trim() }),
    );
    const out = await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    expect(out).toMatchObject({ dispatched: false, reason: "body_refused" });
    expect(allSent()).toEqual([]);
    expect(h.ledger).toEqual([
      expect.objectContaining({ channel: "sms", suppressionReason: "body_refused" }),
    ]);
  });
});

/* ==================================================================== */
/* 7. STILL GATED BY THE REGISTRY AND BY REMINDERS_LIVE_SEND             */
/* ==================================================================== */

describe("the two gates the email is NOT exempt from", () => {
  beforeEach(() => {
    process.env.BOOK_CONFIRM_MODE = "on";
    h.realGate = true;
  });

  it("the template is registered, approved, an email, and on the reminders live-send flag", () => {
    expect(webRegistry.get(BOOKING_APPROVED_EMAIL_TEMPLATE_ID)).toMatchObject({
      channel: "email",
      audience: "patient",
      triggerEvent: "appointment/scheduled",
      liveSendFlag: "REMINDERS_LIVE_SEND",
      approved: true,
      approvedBy: "owner and strategy, dispatch S-1003-B",
      approvedAt: "2026-10-03",
    });
    // The fallback is the existing approved SMS, under its existing id.
    expect(BOOKING_APPROVED_SMS_TEMPLATE_ID).toBe("confirmation.sms");
    expect(webRegistry.get("confirmation.sms")?.approved).toBe(true);
  });

  it("with REMINDERS_LIVE_SEND off, the REAL gate suppresses the email and the ledger says sandbox", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    h.loadReminderData.mockResolvedValue(row());
    const out = await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    expect(out).toMatchObject({ dispatched: true, channels: [{ channel: "email", sandbox: true }] });
    expect(h.ledger).toEqual([
      expect.objectContaining({
        channel: "email",
        templateId: "booking_approved.email",
        outcome: "suppressed",
        suppressionReason: "live_send_disabled",
        providerMessageId: null,
      }),
    ]);
  });

  it("and that suppressed approval still counts as the one message: approving again sends nothing more", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    h.loadReminderData.mockResolvedValue(row());
    await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    expect(await dispatchConfirmation(TENANT, APPT, ACCEPTED)).toEqual({
      dispatched: false,
      reason: "already_sent",
    });
  });

  it("with REMINDERS_LIVE_SEND off, the REAL gate suppresses the SMS fallback too", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    h.loadReminderData.mockResolvedValue(row({ patientEmail: null }));
    const out = await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    expect(out).toMatchObject({ dispatched: true, channels: [{ channel: "sms", sandbox: true }] });
    expect(h.ledger).toEqual([
      expect.objectContaining({
        channel: "sms",
        outcome: "suppressed",
        suppressionReason: "live_send_disabled",
      }),
    ]);
  });
});

/* ==================================================================== */
/* 8. EVERY CONFIRMATION ATTEMPT LEAVES A LEDGER ROW, ON BOTH PATHS      */
/* ==================================================================== */

/**
 * Until BOOK-CONFIRM `dispatchConfirmation` wrote nothing to
 * `reminder_dispatches` except a refused SMS. A confirmation that went out, one
 * a gate held back, and an email the provider refused all left no row, so "did
 * the confirmation go out for this approval" could not be answered from data.
 *
 * TODAY'S PATH (no marker, or the switch does not apply) is exercised here. The
 * booking-approved path's rows are asserted with its behaviour, above.
 */
describe("today's confirmation leaves a ledger row for every outcome", () => {
  const rows = () => h.ledger.map((r) => [r.channel, r.templateId, r.outcome, r.suppressionReason ?? null]);

  it("SENT on both channels: one row each, with the provider id and the SMS length", async () => {
    h.loadReminderData.mockResolvedValue(row());
    await dispatchConfirmation(TENANT, APPT);
    expect(h.ledger).toEqual([
      expect.objectContaining({
        channel: "email",
        templateId: "confirmation.email",
        outcome: "sent",
        suppressionReason: null,
        providerMessageId: "test-email-1",
      }),
      expect.objectContaining({
        channel: "sms",
        templateId: "confirmation.sms",
        outcome: "sent",
        suppressionReason: null,
        providerMessageId: "test-sms-1",
        bodyLength: h.sms[0]!.body.length,
      }),
    ]);
  });

  it("only the channel that was TRIED gets a row", async () => {
    h.loadReminderData.mockResolvedValue(row({ patientEmail: null }));
    await dispatchConfirmation(TENANT, APPT);
    expect(rows()).toEqual([["sms", "confirmation.sms", "sent", null]]);
  });

  /* ---- a gate returns before any channel is tried ---- */

  it.each([
    ["status", { status: "cancelled" }],
    ["origin", { origin: "staff" }],
    ["unconfirmed", { status: "scheduled" }],
    ["no_contact", { patientEmail: null, patientPhone: null }],
    ["channels_off", { patientReminderEmailEnabled: false, patientReminderSmsEnabled: false }],
  ] as const)("gate %s: nothing is sent and ONE row says why", async (reason, over) => {
    h.loadReminderData.mockResolvedValue(row(over));
    expect(await dispatchConfirmation(TENANT, APPT)).toEqual({ dispatched: false, reason });
    expect(allSent()).toEqual([]);
    expect(rows()).toEqual([["email", "confirmation.email", "suppressed", reason]]);
  });

  it("gate not_found: one row, under today's id", async () => {
    h.loadReminderData.mockResolvedValue(null);
    await dispatchConfirmation(TENANT, APPT);
    expect(rows()).toEqual([["email", "confirmation.email", "suppressed", "not_found"]]);
  });

  it("gate patient_deleted: one row", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    h.loadReminderData.mockResolvedValue(row({ patientDeletedAt: new Date() }));
    await dispatchConfirmation(TENANT, APPT);
    expect(rows()).toEqual([["email", "confirmation.email", "suppressed", "patient_deleted"]]);
  });

  it("gate patient_deleted for an ACCEPTANCE under the switch: filed under the booking-approved id", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.BOOK_CONFIRM_MODE = "on";
    h.loadReminderData.mockResolvedValue(row({ patientDeletedAt: new Date() }));
    await dispatchConfirmation(TENANT, APPT, ACCEPTED);
    expect(rows()).toEqual([["email", "booking_approved.email", "suppressed", "patient_deleted"]]);
  });

  it("gate patient_deleted for a RESCHEDULE under the switch: filed under today's id, the marker decides", async () => {
    // Found by the mutation sweep: without this arm, dropping the marker from
    // the decision left every test green.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.BOOK_CONFIRM_MODE = "on";
    h.loadReminderData.mockResolvedValue(row({ patientDeletedAt: new Date() }));
    await dispatchConfirmation(TENANT, APPT);
    expect(rows()).toEqual([["email", "confirmation.email", "suppressed", "patient_deleted"]]);
  });

  /* ---- the transport held the message back ---- */

  it("live send OFF, through the REAL gate: both channels record live_send_disabled", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    h.realGate = true;
    h.loadReminderData.mockResolvedValue(row());
    const out = await dispatchConfirmation(TENANT, APPT);
    expect(out.dispatched).toBe(true);
    expect(rows()).toEqual([
      ["email", "confirmation.email", "suppressed", "live_send_disabled"],
      ["sms", "confirmation.sms", "suppressed", "live_send_disabled"],
    ]);
    expect(h.ledger.every((r) => (r.providerMessageId ?? null) === null)).toBe(true);
  });

  it.each(["template_unapproved", "missing_provider_config", "invalid_recipient"] as const)(
    "the gate's %s reaches the row as itself, not as a generic word",
    async (reason) => {
      const clients = await import("./clients");
      h.simulatedReason = reason;
      vi.mocked(clients.sendEmail).mockResolvedValueOnce({
        channel: "email",
        sandbox: true,
        id: "sandbox:email",
      });
      vi.mocked(clients.sendSms).mockResolvedValueOnce({
        channel: "sms",
        sandbox: true,
        id: "sandbox:sms",
      });
      h.loadReminderData.mockResolvedValue(row());
      await dispatchConfirmation(TENANT, APPT);
      expect(rows()).toEqual([
        ["email", "confirmation.email", "suppressed", reason],
        ["sms", "confirmation.sms", "suppressed", reason],
      ]);
    },
  );

  it("a held-back result that names no reason is recorded as sandbox, the reminder rows' word", async () => {
    const clients = await import("./clients");
    vi.mocked(clients.sendEmail).mockResolvedValueOnce({ channel: "email", sandbox: true, id: "sandbox:email" });
    h.loadReminderData.mockResolvedValue(row({ patientPhone: null }));
    await dispatchConfirmation(TENANT, APPT);
    expect(rows()).toEqual([["email", "confirmation.email", "suppressed", "sandbox"]]);
  });

  it.each([
    ["landline", "+351 272 000 123"],
    ["invalid_phone", "12"],
  ])("an SMS that never reaches the provider records %s", async (reason, patientPhone) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    h.loadReminderData.mockResolvedValue(row({ patientEmail: null, patientPhone }));
    const out = await dispatchConfirmation(TENANT, APPT);
    expect(out).toEqual({ dispatched: true, channels: [] });
    expect(rows()).toEqual([["sms", "confirmation.sms", "suppressed", reason]]);
  });

  /* ---- a refusal, and a throw before any send ---- */

  it("a REFUSED email leaves a provider_error row with the reason class, and still fails the run", async () => {
    const clients = await import("./clients");
    vi.mocked(clients.sendEmail).mockRejectedValueOnce(
      new clients.ProviderSendError("email", "validation_error", "reminders/email: Resend send failed"),
    );
    h.loadReminderData.mockResolvedValue(row());
    await expect(dispatchConfirmation(TENANT, APPT)).rejects.toThrow(/Resend send failed/);
    expect(h.ledger).toEqual([
      expect.objectContaining({
        channel: "email",
        templateId: "confirmation.email",
        outcome: "provider_error",
        providerErrorCode: "validation_error",
      }),
    ]);
    // The SMS was never reached, exactly as before: the throw stops the run.
    expect(h.sms).toEqual([]);
  });

  it.each(["REMINDERS_LINK_SECRET", "REMINDERS_RESCHEDULE_BASE_URL"] as const)(
    "%s unset: the context throws BEFORE either send, the run fails, and a row says so",
    async (name) => {
      delete process.env[name];
      h.loadReminderData.mockResolvedValue(row());
      await expect(dispatchConfirmation(TENANT, APPT)).rejects.toThrow(name);
      expect(allSent()).toEqual([]);
      expect(rows()).toEqual([["email", "confirmation.email", "suppressed", "reschedule_link_error"]]);
    },
  );

  it("the booking-approved message signs no link, so the same missing variables cannot stop it", async () => {
    process.env.BOOK_CONFIRM_MODE = "on";
    delete process.env.REMINDERS_LINK_SECRET;
    delete process.env.REMINDERS_RESCHEDULE_BASE_URL;
    h.loadReminderData.mockResolvedValue(row());
    expect(await dispatchConfirmation(TENANT, APPT, ACCEPTED)).toMatchObject({ dispatched: true });
    expect(h.email.map((m) => m.templateId)).toEqual(["booking_approved.email"]);
  });
});
