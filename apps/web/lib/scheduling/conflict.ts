import "server-only";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { availabilityTemplates, timeOff, type DbTx } from "@osteojp/db";
import {
  absencesOverlapping,
  evaluateAvailability,
  type AbsenceBlock,
  type AvailabilityTemplate,
} from "./availability";
import type { ConflictInfo } from "./types";

/**
 * Conflicts for a candidate window, in two flavours:
 *   - therapist: same practitioner, overlapping time.
 *   - room: same location + same room (case-insensitive), overlapping time.
 *
 * Cancelled appointments never conflict. `excludeIds` drops the appointment(s)
 * being created/moved (the series itself) from their own conflict set.
 *
 * Runs on the caller's tenant-scoped tx — tenant isolation is enforced by RLS,
 * so this deliberately does NOT filter tenant_id by hand.
 */
export async function findConflicts(
  tx: DbTx,
  args: {
    practitionerId: string;
    locationId: string;
    room: string | null;
    startsAt: Date;
    endsAt: Date;
    excludeIds?: string[];
  },
): Promise<ConflictInfo[]> {
  // PL-09 Phase 2b: conflict detection must see rows the caller's scoped RLS
  // hides — a ROOM clash spans therapists, a THERAPIST clash spans locations, and
  // (since 0047) the patient join would otherwise drop a conflict whose patient
  // the booker cannot see. public.appointment_conflicts is SECURITY DEFINER: it
  // runs the SAME therapist-overlap + room-overlap logic over ALL in-tenant
  // appointments + patients (tenant-filtered inside), so booking stays correct.
  const exclude = (args.excludeIds ?? []).filter(Boolean);
  const excludeSql = exclude.length
    ? sql`ARRAY[${sql.join(
        exclude.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}]::uuid[]`
    : sql`NULL::uuid[]`;
  const room = args.room?.trim() || null;

  const result = await tx.execute(sql`
    SELECT id, patient_name, starts_at, ends_at, room, kind
    FROM public.appointment_conflicts(
      ${args.practitionerId}::uuid,
      ${args.locationId}::uuid,
      ${room}::text,
      ${args.startsAt},
      ${args.endsAt},
      ${excludeSql}
    )
  `);
  const rows = result as unknown as Array<{
    id: string;
    patient_name: string;
    starts_at: string | Date;
    ends_at: string | Date;
    room: string | null;
    kind: ConflictInfo["kind"];
  }>;
  return rows.map((r) => ({
    kind: r.kind,
    id: r.id,
    patientName: r.patient_name,
    startsAt: new Date(r.starts_at).toISOString(),
    endsAt: new Date(r.ends_at).toISOString(),
    room: r.room,
  }));
}

/**
 * Schedule conflicts that don't involve another appointment:
 *   - availability: the window falls outside the therapist's working hours for
 *     that weekday/location (only enforced when availability is configured for
 *     the location — see evaluateAvailability).
 *   - time_off: the window overlaps an absence block for the therapist.
 *
 * Same severity as appointment overlaps: returned as ConflictInfo so the action
 * blocks by default and the UI offers "Save anyway". Runs on the caller's
 * tenant-scoped tx — RLS enforces tenant isolation, so no manual tenant filter.
 */
export async function findScheduleConflicts(
  tx: DbTx,
  args: {
    practitionerId: string;
    locationId: string;
    startsAt: Date;
    endsAt: Date;
  },
): Promise<ConflictInfo[]> {
  const [templateRows, absenceRows] = await Promise.all([
    tx
      .select({
        weekday: availabilityTemplates.weekday,
        startTime: availabilityTemplates.startTime,
        endTime: availabilityTemplates.endTime,
        validFrom: availabilityTemplates.validFrom,
        validUntil: availabilityTemplates.validUntil,
        isActive: availabilityTemplates.isActive,
      })
      .from(availabilityTemplates)
      .where(
        and(
          eq(availabilityTemplates.userId, args.practitionerId),
          eq(availabilityTemplates.locationId, args.locationId),
        ),
      ),
    // time_off is therapist-wide (not per location). Half-open overlap with the
    // candidate window, filtered in SQL so we only pull relevant blocks.
    tx
      .select({
        id: timeOff.id,
        startsAt: timeOff.startsAt,
        endsAt: timeOff.endsAt,
        reason: timeOff.reason,
      })
      .from(timeOff)
      .where(
        and(
          eq(timeOff.userId, args.practitionerId),
          lt(timeOff.startsAt, args.endsAt),
          gt(timeOff.endsAt, args.startsAt),
        ),
      ),
  ]);

  const out: ConflictInfo[] = [];

  const templates: AvailabilityTemplate[] = templateRows.map((r) => ({
    weekday: r.weekday,
    startTime: r.startTime,
    endTime: r.endTime,
    validFrom: r.validFrom,
    validUntil: r.validUntil,
    isActive: r.isActive,
  }));
  const availability = evaluateAvailability(args.startsAt, args.endsAt, templates);
  if (availability.configured && !availability.covered) {
    out.push({
      kind: "availability",
      // Synthetic id: there is no row, the candidate window IS the conflict.
      id: `availability:${args.startsAt.toISOString()}`,
      patientName: null,
      startsAt: args.startsAt.toISOString(),
      endsAt: args.endsAt.toISOString(),
      room: null,
    });
  }

  const blocks: AbsenceBlock[] = absenceRows.map((r) => ({
    id: r.id,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    reason: r.reason,
  }));
  for (const b of absencesOverlapping(args.startsAt, args.endsAt, blocks)) {
    out.push({
      kind: "time_off",
      id: b.id,
      patientName: null,
      startsAt: b.startsAt.toISOString(),
      endsAt: b.endsAt.toISOString(),
      room: null,
      reason: b.reason,
    });
  }

  return out;
}

/**
 * All conflicts for one candidate window: appointment overlaps (therapist/room)
 * plus schedule conflicts (availability/time_off). Used by create + reschedule
 * where the therapist and time are being set. Room-only edits use findConflicts
 * directly, since availability/time_off can't change without a time change.
 */
export async function findConflictsForWindow(
  tx: DbTx,
  args: {
    practitionerId: string;
    locationId: string;
    room: string | null;
    startsAt: Date;
    endsAt: Date;
    excludeIds?: string[];
  },
): Promise<ConflictInfo[]> {
  const [appointmentConflicts, scheduleConflicts] = await Promise.all([
    findConflicts(tx, args),
    findScheduleConflicts(tx, {
      practitionerId: args.practitionerId,
      locationId: args.locationId,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
    }),
  ]);
  return [...appointmentConflicts, ...scheduleConflicts];
}
