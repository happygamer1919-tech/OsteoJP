// "Marcar novamente" eligibility — PURE core (no DB, no server-only, no React).
// Separate from the drawer component for the reason clone-core.ts is separate
// from actions.ts, PLUS one this file learned the hard way:
//
//   THE FIRST VERSION IMPORTED `PACK_CONSUMING_STATUSES` FROM `@osteojp/db`
//   INTO A "use client" COMPONENT, AND THAT PULLS THE `postgres` DRIVER INTO
//   THE BROWSER BUNDLE. Next refused to build the page. Neither the unit tests
//   nor the typechecker could see it — `renderToStaticMarkup` never bundles —
//   and the E2E run is what caught it, which is why test:e2e is unconditional.
//
// So the rule is restated here in plain TypeScript and PINNED against the
// database constant by schedule-again-core.test.ts, which is a NODE test and
// may import `@osteojp/db` freely. The two cannot drift without going red, and
// the client never reaches the driver.

import type { AppointmentStatusValue } from "./types";

type EligibilityInput = { status: AppointmentStatusValue; startsAt: string };

/**
 * PATIENT PROFILE gate: "past or completed". Past is judged on the actual
 * instant, not the status, so a CANCELLED or NO-SHOW visit is still offered —
 * rebooking after exactly those outcomes is the point of "schedule again".
 * Future non-completed appointments (the normal upcoming case) are excluded.
 */
export function isEligibleForScheduleAgain(a: EligibilityInput, now = Date.now()): boolean {
  return a.status === "completed" || new Date(a.startsAt).getTime() < now;
}

/**
 * AGENDA DRAWER gate, deliberately NARROWER: past AND in a CONSUMING state.
 * Rodica's stated workflow is the one it is cut for — press an appointment that
 * finished today and copy it for the patient's next visit.
 *
 * WRITTEN AS "NOT CANCELLED" RATHER THAN AS AN IN-LIST, which is the shape
 * `PACK_CONSUMING_STATUS_SQL` already argues for in pack-balance.ts: the status
 * enum may gain a value, and a new status should default to CONSUMING. Getting
 * that backwards silently hides the button for a state nobody thought about.
 *
 * THE TWO GATES DISAGREE ON EXACTLY ONE ROW, recorded rather than quietly
 * unified: a PAST CANCELLED appointment is offered on the profile and not in the
 * drawer. Both readings are defensible — the profile's comment argues rebooking
 * a cancellation is the point; the drawer's brief scopes to visits that actually
 * happened — and choosing one for both surfaces is a product decision, not a
 * refactor. Ruled on, they collapse to a single predicate here.
 */
export function isPastConsuming(a: EligibilityInput, now = Date.now()): boolean {
  return a.status !== "cancelled" && new Date(a.startsAt).getTime() < now;
}
