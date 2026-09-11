import type { Role } from "@osteojp/auth";

/**
 * SCHED-17 - WHERE A SHARED RESOURCE (NESA) MAY BE BOOKED. Pure, so every rule
 * below is a table test rather than a claim.
 *
 * A shared resource is a `users` row with `is_shared_resource` (the pending NESA
 * migration): a machine that holds appointments, not a person. Its `locationIds`
 * are its `staff_locations` - where it is physically installed.
 *
 * THE RULING (owner, 2026-09-10): the app refuses creating or moving a
 * shared-resource appointment to a location outside the ACTOR's assigned
 * locations. The database cannot say this on its own: 0078's
 * `created_by = auth.uid()` arm admits any row a therapist stamps with their own
 * id, at any location, and the staff create path stamps exactly that.
 *
 * AND ONE CONDITION THE RULING IMPLIES RATHER THAN STATES: the location must
 * also be one where the resource IS. The NESA policy shows a resource's
 * appointment to a therapist only when the appointment's location is one of the
 * therapist's AND the resource is at a location the therapist shares with it. A
 * NESA appointment recorded at a clinic without the machine is therefore visible
 * to no therapist at all - the exact half-state SCHED-17 exists to end. A
 * therapist assigned to BOTH clinics passes the actor condition at LV and is
 * refused here.
 *
 * THE OWNER IS EXEMPT FROM THE ACTOR CONDITION ONLY. The owner is tenant-wide in
 * every policy in this system and has no location scope to be outside of; the
 * resource condition still applies to them.
 */
export type SharedResource = { id: string; label: string; locationIds: string[] };

export function sharedResourceLocationAllowed(args: {
  role: Role;
  actorLocationIds: readonly string[];
  resource: Pick<SharedResource, "locationIds"> | null;
  targetLocationId: string;
}): boolean {
  if (!args.resource) return true;
  if (!args.resource.locationIds.includes(args.targetLocationId)) return false;
  if (args.role === "owner") return true;
  return args.actorLocationIds.includes(args.targetLocationId);
}

/**
 * The resources a viewer shares at least one location with - what a therapist's
 * agenda merges in and what their booking drawer offers besides themselves. An
 * UNASSIGNED viewer gets none: the NESA policy's function returns an empty set
 * for them too, and offering a booking the database would then hide is worse
 * than offering nothing.
 */
export function sharedResourcesForViewer(
  resources: readonly SharedResource[],
  viewerLocationIds: readonly string[],
): SharedResource[] {
  return resources.filter((r) => r.locationIds.some((l) => viewerLocationIds.includes(l)));
}
