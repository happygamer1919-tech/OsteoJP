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

/**
 * STAFF-02 — the locations a staff member may BOOK INTO, or `null` when they are
 * not location-restricted.
 *
 * ============================================================================
 * WHY A SECOND FUNCTION AND NOT `viewerLocationScope`
 * ============================================================================
 * The read scope above returns `null` for a THERAPIST, deliberately and
 * correctly: a therapist's reads are bounded by their own-data rules
 * (practitioner lock + therapistPatientScope), so a location allowlist would be
 * the wrong axis for them.
 *
 * **The write scope is a different question.** The owner ruled 2026-08-13 that
 * reception, admin AND therapists may only book into their assigned locations.
 * Reusing the read scope would have left therapists able to book anywhere, which
 * is the same class of gap this card exists to close — just one role over.
 *
 * ONE SOURCE OF TRUTH, WHICH IS THE POINT. Both functions call
 * `resolveViewerLocationIds`; neither has its own query. Two sources of location
 * truth drift silently, and the drift would be invisible until someone booked
 * into a clinic they cannot see — exactly how this defect was found.
 *
 * ============================================================================
 * THE DEFECT THIS CLOSES
 * ============================================================================
 * The READ path was scoped by PL-09 and the WRITE path was scoped by nothing. An
 * LV-only receptionist selected CB in Nova marcação and created appointments at
 * CB that he could then never see. Confirmed on the deployed build: the
 * appointments existed, all at OsteoJP (CB), created by a staffer assigned to LV
 * only. **The agenda hid them correctly.** PL-09 was not the defect; it is what
 * made the defect visible.
 *
 * ============================================================================
 * THE UNASSIGNED CASE, AND IT IS A DECISION RATHER THAN AN OVERSIGHT
 * ============================================================================
 * A staff member with NO assignment falls back to `null` — unrestricted — which
 * is exactly what the read scope does, for the reason stated above it: nobody is
 * locked out mid-onboarding, and the restriction takes effect the moment an
 * assignment exists in Equipa.
 *
 * The alternative — refusing every booking from an unassigned staffer — closes a
 * hole nobody has hit and opens a hard lockout that reads as a broken
 * application on someone's first day. The reported defect is closed either way,
 * because the receptionist in question WAS assigned (LV only).
 *
 * **Flagged rather than assumed:** the owner's ruling did not cover the
 * unassigned case. This mirrors PL-09's own documented fallback so the two
 * cannot disagree, and it is recorded on the card.
 */
export async function bookingLocationScope(ctx: RequestContext): Promise<string[] | null> {
  if (ctx.role === "owner") return null;
  const ids = await resolveViewerLocationIds(ctx);
  return ids.length > 0 ? ids : null;
}

/**
 * The refusal itself, as a predicate, so every write path asks the same question
 * in the same words.
 *
 * `null` scope means unrestricted and always permits. A non-null scope permits
 * only membership. There is no third answer and no "unknown" branch — the one
 * shape that would let a location slip through unexamined.
 */
export function isLocationBookable(scope: string[] | null, locationId: string): boolean {
  return scope === null || scope.includes(locationId);
}
