/**
 * The inbound Twilio webhook, at the route level.
 *
 * WHAT THIS FILE IS FOR, and it is not the transitions. Those are proven
 * against real Postgres in lib/reminders/inbound-reply.db.test.ts, because
 * they are properties of the database. THIS file proves the properties of the
 * HANDLER, which are all about what it refuses and what it does not do:
 *
 *   - it is invisible while the capability flag is off;
 *   - it refuses when armed but unconfigured, LOUDLY, rather than 200-ing and
 *     dropping the reply;
 *   - an unsigned or wrongly-signed request never reaches the database;
 *   - the acknowledgement goes through the notify gate, so it is suppressed as
 *     `template_unapproved` and no SMS is sent while JP has not approved it;
 *   - a STOP is never answered with an SMS.
 *
 * The reply application is mocked here on purpose: a route test that also
 * needed a database would prove neither thing clearly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  applyInboundReply: vi.fn(),
  sendSms: vi.fn(async () => ({ channel: "sms" as const, sandbox: true, id: "x" })),
  recordForReview: vi.fn(async () => {}),
}));

vi.mock("@/lib/reminders/inbound-reply", () => ({ applyInboundReply: h.applyInboundReply }));
vi.mock("@/lib/reminders/clients", () => ({ sendSms: h.sendSms }));
vi.mock("@/lib/reminders/inbound-store", () => ({ recordInboundReply: h.recordForReview }));

/**
 * The Sentry seam, shaped as app/api/followup/contact/route.test.ts:24-29 shapes
 * it: a `vi.fn()` CLOSED OVER by the factory, never named directly inside it.
 * `./route` is imported statically below, so its module body - and every
 * `vi.mock` factory it pulls - runs before the consts at this scope are
 * initialised. A factory that referenced `captureMessage` directly would read it
 * in the temporal dead zone and throw, which is the trap
 * lib/reminders/inbound-config.test.ts:18-19 does not hit only because it
 * imports its subject with a dynamic `await import`.
 */
const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureMessage: (...a: unknown[]) => captureMessage(...a),
  captureException: vi.fn(),
}));

import { computeTwilioSignature } from "@/lib/reminders/inbound-signature";
import { POST } from "./route";

const TENANT = "11111111-1111-4111-8111-111111111111";
const TOKEN = "auth-token-for-tests-only";
const BASE = "https://app.osteojp.test";
const PATH = "/api/webhooks/twilio/inbound";

const ENV = [
  "REMINDERS_INBOUND",
  "REMINDERS_INBOUND_TENANT_ID",
  "REMINDERS_INBOUND_BASE_URL",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_SMS_FROM",
  "TWILIO_MESSAGING_SERVICE_SID",
] as const;
const saved: Record<string, string | undefined> = {};

/**
 * The clinic's own number. SR-47 makes an E.164 `TWILIO_SMS_FROM` the SECOND
 * arming condition, so `arm()` sets one: the flag alone no longer opens this
 * route, and a suite that only set the flag would be testing the 404 branch
 * while believing it tested the handler.
 */
const CLINIC_NUMBER = "+351210000000";
/** The live production sender. One-way, so no reply can ever arrive at it. */
const ALPHANUMERIC_SENDER = "OsteoJP";

function arm() {
  process.env.REMINDERS_INBOUND = "true";
  process.env.REMINDERS_INBOUND_TENANT_ID = TENANT;
  process.env.REMINDERS_INBOUND_BASE_URL = BASE;
  process.env.TWILIO_AUTH_TOKEN = TOKEN;
  process.env.TWILIO_SMS_FROM = CLINIC_NUMBER;
  delete process.env.TWILIO_MESSAGING_SERVICE_SID;
}

/** A request Twilio would have made, correctly signed unless told otherwise. */
function twilioPost(params: Record<string, string>, opts: { signature?: string | null } = {}) {
  const body = new URLSearchParams(params).toString();
  const signature =
    opts.signature === undefined
      ? computeTwilioSignature(TOKEN, BASE + PATH, params)
      : opts.signature;
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  if (signature !== null) headers["x-twilio-signature"] = signature;
  return new Request(BASE + PATH, { method: "POST", body, headers });
}

const REPLY = { From: "+351912345678", To: "+351210000000", Body: "Sim" };

/** The review verdict, which transitions NOTHING. Used by the refusal tests. */
const REVIEW = {
  outcome: "review" as const,
  reason: "no_patient_match" as const,
  intent: "review" as const,
  patientId: null,
  appointmentId: null,
};

/**
 * Every argument console.error was called with, so a test can assert what the
 * failure line DOES and DOES NOT carry (rule 7). Same shape as
 * lib/reminders/inbound-config.test.ts:38-42.
 */
let errors: unknown[][] = [];

beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  h.applyInboundReply.mockReset();
  h.sendSms.mockClear();
  // mockReset, not mockClear: `mockRejectedValueOnce` queues a one-shot
  // implementation that mockClear does NOT discard, so a rejection armed by a
  // test that short-circuits before the filing call (404, 503, 403) would leak
  // into whichever test ran next.
  h.recordForReview.mockReset();
  h.recordForReview.mockResolvedValue(undefined);
  captureMessage.mockClear();
  h.applyInboundReply.mockResolvedValue({
    outcome: "confirmed",
    appointmentId: "a1",
    patientId: "p1",
  });
  errors = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args);
  });
  arm();
});

afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
  vi.restoreAllMocks();
});

describe("the capability flag", () => {
  it("404s as if the route did not exist while REMINDERS_INBOUND is off", async () => {
    for (const v of [undefined, "false", "1", "TRUE", "yes", " true "]) {
      if (v === undefined) delete process.env.REMINDERS_INBOUND;
      else process.env.REMINDERS_INBOUND = v;
      const res = await POST(twilioPost(REPLY) as never);
      expect(res.status, `flag=${String(v)}`).toBe(404);
    }
    // Nothing was classified, nothing was sent, nothing touched the database.
    expect(h.applyInboundReply).not.toHaveBeenCalled();
    expect(h.sendSms).not.toHaveBeenCalled();
  });

  /**
   * SR-47 AT THE READER, and this is the arm that had never executed: the flag
   * is exactly "true" and the request is correctly signed, and the route still
   * behaves as if it does not exist because the sender cannot receive a reply.
   *
   * IT IS ASSERTED HERE AND NOT ONLY IN `inbound-config.test.ts` because a
   * pure test of the predicate proves nothing about the CALLER - the route
   * could have read the flag directly, and until this test existed nothing
   * would have said so.
   */
  it("404s while the flag is true but the sender is alphanumeric", async () => {
    process.env.TWILIO_SMS_FROM = ALPHANUMERIC_SENDER;
    const res = await POST(twilioPost(REPLY) as never);
    expect(res.status).toBe(404);
    expect(h.applyInboundReply).not.toHaveBeenCalled();
    expect(h.sendSms).not.toHaveBeenCalled();
  });

  /**
   * A MESSAGING SERVICE IS REFUSED TOO, and `REMINDERS_REPLY_CAPABLE` cannot
   * open it. That flag exists so an operator can declare a service's sender
   * pool replyable for a line of SMS copy; the cost of a wrong "yes" HERE is an
   * armed unauthenticated route that changes appointment status.
   */
  it("404s on a messaging service even with REMINDERS_REPLY_CAPABLE=true", async () => {
    const savedCapable = process.env.REMINDERS_REPLY_CAPABLE;
    try {
      delete process.env.TWILIO_SMS_FROM;
      process.env.TWILIO_MESSAGING_SERVICE_SID = `MG${"0".repeat(32)}`;
      process.env.REMINDERS_REPLY_CAPABLE = "true";
      const res = await POST(twilioPost(REPLY) as never);
      expect(res.status).toBe(404);
      expect(h.applyInboundReply).not.toHaveBeenCalled();
    } finally {
      if (savedCapable === undefined) delete process.env.REMINDERS_REPLY_CAPABLE;
      else process.env.REMINDERS_REPLY_CAPABLE = savedCapable;
    }
  });
});

describe("armed but unconfigured — it fails CLOSED and LOUD", () => {
  it("503s when the tenant is not configured", async () => {
    delete process.env.REMINDERS_INBOUND_TENANT_ID;
    const res = await POST(twilioPost(REPLY) as never);
    expect(res.status).toBe(503);
    expect(h.applyInboundReply).not.toHaveBeenCalled();
    // A 200 here would tell Twilio the reply was handled while it was
    // silently discarded, which is the failure this refuses to become.
    expect(console.error).toHaveBeenCalled();
  });

  it("503s when the auth token is absent — there is nothing to verify with", async () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    const res = await POST(twilioPost(REPLY) as never);
    expect(res.status).toBe(503);
    expect(h.applyInboundReply).not.toHaveBeenCalled();
  });

  it("503s when the signed base URL is unset — it does not guess an origin", async () => {
    delete process.env.REMINDERS_INBOUND_BASE_URL;
    const res = await POST(twilioPost(REPLY) as never);
    expect(res.status).toBe(503);
    expect(h.applyInboundReply).not.toHaveBeenCalled();
  });
});

describe("the signature is the only gate, and it holds", () => {
  it("accepts a correctly signed request", async () => {
    const res = await POST(twilioPost(REPLY) as never);
    expect(res.status).toBe(200);
    expect(h.applyInboundReply).toHaveBeenCalledOnce();
  });

  it("REFUSES an unsigned request and never reaches the database", async () => {
    const res = await POST(twilioPost(REPLY, { signature: null }) as never);
    expect(res.status).toBe(403);
    expect(h.applyInboundReply).not.toHaveBeenCalled();
    expect(h.sendSms).not.toHaveBeenCalled();
  });

  it("REFUSES a garbage signature", async () => {
    const res = await POST(twilioPost(REPLY, { signature: "not-a-signature" }) as never);
    expect(res.status).toBe(403);
    expect(h.applyInboundReply).not.toHaveBeenCalled();
  });

  it("REFUSES a signature computed over DIFFERENT content — the real forgery", async () => {
    // Signed for a reply saying "Sim"; delivered with a body saying "Nao".
    // The attack this stops is replaying a captured signature with edited
    // params, which is the only interesting way to attack a signed webhook.
    const signature = computeTwilioSignature(TOKEN, BASE + PATH, REPLY);
    const res = await POST(
      twilioPost({ ...REPLY, Body: "Nao" }, { signature }) as never,
    );
    expect(res.status).toBe(403);
    expect(h.applyInboundReply).not.toHaveBeenCalled();
  });

  it("REFUSES a signature computed for a DIFFERENT URL", async () => {
    const signature = computeTwilioSignature(TOKEN, "https://evil.test" + PATH, REPLY);
    const res = await POST(twilioPost(REPLY, { signature }) as never);
    expect(res.status).toBe(403);
  });
});

describe("what it does once the signature passes", () => {
  it("passes the tenant from CONFIG, never from the payload", async () => {
    // The payload names a different tenant. It must be ignored: a tenant taken
    // from an attacker-controlled body would let a forger choose which clinic
    // to act on.
    await POST(twilioPost({ ...REPLY, tenantId: "99999999-9999-4999-8999-999999999999" }) as never);
    expect(h.applyInboundReply).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, fromPhone: REPLY.From, body: "Sim" }),
    );
  });

  it("sends the acknowledgement through the notify gate, never as TwiML", async () => {
    const res = await POST(twilioPost(REPLY) as never);
    const xml = await res.text();
    // An empty TwiML Response: "received, nothing to say". A <Message> here
    // would bypass the registry, the approval gate and the live-send flag
    // entirely - a second send path, which is the thing clients.ts exists to
    // prevent.
    expect(xml).not.toContain("<Message");
    expect(h.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: "reply_ack.confirmed.sms" }),
    );
  });

  it("picks the acknowledgement that matches the outcome", async () => {
    h.applyInboundReply.mockResolvedValue({
      outcome: "cancelled",
      appointmentId: "a1",
      patientId: "p1",
    });
    await POST(twilioPost({ ...REPLY, Body: "Nao" }) as never);
    expect(h.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: "reply_ack.cancelled.sms" }),
    );

    h.sendSms.mockClear();
    h.applyInboundReply.mockResolvedValue({
      outcome: "review",
      reason: "ambiguous",
      intent: "review",
      patientId: null,
      appointmentId: null,
    });
    await POST(twilioPost({ ...REPLY, Body: "talvez" }) as never);
    expect(h.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: "reply_ack.review.sms" }),
    );
  });

  it("NEVER answers a STOP with an SMS", async () => {
    // Replying to an opt-out is the one message that contradicts the
    // instruction it is answering.
    h.applyInboundReply.mockResolvedValue({
      outcome: "opt_out",
      patientId: "p1",
      appointmentId: null,
    });
    const res = await POST(twilioPost({ ...REPLY, Body: "STOP" }) as never);
    expect(res.status).toBe(200);
    expect(h.sendSms).not.toHaveBeenCalled();
  });

  it("files a REVIEW outcome unresolved, so it enters reception's queue", async () => {
    h.applyInboundReply.mockResolvedValue({
      outcome: "review",
      reason: "no_patient_match",
      intent: "review",
      patientId: null,
      appointmentId: null,
    });
    await POST(twilioPost({ ...REPLY, MessageSid: "SM-fixture-review" }) as never);
    expect(h.recordForReview).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        classification: "review",
        reviewReason: "no_patient_match",
        providerMessageSid: "SM-fixture-review",
        resolved: false,
      }),
    );
  });

  it("files an ACTED-ON reply already resolved, so it never enters the queue", async () => {
    // W14-06: every reply is stored, because "what did the patient actually
    // write" is a question about a confirmed reply too - but only the ones
    // needing a human are queued.
    h.applyInboundReply.mockResolvedValue({
      outcome: "confirmed",
      appointmentId: "a1",
      patientId: "p1",
    });
    await POST(twilioPost({ ...REPLY, MessageSid: "SM-fixture-confirmed" }) as never);
    expect(h.recordForReview).toHaveBeenCalledWith(
      expect.objectContaining({
        classification: "confirmada",
        reviewReason: null,
        patientId: "p1",
        appointmentId: "a1",
        resolved: true,
      }),
    );
  });

  it("a failure to FILE an ACTED-ON reply still acknowledges it and still 200s", async () => {
    // The appointment has already moved and the audit row is already written,
    // so the filed row is a working copy. A non-2xx would not bring it back
    // (see the route header), and it would cost the acknowledgement, which is
    // true whether or not the working copy landed.
    h.recordForReview.mockRejectedValueOnce(new Error("store down"));
    h.applyInboundReply.mockResolvedValue({
      outcome: "confirmed",
      appointmentId: "a1",
      patientId: "p1",
    });
    const res = await POST(twilioPost(REPLY) as never);
    expect(res.status).toBe(200);
    expect(h.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: "reply_ack.confirmed.sms" }),
    );
  });

  it("a REVIEW reply that could not be filed is REPORTED, and still acknowledged", async () => {
    // THE REFUSAL THIS ARM ASSERTED IN THE FIRST DRAFT IS WITHDRAWN. It was
    // built on "a non-2xx makes Twilio redeliver"; this route does not rely on
    // re-delivery, and the route header says why.
    // So the 500 did not fetch the reply again; it only suppressed the
    // acknowledgement on the way past, leaving the patient with silence. The
    // text stays retrievable from Twilio by sid, so "a recepcao vai confirmar
    // consigo" is still a promise the clinic can keep, and the loss is
    // reported through the capture instead.
    h.recordForReview.mockRejectedValueOnce(new Error("store down"));
    h.applyInboundReply.mockResolvedValue(REVIEW);
    const res = await POST(
      twilioPost({ ...REPLY, MessageSid: "SM-review-unfiled" }) as never,
    );
    expect(res.status).toBe(200);
    expect(h.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: "reply_ack.review.sms" }),
    );
    // The console is not a report: nothing in this app forwards console lines
    // to Sentry, so without this the loss is visible to nobody.
    expect(captureMessage).toHaveBeenCalled();
  });

  it("the filing failure names the MessageSid and never the body or the sender", async () => {
    // The sid is Twilio's own id for the message and the key to retrieving the
    // text from their console, so the line is worth nothing without it. The
    // body and the sender's number are the two things rule 7 keeps out of it.
    h.recordForReview.mockRejectedValueOnce(new Error("store down"));
    h.applyInboundReply.mockResolvedValue(REVIEW);
    await POST(
      twilioPost({
        ...REPLY,
        MessageSid: "SM-review-unfiled",
        Body: "preciso de remarcar XYZZYMARKER",
      }) as never,
    );
    const logged = errors.map((a) => a.join(" ")).join("\n");
    expect(logged).toContain("SM-review-unfiled");
    expect(logged).not.toContain("XYZZYMARKER");
    expect(logged).not.toContain("912345678");
    const tags =
      (captureMessage.mock.calls[0]?.[1] as { tags?: Record<string, string> } | undefined)?.tags ??
      {};
    const tagText = Object.values(tags).join(" ");
    expect(tagText).toContain("SM-review-unfiled");
    expect(tagText).not.toContain("XYZZYMARKER");
    expect(tagText).not.toContain("912345678");
  });

  it("200s even when the reply changed nothing — a handled reply is not a failure", async () => {
    // "Nothing to do" is a successful outcome for a webhook: the reply was
    // decided, and there is nothing a different status would put right.
    h.applyInboundReply.mockResolvedValue({
      outcome: "review",
      reason: "outside_window",
      intent: "confirmada",
      patientId: "p1",
      appointmentId: "a1",
    });
    const res = await POST(twilioPost(REPLY) as never);
    expect(res.status).toBe(200);
  });

  it("does not fall over on an empty body or a missing From", async () => {
    h.applyInboundReply.mockResolvedValue({
      outcome: "review",
      reason: "no_patient_match",
      intent: "review",
      patientId: null,
      appointmentId: null,
    });
    const res = await POST(twilioPost({ To: "+351210000000" }) as never);
    expect(res.status).toBe(200);
    expect(h.applyInboundReply).toHaveBeenCalledWith(
      expect.objectContaining({ fromPhone: "", body: "" }),
    );
    // No normalizable sender, so no acknowledgement is attempted.
    expect(h.sendSms).not.toHaveBeenCalled();
  });
});

/**
 * ==========================================================================
 * THE THROW PATHS
 * ==========================================================================
 * Both awaits guarded on this route are MOCKED by this file, so the arms below
 * are what make either mock reject and measure what the route then answers and
 * logs. The fixture number is invented for these arms specifically: it is the
 * value the thrown errors carry, so "the log does not contain it" is a
 * measurement rather than a coincidence of which strings happen to be short.
 */
const SYNTHETIC_REPLIER = "+351900000042";
const SYNTHETIC_SUBSCRIBER = "900000042";
const SYNTHETIC_REPLY = { From: SYNTHETIC_REPLIER, To: CLINIC_NUMBER, Body: "Sim" };

describe("a database fault in the classifier", () => {
  /**
   * The fixture carries the number, so the assertion that the log does not is a
   * measurement rather than a coincidence.
   */
  function queryErrorFixture() {
    return Object.assign(
      new Error(
        "select \"patients\".\"id\" from \"patients\" where regexp_replace(...) in ($1, $2, $3) " +
          `-- params: ["${SYNTHETIC_SUBSCRIBER}", "351${SYNTHETIC_SUBSCRIBER}", ` +
          `"00351${SYNTHETIC_SUBSCRIBER}"]`,
      ),
      { code: "42P01" },
    );
  }

  it("answers 200, reports the SQLSTATE, and never repeats the value the fixture carries", async () => {
    const leaky = queryErrorFixture();
    // NEGATIVE CONTROL: the error really does carry the number.
    expect(leaky.message).toContain(SYNTHETIC_SUBSCRIBER);
    h.applyInboundReply.mockRejectedValueOnce(leaky);

    const res = await POST(
      twilioPost({ ...SYNTHETIC_REPLY, MessageSid: "SM-classifier-fault" }) as never,
    );

    // 200: a refusal would preserve nothing, and there is no verdict, so there
    // is no acknowledgement that could be true.
    expect(res.status).toBe(200);
    const logged = errors.map((a) => a.join(" ")).join("\n");
    expect(logged).toContain("sqlstate=42P01");
    expect(logged).toContain("SM-classifier-fault");
    expect(logged).not.toContain(SYNTHETIC_SUBSCRIBER);
    expect(logged).not.toContain("params");
    // NOTHING IS SENT. The reply may have been a STOP, and answering one with
    // an SMS is the single message that contradicts its own instruction.
    expect(h.sendSms).not.toHaveBeenCalled();
    // Nothing was filed either: there is no outcome to file.
    expect(h.recordForReview).not.toHaveBeenCalled();
    expect(captureMessage).toHaveBeenCalled();
    const tags =
      (captureMessage.mock.calls[0]?.[1] as { tags?: Record<string, string> } | undefined)?.tags ??
      {};
    const tagText = Object.values(tags).join(" ");
    expect(tagText).toContain("42P01");
    expect(tagText).not.toContain(SYNTHETIC_SUBSCRIBER);
  });

  /**
   * `SmsSid` IS READ, AND THIS IS THE ARM THAT SAYS SO. Twilio posts it on
   * every inbound SMS beside `MessageSid`, and the delivery-status route one
   * directory over already reads both. The whole mitigation on this path is
   * that the reply stays retrievable from the provider BY SID, so a line
   * reading `sid=absent` for a delivery that carried one is the mitigation
   * failing quietly.
   */
  it("names the SmsSid when the delivery carried no MessageSid", async () => {
    h.applyInboundReply.mockRejectedValueOnce(queryErrorFixture());
    const res = await POST(twilioPost({ ...SYNTHETIC_REPLY, SmsSid: "SM-sms-sid-only" }) as never);
    expect(res.status).toBe(200);
    const logged = errors.map((a) => a.join(" ")).join("\n");
    expect(logged).toContain("sid=SM-sms-sid-only");
    expect(logged).not.toContain("sid=absent");
    const tags =
      (captureMessage.mock.calls[0]?.[1] as { tags?: Record<string, string> } | undefined)?.tags ??
      {};
    expect(tags.sid).toBe("SM-sms-sid-only");
  });

  it("does not let the driver error escape the route", async () => {
    // An unguarded await REJECTS rather than refusing, which is the same defect
    // wearing a different coat - so the assertion is on the settled value and
    // not on a `.status` read after it.
    h.applyInboundReply.mockRejectedValueOnce(queryErrorFixture());
    const settled = await POST(twilioPost(SYNTHETIC_REPLY) as never).catch((e: unknown) => e);
    expect(settled, "the route rejected instead of answering").toBeInstanceOf(Response);
  });
});

describe("a failure to SEND the acknowledgement", () => {
  /**
   * The fixture carries the number, so the assertion that the log does not is a
   * measurement rather than a coincidence. `assertNotificationEnv` throwing
   * inside dispatch is the other way this await can fail.
   */
  function providerRejection() {
    return Object.assign(
      new Error(`The 'To' number ${SYNTHETIC_REPLIER} is not a valid phone number.`),
      { code: 21211, status: 400 },
    );
  }

  for (const [label, result] of [
    ["confirmed", { outcome: "confirmed", appointmentId: "a1", patientId: "p1" }],
    ["review", REVIEW],
  ] as const) {
    it(`is SWALLOWED on a ${label} verdict: 200, nothing escapes, no value on the line`, async () => {
      const rejection = providerRejection();
      // NEGATIVE CONTROL: the rejection really does carry the number.
      expect(rejection.message).toContain(SYNTHETIC_SUBSCRIBER);
      h.applyInboundReply.mockResolvedValue(result);
      h.sendSms.mockRejectedValueOnce(rejection);

      const settled = await POST(
        twilioPost({ ...SYNTHETIC_REPLY, MessageSid: `SM-send-fault-${label}` }) as never,
      ).catch((e: unknown) => e);

      expect(settled, "the route rejected instead of answering").toBeInstanceOf(Response);
      // SWALLOWED, NOT REFUSED: the reply was already decided and filed, so a
      // refusal would report a delivery as failed although both succeeded.
      expect((settled as Response).status).toBe(200);
      expect(h.recordForReview).toHaveBeenCalledOnce();
      const logged = errors.map((a) => a.join(" ")).join("\n");
      expect(logged).toContain(`SM-send-fault-${label}`);
      expect(logged).not.toContain(SYNTHETIC_SUBSCRIBER);
      expect(logged).not.toContain("not a valid phone number");
      const tags =
        (captureMessage.mock.calls[0]?.[1] as { tags?: Record<string, string> } | undefined)
          ?.tags ?? {};
      expect(Object.values(tags).join(" ")).not.toContain(SYNTHETIC_SUBSCRIBER);
    });
  }
});

describe("a reply carrying neither MessageSid nor SmsSid", () => {
  /**
   * WHAT THE MINTED FALLBACK ID ACTUALLY IS, measured rather than asserted in a
   * comment: `no-sid:<uuid>`, fresh per delivery. That and the review-reason
   * timing are unchanged here and tracked separately; this arm exists so the
   * property is written down in a form that goes red if it changes.
   */
  it("is never refused, and each delivery files under a DIFFERENT minted id", async () => {
    h.applyInboundReply.mockResolvedValue(REVIEW);
    h.recordForReview.mockRejectedValueOnce(new Error("store down"));

    const first = await POST(twilioPost(SYNTHETIC_REPLY) as never);
    const second = await POST(twilioPost(SYNTHETIC_REPLY) as never);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    // The hoisted mock is declared with no parameters, so its recorded calls
    // are typed as the empty tuple; the cast is about the STUB'S TYPE and not
    // about the value, which the assertions below check on their own.
    const calls = h.recordForReview.mock.calls as unknown as [{ providerMessageSid: string }][];
    const sids = calls.map((c) => c[0].providerMessageSid);
    expect(sids).toHaveLength(2);
    for (const sid of sids) expect(sid).toMatch(/^no-sid:/);
    expect(sids[0], "the minted id is stable across deliveries, so the insert DOES dedupe").not.toBe(
      sids[1],
    );
    // And the line that reports the first failure says the sid is absent
    // rather than inventing one.
    expect(errors.map((a) => a.join(" ")).join("\n")).toContain("sid=absent");
  });

  /**
   * THE CONTROL: a delivery that carries `SmsSid` alone is NOT in the minted
   * path at all. It files under the provider's own id, which is the narrowing
   * the shared read buys.
   */
  it("files under SmsSid when that is the only id the delivery carries", async () => {
    h.applyInboundReply.mockResolvedValue(REVIEW);
    await POST(twilioPost({ ...SYNTHETIC_REPLY, SmsSid: "SM-sms-sid-only" }) as never);
    const calls = h.recordForReview.mock.calls as unknown as [{ providerMessageSid: string }][];
    expect(calls).toHaveLength(1);
    expect(calls[0][0].providerMessageSid).toBe("SM-sms-sid-only");
  });
});

describe("the three acknowledgement bodies are APPROVED, and the capability is still shut", () => {
  it("every reply_ack template is registered approved by JP on 2026-09-01", async () => {
    // They shipped `approved: false` on 2026-08-31 and the gate refused every
    // send. WF-18 A approved them AS WRITTEN, so this assertion flipped without
    // a single body changing - which is the property that makes the registry an
    // approval ledger rather than a formality.
    const { REMINDER_TEMPLATES } = await import("@/lib/reminders/notification-registry");
    const acks = REMINDER_TEMPLATES.filter((t) => t.id.startsWith("reply_ack."));
    expect(acks).toHaveLength(3);
    for (const t of acks) {
      expect(t.approved, t.id).toBe(true);
      expect(t.approvedBy, t.id).toBe("JP");
      expect(t.approvedAt, t.id).toBe("2026-09-01");
    }
  });

  it("the gate now PASSES them when live send is armed", async () => {
    const { createNotifier, buildRegistry, createTestSink } = await import("@osteojp/notify");
    const { REMINDER_TEMPLATES } = await import("@/lib/reminders/notification-registry");
    // A SINK, not a throwing stub. These bodies are approved now, so the
    // dispatch reaches the transport; a stub that threw would report an
    // approval pass as a send failure and hide which gate answered.
    const sink = createTestSink();
    const notifier = createNotifier({
      registry: buildRegistry([...REMINDER_TEMPLATES]),
      transport: sink,
      transportConfigured: () => true,
      envFlags: ["REMINDERS_LIVE_SEND"],
      // "ARMED" HAS TO MEAN "ARMED AND CORRECTLY CONFIGURED". Since INC-12 the
      // env assertion runs inside dispatch, AFTER the approval gate - so while
      // these bodies were unapproved this test never reached it, and the moment
      // they were approved a bare env made the assertion throw instead of
      // exercising the gate this test is about. Placeholders only; nothing here
      // is a credential.
      env: {
        REMINDERS_LIVE_SEND: "true",
        RESEND_API_KEY: "test",
        REMINDERS_EMAIL_FROM: "test",
        TWILIO_ACCOUNT_SID: "test",
        TWILIO_AUTH_TOKEN: "test",
        TWILIO_SMS_FROM: "test",
        REMINDERS_RESCHEDULE_BASE_URL: "test",
        REMINDERS_LINK_SECRET: "test",
      },
      logger: { info: () => {}, error: () => {} },
    });
    for (const id of [
      "reply_ack.confirmed.sms",
      "reply_ack.cancelled.sms",
      "reply_ack.review.sms",
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const out = await notifier.dispatch({
        templateId: id,
        channel: "sms",
        to: "+351912345678",
        body: "irrelevant",
      });
      expect(out, id).toMatchObject({ sent: true });
    }
    expect(sink.records).toHaveLength(3);
  });

  it("THE KILL SWITCH STILL HOLDS THEM, AND IT IS NOT THE ONLY LOCK", async () => {
    // CORRECTED 2026-09-04. This comment read "REMINDERS_INBOUND is already
    // armed in production - so this is the only thing between an
    // acknowledgement and a real patient's phone". That was never measured:
    // production env is not readable from this repository (standing rule 1),
    // and the same false sentence sat in notification-registry.ts. There are
    // TWO locks in front of these bodies today - the capability itself is a
    // hard refusal while the live sender is the alphanumeric id `OsteoJP`
    // (SR-47), so nothing ever reaches this gate. It must still fail loudly if
    // the kill switch stops holding, because it is the lock that survives the
    // day the clinic buys a number.
    const { createNotifier, buildRegistry, createTestSink } = await import("@osteojp/notify");
    const { REMINDER_TEMPLATES } = await import("@/lib/reminders/notification-registry");
    const sink = createTestSink();
    const notifier = createNotifier({
      registry: buildRegistry([...REMINDER_TEMPLATES]),
      transport: sink,
      transportConfigured: () => true,
      envFlags: ["REMINDERS_LIVE_SEND"],
      env: {}, // the flag is OFF
      logger: { info: () => {}, error: () => {} },
    });
    const out = await notifier.dispatch({
      templateId: "reply_ack.confirmed.sms",
      channel: "sms",
      to: "+351912345678",
      body: "irrelevant",
    });
    expect(out).toMatchObject({ sent: false, reason: "live_send_disabled" });
    expect(sink.records).toHaveLength(0);
  });
});
