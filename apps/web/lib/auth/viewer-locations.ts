import "server-only";
import { cache } from "react";
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
/**
 * ==========================================================================
 * MEMOISED PER REQUEST. PERF-02.
 * ==========================================================================
 * This ran ONCE PER CALLER, and it opens its OWN `runScoped` transaction each
 * time. One `/patients` render called it THREE TIMES for the same user in the
 * same request: `app/patients/page.tsx` runs `listPatientsPage`,
 * `getPatientListStats` and `listFilterLocations` in a `Promise.all`, and each
 * resolves the viewer's scope independently. The agenda page reaches five or six.
 * React `cache()` was used nowhere in `apps/web` - zero imports before this.
 *
 * Six transactions per `/patients` load became four; nineteen statements became
 * thirteen. Under a `postgres.js` pool of `max: 2`, each removed transaction is
 * also one fewer connection acquisition against two slots.
 *
 * ==========================================================================
 * DO NOT QUOTE THE LOCAL MEASUREMENT AS THE BENEFIT
 * ==========================================================================
 * Against a local harness this moved p50 by about 2%, and that number is
 * MEANINGLESS for production: a `staff_locations` read on a database in the same
 * kernel is 0.083 ms, so removing the round trip removes almost nothing. On
 * production every one of those statements crosses the Supabase transaction
 * pooler. THE HARNESS CANNOT MEASURE THAT because it has no network latency, and
 * this comment says so rather than promoting the 2% into a claim about the
 * clinic. What is measured is the COUNT - six transactions to four, nineteen
 * statements to thirteen - and that count is exact.
 *
 * ==========================================================================
 * KEYED ON THE PRIMITIVES, NOT ON THE CONTEXT OBJECT
 * ==========================================================================
 * `cache()` compares arguments by identity for objects. A caller that builds a
 * fresh `RequestContext` - which `requireRequestContext()` does whenever a
 * function is called without one - would miss a cache keyed on `ctx`, silently,
 * and the memo would look present while doing nothing. `RequestContext` is
 * exactly three strings (`packages/auth/guard.ts:33`), so keying on all three is
 * both complete and value-compared.
 *
 * The cache is per REQUEST, which is the correct lifetime: a staff member's
 * location assignment can change in Equipa, and the next request must see it.
 */
const resolveForPrincipal = cache(
  async (tenantId: string, role: RequestContext["role"], userId: string): Promise<string[]> =>
    runScoped({ tenantId, role, userId }, (tx) =>
      tx
        .select({ locationId: staffLocations.locationId })
        .from(staffLocations)
        .where(eq(staffLocations.userId, userId))
        .then((rows) => rows.map((r) => r.locationId)),
    ),
);

export async function resolveViewerLocationIds(ctx: RequestContext): Promise<string[]> {
  return resolveForPrincipal(ctx.tenantId, ctx.role, ctx.userId);
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
