/**
 * reminder-claim-dispatch.test.ts: where the dispatcher takes the claim, and
 * the proof of the ONE thing the claim may change.
 *
 * The claim module is replaced here by one that answers whatever the test
 * tells it to. Four properties:
 *
 *   1. One claim is asked for per call that found its appointment, whichever
 *      way the call ends, and none for `not_found`. Asked before any send.
 *   2. NOT HELD CHANGES NOTHING. Whatever a not-held claim carries (an id, no
 *      id because it could not be written), the outcome, the sends and the
 *      ledger rows are IDENTICAL for every way a call can end.
 *   3. HELD STOPS EVERYTHING, AND LEAVES NOTHING. The outcome is `claim_held`:
 *      no send, no ledger row, no release. (The real claim answers `held` only
 *      for a reminder that was already sent.)
 *   4. EVERY THROW RELEASES. Whatever throws after the claim, the claim that
 *      was written is released and the SAME error goes on. A claim that was
 *      never written has nothing to release.
 *
 * WHAT THIS FILE CANNOT SHOW: which rows make a claim answer `held`, and how
 * long a real claim may take. The stand-in answers what and when it is told
 * to. Both are proven where there is a database: reminder-claim.db.test.ts
 * for the rows, reminder-log.db.test.ts for the wait (another session sits on
 * the reminder's lock and the dispatcher still answers).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  loadReminderData: vi.fn(),
  /** Everything that happened, in order. */
  events: [] as string[],
  claims: [] as Record<string, unknown>[],
  releases: [] as Record<string, unknown>[],
  /** What the stand-in claim resolves to. The default is the real one's usual answer. */
  claimAnswer: { held: false, claimId: "44444444-4444-4444-4444-444444444444" } as unknown,
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
  releaseReminderClaim: vi.fn(async (args: Record<string, unknown>) => {
    h.releases.push(args);
    h.events.push(`release:${String(args.claimId)}`);
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
const CLAIM_ID = "44444444-4444-4444-4444-444444444444";
const NOT_HELD = { held: false, claimId: CLAIM_ID };

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
    h.releases.length = 0;
    h.claimAnswer = NOT_HELD;
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

  /**
   * NOT HELD, AS AN EQUALITY. A not-held claim carries the id of its row, or
   * no id when it could not be written. The dispatcher must not notice the
   * difference: same outcome, same sends, same ledger rows, in the same order,
   * and no release, because nothing threw.
   */
  describe("NOT HELD: whatever the claim carries, the dispatcher does the same thing", () => {
    const ANSWERS: unknown[] = [
      NOT_HELD,
      { held: false, claimId: null },
      { held: false, claimId: "99999999-9999-9999-9999-999999999999" },
    ];

    async function run(e: (typeof ENDINGS)[number], answer: unknown) {
      h.events.length = 0;
      h.claims.length = 0;
      h.releases.length = 0;
      h.claimAnswer = answer;
      h.loadReminderData.mockResolvedValue(e.data);
      const outcome = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, e.offset, e.channel);
      return { outcome, events: [...h.events] };
    }

    for (const e of ENDINGS) {
      it(`${e.name}`, async () => {
        const baseline = await run(e, NOT_HELD);
        expect(baseline.events.filter((x) => x.startsWith("release:"))).toEqual([]);
        for (const answer of ANSWERS.slice(1)) {
          const again = await run(e, answer);
          expect(again, `claim answered ${JSON.stringify(answer)}`).toEqual(baseline);
        }
      });
    }

    it("NEGATIVE CONTROL: the baseline of a send is not empty, so the equality above compares something", async () => {
      const sms = await run(ENDINGS.find((e) => e.name.startsWith("the 24h SMS"))!, NOT_HELD);
      expect(sms.outcome).toMatchObject({ dispatched: true });
      expect(sms.events).toEqual(["claim", "claim:answered", "send:sms", "ledger:reminder.24h.sms:suppressed:sandbox"]);
      const status = await run(ENDINGS.find((e) => e.name === "status")!, NOT_HELD);
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
        const baseline = await run(e, NOT_HELD);
        h.claimDelayMs = 25;
        const slow = await run(e, NOT_HELD);
        expect(slow, e.name).toEqual(baseline);
        if (e.claims === 1) {
          // `claim:answered` sits between the claim and whatever follows it.
          expect(slow.events.indexOf("claim:answered"), e.name).toBe(1);
        }
      }
    });
  });

  /**
   * HELD. The one answer that stops a send. Whatever the loaded row says, a
   * visit that is fine or one a gate would have refused, the answer is
   * `claim_held` and NOTHING else happens: no send, no ledger row (the wrapper's
   * one exception), no release.
   */
  describe("HELD: nothing is sent, and nothing is written", () => {
    for (const e of ENDINGS.filter((x) => x.claims === 1)) {
      it(`${e.name}`, async () => {
        h.claimAnswer = { held: true };
        h.loadReminderData.mockResolvedValue(e.data);
        const outcome = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, e.offset, e.channel);
        expect(outcome).toEqual({ dispatched: false, reason: "claim_held" });
        expect(h.events).toEqual(["claim", "claim:answered"]);
      });
    }

    it("not_found is never held: no claim is asked for, and it keeps its own answer and its ledger row", async () => {
      h.claimAnswer = { held: true };
      h.loadReminderData.mockResolvedValue(null);
      const outcome = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms");
      expect(outcome).toEqual({ dispatched: false, reason: "not_found" });
      expect(h.events).toEqual(["ledger:reminder.24h.sms:suppressed:not_found"]);
    });

    it("NEGATIVE CONTROL: only `held: true` is held. A not-held answer on the same row sends", async () => {
      h.loadReminderData.mockResolvedValue(fixture());
      const outcome = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms");
      expect(outcome).toMatchObject({ dispatched: true });
      expect(h.events).toContain("send:sms");
    });
  });

  /**
   * EVERY THROW RELEASES. The claim is taken before anything that can throw,
   * so whatever throws afterwards finds a claim to release. The release comes
   * LAST, after the row the throw itself leaves, and the error that reaches
   * the caller is the very object that was thrown: the scheduler retries on
   * it, and a wrapped or replaced error would be a different failure.
   */
  describe("EVERY THROW RELEASES the claim, and the same error goes on", () => {
    const refusal = Object.assign(new Error("provider refused"), { code: 21211 });

    async function thrown(run: () => Promise<unknown>): Promise<unknown> {
      try {
        await run();
      } catch (e) {
        return e;
      }
      throw new Error("the dispatcher did not throw");
    }

    it("the SMS provider refuses: the provider_error row, then the release, then the same error", async () => {
      const clients = await import("./clients");
      vi.mocked(clients.sendSms).mockImplementationOnce(async () => {
        h.events.push("send:sms");
        throw refusal;
      });
      h.loadReminderData.mockResolvedValue(fixture());
      const e = await thrown(() => dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms"));
      expect(e).toBe(refusal);
      expect(h.events).toEqual([
        "claim",
        "claim:answered",
        "send:sms",
        "ledger:reminder.24h.sms:provider_error:",
        `release:${CLAIM_ID}`,
      ]);
      expect(h.releases).toEqual([
        { tenantId: TENANT_ID, appointmentId: APPOINTMENT_ID, offsetId: "24h", channel: "sms", claimId: CLAIM_ID },
      ]);
    });

    it("the email provider refuses: the same, on the other channel", async () => {
      const clients = await import("./clients");
      vi.mocked(clients.sendEmail).mockImplementationOnce(async () => {
        h.events.push("send:email");
        throw refusal;
      });
      h.loadReminderData.mockResolvedValue(fixture());
      const e = await thrown(() => dispatchReminder(TENANT_ID, APPOINTMENT_ID, "48h", "email"));
      expect(e).toBe(refusal);
      expect(h.events).toEqual([
        "claim",
        "claim:answered",
        "send:email",
        "ledger:reminder.48h.email:provider_error:",
        `release:${CLAIM_ID}`,
      ]);
      expect(h.releases).toEqual([
        { tenantId: TENANT_ID, appointmentId: APPOINTMENT_ID, offsetId: "48h", channel: "email", claimId: CLAIM_ID },
      ]);
    });

    it("a throw BEFORE the provider is called (the link cannot be built): nothing was sent, and the claim is released", async () => {
      delete process.env.REMINDERS_RESCHEDULE_BASE_URL;
      h.loadReminderData.mockResolvedValue(fixture());
      const e = await thrown(() => dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms"));
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toContain("REMINDERS_RESCHEDULE_BASE_URL is required");
      expect(h.events).toEqual(["claim", "claim:answered", `release:${CLAIM_ID}`]);
    });

    it("a claim that could not be written has nothing to release: the same error goes on, and no release is asked for", async () => {
      h.claimAnswer = { held: false, claimId: null };
      const clients = await import("./clients");
      vi.mocked(clients.sendSms).mockImplementationOnce(async () => {
        h.events.push("send:sms");
        throw refusal;
      });
      h.loadReminderData.mockResolvedValue(fixture());
      const e = await thrown(() => dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms"));
      expect(e).toBe(refusal);
      expect(h.events).toEqual(["claim", "claim:answered", "send:sms", "ledger:reminder.24h.sms:provider_error:"]);
      expect(h.releases).toEqual([]);
    });

    it("NEGATIVE CONTROL: a call that does not throw releases nothing, whichever way it ends", async () => {
      for (const e of ENDINGS) {
        h.loadReminderData.mockResolvedValue(e.data);
        await dispatchReminder(TENANT_ID, APPOINTMENT_ID, e.offset, e.channel);
      }
      expect(h.releases).toEqual([]);
    });
  });
});
