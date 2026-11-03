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

import type { Role } from "@osteojp/auth";
import { practitionerForbiddenToActor } from "./shared-resource-guard";
import type { AppointmentStatusValue } from "./types";

type EligibilityInput = { status: AppointmentStatusValue; startsAt: string };

/**
 * ==========================================================================
 * MARCAR NOVAMENTE IS OFFERED ON EVERY APPOINTMENT. Owner ruling 2026-09-10.
 * ==========================================================================
 * "Renders on every appointment regardless of estado, past and future."
 *
 * WHAT THE TWO GATES USED TO DO, and both are reproduced in
 * marcar-novamente.repro.test.ts before this change:
 *
 *   PROFILE  status === "completed" || startsAt < now
 *            -> hid EVERY future appointment that was not already completed,
 *               which is the ordinary upcoming case.
 *   DRAWER   status !== "cancelled" && startsAt < now
 *            -> hid every future one AND every past CANCELLED one.
 *
 * They disagreed on exactly one row - a past cancelled visit was offered on the
 * profile and not in the drawer - and that disagreement was recorded in this
 * file as a product decision nobody had taken. It has now been taken, in the
 * direction that removes both gates.
 *
 * ==========================================================================
 * THE PREDICATES ARE KEPT, RETURNING TRUE, RATHER THAN DELETED
 * ==========================================================================
 * Four call sites read them. Deleting them would spread `true` across four
 * files and leave nothing to read when somebody asks "was this ever gated?" -
 * the answer would be in git history only. Keeping one place that says
 * "unconditional, and here is what it used to be" is what makes the ruling
 * findable from the code it governs.
 *
 * They keep taking their arguments so no call site changes and so a future
 * re-gating has somewhere to go. `now` is still a parameter for the same
 * reason. The arguments are deliberately unused.
 */

/** PROFILE gate: unconditional. See the header. */
export function isEligibleForScheduleAgain(_a: EligibilityInput, _now = Date.now()): boolean {
  return true;
}

/** AGENDA DRAWER gate: unconditional, and now identical to the profile's. */
export function isPastConsuming(_a: EligibilityInput, _now = Date.now()): boolean {
  return true;
}

/**
 * U6 - WHO IS OFFERED "MARCAR NOVAMENTE" ON A GIVEN VISIT.
 *
 * The two gates above say the button is on every appointment, whatever its
 * estado and date. This one is about the VIEWER: since R52 `cloneAppointment`
 * refuses a therapist who copies a colleague's visit (`forbidden`), because the
 * copy is written in the colleague's name. The button was still drawn, so the
 * therapist pressed it, chose a time and was refused.
 *
 * True means the server would refuse, so the button is hidden. It calls the
 * server's own rule, `practitionerForbiddenToActor`, and restates nothing.
 *
 * `tenantSharedResourceIds` is `AgendaOptions.tenantSharedResourceIds`: the
 * tenant's active shared resources (NESA), which the rule lets a therapist book.
 * The pages that offer the button set it for a therapist viewer; for the other
 * roles the rule never refuses, so it is not needed.
 *
 * What this does NOT hide: refusals that depend on the hour picked in the
 * drawer (availability, conflicts, clinic hours), and the location refusals
 * (`location_not_assigned`, `shared_resource_location`), which the drawer
 * explains in their own sentences.
 */
export function scheduleAgainForbidden(
  viewer: { role: Role; userId: string },
  practitionerId: string,
  tenantSharedResourceIds: readonly string[] | undefined,
): boolean {
  return practitionerForbiddenToActor({
    role: viewer.role,
    actorId: viewer.userId,
    practitionerId,
    isSharedResource: (tenantSharedResourceIds ?? []).includes(practitionerId),
  });
}
