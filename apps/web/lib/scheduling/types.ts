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
  /**
   * NULL MEANS WITHHELD, and it is the only thing it can mean.
   *
   * SEC-appointment-vanishes-with-patient-scope: `baseAppointmentQuery` LEFT
   * JOINs `patients`, so a row the APPOINTMENTS policy admits survives even
   * when the PATIENTS policy does not admit its patient - the slot renders as
   * occupied and the identity is not disclosed. Before that it was an inner
   * join and the whole appointment disappeared, so reception saw a free slot
   * and would book over it.
   *
   * It is nullable rather than a substituted label so that every consumer has
   * to SAY what it does about the case. A label pushed in here would have been
   * indistinguishable from a patient actually called that, which is exactly the
   * conflation PORTAL-REHYDRATE 1.3 is about; and `patient_id` is NOT NULL with
   * an FK, so there is no second reading of a null.
   */
  patientName: string | null;
  practitionerId: string;
  practitionerName: string;
  // W12-40-T2: the practitioner's assigned agenda colour — a W12-21 palette key
  // (from staff_locations.color, first-non-null membership = one colour per
  // person, matching the Equipa card). NULL → the deterministic FNV colour.
  colorKey: string | null;
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
  /** PL-17: total notes on this visit (thread length). Optional so existing
   *  fixtures keep type-checking; absent is read as "unknown, show no count". */
  noteCount?: number;
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
  /**
   * STAFF-02 — the locations the CALLER may book into, a subset of `locations`.
   *
   * SEPARATE FROM `locations`, DELIBERATELY, and this is the whole reason it is
   * a second field rather than a filter applied to the first. `locations` feeds
   * the agenda TOOLBAR, which is a READ concern governed by PL-09; a therapist
   * has null read scope there and narrowing it would change what they can VIEW.
   * This field feeds the booking drawer, which is a WRITE concern and is scoped
   * for reception, admin AND therapists per the owner ruling.
   *
   * Equal to `locations` for the owner, who is unrestricted on both axes.
   */
  bookableLocations: Option[];
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
  // RB-03, PL-11 changed by owner ruling 2026-08-20: a manually entered time
  // outside the therapist's disponibilidade, refused SERVER-SIDE on create and
  // edit.
  //
  // ITS OWN CODE AND NOT `conflict`, for two reasons that both matter. The copy
  // differs: this one NAMES the therapist's window that day, and a caller that
  // folded it into the conflict list would render "conflicts with:" followed by
  // nothing, because there is no conflicting appointment - the candidate window
  // IS the problem. And `conflict` is OVERRIDABLE by `allowConflict`
  // ("Guardar mesmo assim"); this is not, because an override that reinstates
  // the exact defect is a bypass rather than an override.
  | "outside_availability"
  // RB-02: the pacote has fewer sessions left than this booking needs.
  //
  // ITS OWN CODE AND NOT `validation`, because the two need different copy and
  // different actions. `validation` means "you left something blank"; this
  // means "the pacote has 3 sessions and you asked for 5", and the person
  // reading it decides whether to book fewer or sell another pacote.
  //
  // A REFUSAL RATHER THAN A TRUNCATION. Booking three of the five and reporting
  // success is the shape section 1.3 warns about: an unhandled case wearing the
  // face of a harmless one, discovered later from the diary.
  | "pack_insufficient"
  | "not_found"
  // W3-06 hard-delete: wrong delete password, or linked clinical/invoice records.
  | "password"
  | "linked_records"
  // INC-08: a lifecycle move the Estado map forbids, refused SERVER-SIDE. It is
  // its own code and not `validation` because the two need different copy: this
  // one is "that move is not allowed", not "you left a field blank". The agenda
  // drawer offers all five statuses with no client guard, so reception can and
  // did reach `confirmed -> scheduled` in one click.
  | "illegal_transition"
  // INC-08 / 0061: the database refused the write because it would leave two
  // CONFIRMED appointments overlapping for one practitioner. Distinct from
  // `conflict` on purpose - `conflict` is advisory and the drawer answers it
  // with "Guardar mesmo assim", and this is the one refusal that override may
  // not reach.
  | "double_booked"
  // STAFF-02: the actor tried to write an appointment at a location outside
  // their `staff_locations` assignment. Its own code rather than `forbidden`,
  // for the same reason `illegal_transition` is its own: reception needs to be
  // told WHICH thing was refused. "Não tem permissão para esta ação" would send
  // them to look for a missing capability that is not the problem - they have
  // appointments:write, they simply do not work at that clinic.
  | "location_not_assigned"
  | "error";

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: ActionErrorCode;
      conflicts?: ConflictInfo[];
      /**
       * RB-03. The therapist's working windows on the day the caller asked for,
       * as "HH:MM" pairs, set only with `error: "outside_availability"`.
       *
       * EMPTY IS A DIFFERENT SENTENCE, not a missing value: the therapist has
       * hours at this location but none on that weekday, which reads as "does
       * not work that day" rather than "works 08:00-13:00". The caller renders
       * the two differently and the type does not collapse them.
       */
      availabilityWindows?: { startTime: string; endTime: string }[];
    };
