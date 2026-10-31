import "server-only";
import { and, eq, inArray, type SQL } from "drizzle-orm";
import {
  availabilityTemplates,
  locations,
  readLocationSaturdayClosesAt,
  staffLocations,
  users,
  type DbTx,
} from "@osteojp/db";

import type { AvailabilityTemplate } from "./availability";
import {
  clinicsWithOwnRows,
  isClinicDefaultEligible,
  resolveEffectiveTemplates,
  type ClinicDefaultEligibility,
  type MemberClinic,
} from "./effective-availability-core";

/**
 * HOR-01 - THE ONE READ OF A THERAPIST'S WORKING HOURS ON THE STAFF SIDE.
 *
 * Every staff reader of availability_templates goes through this function:
 * the write-time refusal (`checkAvailability`: create, clone, reschedule), the
 * advisory conflict panel (`findScheduleConflicts`), the day availability
 * behind Nova marcacao, Agendar lote and the Horarios inspector
 * (`getTherapistAvailability`), the agenda's off-hours band
 * (`listTherapistBlocksAndHours`) and the clinic auto-fill
 * (`getTherapistLocationIds`). One function, so those screens cannot come to
 * disagree about whether a therapist works on a Tuesday afternoon.
 *
 * The rule itself is pure and lives in effective-availability-core.ts. This
 * module only reads what it needs, on the caller's tenant-scoped transaction,
 * so RLS scopes every read to the caller's tenant.
 *
 * THE PATIENT PORTAL (apps/api) DOES NOT READ THIS. It keeps its own SQL over
 * availability_templates, so a therapist with no rows stays invisible online
 * exactly as before (pinned by apps/api/lib/appointments/portal-default-hours-off.db.test.ts).
 *
 * THE COST IS PAID ONLY BY A THERAPIST WITHOUT ROWS. When the caller names a
 * clinic and the therapist has an active row there, this is the one query it
 * always was. The membership and eligibility reads run only when a default
 * could apply.
 */
export async function readEffectiveTemplates(
  tx: DbTx,
  args: { therapistId: string; locationId?: string | null },
): Promise<AvailabilityTemplate[]> {
  const ownConds: SQL[] = [
    eq(availabilityTemplates.userId, args.therapistId),
    eq(availabilityTemplates.isActive, true),
  ];
  if (args.locationId) ownConds.push(eq(availabilityTemplates.locationId, args.locationId));
  const ownRows = await tx
    .select({
      id: availabilityTemplates.id,
      weekday: availabilityTemplates.weekday,
      startTime: availabilityTemplates.startTime,
      endTime: availabilityTemplates.endTime,
      validFrom: availabilityTemplates.validFrom,
      validUntil: availabilityTemplates.validUntil,
      isActive: availabilityTemplates.isActive,
      locationId: availabilityTemplates.locationId,
    })
    .from(availabilityTemplates)
    .where(and(...ownConds));

  const own: AvailabilityTemplate[] = ownRows.map((r) => ({
    id: r.id,
    weekday: r.weekday,
    startTime: r.startTime,
    endTime: r.endTime,
    validFrom: r.validFrom,
    validUntil: r.validUntil,
    isActive: r.isActive === true,
    locationId: r.locationId,
  }));

  // The common case for a configured therapist: one named clinic, rows there.
  // Nothing else can change the answer, so nothing else is read.
  const covered = clinicsWithOwnRows(own);
  if (args.locationId && covered.has(args.locationId)) return own;

  const eligibility = await readDefaultEligibility(tx, args.therapistId);
  if (!isClinicDefaultEligible(eligibility)) return own;

  const memberClinics = (
    await readMemberClinics(tx, { therapistId: args.therapistId, locationId: args.locationId })
  ).filter((c) => !covered.has(c.locationId));
  if (memberClinics.length === 0) return own;

  return resolveEffectiveTemplates({
    own,
    eligibility,
    memberClinics,
    locationId: args.locationId,
  });
}

/** Active, bookable, not a shared resource: the three flags the default needs. */
export async function readDefaultEligibility(
  tx: DbTx,
  therapistId: string,
): Promise<ClinicDefaultEligibility | null> {
  const rows = await tx
    .select({
      isActive: users.isActive,
      isBookable: users.isBookable,
      isSharedResource: users.isSharedResource,
    })
    .from(users)
    .where(eq(users.id, therapistId));
  const row = rows[0];
  if (!row) return null;
  return {
    isActive: row.isActive === true,
    isBookable: row.isBookable === true,
    isSharedResource: row.isSharedResource === true,
  };
}

/**
 * The ACTIVE clinics the therapist is a member of (staff_locations), each with
 * its opening hours and, where the database has the column, its Saturday
 * closing time. Two plain reads rather than a join, so the membership and the
 * hours are each one query a reader can check by eye.
 */
export async function readMemberClinics(
  tx: DbTx,
  args: { therapistId: string; locationId?: string | null },
): Promise<MemberClinic[]> {
  const memberConds: SQL[] = [eq(staffLocations.userId, args.therapistId)];
  if (args.locationId) memberConds.push(eq(staffLocations.locationId, args.locationId));
  const memberRows = await tx
    .select({ locationId: staffLocations.locationId })
    .from(staffLocations)
    .where(and(...memberConds));
  const ids = [...new Set(memberRows.map((r) => r.locationId))];
  if (ids.length === 0) return [];

  const hourRows = await tx
    .select({
      id: locations.id,
      opensAt: locations.opensAt,
      closesAt: locations.closesAt,
    })
    .from(locations)
    .where(and(inArray(locations.id, ids), eq(locations.isActive, true)));
  if (hourRows.length === 0) return [];

  const saturday = await readLocationSaturdayClosesAt(
    tx,
    hourRows.map((r) => r.id),
  );
  return hourRows.map((r) => ({
    locationId: r.id,
    opensAt: r.opensAt,
    closesAt: r.closesAt,
    saturdayClosesAt: saturday.get(r.id) ?? null,
  }));
}
