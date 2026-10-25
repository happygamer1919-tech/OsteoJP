/**
 * sms-sender-refusal-alert.test.ts - Q-L (strategy, 2026-10-18): the
 * confirmation, booking approved, follow-up and no-show SMS raise the same
 * alert the reminder raises (Q-C) when Twilio refuses our sender (21606) or
 * our message body (21617), after the `provider_error` row is written. Q-U
 * (strategy, 2026-10-25) adds the survey SMS.
 *
 * For each of the five senders:
 *   - 21606 and 21617: the transport is called, the `provider_error` row is
 *     written, THEN one alert is raised, with the fixed title, the code and
 *     the channel and nothing else, and the provider's own error goes on
 *     unchanged;
 *   - CONTROL, another code (21211, the patient's number; 20429, too many
 *     requests): the same row and the same error, and no alert.
 *
 * WHAT IS REPLACED. The row the dispatch reads (./data), the two transports
 * (./clients), the ledger (./dispatch-ledger), the survey's issue door
 * (@/lib/surveys/survey-store, which always answers "issued") and Sentry. Each records what
 * it was given, in one ordered list. Everything the dispatch decides is the
 * real code. Every name, number and address below is invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  loadReminderData: vi.fn(),
  /** Everything that happened, in order. */
  events: [] as string[],
  /** The error the SMS transport throws next. */
  smsThrows: null as unknown,
  /** Every alert raised, as the replaced Sentry received it. */
  alerts: [] as { title: string; context: unknown }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("./data", () => ({
  loadReminderData: h.loadReminderData,
  isGuestLinkedAppointment: vi.fn(async () => false),
}));
vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn((title: string, context: unknown) => {
    h.alerts.push({ title, context });
    h.events.push("alert");
  }),
}));
vi.mock("./dispatch-ledger", () => ({
  HANDED_OVER_WHILE_LIVE_SEND_OFF: "live_send_disabled",
  hasBookingApprovedHandOver: vi.fn(async () => false),
  recordBookingApprovedHandOver: vi.fn(async () => {}),
  recordDispatch: vi.fn(async (row: { templateId: string; outcome: string; providerErrorCode?: string | null }) => {
    h.events.push(
      `ledger:${row.templateId}:${row.outcome}${row.outcome === "provider_error" ? `:${row.providerErrorCode ?? "no-code"}` : ""}`,
    );
  }),
}));
// The survey's database door. It answers "issued", so the survey reaches its SMS.
vi.mock("@/lib/surveys/survey-store", () => ({
  issueSurveyAutomatic: vi.fn(async () => "issued"),
}));
// THE TRANSPORT IS REPLACED, NOT WRAPPED: nothing here can reach a provider.
vi.mock("./clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clients")>();
  return {
    ...actual,
    sendEmail: vi.fn(async () => {
      h.events.push("send:email");
      return { channel: "email" as const, sandbox: false, id: "test-email" };
    }),
    sendSms: vi.fn(async () => {
      h.events.push("send:sms");
      if (h.smsThrows) throw h.smsThrows;
      return { channel: "sms" as const, sandbox: false, id: "test-sms" };
    }),
  };
});

import { dispatchConfirmation, dispatchFollowUp, dispatchNoShow, dispatchSurvey } from "./dispatch";

const TENANT_ID = "22222222-2222-4222-8222-222222222222";
const APPOINTMENT_ID = "11111111-1111-4111-8111-111111111111";
const PATIENT_ID = "33333333-3333-4333-8333-333333333333";
const STARTS_AT = new Date(Date.UTC(2031, 4, 14, 13, 30, 0));
const ALERT_TITLE = "reminders/dispatch: the provider refused our sender or our message body";

/** An SMS-only patient: no email, so every sender's one message is its SMS. */
function fixture(over: Record<string, unknown> = {}) {
  return {
    appointmentId: APPOINTMENT_ID,
    startsAt: STARTS_AT,
    status: "confirmed",
    origin: "patient_portal",
    confirmationState: "pending",
    patientId: PATIENT_ID,
    patientName: "Paciente Ficticio",
    patientEmail: null,
    patientPhone: "+351 912 345 678",
    patientReminderSmsEnabled: true,
    patientReminderEmailEnabled: true,
    patientDeletedAt: null,
    patientHasAcceptedTerms: false,
    practitionerName: "Terapeuta Ficticio",
    locationName: "Clinica Ficticia",
    locationPhone: "+351 210 000 000",
    locationAddress: "Rua Ficticia 1, 0000-000 Lugar",
    serviceName: "Osteopatia",
    tenantSettings: { locale: "pt", contacts: { phone: "+351 210 000 000" } },
    ...over,
  };
}

type Sender = {
  name: string;
  templateId: string;
  row: Record<string, unknown>;
  env: Record<string, string>;
  run: () => Promise<unknown>;
};

const SENDERS: Sender[] = [
  {
    name: "the confirmation",
    templateId: "confirmation.sms",
    row: {},
    env: {},
    run: () => dispatchConfirmation(TENANT_ID, APPOINTMENT_ID),
  },
  {
    name: "the booking approved message",
    templateId: "booking_approved.sms",
    row: {},
    env: { BOOK_CONFIRM_MODE: "on" },
    run: () => dispatchConfirmation(TENANT_ID, APPOINTMENT_ID, { acceptedPedido: true }),
  },
  {
    name: "the follow-up",
    templateId: "follow_up.sms",
    row: { status: "completed" },
    env: {},
    run: () => dispatchFollowUp(TENANT_ID, APPOINTMENT_ID),
  },
  {
    name: "the no-show message",
    templateId: "no_show.sms",
    row: { status: "no_show" },
    env: {},
    run: () => dispatchNoShow(TENANT_ID, APPOINTMENT_ID),
  },
  {
    // Q-U. The switch on, a concluded visit and no email: the survey goes by SMS.
    name: "the survey",
    templateId: "survey.sms",
    row: { status: "completed" },
    env: { SURVEY_SEND_MODE: "on" },
    run: () => dispatchSurvey(TENANT_ID, APPOINTMENT_ID),
  },
];

const ENV_KEYS = [
  "BOOK_CONFIRM_MODE",
  "BOOK_CONFIRM_CANARY_PATIENT_IDS",
  "SURVEY_SEND_MODE",
  "SURVEY_CANARY_PATIENT_IDS",
  "REMINDERS_LINK_SECRET",
  "REMINDERS_RESCHEDULE_BASE_URL",
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.REMINDERS_LINK_SECRET = "test-only-link-secret-not-prod";
  process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://app.invalid";
  h.loadReminderData.mockReset();
  h.events.length = 0;
  h.alerts.length = 0;
  h.smsThrows = null;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

function arrange(sender: Sender, code: string) {
  for (const [k, v] of Object.entries(sender.env)) process.env[k] = v;
  h.loadReminderData.mockResolvedValue(fixture(sender.row));
  // The error carries patient-looking text on purpose: none of it may reach the alert.
  const refusal = Object.assign(new Error("refused +351912345678 Paciente Ficticio"), { code: Number(code) });
  h.smsThrows = refusal;
  return refusal;
}

describe.each(SENDERS)("Q-L: $name SMS", (sender) => {
  it("CONTROL: with no refusal it sends one SMS and raises nothing", async () => {
    for (const [k, v] of Object.entries(sender.env)) process.env[k] = v;
    h.loadReminderData.mockResolvedValue(fixture(sender.row));
    await sender.run();
    expect(h.events.filter((e) => e.startsWith("send:"))).toEqual(["send:sms"]);
    expect(h.alerts).toEqual([]);
  });

  it.each(["21606", "21617"])(
    "Twilio %s (our sender or our body): the row, THEN one alert of code and channel only, and the error goes on",
    async (code) => {
      const refusal = arrange(sender, code);
      await expect(sender.run()).rejects.toBe(refusal);
      expect(h.events).toEqual(["send:sms", `ledger:${sender.templateId}:provider_error:${code}`, "alert"]);
      expect(h.alerts).toEqual([{ title: ALERT_TITLE, context: { level: "warning", tags: { code, channel: "sms" } } }]);
      const reported = JSON.stringify(h.alerts);
      for (const absent of [TENANT_ID, APPOINTMENT_ID, PATIENT_ID, "912", "Paciente", "refused +351", sender.templateId]) {
        expect(reported).not.toContain(absent);
      }
    },
  );

  it.each(["21211", "20429"])("CONTROL, Twilio %s (not ours): the same row and the same error, and no alert", async (code) => {
    const refusal = arrange(sender, code);
    await expect(sender.run()).rejects.toBe(refusal);
    expect(h.events).toEqual(["send:sms", `ledger:${sender.templateId}:provider_error:${code}`]);
    expect(h.alerts).toEqual([]);
  });
});
