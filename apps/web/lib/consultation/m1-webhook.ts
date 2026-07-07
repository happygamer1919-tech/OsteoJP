import "server-only";

// W4-09 — fire the M1 webhook (OsteoJP → André's Make.com scenario) after the
// audio lands in S3 (W4-08). André's pipeline pulls the audio via the presigned
// GET and transcribes it (SPEC §7, DECISIONS 2026-07-06).
//
//   - `x-make-apikey` (lowercase) on EVERY fire, value from vault key
//     `osteojp-m1-webhook-key` (referenced via env M1_WEBHOOK_API_KEY). Missing
//     or wrong header → 401 on André's side and the audio never enters the
//     scenario. The key lives in vault/env ONLY — never hardcoded, stubbed,
//     printed, logged, or committed; missing env THROWS (M1WebhookConfigError).
//   - ALL contract fields are mandatory on every fire.
//   - Timestamps are forwarded verbatim from W4-07's machine stamps (they feed
//     the ingestion idempotency key: patient_id + started + ended); this module
//     does not re-derive them.

const URL_ENV = "M1_WEBHOOK_URL";
const API_KEY_ENV = "M1_WEBHOOK_API_KEY"; // value = vault key `osteojp-m1-webhook-key`

/** The template selector André's transcription uses (SPEC §9). */
export const M1_TEMPLATE = "osteopathy";

export class M1WebhookConfigError extends Error {
  constructor(missing: string[]) {
    super(`m1 webhook env not configured: ${missing.join(", ")}`); // names only
    this.name = "M1WebhookConfigError";
  }
}

export interface M1WebhookPayload {
  audio_url: string; // presigned GET, 1h
  audio_filename: string; // e.g. consultation.webm — André's mappable token
  patient_id: string;
  doctor_id: string;
  consultation_started_at: string;
  consultation_ended_at: string;
  template: string;
}

/** Build the full, mandatory contract payload. Template is fixed to osteopathy. */
export function buildM1Payload(input: {
  audioUrl: string;
  audioFilename: string;
  patientId: string;
  doctorId: string;
  consultationStartedAt: string;
  consultationEndedAt: string;
}): M1WebhookPayload {
  return {
    audio_url: input.audioUrl,
    audio_filename: input.audioFilename,
    patient_id: input.patientId,
    doctor_id: input.doctorId,
    consultation_started_at: input.consultationStartedAt,
    consultation_ended_at: input.consultationEndedAt,
    template: M1_TEMPLATE,
  };
}

function readConfig(): { url: string; apiKey: string } {
  const url = process.env[URL_ENV];
  const apiKey = process.env[API_KEY_ENV];
  const missing = [!url && URL_ENV, !apiKey && API_KEY_ENV].filter(
    (v): v is string => typeof v === "string",
  );
  if (missing.length > 0) throw new M1WebhookConfigError(missing);
  return { url: url!, apiKey: apiKey! };
}

export type M1FireResult = { ok: true; status: number } | { ok: false; status: number };

/**
 * POST the contract to the M1 webhook with the `x-make-apikey` header (from env).
 * The key is never logged or returned. A non-2xx is returned as { ok:false }
 * (the caller surfaces it) — this never throws on an HTTP error, only on a
 * missing env (no key to send).
 */
export async function fireM1Webhook(
  payload: M1WebhookPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<M1FireResult> {
  const { url, apiKey } = readConfig();
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-make-apikey": apiKey, // never logged
    },
    body: JSON.stringify(payload),
  });
  return res.ok ? { ok: true, status: res.status } : { ok: false, status: res.status };
}
