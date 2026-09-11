import { getDbAdmin, guestBookingRequests, insertGuestClinicalIntake } from "@osteojp/db";

import type { GuestIntake } from "./validate";

/**
 * INTAKE-01 - the guest route's write: the request row, and its intake row when
 * there is one, in ONE transaction.
 *
 * WHY ONE TRANSACTION (SPEC section 6.2). A request that exists without its
 * intake, or an intake with no request, is a row nobody can act on and nobody
 * will notice. So either both rows commit or neither does.
 *
 * NOTHING HERE DECIDES WHETHER AN INTAKE MAY BE WRITTEN. The route refuses an
 * intake while 0087 is not applied and only then calls this with one; this
 * module is told what to write and writes it.
 */
export type GuestRequestRow = typeof guestBookingRequests.$inferInsert;

type Db = ReturnType<typeof getDbAdmin>;

export async function writeGuestBooking(
  db: Db,
  request: GuestRequestRow,
  intake: GuestIntake | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(guestBookingRequests)
      .values(request)
      .returning({ id: guestBookingRequests.id });
    if (!intake) return;
    if (!row) {
      // Unreachable: an INSERT that did not throw returned its row. Refusing
      // here rather than writing an intake keyed on nothing.
      throw new Error("guest booking insert returned no row");
    }
    await insertGuestClinicalIntake(tx, {
      // Rule 3: the tenant is set EXPLICITLY, and it is the request's own. 0087's
      // trigger refuses any other.
      tenantId: request.tenantId,
      guestBookingRequestId: row.id,
      dateOfBirth: intake.dateOfBirth,
      reason: intake.reason,
      healthConditions: intake.healthConditions,
      medication: intake.medication,
      fallsAccidents: intake.fallsAccidents,
      surgeries: intake.surgeries,
      pacemaker: intake.pacemaker,
      pregnancy: intake.pregnancy,
      consentVersion: intake.consentVersion,
    });
  });
}
