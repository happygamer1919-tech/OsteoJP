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

/**
 * The same question as `assertTargetInScheduleScope`, asked about MANY targets
 * and ANSWERED rather than thrown. Returns the subset of `targetUserIds` this
 * actor may manage.
 *
 * WHY THIS EXISTS, and it is a defect fix rather than an optimisation.
 * A SURFACE THAT LISTS THERAPISTS AND A GATE THAT REFUSES THEM ARE TWO
 * DIFFERENT PREDICATES, and they disagreed on exactly one case: a therapist
 * with NO location assignment at all.
 *
 *   filterRosterByViewerScope (scheduling/therapist-location-filter.ts) KEEPS
 *     that therapist, deliberately - "dropping them would silently hide a real
 *     colleague behind a data-entry gap rather than isolate anything".
 *   assertTargetInScheduleScope (above) THROWS on that therapist, also
 *     deliberately - a located actor manages only their own location's staff.
 *
 * Both are right on their own. /horarios and Equipa put them in series: render
 * the roster, then run the assert once per rostered member inside a
 * `Promise.all`. One unassigned therapist rejected the whole batch, the server
 * component threw, and reception got a black page reading "Application error:
 * a client-side exception has occurred". It failed in front of the clinic team.
 *
 * A THROW IS THE WRONG SHAPE FOR A LIST. The assert is correct where a single
 * target is being acted on - a write must refuse. Building a LIST is a
 * different question: "which of these may I manage" has a per-member answer,
 * and a page that renders many members must be able to hold that answer per
 * member instead of losing every member to the first refusal.
 *
 * ONE QUERY, NOT N. The callers previously issued one round-trip per therapist.
 * Reading the membership once also removes the possibility that two members'
 * answers come from different snapshots.
 *
 * THIS DOES NOT WEAKEN THE GATE. `assertTargetInScheduleScope` is unchanged and
 * still runs inside every time-off read and write, so a caller that renders a
 * member it should not have still cannot act on them.
 */
export async function manageableTargets(
  tx: DbTx,
  targetUserIds: readonly string[],
  scope: string[] | null,
): Promise<Set<string>> {
  const ids = [...new Set(targetUserIds)];
  // An unscoped actor (owner / therapist / unassigned) manages everyone, and is
  // never worth a query - the same short-circuit the assert takes.
  if (!scope) return new Set(ids);
  if (ids.length === 0 || scope.length === 0) return new Set();
  const rows = await tx
    .selectDistinct({ userId: staffLocations.userId })
    .from(staffLocations)
    .where(
      and(
        inArray(staffLocations.userId, ids),
        inArray(staffLocations.locationId, scope),
      ),
    );
  return new Set(rows.map((r) => r.userId));
}
