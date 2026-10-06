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
 * NO DATE IN IT, ON PURPOSE
 * ==========================================================================
 * The therapist step's roster (`listBookableTherapists`) also requires the
 * schedule row's validity window to cover today. This fragment deliberately
 * does not. A schedule is often entered as dated rows, so on a given day most
 * of a working clinic's active rows can sit outside their window; a date test
 * here could take a clinic that is open off the booking form for a day because
 * of how its hours were typed. "Does anybody bookable have hours here" answers
 * the question the ruling asks, and it does not change with the calendar.
 *
 * So a location can be listed while the therapist step, or the slot grid, is
 * empty for the moment. That is what every location did before this rule, and
 * the roster and the slot query are unchanged.
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
