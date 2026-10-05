import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CONFIRM_CODE_SECRET_VAR, CONFIRM_LINK_FLAG } from "./confirm-code";

/**
 * The two refusals the owner's delivery test can reach WITHOUT sending, and
 * they are the two worth pinning: both happen before anything costs money or
 * touches a handset, and both are easy to regress into a silent send.
 */
describe("the delivery test refuses before it spends", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("refuses a number that is not usable, without sending", async () => {
    process.env[CONFIRM_LINK_FLAG] = "true";
    process.env[CONFIRM_CODE_SECRET_VAR] = "messaging-check-test-secret";
    const { sendMessagingCheck } = await import("./messaging-check");
    expect(
      await sendMessagingCheck({
        tenantId: "t",
        actorUserId: "u",
        phone: "not a number",
        ip: null,
      }),
    ).toEqual({ ok: false, reason: "invalid_phone" });
  });

  it("refuses when the confirm link is DISARMED, because there is nothing to test", async () => {
    // The commonest reason a delivery test would appear to work and prove
    // nothing: the flag is off, so the body has no link in it. Sending that
    // costs money and answers a question nobody asked.
    delete process.env[CONFIRM_LINK_FLAG];
    process.env[CONFIRM_CODE_SECRET_VAR] = "messaging-check-test-secret";
    const { sendMessagingCheck } = await import("./messaging-check");
    expect(
      await sendMessagingCheck({
        tenantId: "t",
        actorUserId: "u",
        phone: "+351912345678",
        ip: null,
      }),
    ).toEqual({ ok: false, reason: "no_link" });
  });
});

/**
 * P0-A. THE TRANSPORT THROWS AND THE PAGE MUST NOT.
 *
 * packages/notify's gate awaits the provider with no try/catch, so a Twilio
 * rejection propagates. The reminder path survives that because it runs inside
 * an Inngest job, where a throw is a retryable job failure nobody sees. This
 * page is a user-facing server action, so the SAME throw was a 500 on the
 * owner's screen with the reason only in Sentry - which is what he hit.
 *
 * BOTH ARMS. Without the catch the call rejects; with it the owner gets a
 * result object naming the provider's own words.
 */
describe("a provider rejection is reported, never thrown", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    vi.resetModules();
    vi.restoreAllMocks();
  });

  async function withThrowingTransport() {
    vi.resetModules();
    vi.doMock("./clients", () => ({
      sendSms: async () => {
        throw new Error("The 'To' number +351210000000 is not a mobile number");
      },
      // Nothing is returned by a transport that throws, so there is no
      // suppression to explain.
      suppressionReasonOf: () => undefined,
    }));
    vi.doMock("./confirm-code-store", () => ({
      issueConfirmCode: async () => null,
      withdrawConfirmCode: async () => true,
    }));
    vi.doMock("@osteojp/db", () => ({
      auditLog: {},
      getDbAdmin: () => ({ insert: () => ({ values: async () => undefined }) }),
    }));
    return import("./messaging-check");
  }

  it("returns send_failed carrying the provider's reason, and does NOT reject", async () => {
    process.env[CONFIRM_LINK_FLAG] = "true";
    process.env[CONFIRM_CODE_SECRET_VAR] = "messaging-check-test-secret";
    process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://app.osteojp.pt";
    const { sendMessagingCheck } = await withThrowingTransport();

    const result = await sendMessagingCheck({
      tenantId: "t",
      actorUserId: "u",
      phone: "+351912345678",
      ip: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("send_failed");
    // The provider's own words reach the owner's screen. That is the entire
    // difference between a diagnostic page and a 500.
    expect(result.detail).toContain("is not a mobile number");
  });

  it("NEGATIVE CONTROL: the same call REJECTS when the catch is removed", async () => {
    // Proves the assertion above is detecting the catch rather than agreeing
    // with itself: the transport used here is the one that throws.
    const throwingSend = async () => {
      throw new Error("The 'To' number +351210000000 is not a mobile number");
    };
    await expect(throwingSend()).rejects.toThrow("is not a mobile number");
  });

  it("REFUSES A LANDLINE before the provider is ever called", async () => {
    process.env[CONFIRM_LINK_FLAG] = "true";
    process.env[CONFIRM_CODE_SECRET_VAR] = "messaging-check-test-secret";
    process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://app.osteojp.pt";
    const { sendMessagingCheck } = await withThrowingTransport();

    // A Portuguese geographic line. normalizePhonePT admits it; it cannot
    // receive SMS, and the reminder path has always skipped it before sending.
    const result = await sendMessagingCheck({
      tenantId: "t",
      actorUserId: "u",
      phone: "+351210000000",
      ip: null,
    });
    expect(result).toEqual({ ok: false, reason: "landline" });
  });
});

/**
 * EVERYTHING BELOW DRIVES THE REAL `sendMessagingCheck` WITH ITS SEAMS REPLACED:
 * the transport, the code store, the one appointment read and the audit insert.
 * Each seam RECORDS, so a test can assert what did NOT happen - which, for a
 * refusal, is the property that matters.
 */
type Target = { status: string; origin: string } | null;
type Sent = { channel: "sms"; sandbox: boolean; id: string };

async function harness(opts: {
  /** What the transport answers. Omit to use the REAL gate in clients.ts. */
  transport?: Sent;
  /** What the appointment read answers. */
  target?: Target;
}) {
  const calls = {
    sent: [] as string[],
    issued: [] as string[],
    withdrawn: 0,
    targetReads: [] as string[],
    audits: [] as Record<string, unknown>[],
  };
  vi.resetModules();
  if (opts.transport) {
    const answer = opts.transport;
    vi.doMock("./clients", () => ({
      sendSms: async (m: { body: string }) => {
        calls.sent.push(m.body);
        return answer;
      },
      suppressionReasonOf: () => undefined,
    }));
  } else {
    vi.doMock("./clients", async (importOriginal) => {
      const actual = await importOriginal<typeof import("./clients")>();
      return {
        ...actual,
        sendSms: async (m: Parameters<typeof actual.sendSms>[0]) => {
          calls.sent.push(m.body);
          return actual.sendSms(m);
        },
      };
    });
  }
  vi.doMock("./confirm-code-store", () => ({
    issueConfirmCode: async (a: { appointmentId: string; code?: string }) => {
      calls.issued.push(a.appointmentId);
      return { code: a.code ?? "", codeHash: "0".repeat(64) };
    },
    withdrawConfirmCode: async () => {
      calls.withdrawn += 1;
      return true;
    },
  }));
  vi.doMock("./messaging-check-target", () => ({
    loadMessagingCheckTarget: async (_tenantId: string, appointmentId: string) => {
      calls.targetReads.push(appointmentId);
      return opts.target ?? null;
    },
  }));
  vi.doMock("@osteojp/db", () => ({
    auditLog: {},
    getDbAdmin: () => ({
      insert: () => ({
        values: async (row: Record<string, unknown>) => {
          calls.audits.push(row);
        },
      }),
    }),
  }));
  const { sendMessagingCheck } = await import("./messaging-check");
  return { sendMessagingCheck, calls };
}

/** A provider that took the message. */
const DELIVERED: Sent = { channel: "sms", sandbox: false, id: "SM-test-accepted" };
const APPOINTMENT = "11111111-1111-4111-8111-111111111111";
const ARGS = { tenantId: "t", actorUserId: "u", phone: "+351912345678", ip: null };

const ENV_KEYS = [
  CONFIRM_LINK_FLAG,
  CONFIRM_CODE_SECRET_VAR,
  "REMINDERS_RESCHEDULE_BASE_URL",
  "REMINDERS_LIVE_SEND",
  "TWILIO_SMS_FROM",
  "TWILIO_MESSAGING_SERVICE_SID",
  "REMINDERS_REPLY_CAPABLE",
] as const;

function armed() {
  for (const k of ENV_KEYS) delete process.env[k];
  process.env[CONFIRM_LINK_FLAG] = "true";
  process.env[CONFIRM_CODE_SECRET_VAR] = "messaging-check-test-secret";
  // `.invalid` is reserved (RFC 2606): no test names a host that could answer.
  process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://app.x.invalid";
  process.env.TWILIO_SMS_FROM = "OsteoJP";
}

/**
 * A MESSAGE THE GATE HELD BACK IS NOT A MESSAGE THAT WAS SENT.
 *
 * The page said "Enviada. Veja o telemóvel." for it. `delivered` was computed
 * as `!sent.id.startsWith("skipped:")`, and the notification gate marks a
 * held-back message `sandbox:sms`, so live sending off, an unapproved template
 * and a missing sender all read as a delivery. The owner was sent to look at a
 * handset nothing had been sent to.
 */
describe("a message the gate held back is reported as held back", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("LIVE SEND OFF: the real gate suppresses, and the answer names that switch", async () => {
    armed(); // REMINDERS_LIVE_SEND is deleted, which is off
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { sendMessagingCheck, calls } = await harness({});

    const result = await sendMessagingCheck(ARGS);

    // The body reached the gate, so this is the gate's verdict and not an
    // earlier refusal.
    expect(calls.sent).toHaveLength(1);
    expect(result).toEqual({ ok: false, reason: "live_send_disabled" });
    // And the audit row says the same thing the screen does.
    expect(calls.audits).toHaveLength(1);
    expect(calls.audits[0].metadata).toMatchObject({
      sandbox: true,
      failure: "live_send_disabled",
    });
  });

  it("a code minted for a named appointment is WITHDRAWN when nothing left", async () => {
    // The compensation the function has always documented, and never ran on
    // this path: a live code for a message nobody received would block that
    // appointment's real reminder from carrying a link.
    armed();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { sendMessagingCheck, calls } = await harness({
      target: { status: "confirmed", origin: "staff" },
    });

    const result = await sendMessagingCheck({ ...ARGS, appointmentId: APPOINTMENT });

    expect(result).toEqual({ ok: false, reason: "live_send_disabled" });
    expect(calls.issued).toEqual([APPOINTMENT]);
    expect(calls.withdrawn).toBe(1);
  });

  it("CONTROL: a provider that took the message still reads as sent", async () => {
    // Without this arm the two tests above would pass on a function that
    // refuses everything.
    armed();
    const { sendMessagingCheck, calls } = await harness({ transport: DELIVERED });

    const result = await sendMessagingCheck(ARGS);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.segments).toBe(1);
    expect(result.length).toBe(calls.sent[0].length);
    expect(result.codeWasLive).toBe(false);
    expect(calls.withdrawn).toBe(0);
  });

  it("every reason the gate can hold a message for has a named refusal", async () => {
    const { refusalFromSuppression, MESSAGING_CHECK_REFUSALS } = await import(
      "./messaging-check-reasons"
    );
    // The gate's union, spelled out. A fifth reason does not compile in
    // messaging-check-reasons.ts until it is given an answer; this pins the
    // four answers themselves.
    expect(refusalFromSuppression("live_send_disabled")).toBe("live_send_disabled");
    expect(refusalFromSuppression("missing_provider_config")).toBe("missing_provider_config");
    expect(refusalFromSuppression("template_unapproved")).toBe("template_unapproved");
    expect(refusalFromSuppression("invalid_recipient")).toBe("invalid_phone");
    for (const reason of [
      "live_send_disabled",
      "missing_provider_config",
      "template_unapproved",
      "invalid_recipient",
    ] as const) {
      expect(MESSAGING_CHECK_REFUSALS).toContain(refusalFromSuppression(reason));
    }
  });
});

/**
 * THE APPOINTMENT ID, WHICH IS THE ONE INPUT THAT CAN TOUCH A REAL APPOINTMENT.
 *
 * With an id the confirm code is LIVE: the link in the test message opens
 * /c/<code>, and pressing Confirmar there moves that appointment from
 * `scheduled` to `confirmed`. The reminder job never mints a code for an online
 * request reception has not accepted (R10); this function did, for any id.
 */
describe("an appointment id is checked before a live code is minted", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("REFUSES an online request reception has not accepted: nothing sent, minted or written", async () => {
    armed();
    const { sendMessagingCheck, calls } = await harness({
      transport: DELIVERED,
      target: { status: "scheduled", origin: "patient_portal" },
    });

    const result = await sendMessagingCheck({ ...ARGS, appointmentId: APPOINTMENT });

    expect(result).toEqual({ ok: false, reason: "pending_request" });
    expect(calls.targetReads).toEqual([APPOINTMENT]);
    expect(calls.issued).toEqual([]);
    expect(calls.sent).toEqual([]);
    expect(calls.audits).toEqual([]);
  });

  // THE OTHER ARMS. A guard that refused every id would pass the test above
  // and end the full round trip the id exists for.
  const ALLOWED: [string, Target][] = [
    ["a staff booking still scheduled", { status: "scheduled", origin: "staff" }],
    ["an online request reception HAS accepted", { status: "confirmed", origin: "patient_portal" }],
    ["an id that names no visible appointment", null],
  ];
  for (const [name, target] of ALLOWED) {
    it(`still sends for ${name}`, async () => {
      armed();
      const { sendMessagingCheck, calls } = await harness({ transport: DELIVERED, target });

      const result = await sendMessagingCheck({ ...ARGS, appointmentId: APPOINTMENT });

      expect(result.ok).toBe(true);
      expect(calls.issued).toEqual([APPOINTMENT]);
      expect(calls.sent).toHaveLength(1);
    });
  }

  it("REFUSES an id that is not an id, without reading, minting or sending", async () => {
    // Before this, the string reached Postgres as a uuid cast and raised: a 500
    // on the one screen whose job is to report what happened.
    armed();
    for (const bad of ["abc", "123", "11111111-1111-4111-8111-11111111111", `${APPOINTMENT}x`]) {
      const { sendMessagingCheck, calls } = await harness({ transport: DELIVERED });
      const result = await sendMessagingCheck({ ...ARGS, appointmentId: bad });
      expect(result, bad).toEqual({ ok: false, reason: "invalid_appointment" });
      expect(calls.targetReads).toEqual([]);
      expect(calls.issued).toEqual([]);
      expect(calls.sent).toEqual([]);
    }
  });

  it("NO ID, NO READ: the ordinary test touches no appointment at all", async () => {
    armed();
    const { sendMessagingCheck, calls } = await harness({ transport: DELIVERED });

    const result = await sendMessagingCheck({ ...ARGS, appointmentId: null });

    expect(result.ok).toBe(true);
    expect(calls.targetReads).toEqual([]);
    expect(calls.issued).toEqual([]);
    expect(calls.audits[0].entityId).toBeNull();
  });

  it("the rule is the reminder job's own rule, and fails if that one moves", async () => {
    // dispatch.ts keeps its predicate private, and importing dispatch.ts into
    // the delivery test would drag the whole reminder pipeline behind an owner
    // screen. So the rule is restated in messaging-check-reasons.ts and PINNED
    // to its source here: change the job's gate and this fails until the
    // delivery test's gate has been looked at too.
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const dispatch = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "dispatch.ts"),
      "utf8",
    );
    expect(dispatch).toContain('const PEDIDO_ORIGINS = new Set(["patient_portal"]);');
    expect(dispatch).toContain(
      'return data.status === "scheduled" && PEDIDO_ORIGINS.has(data.origin);',
    );

    const { ONLINE_REQUEST_ORIGINS, isUnacceptedOnlineRequest } = await import(
      "./messaging-check-reasons"
    );
    expect([...ONLINE_REQUEST_ORIGINS]).toEqual(["patient_portal"]);
    expect(isUnacceptedOnlineRequest({ status: "scheduled", origin: "patient_portal" })).toBe(true);
    expect(isUnacceptedOnlineRequest({ status: "confirmed", origin: "patient_portal" })).toBe(false);
    expect(isUnacceptedOnlineRequest({ status: "scheduled", origin: "staff" })).toBe(false);
    expect(isUnacceptedOnlineRequest({ status: "cancelled", origin: "patient_portal" })).toBe(false);
  });
});
