// No `server-only` here, deliberately, matching lib/notify/clients.ts: booking.ts
// imports this module, and booking.ts is unit-tested under vitest's node env by
// three existing suites. Adding the import forced every one of them to mock it,
// which is a lot of blast radius for a marker. Nothing here touches a secret or
// a DB; it is a pure event emitter over an injectable consumer.
//
// In-app notifications for patient-initiated appointment changes (JP ruling,
// 2026-08-03: every patient cancel or reschedule must reach reception and the
// assigned therapist).
//
// WHAT THIS IS AND IS NOT. The notification CENTRE — the bell icon, the UI, the
// persistence — is a later loop. What lands here is the half that must not be
// retrofitted: a FIXED event contract emitted from the real write paths, and a
// consumer seam. The default consumer is a STUB that records nothing; it exists
// so the emit sites are real, exercised and tested now, and the later loop
// replaces one function rather than hunting for every place a change happens.
//
// The stub is deliberately loud about being a stub. A silent no-op that looks
// like a delivery is the exact pattern this codebase has been unpicking all
// session, so `delivered` is false and the log says so.
//
// PII RULE (#7) AND PAYLOAD MINIMISATION. The event carries IDENTIFIERS and
// INSTANTS only: no patient name, no phone, no email, no service name, no
// clinical content. Recipients are named by role and by practitioner id, not by
// contact detail. This mirrors the Inngest payload rule counsel reviewed, and it
// matters more here, not less: an in-app notification is rendered to staff who
// may not be entitled to the underlying record.

/**
 * What the patient did. All four are patient-initiated writes, never staff ones.
 *
 * GREW FROM 2 KINDS TO 4 under owner ruling WF-04 (R1, 2026-08-05), which
 * ratifies the extension as GROWTH of this contract rather than the redesign
 * LOOP 2 is forbidden to perform. `appointment_request` is "pedido de marcacao";
 * the pt-PT wording lives in packages/i18n, never in a type.
 *
 * `appointment_request` HAS NO PRODUCTION EMIT SITE YET, and that is a scope
 * boundary rather than a gap. Request-mode — the multi-resource services that
 * submit a pedido instead of confirming against one therapist's calendar — is
 * built by LOOP 4 (Decision C, WAVE-13.md section 1.4). A repo-wide search for
 * "pedido de marca" finds it only in documentation. The kind is defined and the
 * centre handles it now so LOOP 4 adds one emit call rather than reopening this
 * contract; until then it is exercised by tests only.
 */
export type PatientChangeKind =
  | "booked"
  | "cancelled"
  | "rescheduled"
  | "appointment_request";

/**
 * Who must see it. Reception is a ROLE (all reception users of the tenant); the
 * therapists are those assigned to the appointment, by id.
 *
 * PLURAL SINCE WF-05 (R2, 2026-08-05). JP's standing ruling of 2026-08-03 is
 * that every patient-initiated change reaches reception AND the assigned
 * therapist. Dual-participant services exist — Massagem 4 Maos, Sessao Familia —
 * and notifying only one of two assigned therapists would leave someone who is
 * on the appointment unaware the patient moved it, which is the failure that
 * ruling forbids. So BOTH are notified, derived from the standing ruling rather
 * than guessed. Notifying the primary only would have been a NEW restriction JP
 * never stated.
 */
export type NotificationAudience = {
  /** Every reception user in the tenant. */
  reception: true;
  /**
   * The assigned practitioners, by id. Never by name. One entry for an ordinary
   * appointment, more for a dual-participant service. Must be non-empty: an
   * appointment with no practitioner cannot be booked (booking.ts throws
   * `no_therapist` before it gets here), so an empty array means a caller built
   * the event wrongly and the fan-out would silently reach reception only.
   */
  practitionerIds: string[];
};

/**
 * The fixed contract. Adding a field here is a deliberate act with a diff; that
 * is the point. The later centre loop reads exactly this shape.
 */
export type PatientChangeEvent = {
  kind: PatientChangeKind;
  tenantId: string;
  appointmentId: string;
  patientId: string;
  audience: NotificationAudience;
  /** The appointment's start BEFORE the change, ISO-8601 UTC. */
  previousStartsAt: string;
  /** The start AFTER the change. Equal to previousStartsAt for a cancellation. */
  newStartsAt: string;
  /** When the patient acted, ISO-8601 UTC. */
  occurredAt: string;
};

export type ConsumerResult = {
  /** false for the stub. True only once something actually persists. */
  delivered: boolean;
};

export type PatientChangeConsumer = (e: PatientChangeEvent) => Promise<ConsumerResult>;

/**
 * The stub. Records nothing, and says so at every call. Structured and
 * greppable, ids only, so the emit sites can be verified in a deployed
 * environment before the centre exists.
 */
export const stubConsumer: PatientChangeConsumer = async (e) => {
  console.info(
    `[notifications] patient-change NOT DELIVERED (stub consumer, centre not built yet) ` +
      `kind=${e.kind} tenant=${e.tenantId} appointment=${e.appointmentId} ` +
      `practitioners=${e.audience.practitionerIds.join(",")} reception=true ` +
      `occurredAt=${e.occurredAt}`,
  );
  return { delivered: false };
};

let consumer: PatientChangeConsumer = stubConsumer;

/** Swap the consumer. Used by tests, and by the centre loop when it lands. */
export function setPatientChangeConsumer(next: PatientChangeConsumer): void {
  consumer = next;
}

export function resetPatientChangeConsumer(): void {
  consumer = stubConsumer;
}

/**
 * Emit a patient-initiated change. Call AFTER the write has committed.
 *
 * Best-effort by design and never throws: the appointment is already changed, so
 * a failed notification must not surface to the patient as a failed cancellation
 * — that would be a worse outcome than a missing staff notification. It is
 * logged at ERROR with the cause, not swallowed to a name, because a silent
 * swallow here is precisely how the reminder pipeline hid its own failure for
 * weeks (see docs/notifications-work-notes.md).
 */
export async function emitPatientChange(e: PatientChangeEvent): Promise<ConsumerResult> {
  try {
    return await consumer(e);
  } catch (err) {
    console.error(
      `[notifications] patient-change emit FAILED kind=${e.kind} ` +
        `tenant=${e.tenantId} appointment=${e.appointmentId}`,
      err instanceof Error ? `${err.name}: ${err.message}` : "unknown",
    );
    return { delivered: false };
  }
}
