import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { staffLocations, users, type DbTx } from "@osteojp/db";
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
 * Serialise every write to ONE member (Q-M review, 2026-10-20; PL-09): a save
 * that reads the member's current rows and then writes from what it read takes
 * `SELECT ... FOR NO KEY UPDATE` on the member's own users row first, so two saves on
 * the same member run one after the other and the second reads what the first
 * committed. It also refuses a member this actor cannot see (another tenant's
 * id) with not_found.
 */
export async function lockStaffMember(tx: DbTx, userId: string): Promise<void> {
  // NO KEY UPDATE: serialises the saves on this member without conflicting
  // with the KEY SHARE locks that foreign keys to users take (an audit insert
  // naming this member, for one).
  const [row] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .for("no key update");
  if (!row) throw new AdminError("not_found");
}

/**
 * The clinic set a memberships save writes. For the owner and an unassigned
 * admin (scope null) it is exactly what the form posted. For an admin assigned
 * to some clinics, the save governs only their own clinics:
 *   - a posted clinic outside the scope that the member does not hold is an
 *     add at another clinic, and refuses the whole save (`forbidden`);
 *   - a membership the member holds outside the scope is KEPT, whether or not
 *     the form posted it. The Gerir form posts active clinics only, so a
 *     membership at an archived clinic is never posted, and must not read as a
 *     removal.
 * Result: (posted within the scope) together with (held outside the scope).
 */
export function resolveMembershipSet(
  wanted: readonly string[],
  current: ReadonlySet<string>,
  scope: string[] | null,
): string[] {
  if (!scope) return [...new Set(wanted)];
  const own = new Set(scope);
  if (wanted.some((locationId) => !current.has(locationId) && !own.has(locationId))) {
    throw new AdminError("forbidden");
  }
  const keptOutside = [...current].filter((locationId) => !own.has(locationId));
  return [...new Set([...wanted.filter((locationId) => own.has(locationId)), ...keptOutside])];
}

/**
 * A location-scoped admin never leaves a member with no clinic at all. A member
 * with no clinic falls outside every scoped admin's list, and an admin with no
 * clinic is unrestricted (`viewerLocationScope` returns null), so emptying a
 * member's memberships, the admin's own included, would move them out of the
 * clinic model rather than between clinics. Refused with `forbidden`. No-op for
 * owner and for an unassigned admin (scope null).
 */
export function assertKeepsAMembership(
  remaining: number,
  scope: string[] | null,
): void {
  if (!scope) return;
  if (remaining === 0) throw new AdminError("forbidden");
}

/**
 * A location-scoped admin sets a member's agenda colour only at their own
 * clinics: the colour lives on the membership at one clinic, so it is a change
 * at that clinic. `forbidden` otherwise. No-op for owner and for an unassigned
 * admin (scope null).
 */
export function assertLocationInScope(locationId: string, scope: string[] | null): void {
  if (!scope) return;
  if (!scope.includes(locationId)) throw new AdminError("forbidden");
}
