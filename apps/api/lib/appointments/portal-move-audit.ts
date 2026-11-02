// No `server-only` here, deliberately: this is a pure builder with no secret
// and no database, imported by store.ts and unit-tested under vitest's node env.
//
// R44 (strategy, 2026-11-02): A PATIENT'S OWN MOVE IN THE PORTAL WRITES THE
// SAME AUDIT ROW A STAFF MOVE WRITES.
//
// Before this, `rescheduleOwn` (./store.ts) changed `starts_at` with no audit
// row at all, so the reminder sweep could not see the move
// (apps/web/lib/reminders/reminder-population.ts, "THE GAP THAT REMAINS").
// The sweep reads a move through its `moved` clause, which matches:
//   entity_type  'appointment'
//   entity_id    the appointment's id
//   action       'appointment.reschedule'
//   metadata     `fromStartsAt` (the start the move LEFT) and `startsAt` (the
//                start it made), both as `toISOString()` millisecond text
// and reads it under the tenant's own claims. The staff writer
// (apps/web/lib/scheduling/actions.ts, `moveAppointment`, through
// apps/web/lib/scheduling/audit.ts, `writeAppointmentAudit`) writes exactly
// those keys. This builder writes the same ones, and
// portal-move-audit.test.ts holds the two together.
//
// WHAT DIFFERS FROM THE STAFF ROW, and why:
//   actorUserId  null: a patient has no `users` row (the same reason the portal
//                booking writes `createdBy: null`, see store.ts).
//   ip           null: the store is not handed the request.
//   via          "patient_portal": who made the move, since the actor is
//                null. No clause reads `via` on this action.
//   scope, allowConflict  not written: a portal move is one visit, and the
//                patient cannot override a conflict.
//
// IDS AND INSTANTS ONLY (rule 7): no name, no phone, no email, no service name.

export type PortalMoveAuditRow = {
  tenantId: string;
  actorUserId: null;
  /** The action the sweep's `moved` clause reads, the same string the staff move writes. */
  action: "appointment.reschedule";
  entityType: "appointment";
  entityId: string;
  metadata: {
    practitionerId: string;
    locationId: string;
    fromStartsAt: string;
    startsAt: string;
    endsAt: string;
    via: "patient_portal";
  };
  ip: null;
};

/**
 * The `audit_log` values for one portal move. `fromStartsAt` is the start the
 * row held before the move, read in the move's own transaction.
 */
export function portalMoveAuditRow(args: {
  tenantId: string;
  appointmentId: string;
  practitionerId: string;
  locationId: string;
  fromStartsAt: Date;
  startsAt: Date;
  endsAt: Date;
}): PortalMoveAuditRow {
  return {
    tenantId: args.tenantId,
    actorUserId: null,
    action: "appointment.reschedule",
    entityType: "appointment",
    entityId: args.appointmentId,
    metadata: {
      practitionerId: args.practitionerId,
      locationId: args.locationId,
      fromStartsAt: args.fromStartsAt.toISOString(),
      startsAt: args.startsAt.toISOString(),
      endsAt: args.endsAt.toISOString(),
      via: "patient_portal",
    },
    ip: null,
  };
}
