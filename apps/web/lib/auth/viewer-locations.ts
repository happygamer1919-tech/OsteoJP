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
