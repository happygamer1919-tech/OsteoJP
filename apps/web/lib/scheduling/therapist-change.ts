// MARC-THERAPIST-01 - the Terapeuta field of the ficha's "Gerir marcação", as
// two pure functions, so what the field offers and what it sends are table
// tests rather than claims about a select inside a closed disclosure.
//
// THE FIELD OWNS NO RULE. The list comes from `bookingStaffOptions`, the builder
// the agenda's edit panel uses, in that panel's own mode (an appointment being
// edited, Localização untouched). The save goes to `rescheduleAppointment`, the
// action that panel calls when its Terapeuta changes, so the working hours, the
// clinic's hours, the conflicts and the clinic assignment are checked by the
// one copy of each check that exists.

import type { Role } from "@osteojp/auth";

import { bookingStaffOptions } from "./booking-staff-options";
import { staffLabelContext, type StaffOption } from "./staff-options";
import type { AgendaAppointment, AgendaOptions, RescheduleInput } from "./types";

/** The staff lists the ficha already loads for its Marcações filters. */
export type TherapistChangeStaff = Pick<
  AgendaOptions,
  "therapists" | "allTherapists" | "therapistLocationIds" | "sharedResources" | "viewerClinicIds" | "clinicCodes"
>;

type Row = Pick<
  AgendaAppointment,
  "practitionerId" | "practitionerName" | "practitionerTwoId" | "locationId" | "startsAt" | "endsAt"
>;

/**
 * Who is OFFERED the field: owner, admin and reception, when they may edit this
 * patient's appointments at all. A therapist holds appointments:write too and
 * changes the Terapeuta on the agenda; whether they also get this field is an
 * open question, so they are not handed it. Only the affordance:
 * rescheduleAppointment has no rule of its own about it.
 */
export function offersTherapistChange(role: Role, canEditAppointments: boolean): boolean {
  return canEditAppointments && role !== "therapist";
}

/**
 * APPT-EDIT-01: the ficha's Reagendar opens the agenda's edit panel. For a
 * THERAPIST viewer it locks the Terapeuta to the row's own, for the reason
 * `offersTherapistChange` gives: whether a therapist may hand a visit to a
 * colleague from the ficha is an open question, and before the edit panel the
 * ficha's Reagendar always sent the row's own practitioner. Date, hour and
 * clinic stay editable. (The agenda's own panel is not changed here.)
 */
export function locksFichaPractitioner(role: Role): boolean {
  return role === "therapist";
}

/**
 * The Terapeuta options for one row: the agenda edit panel's list for the row's
 * own clinic, the current Terapeuta always among them (STAFF-01), and the row's
 * Terapeuta 2 left out, because this field cannot move the second slot and one
 * person in both is not a booking anybody means.
 */
export function therapistChangeOptions(appt: Row, staff: TherapistChangeStaff): StaffOption[] {
  const pool = staff.allTherapists ?? staff.therapists;
  const resources = staff.sharedResources ?? [];
  const knownLabels = new Map<string, string>();
  for (const o of [...resources, ...pool, ...staff.therapists]) knownLabels.set(o.id, o.label);
  const { therapistOptions } = bookingStaffOptions({
    // The field is offered to the front desk only (see appointments-list.tsx),
    // so the list is the front desk's: nobody is self-locked here.
    isTherapist: false,
    selfLocked: false,
    selfUserId: "",
    pool,
    assignments: new Map(Object.entries(staff.therapistLocationIds ?? {})),
    resources,
    locationId: appt.locationId,
    practitionerId: appt.practitionerId,
    practitionerTwoId: appt.practitionerTwoId,
    locationTouched: false,
    editing: { practitionerId: appt.practitionerId, practitionerName: appt.practitionerName },
    labels: staffLabelContext(staff),
    knownLabels,
  });
  return therapistOptions.filter((o) => o.id !== appt.practitionerTwoId);
}

/**
 * What the field sends: the row's own start, end and clinic, and the new
 * Terapeuta. Scope "one" (a series is edited on the agenda), and NO conflict
 * override: until it is ruled otherwise, a conflict on this field is a refusal.
 */
export function therapistChangeInput(appt: Row, practitionerId: string): RescheduleInput {
  return {
    startsAt: new Date(appt.startsAt).toISOString(),
    endsAt: new Date(appt.endsAt).toISOString(),
    practitionerId,
    locationId: appt.locationId,
    scope: "one",
    allowConflict: false,
  };
}
