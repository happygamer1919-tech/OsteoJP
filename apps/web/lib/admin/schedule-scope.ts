import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { staffLocations, type DbTx } from "@osteojp/db";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import type { RequestContext } from "@/lib/auth/context";
import { AdminError } from "./errors";

/**
 * PL-09 Phase 5 location scope for schedule management (working-hours + time-off).
 *
 * A scheduling actor may only manage a therapist AT THEIR LOCATION:
 *   - owner / therapist  -> unrestricted (viewerLocationScope returns null).
 *   - reception / admin WITH a staff_locations assignment -> only therapists that
 *     share one of those locations.
 *   - reception / admin with NO assignment -> null (no lockout — mirrors the rest
 *     of PL-09; an unassigned actor is not silently blocked).
 *
 * `viewerLocationScope` opens its own scoped tx, so callers resolve the scope
 * ONCE, BEFORE `runScoped`, and pass it into `assertTargetInScheduleScope` inside.
 * The scope is the SAME staff_locations basis PL-09 uses everywhere.
 *
 * This is the PRIMARY (server-side) enforcement. availability_templates / time_off
 * are still tenant-only at the RLS layer; the RLS tightening is a migration-gated
 * follow-up (blueprint Phase 5). Until then this app check is the whole gate, so
 * it verifies the TARGET therapist explicitly rather than trusting the UI.
 */
export async function resolveScheduleScope(
  actor: RequestContext,
): Promise<string[] | null> {
  return viewerLocationScope(actor);
}

/**
 * Throw AdminError("not_found") when `scope` is set (a located reception/admin)
 * and `targetUserId` is NOT assigned to any location in it. A no-op for an
 * unscoped actor (owner / therapist / unassigned). `not_found` (not `forbidden`)
 * so an out-of-location therapist is indistinguishable from a missing one — the
 * actor never learns another location's roster exists.
 */
export async function assertTargetInScheduleScope(
  tx: DbTx,
  targetUserId: string,
  scope: string[] | null,
): Promise<void> {
  if (!scope) return;
  const [row] = await tx
    .select({ userId: staffLocations.userId })
    .from(staffLocations)
    .where(
      and(
        eq(staffLocations.userId, targetUserId),
        inArray(staffLocations.locationId, scope),
      ),
    )
    .limit(1);
  if (!row) throw new AdminError("not_found", "therapist is not at your location");
}
