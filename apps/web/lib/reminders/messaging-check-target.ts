import "server-only";
import { eq } from "drizzle-orm";
import { appointments } from "@osteojp/db";
import { withReminderTenantContext } from "./context";

// THE ONE READ THE DELIVERY TEST MAKES ABOUT AN APPOINTMENT.
//
// Only when the owner typed an appointment id, and only its status and its
// origin: the two facts that say whether it is an online request reception has
// not accepted yet. Through the same tenant-scoped, RLS-enforced seam the
// reminder job and the confirm page read appointments through, so an id from
// another tenant reads as absent.
//
// Its own module so the tests that drive `sendMessagingCheck` without a
// database can replace it in one line.

/** The appointment's status and origin, or null when no such row is visible. */
export async function loadMessagingCheckTarget(
  tenantId: string,
  appointmentId: string,
): Promise<{ status: string; origin: string } | null> {
  const rows = await withReminderTenantContext(tenantId, async (tx) =>
    tx
      .select({ status: appointments.status, origin: appointments.origin })
      .from(appointments)
      .where(eq(appointments.id, appointmentId))
      .limit(1),
  );
  return rows[0] ?? null;
}
