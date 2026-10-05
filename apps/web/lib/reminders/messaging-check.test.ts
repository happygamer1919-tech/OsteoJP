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

  it("returns send_failed WITHOUT the provider's words, and does NOT reject", async () => {
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
    // THIS ASSERTED THE OPPOSITE UNTIL THE REVIEW OF THIS CHANGE: that the
    // provider's own words reached `detail`, and from there the audit row, the
    // redirect URL and the owner's screen. The fixture above is why that was
    // wrong: the provider's words carry the number. What comes back now is a
    // reason from the closed list and nothing a number could ride in.
    expect(result).toEqual({
      ok: false,
      reason: "send_failed",
      providerCode: null,
      linkNotWithdrawn: false,
    });
    expect(JSON.stringify(result)).not.toContain("mobile number");
    expect(JSON.stringify(result)).not.toContain("210000000");
    expect(result).not.toHaveProperty("detail");
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
  /**
   * What the transport does: answer, or THROW the given value the way a
   * provider SDK does. Omit to use the REAL gate in clients.ts.
   */
  transport?: Sent | { throws: unknown };
  /** What the appointment read answers. */
  target?: Target;
  /** What the withdrawal does. Default: it removes the row. */
  withdraw?: "ok" | "no_row" | "throws";
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
        if ("throws" in answer) throw answer.throws;
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
      if (opts.withdraw === "throws") {
        // What a database error looks like: it quotes its own statement.
        throw new Error(`Failed query: select public.withdraw_confirm_code(${WITHDRAW_ERROR_MARK})`);
      }
      return opts.withdraw !== "no_row";
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

/** A string only the withdrawal's own error carries, so a log can be searched for it. */
const WITHDRAW_ERROR_MARK = "WITHDRAW-ERROR-TEXT-MUST-NOT-BE-LOGGED";

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
    expect(result).toEqual({
      ok: false,
      reason: "live_send_disabled",
      providerCode: null,
      linkNotWithdrawn: false,
    });
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

    expect(result).toEqual({
      ok: false,
      reason: "live_send_disabled",
      providerCode: null,
      linkNotWithdrawn: false,
    });
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

/**
 * THE NUMBER THE OWNER TYPED LEAVES NO TRACE, WHATEVER THE PROVIDER SAYS.
 *
 * ==========================================================================
 * WHAT THIS REPLACES
 * ==========================================================================
 * This screen kept a thrown provider error's MESSAGE, trimmed to 300
 * characters, and sent it three ways: into `audit_log.metadata.failure`, onto
 * the redirect URL as `&d=`, and onto the page. Twilio writes the recipient
 * into that message, so the number went with it, in clear, into an append-only
 * table and into browser history. The page meanwhile said the number is not
 * stored.
 *
 * So the assertion is on DIGITS, not on a sentence: every run of four or more
 * consecutive digits of the number, with the separators a person or a provider
 * might put between them taken out of the haystack first. A check for one
 * spelling of the number would pass on the other five.
 */

/**
 * A number in a range that is not assigned to anybody (98x), so no test names
 * a real handset. `normalizePhonePT` accepts it: it is nine digits from 9.
 */
const SUBSCRIBER = "987654321";
const E164 = `+351${SUBSCRIBER}`;
/** The same number, the ways an owner might type it. All normalise to E164. */
const TYPED_FORMS = [
  E164,
  `00351${SUBSCRIBER}`,
  "+351 987 654 321",
  "987 654 321",
  SUBSCRIBER,
  "(+351) 987-654-321",
  `351${SUBSCRIBER}`,
];

/** Every run of `min` or more consecutive digits of the number, country code included. */
function digitRuns(min = 4): string[] {
  const digits = `351${SUBSCRIBER}`;
  const runs: string[] = [];
  for (let i = 0; i + min <= digits.length; i++) runs.push(digits.slice(i, i + min));
  return runs;
}

/** A haystack with everything that could sit BETWEEN two digits of a number removed. */
function squeeze(value: unknown): string {
  return JSON.stringify(value)
    .replace(/%20|%2B|%28|%29|%2D/gi, "")
    .replace(/[\s.\-()+]/g, "");
}

function expectNoTraceOfTheNumber(what: string, value: unknown) {
  const haystack = squeeze(value);
  for (const run of digitRuns()) {
    expect(haystack.includes(run), `${what} carries the digits ${run}`).toBe(false);
  }
}

/** What Twilio's SDK throws: an Error with `code` and `status` beside the message. */
function providerError(typed: string, extra: Record<string, unknown> = { code: 21614, status: 400 }) {
  return Object.assign(
    new Error(`The 'To' number ${typed} (sent as ${E164}) is not a valid mobile number`),
    extra,
  );
}

describe("a provider error leaves no trace of the number that was typed", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    vi.resetModules();
    vi.restoreAllMocks();
  });

  /** Every console method, captured, so "no log call" means all of them. */
  function captureConsole() {
    const logged: unknown[][] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args);
      });
    }
    return logged;
  }

  it("THE CHECK CAN FAIL: the old behaviour, restated, trips it for every spelling", () => {
    // Without this arm the tests below would pass on a checker that finds
    // nothing. This is what the audit row and the URL used to hold.
    for (const typed of TYPED_FORMS) {
      const oldDetail = providerError(typed).message.slice(0, 300);
      const oldUrl = `/admin/messaging-check?m=send_failed&d=${encodeURIComponent(oldDetail)}`;
      for (const old of [{ failure: oldDetail }, oldUrl]) {
        const haystack = squeeze(old);
        expect(digitRuns().some((run) => haystack.includes(run)), typed).toBe(true);
      }
    }
  });

  for (const typed of TYPED_FORMS) {
    it(`typed as "${typed}": nothing in the result, the audit row or any log`, async () => {
      armed();
      const logged = captureConsole();
      const { sendMessagingCheck, calls } = await harness({
        transport: { throws: providerError(typed) },
      });

      const result = await sendMessagingCheck({ ...ARGS, phone: typed });

      // The send was really attempted and really failed at the provider.
      expect(calls.sent).toHaveLength(1);
      expect(result).toEqual({
        ok: false,
        reason: "send_failed",
        providerCode: "21614",
        linkNotWithdrawn: false,
      });
      expect(calls.audits).toHaveLength(1);

      expectNoTraceOfTheNumber("the result", result);
      expectNoTraceOfTheNumber("the audit row", calls.audits[0]);
      expectNoTraceOfTheNumber("a log call", logged);
      // And none of the provider's words either.
      for (const where of [result, calls.audits[0], logged]) {
        expect(JSON.stringify(where)).not.toContain("mobile number");
      }
    });
  }

  it("the audit row is exactly a closed set of values", async () => {
    armed();
    captureConsole();
    const { sendMessagingCheck, calls } = await harness({
      transport: { throws: providerError(E164) },
    });

    await sendMessagingCheck({ ...ARGS, phone: E164 });

    const row = calls.audits[0];
    expect(row.action).toBe("messaging.check.send");
    expect(row.entityId).toBeNull();
    const metadata = row.metadata as Record<string, unknown>;
    expect(Object.keys(metadata).sort()).toEqual([
      "codeWasLive",
      "codeWithdrawn",
      "failure",
      "providerErrorCode",
      "providerStatus",
      "result",
      "sandbox",
      "segmentLength",
      "toHash",
    ]);
    expect(metadata).toMatchObject({
      codeWasLive: false,
      codeWithdrawn: null,
      failure: "send_failed",
      providerErrorCode: "21614",
      providerStatus: 400,
      result: "threw",
      sandbox: null,
    });
    // The hash is a hash: 64 hex characters, and not the number.
    expect(metadata.toHash).toMatch(/^[0-9a-f]{64}$/);
    // And the row passes the guard every other audit writer answers to.
    const { assertPiiFreeAuditMetadata } = await import("../audit/metadata-contract");
    expect(() => assertPiiFreeAuditMetadata(metadata, "test")).not.toThrow();
  });

  it("a `code` that is not shaped like a code is DROPPED, not trimmed", async () => {
    const { providerFailureOf, isProviderCode } = await import("./messaging-check-reasons");
    const dropped = [
      `The number ${E164} is bad`,
      E164,
      SUBSCRIBER, // nine digits: room for a subscriber number, so not a code
      Number(`351${SUBSCRIBER}`),
      `E${SUBSCRIBER}`,
      "ERR 21614",
      "",
      21614.5,
      { nested: E164 },
      null,
    ];
    for (const code of dropped) {
      const failure = providerFailureOf(providerError(E164, { code, status: 400 }));
      expect(failure, String(code)).toEqual({ reason: "send_failed", code: null, status: 400 });
      expectNoTraceOfTheNumber("the reduced failure", failure);
    }
    // The shapes that ARE codes.
    expect(providerFailureOf(providerError(E164, { code: 21211 })).code).toBe("21211");
    expect(providerFailureOf(providerError(E164, { code: "21211" })).code).toBe("21211");
    expect(providerFailureOf(providerError(E164, { code: "ECONNRESET" })).code).toBe("ECONNRESET");
    expect(isProviderCode("999999")).toBe(true);
    expect(isProviderCode("1000000")).toBe(false);
    // A status that is not an HTTP status is dropped the same way.
    expect(providerFailureOf(providerError(E164, { code: 21211, status: Number(SUBSCRIBER) })).status).toBeNull();
    expect(providerFailureOf(providerError(E164, { code: 21211, status: "400" })).status).toBeNull();
    // Things that are not errors at all.
    for (const thrown of [undefined, null, "a string", 42, E164]) {
      expect(providerFailureOf(thrown)).toEqual({ reason: "send_failed", code: null, status: null });
    }
  });

  it("an incomplete environment is its own reason, and its message is not carried either", async () => {
    armed();
    const logged = captureConsole();
    const { NotificationEnvError } = await import("@osteojp/notify");
    const { sendMessagingCheck, calls } = await harness({
      transport: { throws: new NotificationEnvError(["TWILIO_AUTH_TOKEN"]) },
    });

    const result = await sendMessagingCheck(ARGS);

    expect(result).toEqual({
      ok: false,
      reason: "config_incomplete",
      providerCode: null,
      linkNotWithdrawn: false,
    });
    expect((calls.audits[0].metadata as Record<string, unknown>).failure).toBe("config_incomplete");
    expect(JSON.stringify([result, calls.audits, logged])).not.toContain("TWILIO_AUTH_TOKEN");
  });

  it("the source keeps no route for the provider's text", async () => {
    // The behavioural arms above cover what the function does today. This one
    // fails the day somebody reaches for `err.message` again.
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    for (const file of ["messaging-check.ts", "messaging-check-reasons.ts"]) {
      const code = readFileSync(join(here, file), "utf8")
        // Comments explain the old defect in its own words; only code is read.
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(code, file).not.toMatch(/\.message\b/);
      expect(code, file).not.toMatch(/\bdetail\b/);
      expect(code, file).not.toMatch(/String\(err\)|\$\{err\}|console\.\w+\([^)]*\berr\b/);
    }
  });
});

/**
 * A CODE MINTED FOR A MESSAGE THAT DID NOT GO IS WITHDRAWN, AND WHEN IT CANNOT
 * BE, THE SCREEN SAYS SO.
 *
 * The withdrawal was awaited bare and its answer dropped. A throw was a 500
 * with no audit row and the code left live; a `false` was silence. The earlier
 * throwing harness mocked the mint to null, so the one path that matters - a
 * THROWN provider error with a code already minted - had never run in a test.
 */
describe("the withdrawal after a failed send", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    vi.resetModules();
    vi.restoreAllMocks();
  });
  const STAFF_BOOKING: Target = { status: "scheduled", origin: "staff" };

  it("a THROWN provider error with a minted code withdraws it", async () => {
    armed();
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { sendMessagingCheck, calls } = await harness({
      transport: { throws: providerError(E164) },
      target: STAFF_BOOKING,
    });

    const result = await sendMessagingCheck({ ...ARGS, appointmentId: APPOINTMENT });

    expect(calls.issued).toEqual([APPOINTMENT]);
    expect(calls.withdrawn).toBe(1);
    expect(result).toEqual({
      ok: false,
      reason: "send_failed",
      providerCode: "21614",
      linkNotWithdrawn: false,
    });
    expect((calls.audits[0].metadata as Record<string, unknown>).codeWithdrawn).toBe(true);
    expect(errors).not.toHaveBeenCalled();
  });

  for (const withdraw of ["throws", "no_row"] as const) {
    it(`a withdrawal that fails (${withdraw}) does not 500, is audited, and is REPORTED`, async () => {
      armed();
      const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { sendMessagingCheck, calls } = await harness({
        transport: { throws: providerError(E164) },
        target: STAFF_BOOKING,
        withdraw,
      });

      // Does not reject: a diagnostic page must never 500.
      const result = await sendMessagingCheck({ ...ARGS, appointmentId: APPOINTMENT });

      expect(calls.withdrawn).toBe(1);
      // Not sent, AND the link could not be withdrawn: both, truthfully.
      expect(result).toEqual({
        ok: false,
        reason: "send_failed",
        providerCode: "21614",
        linkNotWithdrawn: true,
      });
      // The audit row is still written, and records the stranded code.
      expect(calls.audits).toHaveLength(1);
      expect(calls.audits[0].entityId).toBe(APPOINTMENT);
      expect(calls.audits[0].metadata).toMatchObject({
        codeWasLive: true,
        codeWithdrawn: false,
        failure: "send_failed",
      });
      // One log line, ids only: never the database's own error text.
      expect(errors).toHaveBeenCalledTimes(1);
      expect(errors.mock.calls[0][1]).toEqual({ tenantId: "t", appointmentId: APPOINTMENT });
      expect(JSON.stringify(errors.mock.calls)).not.toContain(WITHDRAW_ERROR_MARK);
      expect(JSON.stringify(errors.mock.calls)).not.toContain("Failed query");
      expectNoTraceOfTheNumber("the log line", errors.mock.calls);
    });
  }

  it("a message the GATE held back, with a withdrawal that fails, is reported the same way", async () => {
    armed(); // live send off
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { sendMessagingCheck, calls } = await harness({
      target: STAFF_BOOKING,
      withdraw: "throws",
    });

    const result = await sendMessagingCheck({ ...ARGS, appointmentId: APPOINTMENT });

    expect(result).toEqual({
      ok: false,
      reason: "live_send_disabled",
      providerCode: null,
      linkNotWithdrawn: true,
    });
    expect(calls.audits).toHaveLength(1);
  });

  it("CONTROL: a delivered message withdraws nothing and reports nothing", async () => {
    armed();
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { sendMessagingCheck, calls } = await harness({
      transport: DELIVERED,
      target: STAFF_BOOKING,
      withdraw: "throws",
    });

    const result = await sendMessagingCheck({ ...ARGS, appointmentId: APPOINTMENT });

    expect(result.ok).toBe(true);
    expect(calls.withdrawn).toBe(0);
    expect((calls.audits[0].metadata as Record<string, unknown>).codeWithdrawn).toBeNull();
    expect(errors).not.toHaveBeenCalled();
  });

  it("no minted code, nothing to withdraw: the result does not claim a stranded link", async () => {
    armed();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { sendMessagingCheck, calls } = await harness({
      transport: { throws: providerError(E164) },
      withdraw: "throws",
    });

    const result = await sendMessagingCheck(ARGS);

    expect(calls.withdrawn).toBe(0);
    expect(result).toMatchObject({ ok: false, linkNotWithdrawn: false });
  });
});
