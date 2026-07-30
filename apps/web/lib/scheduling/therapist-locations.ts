import "server-only";
import { and, eq } from "drizzle-orm";
import type { RequestContext } from "@osteojp/auth";
import { availabilityTemplates, locations, staffLocations } from "@osteojp/db";
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
 * PL-14 WIDENS this read past the single-therapist one above: "assigned" here is
 * the UNION of active working hours (availability_templates) and explicit team
 * membership (staff_locations, 0038 — which did not exist at W9-02). The two
 * functions no longer share one WHERE clause, and that is deliberate: this one
 * answers "who works at this clinic" for a roster filter, while
 * getTherapistLocationIds answers "where does this therapist have hours" for the
 * booking auto-fill, where an hours row is the thing being auto-filled. Neither
 * applies a `valid_from`/`valid_until` window (W9-01 (f)).
 *
 * Returns a Map so the caller's filter is a set lookup, not an N-query loop.
 * A therapist with no active assignment is simply absent from the map.
 */
export async function listTherapistLocationAssignments(
  ctx: RequestContext,
): Promise<Map<string, string[]>> {
  return runScoped(ctx, async (tx) => {
    const [hourRows, memberRows] = await Promise.all([
      tx
        .selectDistinct({
          userId: availabilityTemplates.userId,
          locationId: availabilityTemplates.locationId,
        })
        .from(availabilityTemplates)
        .innerJoin(locations, eq(availabilityTemplates.locationId, locations.id))
        .where(and(eq(availabilityTemplates.isActive, true), eq(locations.isActive, true))),
      // PL-14: the SECOND leg of "assigned". staff_locations (0038) did not exist
      // when W9-02 derived assignment from working hours alone, and on prod only
      // 5 of 11 members have hours — so the hours-only derivation hid two thirds
      // of a real team behind a specific-location view while STILL showing a
      // CB-only therapist to an LV admin. Explicit membership is the stronger
      // signal; hours stay in the union so a therapist who works somewhere they
      // were never formally added to is not dropped. No capability gate here on
      // purpose (staff_locations grants in-tenant SELECT to every role) — this is
      // a scoping primitive callers apply inside their own authorized reads.
      tx
        .selectDistinct({
          userId: staffLocations.userId,
          locationId: staffLocations.locationId,
        })
        .from(staffLocations)
        .innerJoin(locations, eq(staffLocations.locationId, locations.id))
        .where(eq(locations.isActive, true)),
    ]);

    const byTherapist = new Map<string, string[]>();
    for (const row of [...hourRows, ...memberRows]) {
      const existing = byTherapist.get(row.userId);
      if (!existing) byTherapist.set(row.userId, [row.locationId]);
      else if (!existing.includes(row.locationId)) existing.push(row.locationId);
    }
    return byTherapist;
  });
}
