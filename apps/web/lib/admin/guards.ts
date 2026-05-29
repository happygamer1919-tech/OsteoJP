import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { roles, users, type DbTx } from "@osteojp/db";

/**
 * Pure decision: would this change strip the tenant of its last active owner?
 *
 * Kept side-effect-free so it can be unit-tested without a database. The
 * caller supplies the counts/flags it reads inside the tenant-scoped tx.
 */
export function wouldRemoveLastOwner(params: {
  /** active users currently holding the `owner` role, in this tenant */
  activeOwnerCount: number;
  /** the user being changed currently holds `owner` AND is active */
  targetIsActiveOwner: boolean;
  /** the change removes this user's owner status (demotion or deactivation) */
  changeRemovesOwner: boolean;
}): boolean {
  return (
    params.targetIsActiveOwner &&
    params.changeRemovesOwner &&
    params.activeOwnerCount <= 1
  );
}

/** Count active users with the `owner` role. RLS scopes this to the tenant. */
export async function countActiveOwners(tx: DbTx): Promise<number> {
  const rows = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(and(eq(roles.slug, "owner"), eq(users.isActive, true)));
  return rows[0]?.count ?? 0;
}
