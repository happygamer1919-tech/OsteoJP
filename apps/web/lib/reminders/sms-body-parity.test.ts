/**
 * THE OWNER'S DELIVERY TEST AND THE REAL 24h REMINDER SEND THE SAME BYTES.
 *
 * ==========================================================================
 * WHY THIS IS ASSERTED ON THE TWO REAL ENTRY POINTS AND NOT ON THE BUILDER
 * ==========================================================================
 * `renderReminderSmsBody` is one function, so a test that calls it twice and
 * finds the same answer proves nothing about either caller - it is criterion F
 * of ACC-vacuous-guard-sweep exactly: a guard that proves a test RAN without
 * proving it tested the right SUBJECT. So this drives `sendMessagingCheck` and
 * `dispatchReminder` themselves, with the same appointment facts and the same
 * sender, and compares the bodies each one actually handed to the transport.
 *
 * The two are supposed to be the same message. The page exists so the owner can
 * see, on a handset, what the patient will receive; a page that has drifted from
 * the pipeline is worse than no page, because it reports a body nobody gets.
 *
 * ==========================================================================
 * AND IT PINS THE THREE NUMBERS FROM THE 2026-09-02 P0
 * ==========================================================================
 * 185 = 136 + 49. The 136 is the approved 24h pt body (99) plus the confirm
 * link line (37, LF included). The 49 is a reply instruction that must not be
 * there while the sender is an alphanumeric id, which cannot receive a reply.
 * The equality on 136 is written as an equality rather than as `<= 160` on
 * purpose: a bound would have stayed green through the whole defect.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const FIXED_CODE = "Ab3-Xy_9";

const h = vi.hoisted(() => ({
  loadReminderData: vi.fn(),
  /** Every body handed to the transport, by whichever path put it there. */
  sent: [] as string[],
  /** Every issue attempt. The COUNT is the mint-after-render assertion. */
  issued: [] as { tenantId: string; appointmentId: string; code?: string }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("./data", () => ({ loadReminderData: h.loadReminderData }));

// The DB seam for both paths. `issueConfirmCode` records the attempt and mints
// the code it was handed, which is what lets the two bodies carry the same one.
vi.mock("./confirm-code-store", () => ({
  issueConfirmCode: async (args: { tenantId: string; appointmentId: string; code?: string }) => {
    h.issued.push(args);
    return { code: args.code ?? FIXED_CODE, codeHash: "0".repeat(64) };
  },
  withdrawConfirmCode: async () => true,
}));

// The audit insert messaging-check writes. Nothing here is under test.
vi.mock("@osteojp/db", () => ({
  auditLog: {},
  getDbAdmin: () => ({ insert: () => ({ values: async () => undefined }) }),
}));

// The transport, WRAPPED rather than replaced: the real gate still runs (live
// send is off, so it suppresses), and the body is recorded on the way in.
vi.mock("./clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clients")>();
  return {
    ...actual,
    sendSms: vi.fn(async (m: Parameters<typeof actual.sendSms>[0]) => {
      h.sent.push(m.body);
      return actual.sendSms(m);
    }),
  };
});

// ONE FIXED CODE, so "byte-identical" can be asserted as an equality instead of
// with the eight random characters masked out. Everything else in the module -
// the flag, the secret, the host, the line copy - stays real.
vi.mock("./confirm-code", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./confirm-code")>();
  return { ...actual, generateConfirmCode: () => FIXED_CODE };
});

import { dispatchReminder } from "./dispatch";
import { sendMessagingCheck } from "./messaging-check";
import { senderCanReceiveReplies } from "./reply-capability";
import { REMINDER_CONFIRM_INSTRUCTION } from "./reminder-copy";
import { CONFIRM_CODE_SECRET_VAR, CONFIRM_LINK_FLAG } from "./confirm-code";

const TENANT_ID = "22222222-2222-2222-2222-222222222222";
const APPOINTMENT_ID = "11111111-1111-1111-1111-111111111111";

/**
 * THE SAME APPOINTMENT THE DELIVERY TEST DESCRIBES, as a row.
 *
 * `sampleContext()` in messaging-check.ts is 23/05 at 14:30 in Castelo Branco
 * on +351 210 000 000 - the longest real clinic name, deliberately, so the page
 * measures the worst case. These values are chosen to make
 * `buildReminderContext` produce that same context from a real appointment:
 * 2027-05-23T13:30Z is 14:30 Lisbon wall-clock in May (WEST, UTC+1).
 */
const STARTS_AT = new Date("2027-05-23T13:30:00Z");

function fixture() {
  return {
    appointmentId: APPOINTMENT_ID,
    startsAt: STARTS_AT,
    status: "confirmed",
    patientId: "33333333-3333-3333-3333-333333333333",
    patientName: "Madalena Sousa",
    patientEmail: null,
    patientPhone: "+351 912 345 678",
    patientReminderSmsEnabled: true,
    patientReminderEmailEnabled: true,
    patientHasAcceptedTerms: false,
    origin: "staff",
    practitionerName: "Dr. João Pereira",
    locationName: "Castelo Branco",
    locationPhone: "+351 210 000 000",
    tenantSettings: { locale: "pt", contacts: { phone: "+351 210 000 000" }, reminders: undefined },
  };
}

const ENV_KEYS = [
  "REMINDERS_LIVE_SEND",
  "REMINDERS_LINK_SECRET",
  "REMINDERS_RESCHEDULE_BASE_URL",
  "TWILIO_SMS_FROM",
  "TWILIO_MESSAGING_SERVICE_SID",
  "REMINDERS_REPLY_CAPABLE",
  CONFIRM_LINK_FLAG,
  CONFIRM_CODE_SECRET_VAR,
];
const saved: Record<string, string | undefined> = {};

/** Drive both real entry points and hand back the body each one produced. */
async function bothPaths() {
  h.sent.length = 0;
  h.issued.length = 0;
  h.loadReminderData.mockResolvedValue(fixture());

  const dispatched = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms");
  const reminderBody = h.sent.at(-1);

  const check = await sendMessagingCheck({
    tenantId: TENANT_ID,
    actorUserId: "44444444-4444-4444-4444-444444444444",
    phone: "+351912345678",
    appointmentId: APPOINTMENT_ID,
    ip: null,
  });
  const checkBody = h.sent.length > 1 ? h.sent.at(-1) : undefined;

  return { dispatched, check, reminderBody, checkBody };
}

describe("the delivery test and the 24h reminder render the same body", () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    // Live send OFF: the gate suppresses at the transport, which is what makes
    // this a render test. The body still reaches the wrapper above.
    process.env.REMINDERS_LINK_SECRET = "test-only-link-secret-not-prod";
    process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://app.osteojp.pt";
    process.env[CONFIRM_LINK_FLAG] = "true";
    process.env[CONFIRM_CODE_SECRET_VAR] = "test-only-confirm-secret";
    // THE LIVE SENDER. `OsteoJP` is a PT alphanumeric sender id: one-way.
    process.env.TWILIO_SMS_FROM = "OsteoJP";
    h.sent.length = 0;
    h.issued.length = 0;
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    h.loadReminderData.mockReset();
  });

  it("BYTE-IDENTICAL, for the same appointment and the same sender", async () => {
    const { reminderBody, checkBody } = await bothPaths();
    expect(reminderBody).toBeDefined();
    expect(checkBody).toBeDefined();
    expect(checkBody).toBe(reminderBody);
  });

  it("IS 136 CHARACTERS - an equality, not a bound", async () => {
    // 99 (the approved 24h pt body, worst-case clinic name) + 37 (the confirm
    // link line and its LF). A `<= 160` assertion would have stayed green
    // through the entire 2026-09-02 defect, which is why this is `toBe`.
    const { reminderBody, checkBody } = await bothPaths();
    expect(reminderBody).toHaveLength(136);
    expect(checkBody).toHaveLength(136);
  });

  it("CARRIES NO REPLY LINE while the sender is alphanumeric, on BOTH paths", async () => {
    // The sender cannot receive a reply, so asking for one is asking a question
    // the patient cannot answer - and the failure is silent at their end: they
    // type SIM, believe they confirmed, and the agenda still reads `agendada`.
    expect(senderCanReceiveReplies({ TWILIO_SMS_FROM: "OsteoJP" })).toBe(false);
    const { reminderBody, checkBody } = await bothPaths();
    for (const body of [reminderBody, checkBody]) {
      expect(body).not.toContain(REMINDER_CONFIRM_INSTRUCTION.pt);
      expect(body).not.toContain("Responda");
    }
  });

  it("carries the confirm link, so 136 is the body WITH the thing under test", async () => {
    const { reminderBody, checkBody } = await bothPaths();
    expect(reminderBody).toContain(`Confirmar: app.osteojp.pt/c/${FIXED_CODE}`);
    expect(checkBody).toContain(`Confirmar: app.osteojp.pt/c/${FIXED_CODE}`);
  });
});

/**
 * THE OTHER ARM, WHICH IS THE 2026-09-02 EVENT ITSELF.
 *
 * An E.164 sender arms the reply instruction, the body becomes 185, and the
 * single-segment rule refuses it. What must be true after INC-CONFIRM-07:
 * neither path throws, neither path sends, and NEITHER PATH WRITES A CODE.
 */
describe("with a replyable sender the body is 185 and both paths refuse", () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    process.env.REMINDERS_LINK_SECRET = "test-only-link-secret-not-prod";
    process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://app.osteojp.pt";
    process.env[CONFIRM_LINK_FLAG] = "true";
    process.env[CONFIRM_CODE_SECRET_VAR] = "test-only-confirm-secret";
    // A REAL NUMBER: it can receive replies, so the instruction is true and the
    // renderer appends it. This is the environment the P0 was reported from.
    process.env.TWILIO_SMS_FROM = "+351912345678";
    h.sent.length = 0;
    h.issued.length = 0;
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    h.loadReminderData.mockReset();
  });

  it("136 + 49 = 185, and that is the arithmetic the refusal reports", () => {
    expect(REMINDER_CONFIRM_INSTRUCTION.pt).toHaveLength(48);
    expect(136 + 1 + REMINDER_CONFIRM_INSTRUCTION.pt.length).toBe(185);
  });

  it("the reminder path returns body_refused instead of throwing", async () => {
    const { dispatched } = await bothPaths();
    expect(dispatched).toEqual({
      dispatched: false,
      reason: "body_refused",
      detail: expect.stringContaining("185 chars"),
    });
  });

  it("the page returns body_refused instead of 500ing", async () => {
    const { check } = await bothPaths();
    expect(check.ok).toBe(false);
    if (check.ok) throw new Error("unreachable");
    expect(check.reason).toBe("body_refused");
    expect(check.detail).toContain("185 chars");
  });

  it("NO CODE IS MINTED BY EITHER PATH, which is the whole reorder", async () => {
    // The mint used to happen first: a refusal then left a live code that
    // 0072's partial unique index would let block the next attempt from minting
    // a fresh one, and the retry sent the shorter body with no link.
    await bothPaths();
    expect(h.issued).toEqual([]);
  });

  it("NOTHING IS SENT BY EITHER PATH", async () => {
    await bothPaths();
    expect(h.sent).toEqual([]);
  });

  it("NEGATIVE CONTROL: the same sender DOES arm the reply instruction", async () => {
    // Proves the four assertions above are detecting the refusal rather than a
    // path that never rendered a link at all.
    expect(senderCanReceiveReplies({ TWILIO_SMS_FROM: "+351912345678" })).toBe(true);
  });
});
