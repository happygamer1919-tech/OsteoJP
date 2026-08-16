import "server-only";
import { AUDIO_FILENAME, AudioStorageConfigError, signAudioDownload } from "./audio-storage";
import { M1WebhookConfigError, buildM1Payload, fireM1Webhook } from "./m1-webhook";
import { classifyFireStatus, hasReachedCeiling } from "./retry-policy";
import { markDelivered, markNeedsAttention, markPending } from "./consultation-store";

// ONE fire attempt, and the recording of its outcome.
//
// THIS MODULE EXISTS SO THE FIRST FIRE AND THE RETRY CANNOT DRIFT APART. They
// are the same operation attempted at different times, and the two ways they
// could silently diverge are exactly the two the partner would pay for: a
// different rule about which status counts as delivered, or a different source
// for the timestamps. Both call sites go through here, so both get one answer.

/** Everything an attempt needs, all of it read from the persisted row. */
export type FireSubject = {
  id: string;
  patientId: string;
  doctorId: string;
  audioObjectKey: string;
  /** ISO-8601. FROM THE ROW. Never stamped here — see attemptFire. */
  consultationStartedAt: string;
  consultationEndedAt: string;
};

export type AttemptOutcome =
  | { verdict: "delivered"; attempt: number; status: number }
  | { verdict: "retry"; attempt: number; error: string };

/** Injectable for tests; production uses the real signer and the real fire. */
export type FireDeps = {
  signDownload: typeof signAudioDownload;
  fire: typeof fireM1Webhook;
};

const DEFAULT_DEPS: FireDeps = { signDownload: signAudioDownload, fire: fireM1Webhook };

/** The presigned GET the partner pulls the audio with. Re-signed on every
 *  attempt because it lasts an hour and a retry can be a day later. */
export const AUDIO_GET_TTL_SECONDS = 3600;

/**
 * Make one attempt. Returns the verdict; writes nothing.
 *
 * THE TIMESTAMPS ARE FORWARDED VERBATIM FROM `subject` AND ARE NEVER STAMPED
 * HERE. There is no `new Date()` on this path, and that is load-bearing rather
 * than tidy. The partner derives their idempotency key from patient_id +
 * consultation_started_at + consultation_ended_at. Re-stamping either instant on
 * a retry would present a NEW key for the SAME consultation, and their side
 * would create a SECOND clinical record instead of replaying the first — with
 * both sides reporting success. `fire-attempt.test.ts` pins this by firing the
 * same subject twice and requiring the two payloads' timestamps to be identical.
 *
 * What IS re-derived, deliberately, is the presigned audio URL: it expires in an
 * hour and a retry can be a day later. It is not part of the key.
 */
export async function attemptFire(
  subject: FireSubject,
  attempt: number,
  deps: FireDeps = DEFAULT_DEPS,
): Promise<AttemptOutcome> {
  let audioUrl: string;
  try {
    audioUrl = await deps.signDownload(subject.audioObjectKey, AUDIO_GET_TTL_SECONDS);
  } catch (e) {
    // A config error is an OPERATOR problem, not a lost consultation: the row
    // stays pending and the next tick after the env is fixed delivers it.
    return { verdict: "retry", attempt, error: errorTag(e) };
  }

  const payload = buildM1Payload({
    audioUrl,
    audioFilename: AUDIO_FILENAME,
    patientId: subject.patientId,
    doctorId: subject.doctorId,
    consultationStartedAt: subject.consultationStartedAt,
    consultationEndedAt: subject.consultationEndedAt,
    consultationId: subject.id,
    attempt,
  });

  let status: number;
  try {
    const res = await deps.fire(payload);
    status = res.status;
  } catch (e) {
    // Network failure, DNS, a thrown config error from readConfig. All retryable.
    return { verdict: "retry", attempt, error: errorTag(e) };
  }

  // 200/201 deliver; 409 ALSO delivers — it is the partner's idempotent refusal
  // to create a second record under a key only WE could have sent, i.e. proof an
  // earlier attempt of ours landed and its acknowledgement never reached us.
  // Full reasoning on classifyFireStatus in retry-policy.ts.
  if (classifyFireStatus(status) === "delivered") {
    return { verdict: "delivered", attempt, status };
  }
  return { verdict: "retry", attempt, error: `http_${status}` };
}

/**
 * Persist the outcome, applying the ceiling.
 *
 * The ceiling is applied HERE rather than at either call site so there is one
 * place that decides a consultation has stopped being retried, and one place
 * that emits the line a human needs to find it.
 */
export async function recordOutcome(
  subject: Pick<FireSubject, "id" | "patientId">,
  outcome: AttemptOutcome,
  now: Date,
): Promise<void> {
  if (outcome.verdict === "delivered") {
    await markDelivered(subject.id, outcome.attempt, now);
    return;
  }

  if (hasReachedCeiling(outcome.attempt)) {
    await markNeedsAttention(subject.id, outcome.attempt, now, outcome.error);
    // THE ONLY LINE THAT SAYS A CONSULTATION WAS GIVEN UP ON. Ids only — no
    // clinical content, no payload, no audio URL (it is a signed credential).
    // The patient id is here because it is what makes the row actionable
    // without a second query, the same shape as the fan-out warning in
    // lib/notifications/centre.ts.
    console.error(
      `[consultation] fire ABANDONED after ${outcome.attempt} attempts ` +
        `consultation=${subject.id} patient=${subject.patientId} last_error=${outcome.error}`,
    );
    return;
  }

  await markPending(subject.id, outcome.attempt, now, outcome.error);
}

/** A short, PII-free tag for last_error. Never a response body or a payload. */
function errorTag(e: unknown): string {
  if (e instanceof AudioStorageConfigError || e instanceof M1WebhookConfigError) {
    // The message carries env var NAMES only, by construction in both classes.
    return `config:${e.name}`;
  }
  return `error:${e instanceof Error ? e.name : "unknown"}`;
}
