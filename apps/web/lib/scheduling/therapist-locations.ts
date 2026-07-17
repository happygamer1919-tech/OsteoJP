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

/**
 * The same derivation as `getTherapistLocationIds`, for EVERY therapist at once
 * (W9-02). Feeds the agenda's therapist-by-location filter, which needs the
 * whole roster's assignments rather than one therapist's.
 *
 * The predicate is deliberately IDENTICAL to the single-therapist read above -
 * active availability row AND active location, no `valid_from`/`valid_until`
 * window check. W9-01 (f) flagged the drift risk: if the agenda filter honoured
 * the validity window while the booking auto-fill did not, the two surfaces
 * would disagree about what "assigned" means. They must move together, so keep
 * these two functions' WHERE clauses in lock-step.
 *
 * Returns a Map so the caller's filter is a set lookup, not an N-query loop.
 * A therapist with no active assignment is simply absent from the map.
 */
export async function listTherapistLocationAssignments(
  ctx: RequestContext,
): Promise<Map<string, string[]>> {
  return runScoped(ctx, async (tx) => {
    const rows = await tx
      .selectDistinct({
        userId: availabilityTemplates.userId,
        locationId: availabilityTemplates.locationId,
      })
      .from(availabilityTemplates)
      .innerJoin(locations, eq(availabilityTemplates.locationId, locations.id))
      .where(and(eq(availabilityTemplates.isActive, true), eq(locations.isActive, true)));

    const byTherapist = new Map<string, string[]>();
    for (const row of rows) {
      const existing = byTherapist.get(row.userId);
      if (existing) existing.push(row.locationId);
      else byTherapist.set(row.userId, [row.locationId]);
    }
    return byTherapist;
  });
}
