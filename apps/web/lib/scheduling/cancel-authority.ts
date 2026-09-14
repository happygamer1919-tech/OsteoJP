import { can, type Role } from "@osteojp/auth";

/**
 * SCHED-30 - WHO MAY CANCEL AN APPOINTMENT, AND BRING ONE BACK. Owner dispatch
 * 2026-09-14 (BL-3).
 *
 * Owner, admin and reception hold `appointments:delete` and are unchanged: any
 * row their RLS and location scope already let them write.
 *
 * A therapist holds `appointments:cancel_own`, which is TARGET-BLIND like every
 * grant in the matrix. The target rule lives here and nowhere else:
 *   - they are the Terapeuta or the Terapeuta 2 on EVERY row the call touches;
 *   - every row is at one of their clinics.
 *
 * WHY THE "ON THE ROW" TEST IS OURS AND NOT LEFT TO RLS. appointments_rls lets a
 * therapist read and write a shared resource's appointment (NESA) at a clinic
 * they share with it (0086), whoever booked it. RLS admitting a row is therefore
 * not the same fact as "this therapist is on it", and the owner's rule is the
 * second one.
 *
 * THE CLINIC TEST IS STAFF-02's, on purpose: `bookingLocationScope` is the one
 * source for "which clinics may this person write into", including its
 * documented fallback that an UNASSIGNED staff member is unrestricted. It is
 * passed in rather than read here so this file stays pure; the membership test
 * below is `isLocationBookable` restated, because that module is server-only.
 */

export type CancelAuthority = "any" | "own" | "none";

export function cancelAuthority(role: Role): CancelAuthority {
  if (can(role, "appointments:delete")) return "any";
  if (can(role, "appointments:cancel_own")) return "own";
  return "none";
}

export type CancelTarget = {
  practitionerId: string;
  practitionerTwoId: string | null;
  locationId: string;
};

export type OwnCancelRefusal = "forbidden" | "location_not_assigned";

/**
 * The refusal for a therapist acting on `rows`, or null when every row is theirs
 * and at one of their clinics. ALL OR NOTHING: one foreign row refuses the whole
 * call, so a series action can never cancel part of somebody else's series.
 *
 * `forbidden` is checked before the clinic, because "you are not on this
 * appointment" is the truer sentence when both are false.
 */
export function ownCancelRefusal(
  userId: string,
  bookingScope: readonly string[] | null,
  rows: readonly CancelTarget[],
): OwnCancelRefusal | null {
  if (rows.some((r) => r.practitionerId !== userId && r.practitionerTwoId !== userId)) {
    return "forbidden";
  }
  if (bookingScope !== null && rows.some((r) => !bookingScope.includes(r.locationId))) {
    return "location_not_assigned";
  }
  return null;
}

/**
 * True when any row names a shared resource (NESA) in either slot.
 *
 * WHY A THERAPIST'S UN-CANCEL OF SUCH A ROW IS REFUSED OUTRIGHT. The conflict
 * check for a shared resource reads the rows where it is Terapeuta 2 under the
 * caller's RLS (conflict.ts, SCHED-29.2). A therapist cannot see a colleague's
 * booking that holds NESA as Terapeuta 2 until migration 0088 is applied, so for
 * them the check is incomplete, and an un-cancel it cannot fully check is exactly
 * the double booking the owner named. Reception sees every row at the clinic, so
 * reception can bring it back. Lift this once 0088 is applied.
 */
export function namesSharedResource(
  rows: readonly CancelTarget[],
  sharedResourceIds: ReadonlySet<string>,
): boolean {
  return rows.some(
    (r) =>
      sharedResourceIds.has(r.practitionerId) ||
      (r.practitionerTwoId !== null && sharedResourceIds.has(r.practitionerTwoId)),
  );
}
