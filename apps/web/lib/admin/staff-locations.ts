import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { locations, staffLocations } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { isTherapistPaletteColor } from "@/lib/scheduling/therapist-color";
import { writeAudit } from "./audit";
import { AdminError } from "./errors";

/**
 * Equipa location membership + per-location agenda colour (W12-40-Q2).
 *
 * #663 consolidated member management into one "Gerir" modal but shipped the
 * `staff_locations` (0038) membership + colour as READ-ONLY: there was no app
 * write layer (no query touched the table outside its RLS test). This module is
 * that write layer, completing "everything editable from one place".
 *
 * `staff_locations` (migration 0038) is a plain junction: unique
 * (tenant_id, user_id, location_id) + a nullable `color`. Unlike the append-only
 * `therapist_services`, its RLS grants SELECT to any in-tenant role and
 * INSERT/UPDATE/DELETE to owner/admin — so membership is a straight add/remove
 * diff and colour is a straight UPDATE. Every path is `users:manage`-gated
 * (matches the migration's owner/admin write policy) and tenant-scoped via
 * runScoped; every mutation writes a PII-free audit row.
 */

export type StaffLocationMembership = {
  locationId: string;
  /** W12-21 palette key, or null → agenda uses the deterministic FNV colour. */
  color: string | null;
};

/**
 * All members' location memberships (+colour), tenant-scoped. Keyed by user id,
 * oldest-membership-first. The Equipa page reads this to seed the Gerir modal's
 * membership checkboxes and per-location colour pickers.
 */
export async function listStaffLocations(
  actor: RequestContext,
): Promise<Map<string, StaffLocationMembership[]>> {
  assertCan(actor.role, "users:read");
  return runScoped(actor, async (tx) => {
    const rows = await tx
      .select({
        userId: staffLocations.userId,
        locationId: staffLocations.locationId,
        color: staffLocations.color,
      })
      .from(staffLocations)
      .orderBy(asc(staffLocations.userId), asc(staffLocations.createdAt));

    const byUser = new Map<string, StaffLocationMembership[]>();
    for (const r of rows) {
      const list = byUser.get(r.userId) ?? [];
      list.push({ locationId: r.locationId, color: r.color });
      byUser.set(r.userId, list);
    }
    return byUser;
  });
}

/**
 * Set a member's clinic memberships to EXACTLY `locationIds` (add the missing,
 * remove the absent). Colour on kept rows is preserved (only add/remove touch
 * rows). Every requested id must resolve to a location in the actor's tenant
 * (RLS-scoped read) or the whole set is rejected — a forged/cross-tenant id is
 * never written. Owner/admin only.
 *
 * Membership drives the 0045 admin clinical-visibility basis, so this is a
 * permission-sensitive action: it is audited even though `staff_locations`
 * itself holds no PII.
 */
export async function setStaffLocations(
  actor: RequestContext,
  userId: string,
  locationIds: string[],
): Promise<void> {
  assertCan(actor.role, "users:manage");
  if (!userId) throw new AdminError("invalid");
  const wanted = [...new Set(locationIds.filter((id) => id.length > 0))];

  await runScoped(actor, async (tx) => {
    // Every requested location must be a real location of this tenant (RLS scopes
    // the read); reject the whole request on any unknown/cross-tenant id.
    if (wanted.length > 0) {
      const valid = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(inArray(locations.id, wanted));
      const validIds = new Set(valid.map((v) => v.id));
      for (const id of wanted) {
        if (!validIds.has(id)) throw new AdminError("invalid");
      }
    }

    const current = await tx
      .select({ locationId: staffLocations.locationId })
      .from(staffLocations)
      .where(eq(staffLocations.userId, userId)); // RLS scopes tenant
    const currentIds = new Set(current.map((c) => c.locationId));
    const wantedSet = new Set(wanted);

    const toAdd = wanted.filter((id) => !currentIds.has(id));
    const toRemove = [...currentIds].filter((id) => !wantedSet.has(id));

    if (toAdd.length === 0 && toRemove.length === 0) return; // no-op, no audit

    for (const locationId of toAdd) {
      await tx.insert(staffLocations).values({
        tenantId: actor.tenantId, // NOT NULL + RLS WITH CHECK
        userId,
        locationId,
        // color left null → deterministic FNV colour until set explicitly
      });
    }
    for (const locationId of toRemove) {
      await tx
        .delete(staffLocations)
        .where(
          and(
            eq(staffLocations.userId, userId),
            eq(staffLocations.locationId, locationId),
          ),
        ); // RLS scopes tenant
    }

    await writeAudit(tx, actor, {
      action: "staff.locations.set",
      entityType: "staff_locations",
      entityId: userId,
      // PII-free: ids + counts only.
      metadata: { added: toAdd.length, removed: toRemove.length, total: wanted.length },
    });
  });
}

/**
 * Set the agenda colour for a member's membership at ONE location. `color` must
 * be a W12-21 palette key (allowlist) or null to clear it (→ FNV fallback). The
 * member must already belong to that location — colour lives on the membership
 * row, so there is nothing to colour without a membership. Owner/admin only.
 */
export async function setStaffColor(
  actor: RequestContext,
  userId: string,
  locationId: string,
  color: string | null,
): Promise<void> {
  assertCan(actor.role, "users:manage");
  if (!userId || !locationId) throw new AdminError("invalid");
  const normalized = color && color.length > 0 ? color : null;
  if (normalized !== null && !isTherapistPaletteColor(normalized)) {
    throw new AdminError("invalid");
  }

  await runScoped(actor, async (tx) => {
    const [row] = await tx
      .select({ id: staffLocations.id, color: staffLocations.color })
      .from(staffLocations)
      .where(
        and(eq(staffLocations.userId, userId), eq(staffLocations.locationId, locationId)),
      )
      .limit(1); // RLS scopes tenant
    if (!row) throw new AdminError("not_found"); // must be a member of that location first
    if (row.color === normalized) return; // unchanged, no write/audit

    await tx
      .update(staffLocations)
      .set({ color: normalized })
      .where(
        and(eq(staffLocations.userId, userId), eq(staffLocations.locationId, locationId)),
      ); // RLS scopes tenant

    await writeAudit(tx, actor, {
      action: "staff.color.set",
      entityType: "staff_locations",
      entityId: userId,
      // PII-free: location id + the palette key (or null), never a raw value.
      metadata: { locationId, color: normalized },
    });
  });
}
