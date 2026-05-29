import "server-only";
import { and, eq, gt, lt, ne, notInArray, sql, type SQL } from "drizzle-orm";
import { appointments, patients, type DbTx } from "@osteojp/db";
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
