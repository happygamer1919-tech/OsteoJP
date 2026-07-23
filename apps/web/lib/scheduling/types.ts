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
export type { DayAvailability, IsoInterval, BookedInterval, BlockInterval } from "./day-availability";

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
  // Secondary participants (W4-19, 0032) — optional, display-only. NULL when
  // absent. Primary-only semantics everywhere else.
  patientTwoId: string | null;
  patientTwoName: string | null;
  practitionerTwoId: string | null;
  practitionerTwoName: string | null;
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
  // Audit provenance (W9-06, CB QA item 10) - who created the marcacao and when.
  // `createdBy` is the actor's user id, NULL for a patient portal booking (a
  // patient has no users row); `createdByName` is that user's display name,
  // resolved via a users join, NULL when createdBy is NULL. `createdAt` is the
  // row insert time (distinct from `startsAt`, the appointment time).
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string; // ISO UTC
};

export type Option = { id: string; label: string };
export type ServiceOption = Option & {
  durationMin: number;
  // NESA contraindication sensitivity (0031) — drives the soft booking warning.
  contraindicationSensitive: boolean;
};

// W8-01c — an active pack offered as a bookable type in the create drawer. The
// booking draws down the base service each session; locationId null = offered
// at all locations. sessionCount seeds a fresh instance's total.
export type PackOption = Option & {
  baseServiceId: string;
  locationId: string | null;
  sessionCount: number;
};

export type AgendaOptions = {
  therapists: Option[];
  // W12-23: the FULL therapist roster (unfiltered by the W9-02 page/toolbar
  // location), so the booking drawer can scope its therapist dropdown to the
  // location the FORM selects (which may differ from the toolbar). Optional so
  // existing option mocks keep type-checking; the drawer falls back to
  // `therapists` when absent.
  allTherapists?: Option[];
  // W12-23: therapist id -> the ACTIVE location ids they are assigned to
  // (derived from availability_templates, or staff_locations after W12-15). Drives
  // the booking dropdown's per-location scoping. Optional (see above).
  therapistLocationIds?: Record<string, string[]>;
  locations: Option[];
  services: ServiceOption[];
  packs: PackOption[];
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
  // Optional secondary participants (W4-19, 0032) — de-emphasized LINKED
  // DISPLAY data. NULL = the common case. PRIMARY-ONLY SEMANTICS: these never
  // affect availability, conflict detection, the Serviço/Localização auto-
  // selects, analytics attribution, the AI-recording pair, or the Estado axes.
  patientTwoId?: string | null;
  practitionerTwoId?: string | null;
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
  // No lifecycle `status` here by design (W3-01, creation invariant DECISIONS
  // 2026-07-01): every new appointment is created `scheduled` /
  // `confirmation_state = pending`, hardcoded server-side, never from the
  // payload. Lifecycle transitions happen later via updateAppointment.
  notes: string | null;
  allowConflict?: boolean;
  // When set (count >= 2), create a materialized recurring series.
  recurrence?: RecurrenceSpec | null;
  // W8-01c — booking a PACK. When set, the appointment's serviceId is forced to
  // the pack's base service and one pack session is registered/decremented in
  // the SAME tx. Pack booking is single-session: it is rejected with recurrence
  // (a pack session is one appointment). NULL = a normal service booking.
  packId?: string | null;
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
  // W3-06 hard-delete: wrong delete password, or linked clinical/invoice records.
  | "password"
  | "linked_records"
  | "error";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ActionErrorCode; conflicts?: ConflictInfo[] };
