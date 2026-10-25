import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { staffLocations, type DbTx } from "@osteojp/db";
import { AdminError } from "./errors";

/**
 * PL-09 Phase 4: an admin may only act on staff AT their location(s). Resolve the
 * viewer's scope (`viewerLocationScope`: null for owner / unassigned admin) BEFORE
 * the mutation tx, then pass it here: a target outside the scope is treated as
 * not_found - it is invisible to this admin, exactly as it is absent from
 * listStaff. No-op for owner.
 *
 * Every Equipa save that names a staff member calls this: the profile, role,
 * active and delete saves in staff.ts, Ativar login, the clinic memberships and
 * their colour (staff-locations.ts), and the primary and other services
 * (therapist-primary-service.ts). One helper, so the rule cannot drift between
 * them.
 */
export async function assertStaffInScope(
  tx: DbTx,
  userId: string,
  scope: string[] | null,
): Promise<void> {
  if (!scope) return;
  const rows = await tx
    .select({ id: staffLocations.userId })
    .from(staffLocations)
    .where(and(eq(staffLocations.userId, userId), inArray(staffLocations.locationId, scope)))
    .limit(1);
  if (rows.length === 0) throw new AdminError("not_found");
}

/**
 * A location-scoped admin changes clinic memberships only at their own clinics.
 * `toAdd` and `toRemove` are the clinics a save would add and remove; any of them
 * outside the scope refuses the whole save (`forbidden`). A membership at another
 * clinic that the save leaves as it is passes: the Gerir form lists every clinic
 * of the tenant and posts the member's existing memberships back unchanged.
 * No-op for owner and for an unassigned admin (scope null).
 */
export function assertMembershipChangeInScope(
  toAdd: readonly string[],
  toRemove: readonly string[],
  scope: string[] | null,
): void {
  if (!scope) return;
  const own = new Set(scope);
  if ([...toAdd, ...toRemove].some((locationId) => !own.has(locationId))) {
    throw new AdminError("forbidden");
  }
}
