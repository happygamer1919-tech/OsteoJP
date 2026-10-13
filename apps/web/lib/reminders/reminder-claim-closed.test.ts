/**
 * reminder-claim-closed.test.ts - SWEEP-47: what the dispatcher does with the
 * claim WHILE THE SWEEP IS THE SENDER, and the proof that none of it runs
 * while the send switch is off.
 *
 * The claim module is replaced by one that answers what the test tells it to,
 * as in reminder-claim-dispatch.test.ts. Six properties:
 *
 *   1. THE SWITCH DECIDES WHICH CLAIM IS ASKED. Off, unset, or any near-miss
 *      of `send`: the claim of today, and the closed one is never called. On:
 *      the closed one, and today's is never called.
 *   2. FAIL CLOSED. A closed claim that throws stops everything: no send, no
 *      ledger row, no release, and the same error goes on.
 *   3. HELD STOPS EVERYTHING, as today.
 *   4. A MESSAGE HANDED OVER KEEPS ITS CLAIM. No release: it is final.
 *   5. NOTHING HANDED OVER GIVES THE CLAIM UP. Every gate that holds a
 *      reminder back, a number that cannot take an SMS and a message the gate
 *      kept in the sandbox each leave exactly one release, and the outcome and
 *      the ledger row are the ones the dispatcher always produced.
 *   6. A THROW gives the claim up before any transport was called and after a
 *      provider answer that is on the pinned list, and KEEPS it after any
 *      other answer, because the message may have gone out.
 *
 * WHAT THIS FILE CANNOT SHOW: which rows make the closed claim answer held,
 * and that two senders at once produce one send. Both need the lock and the
 * table: reminder-claim-closed.db.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  loadReminderData: vi.fn(),
  /** Everything that happened, in order. */
  events: [] as string[],
  closedClaims: [] as Record<string, unknown>[],
  /** What the closed claim does next: an answer, or an error to throw. */
  closedAnswer: { held: false, claimId: "44444444-4444-4444-4444-444444444444" } as unknown,
  /** What a transport does next. */
  transport: "sent" as "sent" | "sandbox" | { throws: unknown },
  /** Thrown once by the config read, before any transport. */
  throwBeforeHandOver: null as null | Error,
}));

vi.mock("server-only", () => ({}));
vi.mock("./data", () => ({ loadReminderData: h.loadReminderData }));
vi.mock("./reminder-claim", () => ({
  takeReminderClaim: vi.fn(async () => {
    h.events.push("claim:today");
    return { held: false, claimId: "55555555-5555-5555-5555-555555555555" };
  }),
  takeReminderClaimClosed: vi.fn(async (args: Record<string, unknown>) => {
    h.closedClaims.push(args);
    h.events.push("claim:closed");
    if (h.closedAnswer instanceof Error) throw h.closedAnswer;
    return h.closedAnswer;
  }),
  releaseReminderClaim: vi.fn(async (args: Record<string, unknown>) => {
    h.events.push(`release:${String(args.claimId)}`);
  }),
}));
vi.mock("./dispatch-ledger", () => ({
  HANDED_OVER_WHILE_LIVE_SEND_OFF: "live_send_disabled",
  hasBookingApprovedHandOver: vi.fn(async () => false),
  recordBookingApprovedHandOver: vi.fn(async () => {}),
  recordDispatch: vi.fn(
    async (row: { outcome: string; suppressionReason?: string | null; templateId: string; providerErrorCode?: string | null }) => {
      h.events.push(
        `ledger:${row.templateId}:${row.outcome}:${row.suppressionReason ?? ""}${row.outcome === "provider_error" ? (row.providerErrorCode ?? "no-code") : ""}`,
      );
    },
  ),
}));
vi.mock("@/lib/admin/settings-config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/settings-config")>();
  return {
    ...actual,
    parseTenantConfig: (settings: unknown) => {
      if (h.throwBeforeHandOver) throw h.throwBeforeHandOver;
      return actual.parseTenantConfig(settings);
    },
  };
});
// THE TRANSPORT IS REPLACED, NOT WRAPPED: nothing here can reach a provider.
vi.mock("./clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clients")>();
  const transport = (channel: "sms" | "email") =>
    vi.fn(async () => {
      h.events.push(`send:${channel}`);
      if (typeof h.transport === "object") throw h.transport.throws;
      return { channel, sandbox: h.transport === "sandbox", id: `test-${channel}` };
    });
  return { ...actual, sendEmail: transport("email"), sendSms: transport("sms") };
});

import { ProviderSendError } from "./clients";
import {
  CLAIM_RELEASING_PROVIDER_CODES,
  claimIsGivenUpAfterThrow,
  dispatchReminder,
  reminderWasHandedOver,
} from "./dispatch";

const TENANT_ID = "22222222-2222-2222-2222-222222222222";
const APPOINTMENT_ID = "11111111-1111-1111-1111-111111111111";
const PATIENT_ID = "33333333-3333-3333-3333-333333333333";
const STARTS_AT = new Date("2031-05-14T10:00:00.000Z");
const CLAIM_ID = "44444444-4444-4444-4444-444444444444";
const RELEASE = `release:${CLAIM_ID}`;

function fixture(over: Record<string, unknown> = {}) {
  return {
    appointmentId: APPOINTMENT_ID,
    startsAt: STARTS_AT,
    status: "confirmed",
    origin: "staff",
    confirmationState: "pending",
    patientId: PATIENT_ID,
    patientName: "Paciente Ficticio",
    patientEmail: "paciente.ficticio@example.pt",
    patientPhone: "+351 912 345 678",
    patientReminderSmsEnabled: true,
    patientReminderEmailEnabled: true,
    patientDeletedAt: null,
    patientHasAcceptedTerms: false,
    practitionerName: "Terapeuta Ficticio",
    locationName: "Clinica Ficticia",
    locationPhone: "+351 210 000 000",
    locationAddress: null,
    serviceName: null,
    tenantSettings: { locale: "pt", contacts: { phone: "+351 210 000 000" } },
    ...over,
  };
}

/** Every value of the switch that is not `send`. `undefined` is the variable unset. */
const SWITCH_OFF = [undefined, "", "shadow", "SEND", "Send", " send", "send ", "send\n", "true", "1", "on"];

const ENV_KEYS = [
  "REMINDERS_SWEEP_MODE",
  "REMINDERS_LIVE_SEND",
  "REMINDERS_LINK_SECRET",
  "REMINDERS_RESCHEDULE_BASE_URL",
  "REMINDERS_CONFIRM_LINK_ENABLED",
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
  h.closedClaims.length = 0;
  h.closedAnswer = { held: false, claimId: CLAIM_ID };
  h.transport = "sent";
  h.throwBeforeHandOver = null;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

function setSwitch(value: string | undefined) {
  if (value === undefined) delete process.env.REMINDERS_SWEEP_MODE;
  else process.env.REMINDERS_SWEEP_MODE = value;
}

describe("the send switch decides which claim the dispatcher asks", () => {
  it.each(SWITCH_OFF)("REMINDERS_SWEEP_MODE=%j: the claim of today, and the closed one is never reached", async (value) => {
    setSwitch(value);
    h.loadReminderData.mockResolvedValue(fixture());
    const outcome = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms");
    expect(outcome).toMatchObject({ dispatched: true });
    // Exactly what the dispatcher did before this change, in this order, and
    // no release: with the switch off a send that handed nothing over leaves
    // its claim alone, as it always did.
    expect(h.events).toEqual(["claim:today", "send:sms", "ledger:reminder.24h.sms:sent:"]);
    expect(h.closedClaims).toEqual([]);
  });

  it.each(SWITCH_OFF)("REMINDERS_SWEEP_MODE=%j: a reminder held back leaves no release, as today", async (value) => {
    setSwitch(value);
    h.loadReminderData.mockResolvedValue(fixture({ status: "cancelled" }));
    expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms")).toEqual({ dispatched: false, reason: "status" });
    expect(h.events).toEqual(["claim:today", "ledger:reminder.24h.sms:suppressed:status"]);
  });

  it("send: the closed claim, keyed as today's is, and today's is never reached", async () => {
    setSwitch("send");
    h.loadReminderData.mockResolvedValue(fixture());
    await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "sweep");
    expect(h.closedClaims).toEqual([
      { tenantId: TENANT_ID, appointmentId: APPOINTMENT_ID, offsetId: "24h", channel: "sms", startsAt: STARTS_AT, taker: "sweep" },
    ]);
    expect(h.events).not.toContain("claim:today");
    expect(h.events[0]).toBe("claim:closed");
  });

  it("send: the sleeping job is closed too, and names itself", async () => {
    setSwitch("send");
    h.loadReminderData.mockResolvedValue(fixture());
    await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms");
    expect(h.closedClaims[0]).toMatchObject({ taker: "run" });
  });

  it("send: an appointment the tenant cannot see takes no claim of either kind", async () => {
    setSwitch("send");
    h.loadReminderData.mockResolvedValue(null);
    expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "sweep")).toEqual({ dispatched: false, reason: "not_found" });
    expect(h.events).toEqual(["ledger:reminder.24h.sms:suppressed:not_found"]);
  });
});

describe("while the sweep is the sender", () => {
  beforeEach(() => setSwitch("send"));

  it("FAIL CLOSED: a claim that cannot be read or written stops the send and leaves nothing", async () => {
    const boom = Object.assign(new Error("claim store"), { name: "ReminderClaimStoreError" });
    h.closedAnswer = boom;
    h.loadReminderData.mockResolvedValue(fixture());
    await expect(dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "sweep")).rejects.toBe(boom);
    expect(h.events).toEqual(["claim:closed"]);
  });

  it("HELD: nothing is sent and nothing is written", async () => {
    h.closedAnswer = { held: true };
    h.loadReminderData.mockResolvedValue(fixture());
    expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "sweep")).toEqual({ dispatched: false, reason: "claim_held" });
    expect(h.events).toEqual(["claim:closed"]);
  });

  it.each([
    ["24h", "sms"],
    ["48h", "email"],
  ] as const)("the %s %s handed to the provider KEEPS its claim: no release", async (offset, channel) => {
    h.loadReminderData.mockResolvedValue(fixture());
    const outcome = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, offset, channel, "sweep");
    expect(outcome).toMatchObject({ dispatched: true });
    expect(h.events).toEqual(["claim:closed", `send:${channel}`, `ledger:reminder.${offset}.${channel}:sent:`]);
  });

  /** Every way a reminder is held back with nothing handed over. */
  const HELD_BACK: { name: string; data: ReturnType<typeof fixture>; offset: "24h" | "48h"; channel: "sms" | "email"; events: string[] }[] = [
    {
      name: "patient_deleted",
      data: fixture({ patientDeletedAt: new Date("2031-01-01T00:00:00.000Z") }),
      offset: "24h",
      channel: "sms",
      events: ["ledger:reminder.24h.sms:suppressed:patient_deleted"],
    },
    { name: "status", data: fixture({ status: "cancelled" }), offset: "24h", channel: "sms", events: ["ledger:reminder.24h.sms:suppressed:status"] },
    {
      name: "unconfirmed",
      data: fixture({ status: "scheduled", origin: "patient_portal" }),
      offset: "24h",
      channel: "sms",
      events: ["ledger:reminder.24h.sms:suppressed:unconfirmed"],
    },
    { name: "channel_not_for_offset", data: fixture(), offset: "48h", channel: "sms", events: ["ledger:reminder.48h.sms:suppressed:channel_not_for_offset"] },
    {
      name: "lead_time_off",
      data: fixture({ tenantSettings: { locale: "pt", reminders: { emailEnabled: true, smsEnabled: true, leadTimeHours: [48] } } }),
      offset: "24h",
      channel: "sms",
      events: ["ledger:reminder.24h.sms:suppressed:lead_time_off"],
    },
    {
      name: "no_contact",
      data: fixture({ patientEmail: null, patientPhone: null }),
      offset: "24h",
      channel: "sms",
      events: ["ledger:reminder.24h.sms:suppressed:no_contact"],
    },
    {
      name: "channels_off",
      data: fixture({ patientReminderSmsEnabled: false }),
      offset: "24h",
      channel: "sms",
      events: ["ledger:reminder.24h.sms:suppressed:channels_off"],
    },
    {
      name: "a number that is not a number (invalid_phone)",
      data: fixture({ patientPhone: "12" }),
      offset: "24h",
      channel: "sms",
      events: ["ledger:reminder.24h.sms:suppressed:invalid_phone"],
    },
    {
      name: "a landline",
      data: fixture({ patientPhone: "214 191 988" }),
      offset: "24h",
      channel: "sms",
      events: ["ledger:reminder.24h.sms:suppressed:landline"],
    },
  ];

  for (const e of HELD_BACK) {
    it(`HELD BACK, ${e.name}: the claim is given up, once, after the row the dispatcher always wrote`, async () => {
      h.loadReminderData.mockResolvedValue(e.data);
      await dispatchReminder(TENANT_ID, APPOINTMENT_ID, e.offset, e.channel, "sweep");
      const releases = h.events.filter((x) => x.startsWith("release:"));
      expect(releases).toEqual([RELEASE]);
      // No transport was reached, and the ledger row is the one of today.
      expect(h.events.filter((x) => x.startsWith("send:"))).toEqual([]);
      expect(h.events.filter((x) => x.startsWith("ledger:"))).toEqual(e.events);
      expect(h.events[0]).toBe("claim:closed");
    });
  }

  it("HELD BACK by the gate (sandbox, live send off): the transport was called, nothing left, the claim is given up", async () => {
    h.transport = "sandbox";
    h.loadReminderData.mockResolvedValue(fixture());
    const outcome = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "sweep");
    expect(outcome).toMatchObject({ dispatched: true });
    expect(h.events).toEqual(["claim:closed", "send:sms", "ledger:reminder.24h.sms:suppressed:sandbox", RELEASE]);
  });

  it("A THROW BEFORE ANY TRANSPORT gives the claim up, and the same error goes on", async () => {
    const boom = new Error("config unreadable");
    h.throwBeforeHandOver = boom;
    h.loadReminderData.mockResolvedValue(fixture());
    await expect(dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "sweep")).rejects.toBe(boom);
    expect(h.events).toEqual(["claim:closed", RELEASE]);
  });

  describe("A THROW FROM THE TRANSPORT: the provider's answer decides", () => {
    it.each(CLAIM_RELEASING_PROVIDER_CODES.sms)("SMS, Twilio code %s (refused outright): given up, and the error goes on", async (code) => {
      const refusal = Object.assign(new Error("refused"), { code: Number(code) });
      h.transport = { throws: refusal };
      h.loadReminderData.mockResolvedValue(fixture());
      await expect(dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "sweep")).rejects.toBe(refusal);
      expect(h.events).toEqual(["claim:closed", "send:sms", `ledger:reminder.24h.sms:provider_error:${code}`, RELEASE]);
    });

    it.each(CLAIM_RELEASING_PROVIDER_CODES.email)("email, Resend name %s (not accepted): given up, and the error goes on", async (name) => {
      const refusal = new ProviderSendError("email", name, `reminders/email: Resend send failed (${name})`);
      h.transport = { throws: refusal };
      h.loadReminderData.mockResolvedValue(fixture());
      await expect(dispatchReminder(TENANT_ID, APPOINTMENT_ID, "48h", "email", "sweep")).rejects.toBe(refusal);
      expect(h.events).toEqual(["claim:closed", "send:email", `ledger:reminder.48h.email:provider_error:${name}`, RELEASE]);
    });

    it.each([
      ["email", "48h", new ProviderSendError("email", "application_error", "unreadable answer"), "application_error"],
      ["email", "48h", new ProviderSendError("email", "internal_server_error", "5xx"), "internal_server_error"],
      ["email", "48h", new ProviderSendError("email", null, "no name"), "no-code"],
      ["email", "48h", new Error("socket hang up"), "no-code"],
      ["sms", "24h", Object.assign(new Error("server error"), { code: 20500 }), "20500"],
      ["sms", "24h", Object.assign(new Error("unlisted"), { code: 30003 }), "30003"],
      ["sms", "24h", new Error("ETIMEDOUT"), "no-code"],
      // An email name on the SMS channel is not on the SMS list.
      ["sms", "24h", Object.assign(new Error("wrong list"), { code: "rate_limit_exceeded" }), "rate_limit_exceeded"],
    ] as const)("%s %s, %o: an UNKNOWN outcome keeps the claim, so it is never sent again", async (channel, offset, thrown, code) => {
      h.transport = { throws: thrown };
      h.loadReminderData.mockResolvedValue(fixture());
      await expect(dispatchReminder(TENANT_ID, APPOINTMENT_ID, offset, channel, "sweep")).rejects.toBe(thrown);
      expect(h.events).toEqual(["claim:closed", `send:${channel}`, `ledger:reminder.${offset}.${channel}:provider_error:${code}`]);
    });
  });
});

describe("the two rules, on their own", () => {
  it("THE LISTS ARE PINNED: a name added or removed is a decision, and shows here", () => {
    expect(CLAIM_RELEASING_PROVIDER_CODES).toEqual({
      email: [
        "validation_error",
        "invalid_from_address",
        "missing_required_field",
        "rate_limit_exceeded",
        "daily_quota_exceeded",
        "monthly_quota_exceeded",
        "missing_api_key",
        "restricted_api_key",
        "invalid_api_key",
      ],
      sms: ["20003", "20429", "21211", "21408", "21610", "21611", "21614"],
    });
    // The one name the email list must never hold: an answer the SDK could not read.
    expect(CLAIM_RELEASING_PROVIDER_CODES.email).not.toContain("application_error");
  });

  it("claimIsGivenUpAfterThrow: before a hand-over yes; after it only for a listed answer of that channel", () => {
    expect(claimIsGivenUpAfterThrow({ handOverStarted: false })).toBe(true);
    expect(claimIsGivenUpAfterThrow({ handOverStarted: true })).toBe(false);
    expect(claimIsGivenUpAfterThrow({ handOverStarted: true, refusal: { channel: "sms", code: null } })).toBe(false);
    expect(claimIsGivenUpAfterThrow({ handOverStarted: true, refusal: { channel: "sms", code: "21211" } })).toBe(true);
    expect(claimIsGivenUpAfterThrow({ handOverStarted: true, refusal: { channel: "email", code: "21211" } })).toBe(false);
    expect(claimIsGivenUpAfterThrow({ handOverStarted: true, refusal: { channel: "email", code: "validation_error" } })).toBe(true);
    expect(claimIsGivenUpAfterThrow({ handOverStarted: true, refusal: { channel: "sms", code: "validation_error" } })).toBe(false);
    expect(claimIsGivenUpAfterThrow({ handOverStarted: true, refusal: { channel: "email", code: "application_error" } })).toBe(false);
  });

  it("reminderWasHandedOver: only a real hand-over counts", () => {
    expect(reminderWasHandedOver({ dispatched: false, reason: "status" })).toBe(false);
    expect(reminderWasHandedOver({ dispatched: true, channels: [] })).toBe(false);
    expect(reminderWasHandedOver({ dispatched: true, channels: [{ channel: "sms", sandbox: true, id: "x" }] })).toBe(false);
    expect(reminderWasHandedOver({ dispatched: true, channels: [{ channel: "sms", sandbox: false, id: "SM1" }] })).toBe(true);
  });
});
