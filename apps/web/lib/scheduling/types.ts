// Shared, serializable types for the scheduling feature.
//
// Everything that crosses the server-action / client boundary uses ISO-8601
// UTC strings for instants (not Date), so it survives serialization and the
// client converts to Lisbon wall-clock for display via lib/scheduling/time.

import { appointmentConfirmationState, appointmentStatus } from "@osteojp/db";
import type { AgendaView } from "./time";
import type { RecurrenceSpec, SeriesScope } from "./recurrence";

export type { AgendaView };
export type { RecurrenceSpec, SeriesScope, Frequency } from "./recurrence";
export type { DayAvailability, IsoInterval, BookedInterval } from "./day-availability";

export type AppointmentStatusValue =
  (typeof appointmentStatus.enumValues)[number];

/**
 * Confirmation axis (migration 0024) — did the patient confirm the reminder?
 * ORTHOGONAL to AppointmentStatusValue (the lifecycle: scheduled -> ... ->
 * completed/cancelled). Never derive one from the other; always display both
 * independently (same discipline as record_status vs ai_review_state).
 */
export type AppointmentConfirmationStateValue =
  (typeof appointmentConfirmationState.enumValues)[number];

/** One appointment as rendered in the agenda (joined with display labels). */
export type AgendaAppointment = {
  id: string;
  patientId: string;
  patientName: string;
  practitionerId: string;
  practitionerName: string;
  locationId: string;
  locationName: string;
  serviceId: string | null;
  serviceName: string | null;
  room: string | null;
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
  status: AppointmentStatusValue;
  notes: string | null;
  // Recurring series: RRULE on the parent, parent pointer on children.
  // Either being set means this appointment belongs to a series.
  recurrenceRule: string | null;
  recurrenceParentId: string | null;
  // Confirmation axis (0024) — see AppointmentConfirmationStateValue above.
  confirmationState: AppointmentConfirmationStateValue;
  confirmationReceivedAt: string | null; // ISO UTC
  confirmationChannel: string | null; // free text (sms/whatsapp/phone/...), not an enum
  // Present-state existence of a per-visit note (W2-04). Drives the "Sem nota"
  // indicator on completed appointments; clears the moment a note is added.
  hasNote: boolean;
};

export type Option = { id: string; label: string };
export type ServiceOption = Option & {
  durationMin: number;
  // NESA contraindication sensitivity (0031) — drives the soft booking warning.
  contraindicationSensitive: boolean;
};

export type AgendaOptions = {
  therapists: Option[];
  locations: Option[];
  services: ServiceOption[];
};

export type AgendaFilters = {
  practitionerId: string | null;
  locationId: string | null;
};

export type CreateAppointmentInput = {
  patientId: string;
  practitionerId: string;
  locationId: string;
  serviceId: string | null;
  room: string | null;
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
  status: AppointmentStatusValue;
  notes: string | null;
  allowConflict?: boolean;
  // When set (count >= 2), create a materialized recurring series.
  recurrence?: RecurrenceSpec | null;
};

/** Non-temporal field edits. Time/therapist/location changes go via reschedule. */
export type UpdateAppointmentPatch = {
  serviceId?: string | null;
  room?: string | null;
  status?: AppointmentStatusValue;
  notes?: string | null;
};

export type RescheduleInput = {
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
  practitionerId: string;
  locationId: string;
  room?: string | null;
  allowConflict?: boolean;
  scope?: SeriesScope;
};

/** Options for series-aware mutations (update / cancel). */
export type SeriesOptions = {
  scope?: SeriesScope;
  allowConflict?: boolean;
};

export type ConflictKind = "therapist" | "room" | "availability" | "time_off";

/**
 * A conflict surfaced back to the UI. All kinds share the same severity: they
 * block a booking by default but are overridable via "Save anyway"
 * (allowConflict). No PII beyond patientName.
 *
 *   therapist / room — `patientName` is the other appointment's patient; the
 *     window is that appointment's time.
 *   availability     — booking falls outside the therapist's working hours;
 *     `patientName` is null and the window is the candidate booking itself.
 *   time_off         — booking overlaps an absence block; `patientName` is null,
 *     the window is the block, and `reason` is the time_off reason.
 */
export type ConflictInfo = {
  kind: ConflictKind;
  id: string;
  patientName: string | null;
  startsAt: string;
  endsAt: string;
  room: string | null;
  reason?: string | null;
};

export type ActionErrorCode =
  | "forbidden"
  | "unauthenticated"
  | "validation"
  | "conflict"
  | "not_found"
  | "error";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ActionErrorCode; conflicts?: ConflictInfo[] };
