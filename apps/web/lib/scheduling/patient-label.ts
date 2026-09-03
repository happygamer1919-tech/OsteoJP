// SEC-appointment-vanishes-with-patient-scope — how a withheld patient reads.
//
// Pure and framework-free, so every surface that renders an appointment says
// the same thing, and so the rule can be tested without a browser or a database.
//
// ==========================================================================
// WHY A HELPER AND NOT `?? "Marcação reservada"` AT EACH SITE
// ==========================================================================
// There are eight places that render, sort, search or label an appointment's
// patient. A default written at each of them is eight chances to write a
// different sentence, and - worse - eight chances to write `?? ""`, which is the
// exact shape PORTAL-REHYDRATE 1.3 is about: the slot would render with a blank
// where the name goes, which reads as a rendering glitch rather than as "this is
// somebody else's patient", and a receptionist would still not know the slot was
// taken by a real person.

import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";

const s = getStrings(DEFAULT_LOCALE);

/**
 * `true` when the viewer may not see this appointment's patient.
 *
 * It is a function rather than a `=== null` at each site so the MEANING of the
 * null is named once. `appointments.patient_id` is NOT NULL with an FK, so a
 * null name has exactly one cause: `patients_select` did not admit the row.
 */
export function isPatientWithheld(patientName: string | null): boolean {
  return patientName === null;
}

/**
 * What to show where the patient's name would go.
 *
 * The slot must read as OCCUPIED. That is the whole ruling: the failure being
 * fixed is a receptionist booking over a slot that looked free, so the label
 * has to say a booking is there, not that a name is missing. "Marcação
 * reservada" says the first; "Sem nome" or a dash would say the second.
 */
export function patientLabel(patientName: string | null): string {
  return patientName ?? s["agenda.patientWithheld"];
}
