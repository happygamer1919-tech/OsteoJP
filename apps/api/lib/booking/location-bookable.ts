import { sql, type SQL } from "drizzle-orm";
import { locations } from "@osteojp/db";

/**
 * R45 item 1 (strategy, 2026-10-06): THE PORTAL HIDES ANY LOCATION WITH NO
 * BOOKABLE THERAPIST.
 *
 * ==========================================================================
 * WHAT WAS THERE BEFORE
 * ==========================================================================
 * Every patient-facing list of clinics asked one question of a location: is it
 * active. A row created in Administração > Locais is active by default, so a
 * clinic that has not opened yet would have appeared in the booking wizard and
 * on the public form the moment its row existed, with nobody to book and no
 * slot to offer.
 *
 * ==========================================================================
 * THE RULE, STATED ONCE
 * ==========================================================================
 * A location is offered to a patient only when at least one person a patient
 * could be booked with has hours there:
 *
 *   - an ACTIVE schedule row (`availability_templates.is_active`) at the
 *     location, held by
 *   - an ACTIVE user who is BOOKABLE (`users.is_bookable`, the one flag every
 *     Terapeuta list reads, per PL-06b) and is NOT a shared resource (SCHED-17:
 *     a machine is never offered to a patient).
 *
 * The four places that decide what a patient may see or send all read this one
 * fragment: the logged-in catalogue and its write guard (`store.ts`), the public
 * form's catalogue route, and the public form's submit check (`sellable.ts`).
 * A rule kept in one of them is the GUEST-08 defect again: the list hides what
 * the submit accepts.
 *
 * ==========================================================================
 * NO DATE IN IT, ON PURPOSE, AND WHAT THAT COSTS
 * ==========================================================================
 * A schedule row can carry a validity window. This fragment reads neither end
 * of it: a row that has not started yet counts, and so does one that has
 * expired.
 *
 * NOT STARTED YET COUNTS because that is somebody bookable with hours there,
 * and the slot query honours the row for days inside its window. THE COST: a
 * location given hours ahead of its opening day is listed from the day they
 * are typed, and the therapist step's roster (which requires the row to have
 * started, owner ruling Q-ROSTER) is empty for it until then. A `valid_from`
 * test here would hide exactly that location. It would also hide a working
 * clinic for as long as its schedule was being replaced by one that starts
 * later, if the old rows were switched off rather than left to expire.
 *
 * EXPIRED COUNTS TOO, AND THAT HALF HAS ITS OWN COST. A location whose
 * every schedule row has expired can offer no slot until somebody enters hours,
 * and it stays listed: the wizard shows it with nothing to pick, and the public
 * form accepts a request for it. Before this rule every active location behaved
 * that way. The alternative is an expiry test here, which is exact, and which
 * would also take a working clinic off the PUBLIC form on the first morning
 * its entered hours ran out, although that form needs no schedule at all:
 * reception answers those requests by telephone. Staying listed fails towards
 * the clinic being reachable.
 *
 * BOTH HALVES FAIL THE SAME WAY, towards a clinic being listed. Which failure
 * is preferred is the clinic's to say, so both are recorded in the pull request
 * as a question for strategy, and `location-bookable.db.test.ts` pins both so
 * that changing either is a decision rather than a tidy-up.
 *
 * ==========================================================================
 * THE CALLER MUST HAVE `locations` IN SCOPE
 * ==========================================================================
 * The fragment is correlated on `locations.id` and `locations.tenant_id`, so
 * the tenant of the schedule row and of the user is the location's own and no
 * caller can pass a different one. It belongs in the WHERE of a query over
 * `locations`, or in the ON of a join to it.
 *
 * `is_shared_resource` is named without the column detector `store.ts` still
 * carries: the column arrived with migration 0086 and every database this code
 * can run against has it.
 */
export function locationHasBookableTherapist(): SQL {
  return sql`exists (
    select 1
      from availability_templates av
      join users u on u.id = av.user_id and u.tenant_id = av.tenant_id
     where av.tenant_id = ${locations.tenantId}
       and av.location_id = ${locations.id}
       and av.is_active = true
       and u.is_active = true
       and u.is_bookable = true
       and u.is_shared_resource = false
  )`;
}
