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
