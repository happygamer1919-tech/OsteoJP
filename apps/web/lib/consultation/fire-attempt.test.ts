import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
// consultation-store reaches for the drizzle handle at call time; the module
// import must not drag a database in. recordOutcome is exercised through these
// doubles so the ceiling and the log line can be asserted without one.
const markDelivered = vi.fn();
const markPending = vi.fn();
const markNeedsAttention = vi.fn();
vi.mock("./consultation-store", () => ({
  markDelivered: (...a: unknown[]) => markDelivered(...a),
  markPending: (...a: unknown[]) => markPending(...a),
  markNeedsAttention: (...a: unknown[]) => markNeedsAttention(...a),
  SCAN_LIMIT: 100,
}));

import { attemptFire, recordOutcome, type FireDeps, type FireSubject } from "./fire-attempt";
import { M1WebhookConfigError } from "./m1-webhook";
import { RETRY_CEILING } from "./retry-policy";

// 0064 — one fire attempt. The property this file exists for is the FIRST
// describe block: a retry re-sends the persisted timestamps VERBATIM.

const SUBJECT: FireSubject = {
  id: "c-1111",
  patientId: "p-2222",
  doctorId: "d-3333",
  audioObjectKey: "t-9999/p-2222/2026-08-16T09-00-00-000Z/consultation.webm",
  consultationStartedAt: "2026-08-16T09:00:00.000Z",
  consultationEndedAt: "2026-08-16T09:42:00.000Z",
};

function deps(status: number): FireDeps & { payloads: Record<string, unknown>[] } {
  const payloads: Record<string, unknown>[] = [];
  return {
    payloads,
    signDownload: vi.fn(async (key: string) =>
      // A different signature every call, as the real signer produces: the URL
      // is time-dependent and is NOT part of the partner's key.
      `https://bucket.s3.eu-central-1.amazonaws.com/${key}?X-Amz-Date=${payloads.length}`,
    ) as unknown as FireDeps["signDownload"],
    fire: vi.fn(async (payload: Record<string, unknown>) => {
      payloads.push(payload);
      return status >= 200 && status < 300
        ? ({ ok: true, status } as const)
        : ({ ok: false, status } as const);
    }) as unknown as FireDeps["fire"],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("A RETRY NEVER RE-STAMPS THE TIMESTAMPS", () => {
  it("attempt 2 sends byte-identical timestamps to attempt 1", async () => {
    // THE PIN. The partner's idempotency key is patient_id +
    // consultation_started_at + consultation_ended_at. If a retry re-stamped
    // either instant it would present a NEW key for the SAME consultation and
    // their side would create a SECOND clinical record instead of replaying the
    // first — and BOTH SIDES WOULD REPORT SUCCESS. Nobody would see the
    // duplicate until a clinician opened the patient.
    const d = deps(500);

    // The wall clock moves a day and a half between the two attempts. If any
    // `new Date()` existed on this path, the second payload would carry it.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-16T09:42:01.000Z"));
      await attemptFire(SUBJECT, 1, d);
      vi.setSystemTime(new Date("2026-08-17T22:15:00.000Z"));
      await attemptFire(SUBJECT, 2, d);
    } finally {
      vi.useRealTimers();
    }

    expect(d.payloads).toHaveLength(2);
    const [first, second] = d.payloads;
    expect(second.patient_id).toBe(first.patient_id);
    expect(second.consultation_started_at).toBe(first.consultation_started_at);
    expect(second.consultation_ended_at).toBe(first.consultation_ended_at);
    // ...and they are the SUBJECT's values, not merely equal to each other:
    // two attempts that both re-stamped to the same wrong instant would pass a
    // self-comparison.
    expect(second.consultation_started_at).toBe("2026-08-16T09:00:00.000Z");
    expect(second.consultation_ended_at).toBe("2026-08-16T09:42:00.000Z");
  });

  it("the three key fields are the only ones that must not move; the audio URL is re-signed", async () => {
    const d = deps(500);
    await attemptFire(SUBJECT, 1, d);
    await attemptFire(SUBJECT, 2, d);

    const [first, second] = d.payloads;
    // The presigned GET expires in an hour and a retry can be a day later, so it
    // MUST be re-derived. It is not part of the key.
    expect(second.audio_url).not.toBe(first.audio_url);
    expect(second.attempt).toBe(2);
    expect(first.attempt).toBe(1);
  });
});

describe("the M1 payload", () => {
  it("carries consultation_id and attempt on top of the seven frozen fields", async () => {
    const d = deps(201);
    await attemptFire(SUBJECT, 3, d);

    expect(d.payloads[0]).toEqual({
      // the seven frozen fields, unchanged
      audio_url: expect.stringContaining(SUBJECT.audioObjectKey),
      audio_filename: "consultation.webm",
      patient_id: "p-2222",
      doctor_id: "d-3333",
      consultation_started_at: "2026-08-16T09:00:00.000Z",
      consultation_ended_at: "2026-08-16T09:42:00.000Z",
      template: "osteopathy",
      // the two added by 0064, and nothing else
      consultation_id: "c-1111",
      attempt: 3,
    });
  });
});

describe("verdicts", () => {
  it("201 delivers", async () => {
    await expect(attemptFire(SUBJECT, 1, deps(201))).resolves.toMatchObject({
      verdict: "delivered",
      status: 201,
    });
  });

  it("409 delivers — it is the partner's idempotent refusal, not a failure", async () => {
    await expect(attemptFire(SUBJECT, 4, deps(409))).resolves.toMatchObject({
      verdict: "delivered",
      status: 409,
      attempt: 4,
    });
  });

  it("500 stays pending and records a PII-free tag", async () => {
    await expect(attemptFire(SUBJECT, 2, deps(500))).resolves.toEqual({
      verdict: "retry",
      attempt: 2,
      error: "http_500",
    });
  });

  it("a config error is retryable, so an env fix delivers the consultation", async () => {
    const d = deps(201);
    d.fire = vi.fn(async () => {
      throw new M1WebhookConfigError(["M1_WEBHOOK_URL"]);
    }) as unknown as FireDeps["fire"];

    const out = await attemptFire(SUBJECT, 1, d);
    expect(out).toEqual({ verdict: "retry", attempt: 1, error: "config:M1WebhookConfigError" });
    // The tag names the error class, never the env VALUE — and never a body.
    expect(JSON.stringify(out)).not.toContain("http");
  });

  it("a failure to sign the audio URL is retryable, not a lost consultation", async () => {
    const d = deps(201);
    d.signDownload = vi.fn(async () => {
      throw new Error("boom");
    }) as unknown as FireDeps["signDownload"];

    await expect(attemptFire(SUBJECT, 1, d)).resolves.toEqual({
      verdict: "retry",
      attempt: 1,
      error: "error:Error",
    });
  });
});

describe("recordOutcome applies the ceiling in one place", () => {
  const now = new Date("2026-08-16T12:00:00.000Z");

  it("delivered clears the pending state", async () => {
    await recordOutcome(SUBJECT, { verdict: "delivered", attempt: 2, status: 409 }, now);
    expect(markDelivered).toHaveBeenCalledWith("c-1111", 2, now);
    expect(markPending).not.toHaveBeenCalled();
    expect(markNeedsAttention).not.toHaveBeenCalled();
  });

  it("a retry below the ceiling stays pending", async () => {
    await recordOutcome(SUBJECT, { verdict: "retry", attempt: 2, error: "http_500" }, now);
    expect(markPending).toHaveBeenCalledWith("c-1111", 2, now, "http_500");
    expect(markNeedsAttention).not.toHaveBeenCalled();
  });

  it("the ceiling moves it to needs_attention AND logs the ids a human needs", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await recordOutcome(SUBJECT, { verdict: "retry", attempt: RETRY_CEILING, error: "http_500" }, now);

    expect(markNeedsAttention).toHaveBeenCalledWith("c-1111", RETRY_CEILING, now, "http_500");
    expect(markPending).not.toHaveBeenCalled();

    // Requirement: a stuck consultation must be findable by a human. Both ids,
    // and nothing clinical.
    const line = err.mock.calls[0]?.[0] as string;
    expect(line).toContain("consultation=c-1111");
    expect(line).toContain("patient=p-2222");
    expect(line).not.toContain(SUBJECT.audioObjectKey); // a signed-URL input, not for logs
    err.mockRestore();
  });
});
