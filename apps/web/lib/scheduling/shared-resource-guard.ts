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

/**
 * SCHED-29.4 - WHAT OWNER, ADMIN AND RECEPTION ARE OFFERED. Q-SCHED-29-4-1 = A,
 * ruled by the owner 2026-09-13.
 *
 * The Terapeuta select, the Terapeuta 2 select and the agenda Terapeutas filter
 * list `people` (the is_bookable roster) PLUS the shared resources installed at
 * `locationId`, keyed on `is_shared_resource` and `staff_locations`. NOT on
 * is_bookable: is_bookable means "takes patients", and NESA is not a person, so
 * production flags it false and the three controls dropped it. Measured as
 * reception on 2026-09-13 (card SCHED-29-4-reception-nesa-book-or-filter).
 *
 * `locationId` null means "no clinic chosen" (the toolbar's Todas as
 * localizações), and then every resource is offered. A resource the people list
 * already carries (flagged bookable as well) is not offered twice. Resources go
 * AFTER people, in the order given, so no existing option moves.
 *
 * The offer is not the permission: sharedResourceLocationAllowed refuses a
 * booking at a clinic where the machine is not installed, for the owner too.
 */
export function withSharedResourceOptions(
  people: readonly { id: string; label: string }[],
  resources: readonly SharedResource[],
  locationId: string | null,
): { id: string; label: string }[] {
  const listed = new Set(people.map((p) => p.id));
  const offered = resources
    .filter((r) => !listed.has(r.id) && (!locationId || r.locationIds.includes(locationId)))
    .map((r) => ({ id: r.id, label: r.label }));
  return [...people, ...offered];
}

/**
 * SCHED-29 - WHO A THERAPIST MAY NAME AS "TERAPEUTA 2".
 *
 * THE REQUIREMENT (owner, 2026-09-13): a therapist booking at Castelo Branco
 * selects themselves as primary and NESA as the second participant. Nobody else,
 * and no NESA option at Linda-a-Velha. So for a THERAPIST the second participant
 * is a shared resource installed at the booking's clinic, and never a person.
 * Owner, admin and reception keep the full list they had.
 *
 * NOT A DATABASE RULE, AND NOTHING THERE NEEDS WIDENING. users_tenant_isolation
 * (0001) already lets a therapist read NESA's row, and a therapist-primary +
 * NESA-second appointment passes 0086's plain therapist arm
 * (practitioner_id = auth.uid()) in USING and WITH CHECK. What was missing is
 * that the app offered, and accepted, anyone at all.
 *
 * The options a therapist's "Terapeuta 2" shows: resources installed at the
 * chosen clinic, never the primary itself. `resources` is what the agenda page
 * already hands the drawer - the resources the therapist shares a clinic with -
 * so an empty list here is exactly "no NESA at this clinic".
 */
export function secondParticipantOptionsForTherapist(
  resources: readonly SharedResource[],
  targetLocationId: string | null,
  primaryId: string,
): SharedResource[] {
  if (!targetLocationId) return [];
  return resources.filter((r) => r.id !== primaryId && r.locationIds.includes(targetLocationId));
}

/**
 * The same rule on the server, where it is enforced. Three answers, because the
 * two refusals mean different things to the person reading them:
 *
 *   - "not_a_resource": a person, an unknown id, or the primary named twice.
 *     No form a therapist is shown can produce it, so it is a forged or stale
 *     request, answered as forbidden.
 *   - "resource_location": NESA at a clinic where it is not installed, or where
 *     the therapist does not work. The SCHED-17 sentence already says that.
 */
export function therapistSecondParticipantVerdict(args: {
  practitionerTwoId: string | null;
  primaryId: string;
  targetLocationId: string;
  actorLocationIds: readonly string[];
  resources: readonly SharedResource[];
}): "ok" | "not_a_resource" | "resource_location" {
  if (!args.practitionerTwoId) return "ok";
  const resource = args.resources.find((r) => r.id === args.practitionerTwoId);
  if (!resource || resource.id === args.primaryId) return "not_a_resource";
  if (!resource.locationIds.includes(args.targetLocationId)) return "resource_location";
  if (!args.actorLocationIds.includes(args.targetLocationId)) return "resource_location";
  return "ok";
}
