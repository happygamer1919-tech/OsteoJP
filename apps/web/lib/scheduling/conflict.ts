import "server-only";
import { and, eq, gt, lt, ne, type SQL } from "drizzle-orm";
import { appointments, patients, type DbTx } from "@osteojp/db";
import type { ConflictInfo } from "./types";

/**
 * Appointments for `practitionerId` whose [startsAt, endsAt) overlaps the
 * candidate window. Cancelled appointments never conflict. `excludeId` drops
 * the appointment being moved from its own conflict set.
 *
 * Runs on the caller's tenant-scoped tx — tenant isolation is enforced by RLS,
 * so this deliberately does NOT filter tenant_id by hand.
 */
export async function findTherapistConflicts(
  tx: DbTx,
  args: {
    practitionerId: string;
    startsAt: Date;
    endsAt: Date;
    excludeId?: string;
  },
): Promise<ConflictInfo[]> {
  const conds: SQL[] = [
    eq(appointments.practitionerId, args.practitionerId),
    ne(appointments.status, "cancelled"),
    // half-open overlap: existing.start < new.end AND existing.end > new.start
    lt(appointments.startsAt, args.endsAt),
    gt(appointments.endsAt, args.startsAt),
  ];
  if (args.excludeId) conds.push(ne(appointments.id, args.excludeId));

  const rows = await tx
    .select({
      id: appointments.id,
      patientName: patients.fullName,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
    })
    .from(appointments)
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .where(and(...conds));

  return rows.map((r) => ({
    id: r.id,
    patientName: r.patientName,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
  }));
}
