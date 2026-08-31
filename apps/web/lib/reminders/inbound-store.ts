// Inbound-reply store (W12-11) — STUB until the inbound-store migration lands.
//
// The real store reads/writes an `sms_inbound_events` table (tenant_id + RLS +
// an isolation test in the same PR, per CLAUDE.md) plus a patient opt-out flag.
// That migration is DEFERRED to the end of the migration relay, so this module
// is a typed stub: every read returns an EMPTY queue and every resolve is a
// guarded no-op. This lets the reception review UI + its actions compile and
// render (behind the OFF REMINDERS_INBOUND flag) with no schema dependency and
// no risk of a partial inbound surface touching real data.
//
// PII rule (#7): the real store keeps the sender phone HASHED and references the
// appointment by id, never logging the reply body or phone in clear.

export type InboundReviewItem = {
  id: string;
  /** ISO UTC receipt time. */
  receivedAt: string;
  /** The reply text, shown to reception. Source of truth is the store, never a URL. */
  body: string;
  /** Resolved patient display name when the sender matched a patient, else null. */
  patientName: string | null;
  /** Correlated appointment id when resolvable; null when ambiguous or none. */
  appointmentId: string | null;
};

export type ReviewResolution = "confirmed" | "cancelled" | "read";

/**
 * The reception review queue: inbound replies flagged "resposta por rever"
 * (R11 unmatched tier). Returns [] until the migration provides the store.
 */
export async function listReviewQueue(
  _tenantId: string,
): Promise<InboundReviewItem[]> {
  return [];
}

/**
 * Resolve a review item: mark the inbound row read, and for confirmed/cancelled
 * flip the appointment's confirmation_state (and, for cancelled, status). The
 * write path lands with the migration — no-op stub for now.
 */
export async function resolveReviewItem(_args: {
  tenantId: string;
  itemId: string;
  resolution: ReviewResolution;
}): Promise<void> {
  // Deferred to the inbound-store migration (service-role write, tenant_id
  // explicit, idempotent). Intentionally does nothing until then.
}

/* ================================================================== */
/* Recording a reply for reception — W14-04                            */
/* ================================================================== */

/**
 * Hand one inbound reply to the reception review queue.
 *
 * ==========================================================================
 * THIS IS A NO-OP TODAY AND IT IS THE ONE PART OF THE INBOUND PATH THAT
 * CANNOT BE FINISHED WITHOUT A MIGRATION.
 * ==========================================================================
 * The queue needs somewhere to keep the reply BODY - reception has to read
 * what the patient actually wrote in order to resolve it - and there is no
 * table that may hold it. `audit_log.metadata` is the wrong home twice over:
 * CLAUDE.md rule 7 keeps patient content out of logs, and audit_log has no
 * resolution state, so a queue built on it could never be worked. The real
 * store is `sms_inbound_events` (tenant_id + RLS + an isolation test in the
 * same PR, per CLAUDE.md), and authoring that migration is FROZEN: SR-11
 * released migration authorship to BLUE for 0068 only and re-froze it on
 * merge, pending a strategy release.
 *
 * WHAT IS AND IS NOT LOST. The transitions, the guard rails, the audit trail
 * and the signature check are all live and need no table - see
 * inbound-reply.ts, which writes an `audit_log` row (ids, intent, outcome,
 * reason, `source: patient-sms-reply`) for EVERY reply including the ones that
 * change nothing. So a reply is never silently dropped and reception's
 * question "did anything come in for this appointment" is answerable today.
 * What is missing is the WORKED QUEUE: the body on screen and the three
 * resolve buttons.
 *
 * WHY THE CALL SITE EXISTS ANYWAY. The route calls this for every
 * review-outcome reply. When 0069 lands, this function grows a body and the
 * queue fills with no change at the call site - which is the difference
 * between a deferred feature and an unwired one.
 */
export async function recordForReview(_args: {
  tenantId: string;
  /** Never logged by this function. Persisted by the migration-backed store. */
  body: string;
  fromPhone: string;
  appointmentId: string | null;
  patientId: string | null;
  reason: string;
}): Promise<void> {
  // Deferred to the sms_inbound_events migration. Deliberately silent: the
  // audit row written by applyInboundReply is the record that exists today,
  // and a second log line carrying the body here would breach PII rule #7 to
  // stand in for a table.
}
