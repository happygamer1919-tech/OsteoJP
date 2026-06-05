import { describe, expect, it } from "vitest";
import { constructEvent, signWebhookPayload, TOLERANCE_SECONDS } from "./webhook";
import { StripeSignatureError } from "./errors";

const SECRET = "whsec_test_secret";
const NOW = new Date("2026-06-03T12:00:00Z");
const NOW_SEC = Math.floor(NOW.getTime() / 1000);

const BODY = JSON.stringify({
  id: "evt_1",
  type: "payment_intent.succeeded",
  data: { object: { id: "pi_1", metadata: { tenant_id: "t-1", invoice_id: "inv-1" } } },
});

/** Build a valid Stripe-Signature header for a body at a given timestamp. */
function sigHeader(body: string, timestamp: number, secret = SECRET): string {
  return `t=${timestamp},v1=${signWebhookPayload(body, timestamp, secret)}`;
}

describe("constructEvent — valid signature", () => {
  it("verifies and parses the event", () => {
    const headers = { "stripe-signature": sigHeader(BODY, NOW_SEC) };
    const event = constructEvent(BODY, headers, { secret: SECRET, now: NOW });
    expect(event.id).toBe("evt_1");
    expect(event.type).toBe("payment_intent.succeeded");
  });

  it("accepts a header carrying multiple v1 signatures (rotation), one matching", () => {
    const good = signWebhookPayload(BODY, NOW_SEC, SECRET);
    const headers = { "stripe-signature": `t=${NOW_SEC},v1=deadbeef,v1=${good}` };
    expect(() => constructEvent(BODY, headers, { secret: SECRET, now: NOW })).not.toThrow();
  });

  it("accepts a timestamp at the edge of the tolerance window", () => {
    const ts = NOW_SEC - TOLERANCE_SECONDS;
    const headers = { "stripe-signature": sigHeader(BODY, ts) };
    expect(() => constructEvent(BODY, headers, { secret: SECRET, now: NOW })).not.toThrow();
  });
});

describe("constructEvent — rejections", () => {
  it("rejects a missing signature header", () => {
    const err = (() => {
      try {
        constructEvent(BODY, {}, { secret: SECRET, now: NOW });
      } catch (e) {
        return e as StripeSignatureError;
      }
    })();
    expect(err).toBeInstanceOf(StripeSignatureError);
    expect(err?.reason).toBe("missing_signature");
    expect(err?.retryable).toBe(false);
  });

  it("rejects a malformed header (no v1)", () => {
    const headers = { "stripe-signature": `t=${NOW_SEC}` };
    expect(() => constructEvent(BODY, headers, { secret: SECRET, now: NOW })).toThrow(
      StripeSignatureError,
    );
  });

  it("rejects a stale timestamp (outside tolerance)", () => {
    const ts = NOW_SEC - TOLERANCE_SECONDS - 1;
    const headers = { "stripe-signature": sigHeader(BODY, ts) };
    const err = (() => {
      try {
        constructEvent(BODY, headers, { secret: SECRET, now: NOW });
      } catch (e) {
        return e as StripeSignatureError;
      }
    })();
    expect(err?.reason).toBe("stale_timestamp");
  });

  it("rejects a signature computed with the WRONG secret", () => {
    const headers = { "stripe-signature": sigHeader(BODY, NOW_SEC, "whsec_attacker") };
    const err = (() => {
      try {
        constructEvent(BODY, headers, { secret: SECRET, now: NOW });
      } catch (e) {
        return e as StripeSignatureError;
      }
    })();
    expect(err?.reason).toBe("no_match");
  });

  it("rejects a TAMPERED body (signature no longer matches)", () => {
    const headers = { "stripe-signature": sigHeader(BODY, NOW_SEC) };
    const tampered = BODY.replace("inv-1", "inv-999");
    expect(() => constructEvent(tampered, headers, { secret: SECRET, now: NOW })).toThrow(
      StripeSignatureError,
    );
  });

  it("rejects a verified body that is not valid JSON", () => {
    const notJson = "not-json-payload";
    const headers = { "stripe-signature": sigHeader(notJson, NOW_SEC) };
    const err = (() => {
      try {
        constructEvent(notJson, headers, { secret: SECRET, now: NOW });
      } catch (e) {
        return e as StripeSignatureError;
      }
    })();
    expect(err?.reason).toBe("malformed_signature");
  });
});
