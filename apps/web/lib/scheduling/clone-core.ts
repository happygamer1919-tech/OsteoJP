// Schedule-again clone — PURE core (no DB, no server-only, no auth). Encodes the
// field-by-field mapping for cloning an existing appointment into a new, fresh
// one: copy the clinical shape (patient / practitioner / service / location) and
// the duration, reset the lifecycle, and drop every grouping/series/per-visit
// field. Kept separate from actions.ts so the mapping unit-tests without the
// server/Next/DB chain (mirrors batch-core.ts vs batch.ts).
//
// The two lifecycle axes are orthogonal (see CLAUDE.md rule 4 + schema.ts): a
// clone resets BOTH `status` → "scheduled" and `confirmation_state` → "pending".

/** The source appointment fields the clone reads. Everything else on the source
 * row (grouping ids, series pointers, per-visit notes, lifecycle timestamps) is
 * deliberately NOT read, because a clone never copies it. */
export type CloneSource = {
  patientId: string;
  practitionerId: string;
  locationId: string;
  serviceId: string | null;
  // Secondary participants (W4-19, 0032) — read so the clone can COPY them.
  patientTwoId: string | null;
  practitionerTwoId: string | null;
  startsAt: Date;
  endsAt: Date;
};

/** Tenant + acting user, both derived from the JWT context — never the payload. */
export type CloneActor = { tenantId: string; userId: string };

/**
 * The insert values for the cloned appointment. Fields fall into three groups,
 * exactly per the loop mapping:
 *   COPIED from source   — patientId, practitionerId, serviceId, locationId, and
 *                          the duration (re-applied to the new startsAt).
 *   FRESH / from context — tenantId, createdBy (JWT), startsAt (caller), endsAt
 *                          (derived), status="scheduled", confirmationState="pending".
 *   NOT COPIED → null    — everything a clone must not inherit: the confirmation
 *                          receipt, the recurrence series, the 0027 booking group,
 *                          the 0028 batch, the room, and the inline per-visit note.
 *                          Set to null EXPLICITLY (not omitted) so the "not copied"
 *                          guarantee is legible and cannot silently regress if a
 *                          column default ever changes. createdAt/updatedAt are
 *                          omitted so they take fresh DB defaults.
 * The appointment_notes relation (0026) is a separate table and is never written.
 */
export type ClonedAppointmentValues = {
  tenantId: string;
  patientId: string;
  practitionerId: string;
  locationId: string;
  serviceId: string | null;
  // Secondary participants (W4-19) — COPIED as-is (owner ruling), unlike the
  // grouping/series/room/notes fields a clone drops.
  patientTwoId: string | null;
  practitionerTwoId: string | null;
  startsAt: Date;
  endsAt: Date;
  status: "scheduled";
  confirmationState: "pending";
  confirmationReceivedAt: null;
  confirmationChannel: null;
  recurrenceRule: null;
  recurrenceParentId: null;
  bookingGroupId: null;
  batchId: null;
  room: null;
  notes: null;
  createdBy: string;
};

/**
 * Build the cloned appointment's insert values from a source row, a new start,
 * and the acting context. Pure: no I/O. Duration is derived (`ends_at -
 * starts_at` on the source) and re-applied to `newStartsAt`, so a non-round
 * duration (e.g. 45 min) is preserved exactly at the new start.
 */
export function buildClonedAppointment(
  source: CloneSource,
  newStartsAt: Date,
  actor: CloneActor,
): ClonedAppointmentValues {
  const durationMs = source.endsAt.getTime() - source.startsAt.getTime();
  return {
    // Fresh / from context.
    tenantId: actor.tenantId,
    createdBy: actor.userId,
    startsAt: newStartsAt,
    endsAt: new Date(newStartsAt.getTime() + durationMs),
    status: "scheduled",
    confirmationState: "pending",
    // Copied from source.
    patientId: source.patientId,
    practitionerId: source.practitionerId,
    locationId: source.locationId,
    serviceId: source.serviceId,
    // Secondary participants (W4-19) — COPIED as-is (owner ruling): schedule-again
    // reproduces the same two participants.
    patientTwoId: source.patientTwoId,
    practitionerTwoId: source.practitionerTwoId,
    // Not copied — a clone is a standalone one-off on a fresh lifecycle.
    confirmationReceivedAt: null,
    confirmationChannel: null,
    recurrenceRule: null,
    recurrenceParentId: null,
    bookingGroupId: null,
    batchId: null,
    room: null,
    notes: null,
  };
}
