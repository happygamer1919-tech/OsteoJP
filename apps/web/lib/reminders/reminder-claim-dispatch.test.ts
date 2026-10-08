/**
 * reminder-claim-dispatch.test.ts: where the dispatcher takes the claim, and
 * the proof that the claim is RECORD ONLY.
 *
 * Two properties, and the second is the one that matters to a patient:
 *
 *   1. One claim per call that found its appointment, whichever way the call
 *      ends, and none for `not_found`. Taken before any send.
 *   2. Nothing the dispatcher does depends on the claim. The claim module is
 *      replaced here by one that answers whatever the test tells it to, and for
 *      every way a call can end the outcome, the sends and the ledger rows are
 *      IDENTICAL whatever it answers. A dispatcher that started reading the
 *      claim's answer would fail the arm that makes it answer "held".
 *
 * WHAT THIS FILE CANNOT SHOW: how long a real claim may take. The stand-in
 * answers when it is told to. The dispatcher awaits the claim, so the bound on
 * that wait is the claim's own (reminder-claim.ts sets it in its transaction),
 * and it is proven where a lock can really be held: reminder-log.db.test.ts
 * puts another session on the reminder's lock and the dispatcher still answers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  loadReminderData: vi.fn(),
  /** Everything that happened, in order. */
  events: [] as string[],
  claims: [] as Record<string, unknown>[],
  /** What the stand-in claim resolves to. The real one resolves to nothing. */
  claimAnswer: undefined as unknown,
  /** How long the stand-in takes to answer. The default is at once. */
  claimDelayMs: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("./data", () => ({ loadReminderData: h.loadReminderData }));
vi.mock("./reminder-claim", () => ({
  takeReminderClaim: vi.fn(async (args: Record<string, unknown>) => {
    h.claims.push(args);
    h.events.push("claim");
    if (h.claimDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, h.claimDelayMs));
    h.events.push("claim:answered");
    return h.claimAnswer;
  }),
}));
vi.mock("./dispatch-ledger", () => ({
  HANDED_OVER_WHILE_LIVE_SEND_OFF: "live_send_disabled",
  hasBookingApprovedHandOver: vi.fn(async () => false),
  recordBookingApprovedHandOver: vi.fn(async () => {}),
  recordDispatch: vi.fn(async (row: { outcome: string; suppressionReason?: string | null; templateId: string }) => {
    h.events.push(`ledger:${row.templateId}:${row.outcome}:${row.suppressionReason ?? ""}`);
  }),
}));
// THE TRANSPORT IS REPLACED, NOT WRAPPED. Nothing in this file may reach a
// provider whatever the environment it runs in says about live send, so the
// two senders answer the shape the real gate answers when it holds a message
// back, and call nothing.
vi.mock("./clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clients")>();
  return {
    ...actual,
    sendEmail: vi.fn(async () => {
      h.events.push("send:email");
      return { channel: "email" as const, sandbox: true, id: "held-by-the-test" };
    }),
    sendSms: vi.fn(async () => {
      h.events.push("send:sms");
      return { channel: "sms" as const, sandbox: true, id: "held-by-the-test" };
    }),
  };
});

import { dispatchReminder } from "./dispatch";

const TENANT_ID = "22222222-2222-2222-2222-222222222222";
const APPOINTMENT_ID = "11111111-1111-1111-1111-111111111111";
const PATIENT_ID = "33333333-3333-3333-3333-333333333333";
const STARTS_AT = new Date("2031-05-14T10:00:00.000Z");

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

type Offset = "24h" | "48h";
type Chan = "sms" | "email";

/**
 * Every way `dispatchReminder` can end without a provider refusing, each with
 * the row the load hands back. `null` is an appointment the tenant cannot see.
 */
const ENDINGS: { name: string; data: ReturnType<typeof fixture> | null; offset: Offset; channel: Chan; claims: number }[] = [
  { name: "not_found", data: null, offset: "24h", channel: "sms", claims: 0 },
  { name: "patient_deleted", data: fixture({ patientDeletedAt: new Date("2031-01-01T00:00:00.000Z") }), offset: "24h", channel: "sms", claims: 1 },
  { name: "status", data: fixture({ status: "cancelled" }), offset: "24h", channel: "sms", claims: 1 },
  { name: "unconfirmed", data: fixture({ status: "scheduled", origin: "patient_portal" }), offset: "24h", channel: "sms", claims: 1 },
  { name: "channel_not_for_offset", data: fixture(), offset: "48h", channel: "sms", claims: 1 },
  {
    name: "lead_time_off",
    data: fixture({ tenantSettings: { locale: "pt", reminders: { emailEnabled: true, smsEnabled: true, leadTimeHours: [48] } } }),
    offset: "24h",
    channel: "sms",
    claims: 1,
  },
  { name: "no_contact", data: fixture({ patientEmail: null, patientPhone: null }), offset: "24h", channel: "sms", claims: 1 },
  { name: "channels_off", data: fixture({ patientReminderSmsEnabled: false }), offset: "24h", channel: "sms", claims: 1 },
  { name: "the 24h SMS is handed to the transport", data: fixture(), offset: "24h", channel: "sms", claims: 1 },
  { name: "the 48h email is handed to the transport", data: fixture(), offset: "48h", channel: "email", claims: 1 },
];

describe("dispatchReminder takes a reminder claim", () => {
  const ENV_KEYS = ["REMINDERS_LIVE_SEND", "REMINDERS_LINK_SECRET", "REMINDERS_RESCHEDULE_BASE_URL", "REMINDERS_CONFIRM_LINK_ENABLED"];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    // The link secret and base are set so the email body can be built.
    process.env.REMINDERS_LINK_SECRET = "test-only-link-secret-not-prod";
    process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://app.invalid";
    h.loadReminderData.mockReset();
    h.events.length = 0;
    h.claims.length = 0;
    h.claimAnswer = undefined;
    h.claimDelayMs = 0;
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.restoreAllMocks();
  });

  for (const e of ENDINGS) {
    it(`${e.name}: ${e.claims === 0 ? "NO claim, there is no row and no start" : "exactly one claim, before anything else"}`, async () => {
      h.loadReminderData.mockResolvedValue(e.data);
      await dispatchReminder(TENANT_ID, APPOINTMENT_ID, e.offset, e.channel);

      expect(h.claims).toHaveLength(e.claims);
      if (e.claims === 0) return;
      expect(h.claims[0]).toEqual({
        tenantId: TENANT_ID,
        appointmentId: APPOINTMENT_ID,
        offsetId: e.offset,
        channel: e.channel,
        // The start of the row as loaded: the claim is keyed on it.
        startsAt: STARTS_AT,
        // Today's only caller is the sleeping job, which names no taker.
        taker: "run",
      });
      // Before the send and before the ledger row, every time: taken first,
      // and answered before anything else happens.
      expect(h.events.slice(0, 2)).toEqual(["claim", "claim:answered"]);
      expect(h.events.filter((x) => x === "claim")).toHaveLength(1);
    });
  }

  it("NEGATIVE CONTROL: the endings above really do differ, and two of them reach the transport", async () => {
    const seen: string[] = [];
    for (const e of ENDINGS) {
      h.events.length = 0;
      h.loadReminderData.mockResolvedValue(e.data);
      const outcome = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, e.offset, e.channel);
      seen.push(outcome.dispatched ? `sent:${h.events.filter((x) => x.startsWith("send:")).join(",")}` : outcome.reason);
    }
    expect(seen).toEqual([
      "not_found",
      "patient_deleted",
      "status",
      "unconfirmed",
      "channel_not_for_offset",
      "lead_time_off",
      "no_contact",
      "channels_off",
      "sent:send:sms",
      "sent:send:email",
    ]);
  });

  it("the taker a caller names is the taker recorded", async () => {
    h.loadReminderData.mockResolvedValue(fixture());
    await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms", "sweep");
    expect(h.claims[0]).toMatchObject({ taker: "sweep" });
  });

  it("a provider refusal still leaves its claim: the claim is taken before the provider is called", async () => {
    const clients = await import("./clients");
    vi.mocked(clients.sendSms).mockImplementationOnce(async () => {
      h.events.push("send:sms");
      throw Object.assign(new Error("provider refused"), { code: 21211 });
    });
    h.loadReminderData.mockResolvedValue(fixture());
    await expect(dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms")).rejects.toThrow("provider refused");
    expect(h.events).toEqual(["claim", "claim:answered", "send:sms", "ledger:reminder.24h.sms:provider_error:"]);
  });

  /**
   * RECORD ONLY, AS AN EQUALITY. The real claim resolves to nothing. Here it is
   * made to resolve to each thing a blocking claim might one day say, and the
   * dispatcher must not notice: same outcome, same sends, same ledger rows, in
   * the same order.
   */
  describe("RECORD ONLY: whatever the claim answers, the dispatcher does the same thing", () => {
    const ANSWERS: unknown[] = [undefined, true, false, null, "claim_held", { held: true }, { dispatched: false, reason: "claim_held" }];

    async function run(e: (typeof ENDINGS)[number], answer: unknown) {
      h.events.length = 0;
      h.claims.length = 0;
      h.claimAnswer = answer;
      h.loadReminderData.mockResolvedValue(e.data);
      const outcome = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, e.offset, e.channel);
      return { outcome, events: [...h.events] };
    }

    for (const e of ENDINGS) {
      it(`${e.name}`, async () => {
        const baseline = await run(e, undefined);
        for (const answer of ANSWERS.slice(1)) {
          const again = await run(e, answer);
          expect(again, `claim answered ${JSON.stringify(answer)}`).toEqual(baseline);
        }
      });
    }

    it("NEGATIVE CONTROL: the baseline of a send is not empty, so the equality above compares something", async () => {
      const sms = await run(ENDINGS.find((e) => e.name.startsWith("the 24h SMS"))!, undefined);
      expect(sms.outcome).toMatchObject({ dispatched: true });
      expect(sms.events).toEqual(["claim", "claim:answered", "send:sms", "ledger:reminder.24h.sms:suppressed:sandbox"]);
      const status = await run(ENDINGS.find((e) => e.name === "status")!, undefined);
      expect(status.outcome).toEqual({ dispatched: false, reason: "status" });
      expect(status.events).toEqual(["claim", "claim:answered", "ledger:reminder.24h.sms:suppressed:status"]);
    });

    /**
     * A SLOW CLAIM. The stand-in takes its time before it answers. The
     * dispatcher waits for it (nothing is sent while the claim is still out)
     * and then does exactly what it does when the claim answers at once.
     */
    it("a claim that answers LATE: nothing is sent before it answers, and then every ending is the same", async () => {
      for (const e of ENDINGS) {
        h.claimDelayMs = 0;
        const baseline = await run(e, undefined);
        h.claimDelayMs = 25;
        const slow = await run(e, undefined);
        expect(slow, e.name).toEqual(baseline);
        if (e.claims === 1) {
          // `claim:answered` sits between the claim and whatever follows it.
          expect(slow.events.indexOf("claim:answered"), e.name).toBe(1);
        }
      }
    });
  });
});
