import "server-only";
import { eq } from "drizzle-orm";
import { staffLocations } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";

/**
 * PL-09 Phase 0 (foundation — no behavior change yet). The location ids the
 * CALLER is assigned to (`staff_locations`, migration 0038). This is the viewer's
 * OWN scope — distinct from `listStaffLocations`, which returns EVERY user's
 * memberships for the Equipa UI.
 *
 * RLS-scoped via `runScoped`, so it only ever returns this tenant's rows;
 * filtered to `ctx.userId`, so it is the caller's own assignment set (multi-
 * location safe). A user with no membership gets `[]`.
 *
 * Reception/admin will scope their reads to this set (Phases 1-4); owner ignores
 * it (sees all). No capability gate on purpose: this is a low-level self-scope
 * primitive that callers apply INSIDE their own already-authorized queries, never
 * a user-facing read on its own.
 */
export async function resolveViewerLocationIds(ctx: RequestContext): Promise<string[]> {
  return runScoped(ctx, (tx) =>
    tx
      .select({ locationId: staffLocations.locationId })
      .from(staffLocations)
      .where(eq(staffLocations.userId, ctx.userId))
      .then((rows) => rows.map((r) => r.locationId)),
  );
}

/**
 * PL-09 Phase 1: the location allowlist a viewer's reads are scoped to, or `null`
 * when the viewer is NOT location-restricted.
 *
 *   - owner + therapist  -> null. Owner sees all locations; a therapist is scoped
 *     by their OWN-data rules (practitioner lock + therapistPatientScope), not by
 *     location, so a location allowlist would be the wrong axis for them.
 *   - reception + admin  -> their `staff_locations` assignment set.
 *   - reception/admin with NO assignment -> null (FALL BACK to all-locations, so
 *     an unassigned staffer is never locked out mid-onboarding; assign them a
 *     location in Equipa to make the restriction take effect).
 *
 * Callers AND this into their already-authorized, RLS-scoped queries. This is the
 * app-layer (Phase 1) restriction; Phase 2 adds the matching RLS as defense-in-
 * depth.
 */
export async function viewerLocationScope(ctx: RequestContext): Promise<string[] | null> {
  if (ctx.role !== "reception" && ctx.role !== "admin") return null;
  const ids = await resolveViewerLocationIds(ctx);
  return ids.length > 0 ? ids : null;
}
