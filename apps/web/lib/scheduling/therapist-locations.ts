import "server-only";
import { and, eq } from "drizzle-orm";
import type { RequestContext } from "@osteojp/auth";
import { availabilityTemplates, locations } from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";

/**
 * Read-only lookup of the ACTIVE location ids a therapist is assigned to
 * (W4-12). A therapist's locations are derived from `availability_templates`
 * (migration 0006) — the clinics where they have working hours — since there is
 * no dedicated therapist_locations join. A location counts only when BOTH the
 * availability row and the location itself are active, and it is returned once
 * even if the therapist has several time windows there (DISTINCT).
 *
 * Feeds the booking Localização auto-fill (W4-12): selecting a therapist with
 * exactly one active location auto-fills it. Runs through runScoped, so RLS
 * scopes the read to the caller's tenant; this module never filters tenant_id
 * by hand, matching therapist-services.ts / day-availability.ts.
 */
export async function getTherapistLocationIds(
  ctx: RequestContext,
  therapistId: string,
): Promise<string[]> {
  return runScoped(ctx, async (tx) => {
    const rows = await tx
      .selectDistinct({ locationId: availabilityTemplates.locationId })
      .from(availabilityTemplates)
      .innerJoin(locations, eq(availabilityTemplates.locationId, locations.id))
      .where(
        and(
          eq(availabilityTemplates.userId, therapistId),
          eq(availabilityTemplates.isActive, true),
          eq(locations.isActive, true),
        ),
      );
    return rows.map((r) => r.locationId);
  });
}
