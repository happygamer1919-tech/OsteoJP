import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { staffLocations, type DbTx } from "@osteojp/db";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import type { RequestContext } from "@/lib/auth/context";
import { AdminError } from "./errors";

/**
 * PL-09 Phase 5 location scope for schedule management (working-hours + time-off).
 *
 * Who a scheduling actor may manage:
 *   - owner -> unrestricted.
 *   - reception / admin WITH a staff_locations assignment -> only therapists that
 *     share one of those locations.
 *   - reception / admin with NO assignment -> unrestricted (no lockout — mirrors
 *     the rest of PL-09; an unassigned actor is not silently blocked).
 *   - therapist -> THEMSELVES ONLY (ITEM 3, owner ruling 2026-08-14).
 *
 * THE THERAPIST ROW USED TO READ "unrestricted", ALONGSIDE THE OWNER, and that
 * was safe only because a therapist held no schedule capability at all. The
 * moment they were granted one, that shared `null` became a hole. It is now a
 * distinct scope kind rather than a comment.
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
export type ScheduleScope =
  /** Owner, and any staffer with no location assignment: no target restriction. */
  | { kind: "all" }
  /** Located reception/admin: only therapists sharing one of these locations. */
  | { kind: "locations"; locationIds: string[] }
  /** Therapist: their OWN schedule and nobody else's. */
  | { kind: "self"; userId: string };

export async function resolveScheduleScope(actor: RequestContext): Promise<ScheduleScope> {
  // ITEM 3 - a therapist may manage their own schedule and ONLY their own.
  //
  // THE RULE LIVES IN THE SCOPE RATHER THAN AT THE CALL SITES, and that is the
  // whole design. Nine call sites across availability.ts and time-off.ts already
  // resolve a scope and hand it to the assert. Adding a therapist check beside
  // each of them would mean nine places to forget, forever, and the ninth is
  // whatever someone adds next month.
  //
  // Expressing it as a scope KIND means a caller cannot express the rule
  // incorrectly - they can only fail to call the assert at all, which is a
  // visible omission rather than a subtly wrong predicate. Same argument
  // migration 0059 made for `is_unconfirmed_pedido`: one definition, callers
  // reference it by name.
  //
  // THE OLD SHAPE COULD NOT CARRY THIS. It was `string[] | null`, where null
  // meant "unrestricted" and was returned for the owner, an unassigned staffer
  // AND a therapist alike - three different reasons collapsed onto one value.
  // Granting a therapist schedule:manage under that shape would have made them
  // unrestricted, which is the opposite of the ruling.
  if (actor.role === "therapist") return { kind: "self", userId: actor.userId };
  const locationIds = await viewerLocationScope(actor);
  return locationIds ? { kind: "locations", locationIds } : { kind: "all" };
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
  scope: ScheduleScope,
): Promise<void> {
  if (scope.kind === "all") return;
  // ITEM 3: the therapist rule needs no query - identity is the whole predicate.
  // `forbidden`, not `not_found`: a therapist knows their colleagues exist, so
  // there is nothing to conceal and a truthful refusal is the better message.
  if (scope.kind === "self") {
    if (targetUserId !== scope.userId) {
      throw new AdminError("forbidden", "a therapist may only manage their own schedule");
    }
    return;
  }
  const [row] = await tx
    .select({ userId: staffLocations.userId })
    .from(staffLocations)
    .where(
      and(
        eq(staffLocations.userId, targetUserId),
        inArray(staffLocations.locationId, scope.locationIds),
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
  scope: ScheduleScope,
): Promise<Set<string>> {
  const ids = [...new Set(targetUserIds)];
  // An unrestricted actor (owner / unassigned staffer) manages everyone, and is
  // never worth a query - the same short-circuit the assert takes.
  if (scope.kind === "all") return new Set(ids);
  // ITEM 3: a therapist manages exactly themselves, and only if they were asked
  // about. Answering "yes" for an id the caller did not ask about would be a
  // different bug in the same family.
  if (scope.kind === "self") {
    return new Set(ids.filter((id) => id === scope.userId));
  }
  if (ids.length === 0 || scope.locationIds.length === 0) return new Set();
  const rows = await tx
    .selectDistinct({ userId: staffLocations.userId })
    .from(staffLocations)
    .where(
      and(
        inArray(staffLocations.userId, ids),
        inArray(staffLocations.locationId, scope.locationIds),
      ),
    );
  return new Set(rows.map((r) => r.userId));
}
