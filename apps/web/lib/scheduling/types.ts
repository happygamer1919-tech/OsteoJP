// Shared, serializable types for the scheduling feature.
//
// Everything that crosses the server-action / client boundary uses ISO-8601
// UTC strings for instants (not Date), so it survives serialization and the
// client converts to Lisbon wall-clock for display via lib/scheduling/time.

import { appointmentStatus } from "@osteojp/db";
import type { AgendaView } from "./time";

export type { AgendaView };

export type AppointmentStatusValue =
  (typeof appointmentStatus.enumValues)[number];

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
};

export type Option = { id: string; label: string };
export type ServiceOption = Option & { durationMin: number };

export type AgendaOptions = {
  therapists: Option[];
  locations: Option[];
  patients: Option[];
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
  allowConflict?: boolean;
};

/** A blocking/overlapping appointment surfaced back to the UI (no PII beyond name). */
export type ConflictInfo = {
  id: string;
  patientName: string;
  startsAt: string;
  endsAt: string;
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
