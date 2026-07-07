import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import {
  M1WebhookConfigError,
  M1_TEMPLATE,
  buildM1Payload,
  fireM1Webhook,
} from "./m1-webhook";

// W4-09 — the M1 webhook contract + fire. These pin: ALL contract fields present
// with timestamps forwarded verbatim; `x-make-apikey` attached from env and
// NEVER placed in the body/logged; non-2xx handled without throwing; missing env
// throws (never a stub key).

const PAYLOAD_INPUT = {
  audioUrl: "https://osteojp-audio-intake.s3.eu-central-1.amazonaws.com/t1/p1/ts/consultation.webm?X-Amz-Signature=abc",
  audioFilename: "consultation.webm",
  patientId: "p1",
  doctorId: "d1",
  consultationStartedAt: "2026-07-07T01:00:00.000Z",
  consultationEndedAt: "2026-07-07T01:30:00.000Z",
};

describe("buildM1Payload (full mandatory contract)", () => {
  it("carries every field, template=osteopathy, timestamps forwarded verbatim", () => {
    const p = buildM1Payload(PAYLOAD_INPUT);
    expect(p).toEqual({
      audio_url: PAYLOAD_INPUT.audioUrl,
      audio_filename: "consultation.webm",
      patient_id: "p1",
      doctor_id: "d1",
      consultation_started_at: "2026-07-07T01:00:00.000Z",
      consultation_ended_at: "2026-07-07T01:30:00.000Z",
      template: "osteopathy",
    });
    expect(M1_TEMPLATE).toBe("osteopathy");
  });
});

describe("fireM1Webhook", () => {
  beforeEach(() => {
    process.env.M1_WEBHOOK_URL = "https://hook.make.test/osteojp";
    process.env.M1_WEBHOOK_API_KEY = "vault-webhook-secret-value";
  });
  afterEach(() => {
    delete process.env.M1_WEBHOOK_URL;
    delete process.env.M1_WEBHOOK_API_KEY;
  });

  it("POSTs with x-make-apikey from env; the key is in the HEADER, never the body", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      return { ok: true, status: 200 } as Response;
    });
    const payload = buildM1Payload(PAYLOAD_INPUT);
    const r = await fireM1Webhook(payload, fakeFetch as unknown as typeof fetch);

    expect(r).toEqual({ ok: true, status: 200 });
    expect(calls[0].url).toBe("https://hook.make.test/osteojp");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["x-make-apikey"]).toBe("vault-webhook-secret-value");
    // key NEVER in the body
    expect(String(calls[0].init.body)).not.toContain("vault-webhook-secret-value");
    // the body IS the contract
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ template: "osteopathy", audio_filename: "consultation.webm" });
  });

  it("returns { ok:false } on a non-2xx (does not throw)", async () => {
    const fakeFetch = vi.fn(async () => ({ ok: false, status: 401 }) as Response);
    const r = await fireM1Webhook(buildM1Payload(PAYLOAD_INPUT), fakeFetch as unknown as typeof fetch);
    expect(r).toEqual({ ok: false, status: 401 });
  });

  it("THROWS M1WebhookConfigError when the env is missing (never a stub key)", async () => {
    delete process.env.M1_WEBHOOK_API_KEY;
    await expect(
      fireM1Webhook(buildM1Payload(PAYLOAD_INPUT), (async () => ({ ok: true, status: 200 }) as Response) as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(M1WebhookConfigError);
  });
});
