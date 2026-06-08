import "server-only";
import { and, eq, gt, lt, ne, notInArray, sql, type SQL } from "drizzle-orm";
import {
  appointments,
  availabilityTemplates,
  patients,
  timeOff,
  type DbTx,
} from "@osteojp/db";
import {
  absencesOverlapping,
  evaluateAvailability,
  type AbsenceBlock,
  type AvailabilityTemplate,
} from "./availability";
import type { ConflictInfo } from "./types";

type ConflictRow = {
  id: string;
  patientName: string;
  startsAt: Date;
  endsAt: Date;
  room: string | null;
};

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
  // Shared predicates: not cancelled, half-open overlap, not one of our own rows.
  const base: SQL[] = [
    ne(appointments.status, "cancelled"),
    lt(appointments.startsAt, args.endsAt),
    gt(appointments.endsAt, args.startsAt),
  ];
  const exclude = (args.excludeIds ?? []).filter(Boolean);
  if (exclude.length > 0) base.push(notInArray(appointments.id, exclude));

  const selection = {
    id: appointments.id,
    patientName: patients.fullName,
    startsAt: appointments.startsAt,
    endsAt: appointments.endsAt,
    room: appointments.room,
  } as const;

  const run = (conds: SQL[]) =>
    tx
      .select(selection)
      .from(appointments)
      .innerJoin(patients, eq(patients.id, appointments.patientId))
      .where(and(...base, ...conds));

  const room = args.room?.trim();
  const [therapistRows, roomRows] = await Promise.all([
    run([eq(appointments.practitionerId, args.practitionerId)]),
    room
      ? run([
          eq(appointments.locationId, args.locationId),
          sql`lower(${appointments.room}) = lower(${room})`,
        ])
      : Promise.resolve([] as ConflictRow[]),
  ]);

  const toInfo = (r: ConflictRow, kind: ConflictInfo["kind"]): ConflictInfo => ({
    kind,
    id: r.id,
    patientName: r.patientName,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    room: r.room,
  });

  // Tag each match; an appointment can appear once per kind it conflicts on.
  const seen = new Set<string>();
  const out: ConflictInfo[] = [];
  for (const r of therapistRows) {
    const key = `therapist:${r.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(toInfo(r, "therapist"));
    }
  }
  for (const r of roomRows) {
    const key = `room:${r.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(toInfo(r, "room"));
    }
  }
  return out;
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
