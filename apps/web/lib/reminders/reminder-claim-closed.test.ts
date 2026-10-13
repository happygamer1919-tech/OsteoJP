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
 *   7. THE CLOCK OF THE SEND. Too late, and a visit that has begun, are judged
 *      on the dispatcher's own clock at the moment it sends, and once more at
 *      the transport's door. The clock a caller hands in decides "too early"
 *      and nothing else, and "taken ahead" is granted only for the start the
 *      dispatcher loaded.
 *
 * THE CLOCK. The arms of 7 move the system's clock (`Date` only; no timer is
 * replaced), because the dispatcher reads it and takes it from nobody. Every
 * other arm runs at the real time of day against a visit years ahead.
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
  /** Run by the config read: after the claim and the first reading of the clock, before any transport. */
  duringTheGates: null as null | (() => void),
  /** Run as the confirm code is issued: the last row written before the SMS transport. */
  asTheCodeIsIssued: null as null | (() => void),
}));

vi.mock("server-only", () => ({}));
vi.mock("./data", () => ({ loadReminderData: h.loadReminderData }));
vi.mock("./reminder-claim", async (importOriginal) => ({
  // The two pure pieces the dispatcher's rules of time read: the real ones.
  EARLY_CLAIM_MS: (await importOriginal<typeof import("./reminder-claim")>()).EARLY_CLAIM_MS,
  reminderMark: (await importOriginal<typeof import("./reminder-claim")>()).reminderMark,
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
      h.duringTheGates?.();
      return actual.parseTenantConfig(settings);
    },
  };
});
// The confirm code's two writes. Reached only by the arms that turn the link on.
vi.mock("./confirm-code-store", () => ({
  issueConfirmCode: vi.fn(async (args: { code: string }) => {
    h.events.push("code:issued");
    h.asTheCodeIsIssued?.();
    return { code: args.code, codeHash: "test-code-hash" };
  }),
  withdrawConfirmCode: vi.fn(async (args: { codeHash: string }) => {
    h.events.push(`code:withdrawn:${args.codeHash}`);
    return true;
  }),
}));
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
  REMINDER_LATE_LIMIT_MS,
  claimIsGivenUpAfterThrow,
  dispatchReminder,
  reminderIsTakenAhead,
  reminderIsTooLate,
  reminderRefusedByTheClock,
  reminderWasHandedOver,
} from "./dispatch";

const TENANT_ID = "22222222-2222-2222-2222-222222222222";
const APPOINTMENT_ID = "11111111-1111-1111-1111-111111111111";
const PATIENT_ID = "33333333-3333-3333-3333-333333333333";
const STARTS_AT = new Date("2031-05-14T10:00:00.000Z");
const CLAIM_ID = "44444444-4444-4444-4444-444444444444";
const RELEASE = `release:${CLAIM_ID}`;
const MIN = 60_000;
const HOUR = 60 * MIN;
/** The reminder's time for each offset, and a clock five minutes after it. */
const MARK = { "24h": new Date(STARTS_AT.getTime() - 24 * HOUR), "48h": new Date(STARTS_AT.getTime() - 48 * HOUR) };
const justAfter = (offset: "24h" | "48h") => ({ now: new Date(MARK[offset].getTime() + 5 * MIN) });

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
  "REMINDERS_CONFIRM_CODE_SECRET",
  "REMINDERS_FEE_NOTICE_ENABLED",
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
  h.duringTheGates = null;
  h.asTheCodeIsIssued = null;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Set the clock the dispatcher reads when it sends. `Date` only: every timer stays real. */
function theSendClockReads(at: Date) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at);
}

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
    await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "sweep", justAfter("24h"));
    expect(h.closedClaims).toEqual([
      { tenantId: TENANT_ID, appointmentId: APPOINTMENT_ID, offsetId: "24h", channel: "sms", startsAt: STARTS_AT, taker: "sweep", ...justAfter("24h") },
    ]);
    expect(h.events).not.toContain("claim:today");
    expect(h.events[0]).toBe("claim:closed");
  });

  it("send: the sleeping job is closed too, and names itself", async () => {
    setSwitch("send");
    h.loadReminderData.mockResolvedValue(fixture());
    await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "run", justAfter("24h"));
    expect(h.closedClaims[0]).toMatchObject({ taker: "run" });
  });

  it("send: an appointment the tenant cannot see takes no claim of either kind", async () => {
    setSwitch("send");
    h.loadReminderData.mockResolvedValue(null);
    expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "sweep", justAfter("24h"))).toEqual({ dispatched: false, reason: "not_found" });
    expect(h.events).toEqual(["ledger:reminder.24h.sms:suppressed:not_found"]);
  });
});

describe("while the sweep is the sender", () => {
  beforeEach(() => setSwitch("send"));

  it("FAIL CLOSED: a claim that cannot be read or written stops the send and leaves nothing", async () => {
    const boom = Object.assign(new Error("claim store"), { name: "ReminderClaimStoreError" });
    h.closedAnswer = boom;
    h.loadReminderData.mockResolvedValue(fixture());
    await expect(dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "sweep", justAfter("24h"))).rejects.toBe(boom);
    expect(h.events).toEqual(["claim:closed"]);
  });

  it("HELD: nothing is sent and nothing is written", async () => {
    h.closedAnswer = { held: true };
    h.loadReminderData.mockResolvedValue(fixture());
    expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "sweep", justAfter("24h"))).toEqual({ dispatched: false, reason: "claim_held" });
    expect(h.events).toEqual(["claim:closed"]);
  });

  it.each([
    ["24h", "sms"],
    ["48h", "email"],
  ] as const)("the %s %s handed to the provider KEEPS its claim: no release", async (offset, channel) => {
    h.loadReminderData.mockResolvedValue(fixture());
    const outcome = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, offset, channel, "sweep", justAfter(offset));
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
      await dispatchReminder(TENANT_ID, APPOINTMENT_ID, e.offset, e.channel, "sweep", justAfter(e.offset));
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
    const outcome = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "sweep", justAfter("24h"));
    expect(outcome).toMatchObject({ dispatched: true });
    expect(h.events).toEqual(["claim:closed", "send:sms", "ledger:reminder.24h.sms:suppressed:sandbox", RELEASE]);
  });

  it("A THROW BEFORE ANY TRANSPORT gives the claim up, and the same error goes on", async () => {
    const boom = new Error("config unreadable");
    h.throwBeforeHandOver = boom;
    h.loadReminderData.mockResolvedValue(fixture());
    await expect(dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "sweep", justAfter("24h"))).rejects.toBe(boom);
    expect(h.events).toEqual(["claim:closed", RELEASE]);
  });

  describe("A THROW FROM THE TRANSPORT: the provider's answer decides", () => {
    it.each(CLAIM_RELEASING_PROVIDER_CODES.sms)("SMS, Twilio code %s (refused outright): given up, and the error goes on", async (code) => {
      const refusal = Object.assign(new Error("refused"), { code: Number(code) });
      h.transport = { throws: refusal };
      h.loadReminderData.mockResolvedValue(fixture());
      await expect(dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "sweep", justAfter("24h"))).rejects.toBe(refusal);
      expect(h.events).toEqual(["claim:closed", "send:sms", `ledger:reminder.24h.sms:provider_error:${code}`, RELEASE]);
    });

    it.each(CLAIM_RELEASING_PROVIDER_CODES.email)("email, Resend name %s (not accepted): given up, and the error goes on", async (name) => {
      const refusal = new ProviderSendError("email", name, `reminders/email: Resend send failed (${name})`);
      h.transport = { throws: refusal };
      h.loadReminderData.mockResolvedValue(fixture());
      await expect(dispatchReminder(TENANT_ID, APPOINTMENT_ID, "48h", "email", "sweep", justAfter("48h"))).rejects.toBe(refusal);
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
      await expect(dispatchReminder(TENANT_ID, APPOINTMENT_ID, offset, channel, "sweep", justAfter(offset))).rejects.toBe(thrown);
      expect(h.events).toEqual(["claim:closed", `send:${channel}`, `ledger:reminder.${offset}.${channel}:provider_error:${code}`]);
    });
  });
});

/**
 * THE RULES OF TIME, which exist only while the sweep is the sender.
 * Owner, answer 8a: an SMS may go up to 3 hours late and an email up to 12;
 * later it is recorded as too late and not sent. And no reminder is sent for a
 * visit that has begun.
 *
 * TWO CLOCKS. `caller` is the clock a pass hands in: the instant it selected.
 * `theSendClockReads` sets the one the dispatcher reads for itself. In every
 * arm of "too late" the caller's clock says FIVE MINUTES AFTER THE MARK, as a
 * pass's stored clock does however long ago it selected.
 */
describe("while the sweep is the sender: the clock of the send, too late, begun, and not due", () => {
  beforeEach(() => setSwitch("send"));

  /** The caller's clock, `ms` after the reminder's time. */
  const caller = (offset: "24h" | "48h", ms: number) => ({ now: new Date(MARK[offset].getTime() + ms) });
  const after = (offset: "24h" | "48h", ms: number) => new Date(MARK[offset].getTime() + ms);

  it.each([
    ["24h", "sms", 0],
    ["24h", "sms", 3 * HOUR - 1],
    // Exactly the limit is not too late.
    ["24h", "sms", 3 * HOUR],
    ["48h", "email", 3 * HOUR + 1],
    ["48h", "email", 12 * HOUR],
  ] as const)("the %s %s, sent %d ms after its time: still sent, and its claim is kept", async (offset, channel, ms) => {
    h.loadReminderData.mockResolvedValue(fixture());
    theSendClockReads(after(offset, ms));
    expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, offset, channel, "sweep", justAfter(offset))).toMatchObject({ dispatched: true });
    expect(h.events).toEqual(["claim:closed", `send:${channel}`, `ledger:reminder.${offset}.${channel}:sent:`]);
  });

  it.each([
    ["24h", "sms", 3 * HOUR + 1],
    ["24h", "sms", 4 * HOUR],
    ["24h", "sms", 23 * HOUR],
    ["48h", "email", 12 * HOUR + 1],
    ["48h", "email", 40 * HOUR],
  ] as const)(
    "A SEND STEP THAT RUNS LATE: the pass selected the %s %s five minutes after its time and the send comes %d ms after it. TOO LATE, not sent, claim KEPT",
    async (offset, channel, ms) => {
      h.loadReminderData.mockResolvedValue(fixture());
      theSendClockReads(after(offset, ms));
      // The pass's clock still says five minutes late. It is not asked.
      expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, offset, channel, "sweep", justAfter(offset))).toEqual({
        dispatched: false,
        reason: "mark_missed",
      });
      // The claim, then the ledger row. No transport, and NO release.
      expect(h.events).toEqual(["claim:closed", `ledger:reminder.${offset}.${channel}:suppressed:mark_missed`]);
    },
  );

  it("the caller's clock cannot make a reminder late either: it says 40 hours late, the send clock says five minutes, and it is sent", async () => {
    h.loadReminderData.mockResolvedValue(fixture());
    theSendClockReads(after("24h", 5 * MIN));
    expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "sweep", caller("24h", 40 * HOUR))).toMatchObject({ dispatched: true });
    expect(h.events).toEqual(["claim:closed", "send:sms", "ledger:reminder.24h.sms:sent:"]);
  });

  describe("THE FLOOR: no reminder for a visit that has begun", () => {
    it.each([
      ["48h", "email", 0],
      ["48h", "email", MIN],
      ["24h", "sms", 0],
      ["24h", "sms", 5 * 24 * HOUR],
    ] as const)("the %s %s, with the send %d ms after the START: `start_passed`, not sent, claim KEPT", async (offset, channel, ms) => {
      h.loadReminderData.mockResolvedValue(fixture());
      theSendClockReads(new Date(STARTS_AT.getTime() + ms));
      expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, offset, channel, "sweep", justAfter(offset))).toEqual({
        dispatched: false,
        reason: "start_passed",
      });
      expect(h.events).toEqual(["claim:closed", `ledger:reminder.${offset}.${channel}:suppressed:start_passed`]);
    });

    it("one millisecond before the start it is the late rule that refuses, so the floor is a rule of its own", async () => {
      h.loadReminderData.mockResolvedValue(fixture());
      theSendClockReads(new Date(STARTS_AT.getTime() - 1));
      expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "sweep", justAfter("24h"))).toMatchObject({ reason: "mark_missed" });
    });

    it("the rule itself: the start first, at or before the clock, whatever the mark and the channel allow", () => {
      const start = STARTS_AT;
      const at = (ms: number) => new Date(start.getTime() + ms);
      // An offset this build does not know has no mark: the floor still holds.
      expect(reminderRefusedByTheClock({ startsAt: start, mark: null, channel: "sms", now: at(0) })).toBe("start_passed");
      expect(reminderRefusedByTheClock({ startsAt: start, mark: null, channel: "sms", now: at(-1) })).toBeNull();
      // A mark that is not late at all (it never is, for a real offset) does not lift it.
      expect(reminderRefusedByTheClock({ startsAt: start, mark: at(-MIN), channel: "email", now: at(0) })).toBe("start_passed");
      expect(reminderRefusedByTheClock({ startsAt: start, mark: at(-MIN), channel: "email", now: at(-1) })).toBeNull();
      // Before the start, the late rule: its own word.
      expect(reminderRefusedByTheClock({ startsAt: start, mark: MARK["24h"], channel: "sms", now: after("24h", 3 * HOUR + 1) })).toBe("mark_missed");
      expect(reminderRefusedByTheClock({ startsAt: start, mark: MARK["24h"], channel: "sms", now: after("24h", 3 * HOUR) })).toBeNull();
    });
  });

  describe("THE REAL REASON: what a person did is recorded, not the clock", () => {
    it.each([
      ["a cancelled visit", "status", { status: "cancelled" }],
      ["a visit that is over", "status", { status: "completed" }],
      ["a deleted patient", "patient_deleted", { patientDeletedAt: new Date("2031-01-01T00:00:00.000Z") }],
    ] as const)("%s that is also too late reads `%s`, once, and its claim is KEPT: not `mark_missed`, and not tried again every hour", async (_name, reason, over) => {
      h.loadReminderData.mockResolvedValue(fixture(over));
      theSendClockReads(after("24h", 4 * HOUR));
      expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "run")).toEqual({ dispatched: false, reason });
      expect(h.events).toEqual(["claim:closed", `ledger:reminder.24h.sms:suppressed:${reason}`]);
    });

    it("a cancelled visit that has ALSO begun reads `status`", async () => {
      h.loadReminderData.mockResolvedValue(fixture({ status: "cancelled" }));
      theSendClockReads(new Date(STARTS_AT.getTime() + HOUR));
      expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "run")).toEqual({ dispatched: false, reason: "status" });
      expect(h.events).toEqual(["claim:closed", "ledger:reminder.24h.sms:suppressed:status"]);
    });

    it("CONTROL: the same cancelled visit IN TIME is held back as ever, and its claim is given up", async () => {
      h.loadReminderData.mockResolvedValue(fixture({ status: "cancelled" }));
      theSendClockReads(after("24h", HOUR));
      expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "run")).toEqual({ dispatched: false, reason: "status" });
      expect(h.events).toEqual(["claim:closed", RELEASE, "ledger:reminder.24h.sms:suppressed:status"]);
    });

    it("every other gate that would hold it back does not hide the clock: an unaccepted request past the limit reads too late", async () => {
      h.loadReminderData.mockResolvedValue(fixture({ status: "scheduled", origin: "patient_portal" }));
      theSendClockReads(after("24h", 4 * HOUR));
      expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "sweep", justAfter("24h"))).toEqual({
        dispatched: false,
        reason: "mark_missed",
      });
      expect(h.events).toEqual(["claim:closed", "ledger:reminder.24h.sms:suppressed:mark_missed"]);
    });
  });

  describe("AT THE TRANSPORT'S DOOR: the clock is asked once more, as the last thing before the hand-over", () => {
    /** In time when the claim is taken; one millisecond over the limit by the time the gates are through. */
    const lateDuringTheGates = (offset: "24h" | "48h", channel: "sms" | "email") => {
      theSendClockReads(after(offset, REMINDER_LATE_LIMIT_MS[channel] - MIN));
      return () => vi.setSystemTime(after(offset, REMINDER_LATE_LIMIT_MS[channel] + 1));
    };

    it.each([
      ["24h", "sms"],
      ["48h", "email"],
    ] as const)("the %s %s runs out of time between its claim and its transport: not sent, recorded too late, claim KEPT", async (offset, channel) => {
      h.loadReminderData.mockResolvedValue(fixture());
      h.duringTheGates = lateDuringTheGates(offset, channel);
      expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, offset, channel, "sweep", justAfter(offset))).toEqual({
        dispatched: false,
        reason: "mark_missed",
      });
      expect(h.events).toEqual(["claim:closed", `ledger:reminder.${offset}.${channel}:suppressed:mark_missed`]);
    });

    it.each([
      ["24h", "sms"],
      ["48h", "email"],
    ] as const)("CONTROL: the %s %s whose gates take no time is sent", async (offset, channel) => {
      h.loadReminderData.mockResolvedValue(fixture());
      theSendClockReads(after(offset, REMINDER_LATE_LIMIT_MS[channel] - MIN));
      h.duringTheGates = () => {};
      expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, offset, channel, "sweep", justAfter(offset))).toMatchObject({ dispatched: true });
      expect(h.events).toEqual(["claim:closed", `send:${channel}`, `ledger:reminder.${offset}.${channel}:sent:`]);
    });

    it("the visit begins while the confirm code is being written: no SMS, the code is withdrawn, claim KEPT", async () => {
      process.env.REMINDERS_CONFIRM_LINK_ENABLED = "true";
      process.env.REMINDERS_CONFIRM_CODE_SECRET = "test-only-confirm-secret-not-prod";
      // A visit whose 24 hour SMS is two hours late, with the code's write taking it past the limit.
      h.loadReminderData.mockResolvedValue(fixture());
      theSendClockReads(after("24h", 2 * HOUR));
      h.asTheCodeIsIssued = () => vi.setSystemTime(after("24h", 3 * HOUR + 1));
      expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "sweep", justAfter("24h"))).toEqual({
        dispatched: false,
        reason: "mark_missed",
      });
      expect(h.events).toEqual([
        "claim:closed",
        "code:issued",
        "code:withdrawn:test-code-hash",
        "ledger:reminder.24h.sms:suppressed:mark_missed",
      ]);
    });

    it("CONTROL: with the code written in no time the SMS goes, and the code stays", async () => {
      process.env.REMINDERS_CONFIRM_LINK_ENABLED = "true";
      process.env.REMINDERS_CONFIRM_CODE_SECRET = "test-only-confirm-secret-not-prod";
      h.loadReminderData.mockResolvedValue(fixture());
      theSendClockReads(after("24h", 2 * HOUR));
      expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "sweep", justAfter("24h"))).toMatchObject({ dispatched: true });
      expect(h.events).toEqual(["claim:closed", "code:issued", "send:sms", "ledger:reminder.24h.sms:sent:"]);
    });
  });

  it("a reminder already sent is HELD, not too late: the late rule never writes a second row for it", async () => {
    h.closedAnswer = { held: true };
    h.loadReminderData.mockResolvedValue(fixture());
    theSendClockReads(after("24h", 10 * HOUR));
    expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "sweep", justAfter("24h"))).toEqual({
      dispatched: false,
      reason: "claim_held",
    });
    expect(h.events).toEqual(["claim:closed"]);
  });

  it.each([
    ["sweep", 10 * MIN + 1],
    ["run", 10 * MIN + 1],
    ["run", 3 * 24 * HOUR],
  ] as const)("NOT DUE: the %s asks %d ms before the reminder's time. No claim, nothing sent, and the answer says when it is due", async (taker, ms) => {
    h.loadReminderData.mockResolvedValue(fixture());
    expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", taker, caller("24h", -ms))).toEqual({
      dispatched: false,
      reason: "not_due",
      dueAt: MARK["24h"].toISOString(),
    });
    // No claim of either kind was asked for; the row is the wrapper's.
    expect(h.events).toEqual(["ledger:reminder.24h.sms:suppressed:not_due"]);
  });

  it("exactly ten minutes before its time is not `not due`", async () => {
    h.loadReminderData.mockResolvedValue(fixture());
    expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "run", caller("24h", -10 * MIN))).toMatchObject({ dispatched: true });
  });

  describe("TAKEN AHEAD is granted for the start the dispatcher loaded, and only to the day's last pass", () => {
    // May 2031, summer time: Lisbon is one hour ahead of UTC. The last pass runs at 21:45 and takes marks before 23:00.
    const LAST_PASS = new Date("2031-05-13T20:45:00.000Z");
    const LIMIT = new Date("2031-05-13T22:00:00.000Z");
    /** A visit whose 24 hour mark is `at`. */
    const withMarkAt = (at: Date) => fixture({ startsAt: new Date(at.getTime() + 24 * HOUR) });
    const ask = (now: Date) => dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "sweep", { now, takenAhead: true });

    it("the day's last pass takes a mark 45 minutes ahead: it says so, is let through, and the claim is told", async () => {
      h.loadReminderData.mockResolvedValue(withMarkAt(new Date(LAST_PASS.getTime() + 45 * MIN)));
      expect(await ask(LAST_PASS)).toMatchObject({ dispatched: true });
      expect(h.closedClaims[0]).toMatchObject({ takenAhead: true, now: LAST_PASS });
      // Without the word, the same call is not due.
      h.events.length = 0;
      expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "sweep", { now: LAST_PASS })).toMatchObject({ reason: "not_due" });
    });

    it.each([
      ["two days", 2 * 24 * HOUR],
      ["two hours, past the pass's limit", 2 * HOUR],
    ] as const)("A VISIT MOVED LATER SINCE THE PASS SELECTED IT, by %s: not due, no claim, nothing sent, whatever the pass said", async (_by, ms) => {
      // The pass selected a mark 45 minutes ahead. The start it loads now is later.
      const movedMark = new Date(LAST_PASS.getTime() + 45 * MIN + ms);
      h.loadReminderData.mockResolvedValue(withMarkAt(movedMark));
      expect(await ask(LAST_PASS)).toEqual({ dispatched: false, reason: "not_due", dueAt: movedMark.toISOString() });
      expect(h.events).toEqual(["ledger:reminder.24h.sms:suppressed:not_due"]);
      expect(h.closedClaims).toEqual([]);
    });

    it("a mark due at 23:00 exactly is the morning's, as in the selection; one millisecond before it is taken", async () => {
      h.loadReminderData.mockResolvedValue(withMarkAt(LIMIT));
      expect(await ask(LAST_PASS)).toMatchObject({ reason: "not_due" });
      h.loadReminderData.mockResolvedValue(withMarkAt(new Date(LIMIT.getTime() - 1)));
      expect(await ask(LAST_PASS)).toMatchObject({ dispatched: true });
    });

    it("no other pass may take a mark ahead: at 10:15 Lisbon the word buys nothing", async () => {
      const morning = new Date("2031-05-13T09:15:00.000Z");
      h.loadReminderData.mockResolvedValue(withMarkAt(new Date(morning.getTime() + 45 * MIN)));
      expect(await ask(morning)).toMatchObject({ reason: "not_due" });
      expect(h.closedClaims).toEqual([]);
    });

    it("a visit moved EARLIER since, so that its mark is already due, is sent", async () => {
      h.loadReminderData.mockResolvedValue(withMarkAt(new Date(LAST_PASS.getTime() - 5 * MIN)));
      expect(await ask(LAST_PASS)).toMatchObject({ dispatched: true });
    });

    it("the rule itself", () => {
      expect(reminderIsTakenAhead(new Date(LIMIT.getTime() - 1), LAST_PASS)).toBe(true);
      expect(reminderIsTakenAhead(LIMIT, LAST_PASS)).toBe(false);
      expect(reminderIsTakenAhead(new Date(LAST_PASS.getTime() + MIN), new Date(LAST_PASS.getTime() - MIN))).toBe(false);
    });
  });

  it("a sleeping job that hands no clock is measured against the real one", async () => {
    // A start ten days from the real now: its 24 hour mark is nine days away.
    h.loadReminderData.mockResolvedValue(fixture({ startsAt: new Date(Date.now() + 10 * 24 * HOUR) }));
    expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms")).toMatchObject({ reason: "not_due" });
    // A start an hour from the real now: its 24 hour mark was 23 hours ago.
    h.loadReminderData.mockResolvedValue(fixture({ startsAt: new Date(Date.now() + HOUR) }));
    expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms")).toMatchObject({ reason: "mark_missed" });
    // A start a minute before the real now: the visit has begun.
    h.loadReminderData.mockResolvedValue(fixture({ startsAt: new Date(Date.now() - MIN) }));
    expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms")).toMatchObject({ reason: "start_passed" });
  });

  it.each([undefined, "", "SEND", "send ", "true"])(
    "REMINDERS_SWEEP_MODE=%j: NO rule of time exists. A reminder days late, one days early, and one for a visit that has begun are all sent, as today",
    async (value) => {
      setSwitch(value);
      h.loadReminderData.mockResolvedValue(fixture());
      // By the caller's clock, and by the system's own: neither is asked.
      for (const ms of [40 * HOUR, -3 * 24 * HOUR]) {
        h.events.length = 0;
        expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "run", caller("24h", ms))).toMatchObject({ dispatched: true });
        expect(h.events).toEqual(["claim:today", "send:sms", "ledger:reminder.24h.sms:sent:"]);
      }
      for (const at of [after("24h", 40 * HOUR), after("24h", -3 * 24 * HOUR), new Date(STARTS_AT.getTime() + HOUR)]) {
        h.events.length = 0;
        theSendClockReads(at);
        expect(await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "run", { takenAhead: true })).toMatchObject({ dispatched: true });
        expect(h.events).toEqual(["claim:today", "send:sms", "ledger:reminder.24h.sms:sent:"]);
      }
    },
  );

  it("THE LIMITS ARE PINNED: 3 hours for an SMS, 12 for an email", () => {
    expect(REMINDER_LATE_LIMIT_MS).toEqual({ sms: 3 * HOUR, email: 12 * HOUR });
    const mark = MARK["24h"];
    expect(reminderIsTooLate(mark, "sms", new Date(mark.getTime() + 3 * HOUR))).toBe(false);
    expect(reminderIsTooLate(mark, "sms", new Date(mark.getTime() + 3 * HOUR + 1))).toBe(true);
    expect(reminderIsTooLate(mark, "email", new Date(mark.getTime() + 3 * HOUR + 1))).toBe(false);
    expect(reminderIsTooLate(mark, "email", new Date(mark.getTime() + 12 * HOUR + 1))).toBe(true);
    expect(reminderIsTooLate(mark, "sms", new Date(mark.getTime() - HOUR))).toBe(false);
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
