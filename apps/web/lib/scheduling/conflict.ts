import "server-only";
import { and, eq, gt, lt, notInArray, sql, type SQL } from "drizzle-orm";
import { appointments, availabilityTemplates, patients, timeOff, type DbTx } from "@osteojp/db";
import { listSharedResourcesTx } from "./shared-resources";
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
    /**
     * SCHED-29.2: the candidate's "Terapeuta 2". Read ONLY when it is a shared
     * resource (NESA); a person in that slot stays display-only (W4-19).
     */
    practitionerTwoId?: string | null;
    locationId: string;
    room: string | null;
    startsAt: Date;
    endsAt: Date;
    excludeIds?: string[];
  },
): Promise<ConflictInfo[]> {
  const found = await appointmentConflicts(tx, args);

  // ==========================================================================
  // SCHED-29.2 - A SHARED RESOURCE'S HOUR IS HELD IN BOTH ROLES.
  // ==========================================================================
  // Owner ruling 2026-09-13, fix and not accept: an appointment where NESA is
  // the SECOND participant occupies NESA's hour exactly as one where NESA is the
  // Terapeuta. appointment_conflicts matches practitioner_id only, so before
  // this a booking naming NESA in either role could land on an hour NESA
  // already held in the other. Reproduced on the BLUE lane against main
  // 200d9d7f: four doors, each leaving two rows in NESA's hour
  // (nesa-both-roles-conflict.db.test.ts).
  //
  // FOR EVERY SHARED RESOURCE THE CANDIDATE NAMES, IN EITHER SLOT:
  //   - rows where it is the Terapeuta: appointment_conflicts again, when it
  //     came in as Terapeuta 2 (as Terapeuta it was already the call above);
  //   - rows where it is Terapeuta 2: the read below.
  //
  // PEOPLE ARE UNCHANGED. A therapist named as Terapeuta 2 still holds nothing
  // (W4-19), and this reads no second slot unless the id is a shared resource.
  //
  // WHAT THE SECOND READ CAN SEE, STATED BECAUSE IT IS NOT EVERYTHING. It runs
  // under the caller's RLS; appointment_conflicts is SECURITY DEFINER and this
  // is not, because changing that function is a migration and the ruling is
  // app layer. Owner, admin and reception at the clinic see every row there, so
  // for them it is complete. A THERAPIST sees a colleague's booking with NESA as
  // Terapeuta 2 only once 0088 is applied (SCHED-29.3), which grants exactly
  // that read; until then a second therapist naming NESA as Terapeuta 2 over a
  // colleague's NESA hour is not refused. The DB test pins both arms.
  const occupants = await sharedResourcesAmong(tx, [args.practitionerId, args.practitionerTwoId]);
  if (occupants.length === 0) return found;

  const seen = new Set(found.map((c) => `${c.kind}:${c.id}`));
  const add = (rows: ConflictInfo[]) => {
    for (const c of rows) {
      const key = `${c.kind}:${c.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(c);
    }
  };
  for (const resourceId of occupants) {
    if (resourceId !== args.practitionerId) {
      // Room was already checked on the candidate's own call; therapist rows only.
      const asTerapeuta = await appointmentConflicts(tx, { ...args, practitionerId: resourceId, room: null });
      add(asTerapeuta.filter((c) => c.kind === "therapist"));
    }
    add(await secondParticipantConflicts(tx, { ...args, resourceId }));
  }
  return found;
}

/**
 * The shared resources (users.is_shared_resource, active) among `ids`.
 *
 * Read once per transaction: a recurring series checks every occurrence, and the
 * answer cannot change inside one booking. Empty before 0086, exactly like
 * listSharedResourcesTx, which it reads through.
 */
const sharedResourceIdsByTx = new WeakMap<DbTx, Promise<Set<string>>>();

async function sharedResourcesAmong(
  tx: DbTx,
  ids: ReadonlyArray<string | null | undefined>,
): Promise<string[]> {
  const candidates = [...new Set(ids.filter((id): id is string => !!id))];
  if (candidates.length === 0) return [];
  let pending = sharedResourceIdsByTx.get(tx);
  if (!pending) {
    pending = listSharedResourcesTx(tx).then((rs) => new Set(rs.map((r) => r.id)));
    sharedResourceIdsByTx.set(tx, pending);
  }
  const resources = await pending;
  return candidates.filter((id) => resources.has(id));
}

/**
 * Rows where `resourceId` is Terapeuta 2 and the window overlaps, blocking by the
 * SAME rules appointment_conflicts applies to a Terapeuta: not cancelled or
 * no_show (0052), not an unconfirmed pedido (0059), the candidate's own rows
 * excluded. Under the caller's RLS; see the note in findConflicts.
 *
 * The patient join is LEFT, so a patient the caller cannot see yields a
 * withheld name (null) rather than a vanished conflict, the CONFIRM-09 rule the
 * agenda already follows.
 */
async function secondParticipantConflicts(
  tx: DbTx,
  args: { resourceId: string; startsAt: Date; endsAt: Date; excludeIds?: string[] },
): Promise<ConflictInfo[]> {
  const exclude = (args.excludeIds ?? []).filter(Boolean);
  const conds: SQL[] = [
    eq(appointments.practitionerTwoId, args.resourceId),
    notInArray(appointments.status, ["cancelled", "no_show"]),
    sql`not public.is_unconfirmed_pedido(${appointments.id})`,
    lt(appointments.startsAt, args.endsAt),
    gt(appointments.endsAt, args.startsAt),
  ];
  if (exclude.length > 0) conds.push(notInArray(appointments.id, exclude));
  const rows = await tx
    .select({
      id: appointments.id,
      patientName: patients.fullName,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      room: appointments.room,
    })
    .from(appointments)
    .leftJoin(patients, eq(patients.id, appointments.patientId))
    .where(and(...conds));
  return rows.map((r) => ({
    kind: "therapist" as const,
    id: r.id,
    patientName: r.patientName ?? null,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    room: r.room,
  }));
}

/** The SECURITY DEFINER therapist + room overlap for one practitioner. */
async function appointmentConflicts(
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
        exclude.map((id) => sql`${id}`),
        sql`, `,
      )}]::uuid[]`
    : sql`NULL::uuid[]`;
  const room = args.room?.trim() || null;

  // The timestamptz args MUST be passed as ISO strings + an explicit ::timestamptz
  // cast. A bound JS Date leaves $n untyped and Postgres cannot resolve the
  // appointment_conflicts() argument -> the whole booking create throws.
  const result = await tx.execute(sql`
    SELECT id, patient_name, starts_at, ends_at, room, kind
    FROM public.appointment_conflicts(
      ${args.practitionerId}::uuid,
      ${args.locationId}::uuid,
      ${room}::text,
      ${args.startsAt.toISOString()}::timestamptz,
      ${args.endsAt.toISOString()}::timestamptz,
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
    /** SCHED-29.2: see findConflicts. */
    practitionerTwoId?: string | null;
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

// PL-11 advisory classifier lives in conflict-core.ts (pure, no `server-only`)
// so it is unit-testable; re-exported here for server callers.
export { ADVISORY_CONFLICT_KINDS, blockingConflicts } from "./conflict-core";
