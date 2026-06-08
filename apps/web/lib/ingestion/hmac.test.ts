import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  REPLAY_WINDOW_SECONDS,
  signIngestionBody,
  verifyIngestionSignature,
} from "./hmac";

const SECRET = "test-only-ingestion-secret-not-andrei";
const SECRET_ENV = "AI_INGESTION_HMAC_SECRET";

const NOW = new Date("2026-06-02T12:00:00.000Z");
const NOW_SEC = Math.floor(NOW.getTime() / 1000);

const BODY = JSON.stringify({ idempotency_key: "k1", request_id: "r1" });

function headersFor(rawBody: string, ts: number, secret = SECRET): Record<string, string> {
  return {
    "x-osteojp-timestamp": String(ts),
    "x-osteojp-signature": signIngestionBody(rawBody, ts, secret),
  };
}

let saved: string | undefined;

beforeEach(() => {
  saved = process.env[SECRET_ENV];
  process.env[SECRET_ENV] = SECRET;
});

afterEach(() => {
  if (saved === undefined) delete process.env[SECRET_ENV];
  else process.env[SECRET_ENV] = saved;
});

describe("verifyIngestionSignature", () => {
  it("accepts a correctly signed, in-window request", () => {
    const res = verifyIngestionSignature(BODY, headersFor(BODY, NOW_SEC), NOW);
    expect(res.ok).toBe(true);
  });

  it("works against a Headers instance, not just a plain record", () => {
    const h = new Headers(headersFor(BODY, NOW_SEC));
    expect(verifyIngestionSignature(BODY, h, NOW).ok).toBe(true);
  });

  it("rejects a missing signature header", () => {
    const res = verifyIngestionSignature(BODY, { "x-osteojp-timestamp": String(NOW_SEC) }, NOW);
    expect(res).toEqual({ ok: false, reason: "missing_signature" });
  });

  it("rejects a missing timestamp header", () => {
    const res = verifyIngestionSignature(
      BODY,
      { "x-osteojp-signature": signIngestionBody(BODY, NOW_SEC, SECRET) },
      NOW,
    );
    expect(res).toEqual({ ok: false, reason: "missing_timestamp" });
  });

  it("rejects a tampered body (signature no longer matches)", () => {
    const headers = headersFor(BODY, NOW_SEC);
    const res = verifyIngestionSignature(BODY + "x", headers, NOW);
    expect(res).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a signature made with the wrong secret", () => {
    const res = verifyIngestionSignature(BODY, headersFor(BODY, NOW_SEC, "wrong"), NOW);
    expect(res).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a stale timestamp outside the replay window", () => {
    const stale = NOW_SEC - (REPLAY_WINDOW_SECONDS + 1);
    const res = verifyIngestionSignature(BODY, headersFor(BODY, stale), NOW);
    expect(res).toEqual({ ok: false, reason: "stale_timestamp" });
  });

  it("rejects a far-future timestamp (skew beyond the window)", () => {
    const future = NOW_SEC + (REPLAY_WINDOW_SECONDS + 1);
    const res = verifyIngestionSignature(BODY, headersFor(BODY, future), NOW);
    expect(res).toEqual({ ok: false, reason: "stale_timestamp" });
  });

  it("rejects a non-numeric timestamp", () => {
    const res = verifyIngestionSignature(
      BODY,
      { "x-osteojp-timestamp": "not-a-number", "x-osteojp-signature": "deadbeef" },
      NOW,
    );
    expect(res).toEqual({ ok: false, reason: "malformed_timestamp" });
  });

  it("fails loud (throws) when the secret env is unset", () => {
    delete process.env[SECRET_ENV];
    expect(() => verifyIngestionSignature(BODY, headersFor(BODY, NOW_SEC), NOW)).toThrow(
      /AI_INGESTION_HMAC_SECRET is not configured/,
    );
  });
});
