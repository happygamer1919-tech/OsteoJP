// NESA-SCOPE - every staff option list the booking drawer shows, built in one
// pure function so the role x mode matrix is a table test rather than a claim
// about a component that only mounts some of its selects on a click.
//
// What changed from the lists the drawer built inline before this card:
//   - A MACHINE is offered only where it is installed (the form's Localizacao),
//     in create and edit, self-locked and front desk. Before, the self-locked
//     select listed every machine at any of the therapist's clinics, and a
//     machine flagged bookable rode the people roster to every clinic.
//     The machine already chosen in a TERAPEUTA select stays an option after
//     Localizacao moves away from it (STAFF-01, below): the form submits it and
//     the server refuses it there (sharedResourceBookingCheck), as it did
//     before this card, so nothing is written. TERAPEUTA 2 never keeps
//     one: the server checks a second participant for therapists only, so for
//     the front desk this list is the whole guard (the drawer submits only a
//     value the list offers, SCHED-29).
//   - EDIT scopes the people to the booking's location from the moment the
//     drawer opens; the booking's location is known, so W12-23's "full list
//     until Localizacao is touched" has nothing to protect there. CREATE keeps
//     W12-23 as it was, so W4-12's therapist-first Localizacao auto-fill still
//     works.
//   - Front-desk Terapeuta 2 takes its people from the form's location, not
//     from the toolbar's. It is the only guard there: the server checks the
//     second participant for therapists only.
//   - THE CURRENT VALUE IS ALWAYS AN OPTION (STAFF-01), bar the Terapeuta 2
//     machine above. When the practitioner of the appointment being edited is
//     in no list this viewer is given, the option is synthesised from the
//     appointment row itself and labelled with the same collision rule, so the
//     select never paints one row while the form submits another.

import type { StaffLabelContext, StaffOption } from "./staff-options";
import { labelStaffCollisions } from "./staff-options";
import {
  secondParticipantOptionsForTherapist,
  withSharedResourceOptions,
  type SharedResource,
} from "./shared-resource-guard";
import {
  therapistOptionsForBooking,
  type TherapistLocationAssignments,
} from "./therapist-location-filter";

export type BookingStaffInput = {
  /** The viewer is a therapist (self-locked on create, not on edit). */
  isTherapist: boolean;
  /** PL-10: a therapist's create form. */
  selfLocked: boolean;
  selfUserId: string;
  /** The people the viewer may pick from (options.allTherapists). */
  pool: readonly StaffOption[];
  assignments: TherapistLocationAssignments;
  /** The machines this viewer is offered, with where each is installed. */
  resources: readonly SharedResource[];
  /** The form's Localizacao, null when none is chosen. */
  locationId: string | null;
  practitionerId: string | null;
  practitionerTwoId: string | null;
  /** W12-23: the user has touched Localizacao on this create form. */
  locationTouched: boolean;
  /** The appointment being edited, null on create. */
  editing: { practitionerId: string; practitionerName: string } | null;
  labels: Omit<StaffLabelContext, "keepId"> | null;
  /**
   * The viewer's resolved label for every staff id the page already names (its
   * filter lists and machines). A value in effect that the drawer has to
   * rebuild from the appointment row takes its label from here first, so one
   * machine reads the same in the drawer as in the Terapeutas filter above it.
   */
  knownLabels?: ReadonlyMap<string, string>;
};

export type BookingStaffOptions = {
  /** PL-10: the self-locked therapist's own name. */
  selfName: string;
  /** SCHED-17: the machines a self-locked therapist may pick besides themselves. */
  selfResources: SharedResource[];
  /** The Terapeuta select (front desk, and a therapist's edit form). */
  therapistOptions: StaffOption[];
  /** The Terapeuta 2 select (create only). */
  practitionerTwoOptions: StaffOption[];
};

function installedAt(resource: SharedResource, locationId: string | null): boolean {
  return !locationId || resource.locationIds.includes(locationId);
}

/**
 * `list` plus the current value when the list lacks it, looked up in the pool,
 * then the machines, then the appointment row. An appended option is labelled
 * against the list it joins, because it can collide with a member already there
 * (the viewer's own clinic's twin).
 */
function keepCurrent(
  list: StaffOption[],
  currentId: string | null,
  input: BookingStaffInput,
): StaffOption[] {
  if (!currentId || list.some((o) => o.id === currentId)) return list;
  const fromPool = input.pool.find((o) => o.id === currentId);
  const fromResources = input.resources.find((r) => r.id === currentId);
  const kept =
    fromPool ??
    (fromResources ? { id: fromResources.id, label: fromResources.label } : undefined) ??
    (input.editing && input.editing.practitionerId === currentId
      ? { id: currentId, label: input.knownLabels?.get(currentId) ?? input.editing.practitionerName }
      : undefined);
  if (!kept) return list;
  const withKept = [...list, kept];
  return input.labels ? labelStaffCollisions(withKept, input.labels) : withKept;
}

/**
 * The self-locked select's machines plus the machine in effect, when a
 * Localizacao change left it uninstalled here. That select has no placeholder,
 * so without it the select would paint the therapist while the form submitted
 * the machine; with it the server's refusal is what the therapist sees.
 */
function keepCurrentMachine(
  list: SharedResource[],
  currentId: string | null,
  input: BookingStaffInput,
): SharedResource[] {
  if (!currentId || list.some((r) => r.id === currentId)) return list;
  const machine = input.resources.find((r) => r.id === currentId);
  if (!machine) return list;
  const withKept = [...list, machine];
  return input.labels ? labelStaffCollisions(withKept, input.labels) : withKept;
}

export function bookingStaffOptions(input: BookingStaffInput): BookingStaffOptions {
  const { locationId } = input;
  const machines = new Map(input.resources.map((r) => [r.id, r]));
  const installedHere = (id: string) => {
    const machine = machines.get(id);
    return !machine || installedAt(machine, locationId);
  };
  // A pool member that is a machine not installed here is not offered, unless
  // it is the value in effect.
  const offeredHere = (o: StaffOption, currentId: string | null) =>
    o.id === currentId || installedHere(o.id);

  const selfName = input.selfLocked
    ? (input.pool.find((t) => t.id === input.selfUserId)?.label ?? "")
    : "";
  const selfResources = input.selfLocked
    ? keepCurrentMachine(
        input.resources.filter((r) => !!locationId && r.locationIds.includes(locationId)),
        input.practitionerId,
        input,
      )
    : [];

  // SCHED-29.4: owner, admin and reception are also offered the machines at the
  // chosen clinic that the bookable roster does not carry. A therapist's offer
  // is the SCHED-17/SCHED-29 rule and adds nothing here.
  const frontDeskResources = input.isTherapist ? [] : input.resources;

  // Create, untouched: the full pool (W12-23, so W4-12's therapist-first
  // auto-fill still works). After a Localizacao change: that clinic's team, as
  // before this card. EDIT, untouched: the booking's clinic's team from open,
  // plus every colleague with no clinic at all (PL-14 keeps them visible and
  // create lists them), so a booking can still be handed to one of them.
  const unassigned = (id: string) => (input.assignments.get(id) ?? []).length === 0;
  const primaryPeople = input.locationTouched
    ? therapistOptionsForBooking(input.pool, input.assignments, locationId, input.practitionerId)
    : input.editing
      ? (() => {
          const scoped = new Set(
            therapistOptionsForBooking(input.pool, input.assignments, locationId, input.practitionerId).map(
              (o) => o.id,
            ),
          );
          return input.pool.filter((o) => scoped.has(o.id) || unassigned(o.id));
        })()
      : [...input.pool];
  const therapistOptions = keepCurrent(
    withSharedResourceOptions(
      primaryPeople.filter((o) => offeredHere(o, input.practitionerId)),
      frontDeskResources,
      locationId,
    ),
    input.practitionerId,
    input,
  );

  // Terapeuta 2 keeps a person across a clinic change, never a machine that is
  // not installed at the new one (see the header): it drops out, and the
  // drawer's submit filter then sends no second participant, as before.
  const twoId =
    input.practitionerTwoId && installedHere(input.practitionerTwoId) ? input.practitionerTwoId : null;
  const practitionerTwoOptions = input.selfLocked
    ? secondParticipantOptionsForTherapist(input.resources, locationId, input.practitionerId ?? "")
    : keepCurrent(
        withSharedResourceOptions(
          therapistOptionsForBooking(input.pool, input.assignments, locationId, twoId).filter((o) =>
            offeredHere(o, twoId),
          ),
          frontDeskResources,
          locationId,
        ),
        twoId,
        input,
      );

  return { selfName, selfResources, therapistOptions, practitionerTwoOptions };
}
