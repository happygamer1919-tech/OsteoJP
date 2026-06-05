// Typed domain errors for the patient appointments API. Each carries a stable
// `code` the route maps to an HTTP status + an i18n message key, so handlers stay
// thin and never leak internals (DB errors, other patients' data) to the caller.

export type AppointmentErrorCode =
  | "not_found" // appointment not visible to this patient (self-scope) → 404
  | "invalid_input" // malformed/missing booking fields → 400
  | "service_unavailable" // service not patient-bookable / inactive → 422
  | "location_unavailable" // location not bookable at → 422
  | "slot_in_past" // requested start is not in the future → 422
  | "no_slot" // no therapist available for the window → 409
  | "cutoff" // inside the 24h cancel/reschedule window → 409
  | "not_reschedulable"; // appointment already cancelled/completed → 409

export class AppointmentError extends Error {
  override readonly name = "AppointmentError";
  readonly code: AppointmentErrorCode;
  constructor(code: AppointmentErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

export function isAppointmentError(e: unknown): e is AppointmentError {
  return e instanceof Error && e.name === "AppointmentError";
}

/** Stable HTTP status per code. The patient-facing message is an i18n key the
 *  route resolves; this map keeps the status policy in one place. */
export const HTTP_STATUS: Record<AppointmentErrorCode, number> = {
  not_found: 404,
  invalid_input: 400,
  service_unavailable: 422,
  location_unavailable: 422,
  slot_in_past: 422,
  no_slot: 409,
  cutoff: 409,
  not_reschedulable: 409,
};

/** i18n string key per code (PT/EN resolved by the route). */
export const MESSAGE_KEY: Record<AppointmentErrorCode, string> = {
  not_found: "patientAppointments.error.notFound",
  invalid_input: "patientAppointments.error.invalidInput",
  service_unavailable: "patientAppointments.error.serviceUnavailable",
  location_unavailable: "patientAppointments.error.locationUnavailable",
  slot_in_past: "patientAppointments.error.slotInPast",
  no_slot: "patientAppointments.error.noSlot",
  cutoff: "patientAppointments.error.cutoff",
  not_reschedulable: "patientAppointments.error.notReschedulable",
};
