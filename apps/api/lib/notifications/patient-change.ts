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
  | "appointment_request"
  /**
   * A pedido was ACCEPTED. Added by owner ruling 2026-08-11, and it is the one
   * kind here that is NOT patient-initiated — the rest of this file's header
   * says "never staff ones", and this is the stated exception rather than a
   * quiet contradiction of it.
   *
   * WHY IT HAD TO EXIST. Reception's queue is a live query on state
   * (apps/web/lib/notifications/centre.ts:151-155 filters
   * `status = 'scheduled'`), so when a therapist confirms a pedido the row
   * simply VANISHES from that queue. Reception could not distinguish "a
   * therapist just accepted this" from "cancelled" or from "never there". This
   * kind is the record that the acceptance happened.
   *
   * SCOPE, and it is narrow on purpose: the CONFIRM path only. Staff cancel,
   * reschedule and no-show still emit nothing. That is a known gap, carded, not
   * forgotten.
   */
  | "confirmed";

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
  /**
   * WHO acted, when that is a staff member. 0061's `actor_user_id`.
   *
   * OMITTED for every patient-initiated kind, where the actor is the patient
   * already named by `patientId` and repeating them would be noise. Present for
   * `confirmed`, because reception receives this fan-out too and would
   * otherwise get their OWN confirmations back indistinguishable from a
   * therapist's — which is the noise that would have made the queue worse
   * rather than better.
   */
  actorUserId?: string | null;
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
  /**
   * WHY nothing was delivered. Absent when `delivered` is true.
   *
   * LE-pedido-emit-best-effort. A bare `delivered: false` is three different
   * facts wearing one face, which is PORTAL-REHYDRATE 1.3 exactly:
   *   `no_recipients`  the consumer ran, resolved nobody, and wrote NOTHING.
   *                    Not an error anywhere; nothing throws.
   *   `consumer_threw` the write was attempted and failed.
   *   `stub`           nothing was ever going to be written.
   * Every one of them leaves an `appointment_request` with no
   * `staff_notifications` row, and that row is the ONLY provenance marker
   * `is_unconfirmed_pedido` (migration 0059) can key on - so the CONSEQUENCES
   * are identical and the CAUSES are not. Optional, so a consumer that omits it
   * is still valid.
   */
  reason?: "no_recipients" | "consumer_threw" | "stub";
};

export type PatientChangeConsumer = (e: PatientChangeEvent) => Promise<ConsumerResult>;

/**
 * The stub. Records nothing, and says so at every call. Structured and
 * greppable, ids only.
 *
 * IT IS NO LONGER THE DEFAULT, AND MUST NEVER BECOME ONE AGAIN. INC-06,
 * 2026-08-09: it WAS the default, swapped at boot by a register() hook, and on
 * production that swap never reached the booking path. Two portal pedidos were
 * created on 2026-08-09 (09:02:52 and 09:04:08) and both logged this function's
 * line; a LEFT JOIN to staff_notifications returned null for both. Reception
 * never saw them, and because migration 0059 keys "unconfirmed pedido" on the
 * staff_notifications row, both pedidos then BLOCKED a staff booking with
 * "Conflito de terapeuta" - JP's option-B ruling silently inverted in
 * production.
 *
 * THE MECHANISM, from the build output rather than from reasoning. Turbopack
 * emitted TWO copies of this module. `.next/server/instrumentation.js` reaches
 * `chunks/apps_api_lib_notifications_patient-change_ts_*.js`, the copy that
 * carries `setPatientChangeConsumer`. The appointments route reaches
 * `chunks/apps_api_lib_appointments_booking_ts_*.js`, which has this module
 * INLINED, contains ZERO occurrences of `setPatientChangeConsumer`, and never
 * references the other chunk. The booking copy's module-level variable could not
 * be reassigned by anything, from any route, warm or cold. A boot hook cannot
 * fix a module it does not share.
 *
 * Kept exported because tests assert its shape and because an explicit
 * "deliver nothing" is a legitimate thing for a test to ask for. What is gone is
 * its role as the fallback.
 */
export const stubConsumer: PatientChangeConsumer = async (e) => {
  console.info(
    `[notifications] patient-change NOT DELIVERED (stub consumer, centre not built yet) ` +
      `kind=${e.kind} tenant=${e.tenantId} appointment=${e.appointmentId} ` +
      `practitioners=${e.audience.practitionerIds.join(",")} reception=true ` +
      `occurredAt=${e.occurredAt}`,
  );
  return { delivered: false, reason: "stub" };
};

/**
 * An EXPLICIT override, or null. Null means "resolve the real consumer", never
 * "fall back to the stub".
 *
 * The distinction is the whole fix. Before INC-06 this variable held the
 * consumer itself and was initialised to the stub, so a copy of this module that
 * nobody had called the setter on was indistinguishable from one that had been
 * deliberately stubbed - and silently degraded. Now an un-set copy has no
 * opinion and asks ./centre, which every copy can do for itself.
 */
let override: PatientChangeConsumer | null = null;

/**
 * Swap the consumer. TESTS ONLY now.
 *
 * It is no longer the production wiring: nothing has to call this for emits to
 * be delivered, which is the property INC-06 cost us. A suite that wants nothing
 * delivered passes `stubConsumer` and thereby SAYS SO, instead of relying on an
 * inert default that production also relied on.
 */
export function setPatientChangeConsumer(next: PatientChangeConsumer): void {
  override = next;
}

export function resetPatientChangeConsumer(): void {
  override = null;
}

/**
 * The real consumer, resolved per call and per module copy.
 *
 * A DYNAMIC IMPORT AND NOT A TOP-LEVEL ONE, for the reason this file's header
 * has always given: `./centre` imports `@osteojp/db`, and booking.ts imports
 * this module, so a static import would drag a database into every booking unit
 * suite. The specifier is a literal, so the bundler still traces it and every
 * emitted copy of this module carries its own reachable copy of the centre -
 * which is precisely why this survives the duplication that defeated the boot
 * hook.
 *
 * NOT MEMOISED. The import itself is cached by the module system, so a second
 * call costs a resolved-promise await, and caching it here would add a third
 * piece of module-level state of exactly the kind that caused INC-06.
 */
async function resolveConsumer(): Promise<PatientChangeConsumer> {
  if (override) return override;
  const { persistingConsumer } = await import("./centre");
  return persistingConsumer;
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
 *
 * THE try STILL COVERS THE RESOLUTION, deliberately. If `./centre` cannot be
 * imported the booking must still succeed - but the failure now surfaces as the
 * ERROR line below rather than as a cheerful info-level "NOT DELIVERED", which
 * is the log INC-06 hid behind for the life of the project.
 */
export async function emitPatientChange(e: PatientChangeEvent): Promise<ConsumerResult> {
  try {
    const consumer = await resolveConsumer();
    const result = await consumer(e);
    // A NOT-DELIVERED RESULT WAS AN ERROR NOWHERE, WHICH IS THE WHOLE DEFECT.
    // LE-pedido-emit-best-effort: all three call sites in
    // apps/api/lib/appointments/booking.ts write `await emitPatientChange({...})`
    // and read nothing back, and the only path that logged - the centre's
    // zero-recipients branch - logs at WARN and says what HAPPENED rather than
    // what it COSTS. So a pedido could be lost with no error line anywhere in
    // the system.
    if (!result.delivered) notDelivered(e, result.reason ?? null);
    return result;
  } catch (err) {
    console.error(
      `[notifications] patient-change emit FAILED kind=${e.kind} ` +
        `tenant=${e.tenantId} appointment=${e.appointmentId}`,
      err instanceof Error ? `${err.name}: ${err.message}` : "unknown",
    );
    notDelivered(e, "consumer_threw");
    return { delivered: false, reason: "consumer_threw" };
  }
}

/**
 * The one line that says what a lost emit COSTS, rather than what happened.
 *
 * WHY IT IS SEPARATE FROM THE FAILED LINE ABOVE, and why both fire on a throw:
 * they answer different questions. The FAILED line carries the CAUSE and is
 * what you read when something threw. This line carries the CONSEQUENCE and is
 * what you grep when reception says a pedido never arrived - and it fires on the
 * no-recipients path too, which throws nothing at all and would otherwise leave
 * no error line behind.
 *
 * `appointment_request` GETS THE EXTRA SENTENCE BECAUSE IT IS THE ONLY KIND
 * THAT CARRIES PROVENANCE. `is_unconfirmed_pedido` (migration 0059) decides
 * whether an appointment blocks its slot by joining `staff_notifications` on
 * `kind = 'appointment_request'`. No row means the appointment is
 * indistinguishable from a staff booking: reception is never told to confirm it,
 * AND it blocks the slot as though it had been confirmed. `cancelled` and
 * `rescheduled` lose visibility only - the appointment row already carries
 * their outcome.
 *
 * IDS ONLY, never a name, a number or a time of day (rule 7). The patient id is
 * deliberately absent: it is not needed to find the appointment, and this line
 * is meant to be safe to read in a shared log.
 */
function notDelivered(e: PatientChangeEvent, reason: string | null): void {
  const provenance =
    e.kind === "appointment_request"
      ? " PEDIDO HAS NO PROVENANCE ROW: reception will not see it AND it blocks its slot like a staff booking. Recover by hand from this appointment id."
      : "";
  console.error(
    `[notifications] patient-change NOT DELIVERED kind=${e.kind} ` +
      `reason=${reason ?? "unreported"} tenant=${e.tenantId} ` +
      `appointment=${e.appointmentId} ` +
      `practitioners=${e.audience.practitionerIds.join(",")}` +
      provenance,
  );
}
