import { can, type Role } from "@osteojp/auth";

/**
 * CARE-02b and CARE-02c: the pure half of "booking a therapist puts them on the
 * patient's care team". No database, no "server-only", so every rule here is
 * unit tested without a transaction.
 *
 * ==========================================================================
 * AUTOMATIC AND MANUAL ARE TOLD APART BY AN AUDIT ROW, NOT BY A COLUMN
 * ==========================================================================
 * `patient_care_team` has `assigned_by` and `assigned_at` and no `source`, and
 * adding one is a migration this card may not ship. Three ways to tell the two
 * kinds apart without one were weighed:
 *
 *   assigned_by IS NULL   Collides with 0091's own meaning: NULL is what
 *                         ON DELETE SET NULL leaves when the ASSIGNER's account
 *                         is deleted, so a manual row would flip to automatic.
 *   assigned_by = user_id A convention nothing enforces. An owner who is also a
 *                         practitioner can assign themselves by hand, and that
 *                         row would read as automatic. It also throws away who
 *                         actually made the booking.
 *   an audit_log row      CHOSEN. Every automatic write appends one
 *                         `care_team.auto_assign` row whose `entity_id` IS THE
 *                         CARE TEAM ROW'S OWN ID. The match is on a primary
 *                         key, exact and one to one; audit_log is append-only
 *                         (no UPDATE or DELETE policy, 0001), so the label cannot
 *                         be edited away; and CLAUDE.md rule 6 already requires
 *                         an audit row for a write that widens what a therapist
 *                         can read, so the discriminator costs no extra write.
 *
 * EVERY ROW WRITTEN BEFORE THIS CHANGE READS AS MANUAL, which is true: until
 * now the only writer was reception pressing Atribuir. A manual assignment keeps
 * its existing `care_team.assign` audit, whose entity_id is the PATIENT, so the
 * two can never be confused.
 *
 * IF audit_log EVER STOPS BEING READABLE TO THE PANEL'S ROLES, every row reads
 * as manual and the Remover control reappears on automatic rows. That is the
 * failure direction chosen on purpose: it offers reception a removal they could
 * already make on a manual row, and never hides a row or invents an assignment.
 */

/** The audit action every automatic care-team write appends. */
export const CARE_TEAM_AUTO_ACTION = "care_team.auto_assign";

/** The audit entity type both kinds of care-team write use (CARE-01's value). */
export const CARE_TEAM_ENTITY_TYPE = "patient_care_team";

export type CareTeamSource = "manual" | "automatic";

/** A row is automatic exactly when an auto-assign audit names its id. */
export function careTeamSource(rowId: string, autoRowIds: ReadonlySet<string>): CareTeamSource {
  return autoRowIds.has(rowId) ? "automatic" : "manual";
}

/**
 * WHICH CARE-TEAM ROWS A ROLE MAY WRITE, AS `patient_care_team_insert` SAYS.
 *
 *   "any"   owner and reception: any row of their tenant. 0091's arm, which
 *           0098 keeps byte for byte. `care_team:manage` is held by exactly
 *           those two roles.
 *   "own"   therapist, since 0098 (CARE-02a): ONE kind of row, their own
 *           booking's. user_id and assigned_by are the caller and the patient
 *           is one they have an appointment with. The writer filters its
 *           candidates to `userId === actor.userId`, and the appointment it
 *           just wrote is what puts the patient in viewer_treated_patient_ids().
 *   "none"  admin, deliberately (0091 says so and 0098 keeps it), and any role
 *           added later until somebody rules on it.
 *
 * care-team-core.test.ts reads BOTH migrations and pins that this map equals
 * what they admit, so a drift in either reddens a test rather than turning into
 * an RLS refusal inside a booking (a role the app thinks may write) or a silent
 * skip (a role the policy would admit).
 *
 * WHY IT IS CHECKED BEFORE THE WRITE AND NOT LEFT TO THE DATABASE. The writer
 * runs in a savepoint, so a refusal would not fail the booking, but an INSERT
 * carries every pair of a booking in ONE statement: one pair the policy refuses
 * would take the admitted pairs beside it down with it. Filtering first means
 * the statement only ever carries rows the policy admits.
 *
 * `therapist` IS A ROLE NAME HERE, NOT A CAPABILITY, because the policy arm it
 * mirrors is `jwt_role() = 'therapist'` and no capability is held by the
 * therapist alone.
 */
export type CareTeamWriteReach = "any" | "own" | "none";

export function careTeamWriteReach(role: Role): CareTeamWriteReach {
  if (can(role, "care_team:manage")) return "any";
  if (role === "therapist") return "own";
  return "none";
}

/** What a written appointment contributes: both patient slots, both practitioner slots. */
export type BookedAppointment = {
  appointmentId: string;
  startsAt: Date;
  patientIds: readonly (string | null | undefined)[];
  practitionerIds: readonly (string | null | undefined)[];
};

/** One (patient, therapist) pair a booking may add, with the booking that added it. */
export type CareTeamCandidate = {
  patientId: string;
  userId: string;
  appointmentId: string;
  startsAt: Date;
};

/**
 * The (patient, therapist) pairs a set of written appointments puts on a care
 * team.
 *
 *   BOTH SLOTS ON EACH SIDE. `patient_2_id` and `practitioner_2_id` are real
 *   participants, the way 0091's visibility policy already treats them.
 *   SHARED RESOURCES ARE NOT THERAPISTS. NESA is a machine with a users row; a
 *   care team is who treats the patient, so an id in `excludedUserIds` never
 *   becomes a member automatically. Reception can still add one by hand.
 *   ONE PAIR ONCE. A recurring series of ten is one addition, not ten, and the
 *   appointment it points at is the EARLIEST occurrence, which is the one a
 *   notification should name.
 */
export function careTeamCandidates(
  appointments: readonly BookedAppointment[],
  excludedUserIds: ReadonlySet<string> = new Set(),
): CareTeamCandidate[] {
  const byPair = new Map<string, CareTeamCandidate>();
  for (const a of appointments) {
    const patients = uniqueIds(a.patientIds);
    const practitioners = uniqueIds(a.practitionerIds).filter((u) => !excludedUserIds.has(u));
    for (const patientId of patients) {
      for (const userId of practitioners) {
        const key = `${patientId}:${userId}`;
        const seen = byPair.get(key);
        if (!seen || a.startsAt.getTime() < seen.startsAt.getTime()) {
          byPair.set(key, { patientId, userId, appointmentId: a.appointmentId, startsAt: a.startsAt });
        }
      }
    }
  }
  return [...byPair.values()];
}

function uniqueIds(ids: readonly (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((i): i is string => typeof i === "string" && i.length > 0))];
}

/** A pair that was NOT on the care team and now is. */
export type CareTeamAddition = CareTeamCandidate & { careTeamId: string };

/** One staff notification the additions owe. */
export type CareTeamNotice = {
  recipientUserId: string;
  appointmentId: string;
  patientId: string;
  startsAt: Date;
};

/**
 * Who is told, and about which appointment.
 *
 * FIRST TIME ONLY BY CONSTRUCTION: the input is the rows the INSERT actually
 * wrote, never the candidates, so a therapist already live on the team is not
 * here and gets nothing.
 *
 * NOT THE ACTOR. An owner who books themselves joins the team without being
 * notified of their own click, the rule every staff fan-out in centre.ts keeps.
 *
 * ONE NOTICE PER (therapist, appointment). A shared appointment with two
 * patients can add the same therapist to two teams in one booking; 0055's
 * dedupe key is (recipient, appointment, kind, occurred_at), so two rows would
 * collide, and two notices about one booking would be noise anyway. The first
 * patient in the input order is the one named.
 */
export function careTeamNotices(
  additions: readonly CareTeamAddition[],
  actorUserId: string,
): CareTeamNotice[] {
  const byKey = new Map<string, CareTeamNotice>();
  for (const a of additions) {
    if (a.userId === actorUserId) continue;
    const key = `${a.userId}:${a.appointmentId}`;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      recipientUserId: a.userId,
      appointmentId: a.appointmentId,
      patientId: a.patientId,
      startsAt: a.startsAt,
    });
  }
  return [...byKey.values()];
}
