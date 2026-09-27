import "server-only";
import { inArray, sql } from "drizzle-orm";
import { appointments, patientCareTeam, type DbTx } from "@osteojp/db";
import type { RequestContext } from "@/lib/auth/context";
import { listSharedResourcesTx } from "@/lib/scheduling/shared-resources";
import { writeAudit } from "./audit";
import {
  CARE_TEAM_AUTO_ACTION,
  CARE_TEAM_ENTITY_TYPE,
  canWriteCareTeamUnderCurrentPolicy,
  careTeamCandidates,
  type CareTeamAddition,
} from "./care-team-core";

/**
 * CARE-02c: a booking puts its therapist on the patient's care team, once.
 *
 * Called by every staff path that writes an appointment row or moves one to a
 * new Terapeuta, INSIDE that path's own transaction and under its own actor, so
 * `patient_care_team`'s RLS applies exactly as it does to reception pressing
 * Atribuir. The register of which paths call it, and why the others do not, is
 * creation-paths-write-care-team.test.ts.
 *
 * ==========================================================================
 * IT NEVER FAILS A BOOKING
 * ==========================================================================
 * The whole write runs in a SAVEPOINT (drizzle's nested transaction). A failed
 * statement inside a Postgres transaction poisons the rest of it, so a plain
 * try/catch around these statements would still roll the appointment back. The
 * savepoint confines a failure to the care-team write: the booking commits, the
 * care team does not change, and one line is logged with the error NAME only
 * (CLAUDE.md rule 7). A booking is the clinic's work; a missing care-team row is
 * recoverable by the next booking or by Atribuir.
 *
 * ==========================================================================
 * FIRST TIME ONLY, DECIDED BY THE DATABASE
 * ==========================================================================
 * `ON CONFLICT (tenant_id, patient_id, user_id) WHERE removed_at IS NULL DO
 * NOTHING` targets 0091's partial live-unique index by name of its columns and
 * predicate. A therapist already live on the team (by hand or by an earlier
 * booking) conflicts and writes nothing; RETURNING then yields only the rows
 * really written, and only those get an audit row and, after commit, a
 * notification. Two concurrent bookings for the same pair serialise on the
 * index: one inserts, the other conflicts once the first commits. A pre-read
 * could not give that guarantee.
 *
 * A therapist whose row was REMOVED is not live, so the next booking adds them
 * again as a new, automatic row. That is the current default and it is carried
 * to the owner as a question in the PR.
 *
 * ==========================================================================
 * WHO IT WRITES FOR, AND WHO IT SKIPS
 * ==========================================================================
 * Owner and reception only, because that is who `patient_care_team_insert`
 * admits (see canWriteCareTeamUnderCurrentPolicy). A therapist's own booking
 * and an admin's booking skip the write rather than attempt it, and that gap is
 * reported, not hidden: closing it needs a writer the current policy does not
 * allow.
 *
 * The rows are READ BACK here, by id, inside the savepoint and under the
 * actor's RLS, rather than taken from the caller. The care team then follows
 * what the database actually holds for those appointments, whichever path
 * wrote them, and every caller passes the same thing: the ids it wrote.
 */
export async function addBookedTherapistsToCareTeam(
  tx: DbTx,
  actor: RequestContext,
  appointmentIds: readonly string[],
  opts: {
    /**
     * "primary" when only `practitioner_id` changed (a reschedule to a new
     * Terapeuta): the Terapeuta 2 did not move and is not re-examined.
     */
    slots?: "both" | "primary";
  } = {},
): Promise<CareTeamAddition[]> {
  const ids = [...new Set(appointmentIds.filter(Boolean))];
  if (ids.length === 0) return [];

  // EVERYTHING below is inside the try, the role check included: nothing this
  // function does may throw into the booking that called it.
  try {
    if (!canWriteCareTeamUnderCurrentPolicy(actor.role)) return [];
    return await tx.transaction(async (sp) => {
      const rows = await sp
        .select({
          id: appointments.id,
          startsAt: appointments.startsAt,
          patientId: appointments.patientId,
          patientTwoId: appointments.patientTwoId,
          practitionerId: appointments.practitionerId,
          practitionerTwoId: appointments.practitionerTwoId,
        })
        .from(appointments)
        .where(inArray(appointments.id, ids));
      if (rows.length === 0) return [];

      // NESA and any other shared resource: a machine is not a care-team member.
      const sharedIds = new Set((await listSharedResourcesTx(sp)).map((r) => r.id));
      const candidates = careTeamCandidates(
        rows.map((r) => ({
          appointmentId: r.id,
          startsAt: r.startsAt,
          patientIds: [r.patientId, r.patientTwoId],
          practitionerIds:
            opts.slots === "primary" ? [r.practitionerId] : [r.practitionerId, r.practitionerTwoId],
        })),
        sharedIds,
      );
      if (candidates.length === 0) return [];

      const written = await sp
        .insert(patientCareTeam)
        .values(
          candidates.map((c) => ({
            tenantId: actor.tenantId,
            patientId: c.patientId,
            userId: c.userId,
            // Who made the booking. True, and it keeps assigned_by meaning
            // exactly what 0091 says it means.
            assignedBy: actor.userId,
          })),
        )
        .onConflictDoNothing({
          target: [patientCareTeam.tenantId, patientCareTeam.patientId, patientCareTeam.userId],
          where: sql`removed_at is null`,
        })
        .returning({
          id: patientCareTeam.id,
          patientId: patientCareTeam.patientId,
          userId: patientCareTeam.userId,
        });

      const additions: CareTeamAddition[] = [];
      for (const w of written) {
        const c = candidates.find((x) => x.patientId === w.patientId && x.userId === w.userId);
        if (!c) continue;
        additions.push({ ...c, careTeamId: w.id });
        // The row that makes this entry AUTOMATIC on the panel: its entity_id
        // is the care-team row's own id (care-team-core.ts explains why an
        // audit row and not a column). Ids only, per the metadata contract.
        await writeAudit(sp, actor, {
          action: CARE_TEAM_AUTO_ACTION,
          entityType: CARE_TEAM_ENTITY_TYPE,
          entityId: w.id,
          metadata: {
            patientId: c.patientId,
            therapistId: c.userId,
            appointmentId: c.appointmentId,
          },
        });
      }
      return additions;
    });
  } catch (e) {
    console.error(
      "care-team: the automatic care-team write failed and was rolled back to its savepoint; the booking itself is unaffected",
      e instanceof Error ? e.name : "unknown",
    );
    return [];
  }
}
