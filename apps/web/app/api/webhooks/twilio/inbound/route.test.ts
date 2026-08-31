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
vi.mock("@/lib/reminders/inbound-store", () => ({ recordForReview: h.recordForReview }));

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
] as const;
const saved: Record<string, string | undefined> = {};

function arm() {
  process.env.REMINDERS_INBOUND = "true";
  process.env.REMINDERS_INBOUND_TENANT_ID = TENANT;
  process.env.REMINDERS_INBOUND_BASE_URL = BASE;
  process.env.TWILIO_AUTH_TOKEN = TOKEN;
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

beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  h.applyInboundReply.mockReset();
  h.sendSms.mockClear();
  h.recordForReview.mockClear();
  h.applyInboundReply.mockResolvedValue({ outcome: "confirmed", appointmentId: "a1" });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
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
    h.applyInboundReply.mockResolvedValue({ outcome: "cancelled", appointmentId: "a1" });
    await POST(twilioPost({ ...REPLY, Body: "Nao" }) as never);
    expect(h.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: "reply_ack.cancelled.sms" }),
    );

    h.sendSms.mockClear();
    h.applyInboundReply.mockResolvedValue({
      outcome: "review",
      reason: "ambiguous",
      intent: "review",
    });
    await POST(twilioPost({ ...REPLY, Body: "talvez" }) as never);
    expect(h.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: "reply_ack.review.sms" }),
    );
  });

  it("NEVER answers a STOP with an SMS", async () => {
    // Replying to an opt-out is the one message that contradicts the
    // instruction it is answering.
    h.applyInboundReply.mockResolvedValue({ outcome: "opt_out", patientId: "p1" });
    const res = await POST(twilioPost({ ...REPLY, Body: "STOP" }) as never);
    expect(res.status).toBe(200);
    expect(h.sendSms).not.toHaveBeenCalled();
  });

  it("hands a review outcome to the reception queue seam", async () => {
    h.applyInboundReply.mockResolvedValue({
      outcome: "review",
      reason: "no_patient_match",
      intent: "review",
    });
    await POST(twilioPost(REPLY) as never);
    expect(h.recordForReview).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, reason: "no_patient_match" }),
    );
  });

  it("200s even when the reply changed nothing — a handled reply is not a failure", async () => {
    // A non-2xx makes Twilio redeliver, and the redelivery would take the same
    // decision again. "Nothing to do" is a successful outcome for a webhook.
    h.applyInboundReply.mockResolvedValue({
      outcome: "review",
      reason: "outside_window",
      intent: "confirmada",
    });
    const res = await POST(twilioPost(REPLY) as never);
    expect(res.status).toBe(200);
  });

  it("does not fall over on an empty body or a missing From", async () => {
    h.applyInboundReply.mockResolvedValue({
      outcome: "review",
      reason: "no_patient_match",
      intent: "review",
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

describe("the three acknowledgement bodies are UNAPPROVED, and that is the point", () => {
  it("every reply_ack template is registered approved:false", async () => {
    const { REMINDER_TEMPLATES } = await import("@/lib/reminders/notification-registry");
    const acks = REMINDER_TEMPLATES.filter((t) => t.id.startsWith("reply_ack."));
    expect(acks).toHaveLength(3);
    for (const t of acks) {
      expect(t.approved, t.id).toBe(false);
      expect(t.approvedBy, t.id).toBeNull();
    }
  });

  it("the gate refuses them as template_unapproved even with live send armed", async () => {
    const { createNotifier, buildRegistry } = await import("@osteojp/notify");
    const { REMINDER_TEMPLATES } = await import("@/lib/reminders/notification-registry");
    const notifier = createNotifier({
      registry: buildRegistry([...REMINDER_TEMPLATES]),
      transport: {
        sendEmail: async () => {
          throw new Error("must not send");
        },
        sendSms: async () => {
          throw new Error("must not send");
        },
      },
      transportConfigured: () => true,
      envFlags: ["REMINDERS_LIVE_SEND"],
      env: { REMINDERS_LIVE_SEND: "true" },
      logger: { info: () => {}, error: () => {} },
    });
    for (const id of [
      "reply_ack.confirmed.sms",
      "reply_ack.cancelled.sms",
      "reply_ack.review.sms",
    ]) {
      const out = await notifier.dispatch({
        templateId: id,
        channel: "sms",
        to: "+351912345678",
        body: "irrelevant",
      });
      expect(out, id).toMatchObject({ sent: false, reason: "template_unapproved" });
    }
  });
});
