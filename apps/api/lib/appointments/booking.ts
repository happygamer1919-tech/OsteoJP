import type { PatientPrincipal } from "@osteojp/auth";
import { AppointmentError } from "./errors";
import { isWithinCancellationCutoff } from "./cutoff";
import { chooseTherapist, type TherapistCandidate } from "./therapist";

// Patient appointments orchestration — view / book / cancel / reschedule.
//
// DB-agnostic by design: every database touch is behind the AppointmentsStore
// seam, so the self-scope + 24h-cutoff guarantees are unit- and adversarially
// testable with an in-memory fake (booking.test.ts), and the real Drizzle /
// service-role implementation lives in store.ts.
//
// GUARDRAILS enforced here, independent of the client:
//   * patient_id is ALWAYS the verified principal's — it is never read from the
//     request body. The store methods take the principal and scope every query
//     to principal.patientId + principal.tenantId.
//   * the 24h cancel/reschedule cutoff is checked server-side from the stored
//     startsAt + the server clock (`now`), so the client cannot bypass it.
//   * conflict detection runs on every book and reschedule; a therapist is never
//     double-booked. Conflict RESULTS never carry another patient's data.

/* ----------------------------- view types ------------------------------ */

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

/** A patient-facing appointment row. Display names are tenant reference data
 *  (service/location/therapist), never another patient's PII. */
export type AppointmentView = {
  id: string;
  startsAt: string; // ISO 8601 UTC
  endsAt: string;
  status: AppointmentStatus;
  serviceName: string | null;
  locationName: string | null;
  practitionerName: string | null;
  room: string | null;
};

export type BookableLocation = { id: string; name: string };

export type BookableService = {
  id: string;
  name: string;
  durationMin: number;
  /** Effective (override-then-base) price in integer cents; null = unpublished. */
  priceCents: number | null;
  currency: string;
  /** Location ids where this service can be booked (a null-location catalog
   *  service is offered at every bookable location). */
  locationIds: string[];
};

export type BookableCatalog = {
  locations: BookableLocation[];
  services: BookableService[];
};

/** The subset of an appointment the cancel/reschedule flow needs. */
export type MutableAppointment = {
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
  locationId: string;
  practitionerId: string;
};

/** A service resolved for booking (already allowlist-filtered + active). */
export type ServiceForBooking = {
  id: string;
  name: string;
  durationMin: number;
  /** Catalog binding: a specific location, or null = offered at all locations. */
  locationId: string | null;
};

/* ------------------------------- store seam ----------------------------- */

export interface AppointmentsStore {
  /** The patient's OWN appointments (self-scoped). */
  listOwn(principal: PatientPrincipal): Promise<AppointmentView[]>;
  /** One own appointment, or null if not the patient's (self-scope → 404). */
  getOwn(principal: PatientPrincipal, id: string): Promise<AppointmentView | null>;
  /** Bookable services + locations for the patient's tenant. */
  getCatalog(principal: PatientPrincipal): Promise<BookableCatalog>;

  /** Resolve a patient-bookable, active service by id, or null. */
  getBookableService(
    principal: PatientPrincipal,
    serviceId: string,
  ): Promise<ServiceForBooking | null>;
  /** True if the location is an active, bookable location for the tenant. */
  isBookableLocation(principal: PatientPrincipal, locationId: string): Promise<boolean>;
  /** Concrete bookable slot starts (UTC ISO, ascending) at the location over
   *  the horizon: availability-template expansion filtered by the SAME
   *  predicates the booking guard runs. The step-3 source of truth. */
  listOpenSlots(
    principal: PatientPrincipal,
    args: { locationId: string; durationMin: number; horizonDays: number; now: Date },
  ): Promise<string[]>;
  /** Therapists who work at the location AND have no conflict for the window. */
  listAvailableTherapists(
    principal: PatientPrincipal,
    args: { locationId: string; startsAt: Date; endsAt: Date },
  ): Promise<TherapistCandidate[]>;
  /** The patient's most-recent therapist (soft preference), or null. */
  priorTherapistId(principal: PatientPrincipal): Promise<string | null>;
  /** Insert the booking (tenant_id + patient_id set EXPLICITLY from principal).
   *  Re-checks the chosen therapist's conflict in-tx; returns the new id. Throws
   *  AppointmentError('no_slot') if the slot was taken in the meantime. */
  createBooking(
    principal: PatientPrincipal,
    args: {
      serviceId: string;
      locationId: string;
      practitionerId: string;
      startsAt: Date;
      endsAt: Date;
    },
  ): Promise<string>;

  /** Load the mutable fields of an OWN appointment, or null (self-scope → 404). */
  getOwnMutable(
    principal: PatientPrincipal,
    id: string,
  ): Promise<MutableAppointment | null>;
  /** Cancel an OWN appointment (status → cancelled). */
  cancelOwn(principal: PatientPrincipal, id: string): Promise<void>;
  /** Move an OWN appointment to a new window. */
  rescheduleOwn(
    principal: PatientPrincipal,
    id: string,
    args: { startsAt: Date; endsAt: Date },
  ): Promise<void>;
  /** True if the therapist/room has a conflict for the window (reschedule). */
  hasWindowConflict(
    principal: PatientPrincipal,
    args: {
      practitionerId: string;
      locationId: string;
      startsAt: Date;
      endsAt: Date;
      excludeIds?: string[];
    },
  ): Promise<boolean>;
}

/* ----------------------------- input parsing ---------------------------- */

export type BookingInput = {
  serviceId: string;
  locationId: string;
  startsAt: Date;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parse the booking body. Reads ONLY serviceId, locationId, startsAt. Any
 * patient_id, practitioner_id, price, or status in the body is deliberately
 * ignored — the patient is the principal, the therapist is server-assigned, and
 * pricing is server-derived. Throws AppointmentError('invalid_input') on bad shape.
 */
export function parseBookingInput(body: unknown): BookingInput {
  if (typeof body !== "object" || body === null) {
    throw new AppointmentError("invalid_input");
  }
  const b = body as Record<string, unknown>;
  const serviceId = b.serviceId;
  const locationId = b.locationId;
  const startsAtRaw = b.startsAt;

  if (typeof serviceId !== "string" || !UUID_RE.test(serviceId)) {
    throw new AppointmentError("invalid_input");
  }
  if (typeof locationId !== "string" || !UUID_RE.test(locationId)) {
    throw new AppointmentError("invalid_input");
  }
  if (typeof startsAtRaw !== "string" || startsAtRaw.length === 0) {
    throw new AppointmentError("invalid_input");
  }
  const startsAt = new Date(startsAtRaw);
  if (Number.isNaN(startsAt.getTime())) {
    throw new AppointmentError("invalid_input");
  }
  return { serviceId, locationId, startsAt };
}

/** Parse a reschedule body (new start only; duration is preserved). */
export function parseRescheduleInput(body: unknown): { startsAt: Date } {
  if (typeof body !== "object" || body === null) {
    throw new AppointmentError("invalid_input");
  }
  const raw = (body as Record<string, unknown>).startsAt;
  if (typeof raw !== "string" || raw.length === 0) {
    throw new AppointmentError("invalid_input");
  }
  const startsAt = new Date(raw);
  if (Number.isNaN(startsAt.getTime())) {
    throw new AppointmentError("invalid_input");
  }
  return { startsAt };
}

/* ------------------------------ orchestration --------------------------- */

const MUTABLE_STATUSES: ReadonlySet<AppointmentStatus> = new Set([
  "scheduled",
  "confirmed",
]);

export async function listOwnAppointments(
  principal: PatientPrincipal,
  store: AppointmentsStore,
): Promise<AppointmentView[]> {
  return store.listOwn(principal);
}

export async function getOwnAppointment(
  principal: PatientPrincipal,
  id: string,
  store: AppointmentsStore,
): Promise<AppointmentView> {
  const view = await store.getOwn(principal, id);
  if (!view) throw new AppointmentError("not_found");
  return view;
}

export async function getBookableCatalog(
  principal: PatientPrincipal,
  store: AppointmentsStore,
): Promise<BookableCatalog> {
  return store.getCatalog(principal);
}

/** Booking horizon offered to patients (calendar days from `now`). */
export const OPEN_SLOTS_HORIZON_DAYS = 14;

/**
 * The step-3 availability list. Resolves the service + location with EXACTLY
 * the same checks bookAppointment applies, then returns the store's open-slot
 * starts — which are generated from availability templates and filtered by the
 * same conflict predicates the booking guard runs. One source of truth: a slot
 * returned here books successfully unless a genuine race takes it first.
 */
export async function listOpenSlots(
  principal: PatientPrincipal,
  input: { serviceId: string; locationId: string },
  store: AppointmentsStore,
  now: Date,
): Promise<string[]> {
  const service = await store.getBookableService(principal, input.serviceId);
  if (!service) throw new AppointmentError("service_unavailable");

  if (!(await store.isBookableLocation(principal, input.locationId))) {
    throw new AppointmentError("location_unavailable");
  }
  if (service.locationId !== null && service.locationId !== input.locationId) {
    throw new AppointmentError("service_unavailable");
  }

  return store.listOpenSlots(principal, {
    locationId: input.locationId,
    durationMin: service.durationMin,
    horizonDays: OPEN_SLOTS_HORIZON_DAYS,
    now,
  });
}

/**
 * Book a slot. Resolves the (bookable) service + location, computes the window
 * from the service duration, picks a conflict-free therapist with the returning-
 * patient soft preference, and writes the booking under the principal's tenant +
 * patient id. No fiscal document, no payment.
 */
export async function bookAppointment(
  principal: PatientPrincipal,
  input: BookingInput,
  store: AppointmentsStore,
  now: Date,
): Promise<AppointmentView> {
  if (input.startsAt.getTime() <= now.getTime()) {
    throw new AppointmentError("slot_in_past");
  }

  const service = await store.getBookableService(principal, input.serviceId);
  if (!service) throw new AppointmentError("service_unavailable");

  if (!(await store.isBookableLocation(principal, input.locationId))) {
    throw new AppointmentError("location_unavailable");
  }
  // A service bound to a specific location can only be booked at that location.
  if (service.locationId !== null && service.locationId !== input.locationId) {
    throw new AppointmentError("service_unavailable");
  }

  const endsAt = new Date(input.startsAt.getTime() + service.durationMin * 60_000);

  const available = await store.listAvailableTherapists(principal, {
    locationId: input.locationId,
    startsAt: input.startsAt,
    endsAt,
  });
  const prior = await store.priorTherapistId(principal);
  const practitionerId = chooseTherapist(available, prior);
  // HONEST ERROR: nobody works this window (schedule gap) is `no_therapist`,
  // distinct from `no_slot` (a real race on a slot that WAS free — thrown by
  // the in-tx guard in store.createBooking). The portal words them differently.
  if (!practitionerId) throw new AppointmentError("no_therapist");

  const id = await store.createBooking(principal, {
    serviceId: service.id,
    locationId: input.locationId,
    practitionerId,
    startsAt: input.startsAt,
    endsAt,
  });

  return getOwnAppointment(principal, id, store);
}

/**
 * Cancel an own appointment. Server-enforced 24h cutoff: inside the window the
 * cancellation is rejected regardless of client state. Never touches invoicing.
 */
export async function cancelAppointment(
  principal: PatientPrincipal,
  id: string,
  store: AppointmentsStore,
  now: Date,
): Promise<void> {
  const appt = await store.getOwnMutable(principal, id);
  if (!appt) throw new AppointmentError("not_found");
  if (!MUTABLE_STATUSES.has(appt.status)) {
    throw new AppointmentError("not_reschedulable");
  }
  if (isWithinCancellationCutoff(appt.startsAt, now)) {
    throw new AppointmentError("cutoff");
  }
  await store.cancelOwn(principal, id);
}

/**
 * Reschedule an own appointment to a new start. Server-enforced 24h cutoff is
 * checked against the CURRENT start; the new window preserves the original
 * duration, must be in the future, and re-runs conflict detection for the
 * already-assigned therapist. Never touches invoicing.
 */
export async function rescheduleAppointment(
  principal: PatientPrincipal,
  id: string,
  input: { startsAt: Date },
  store: AppointmentsStore,
  now: Date,
): Promise<AppointmentView> {
  const appt = await store.getOwnMutable(principal, id);
  if (!appt) throw new AppointmentError("not_found");
  if (!MUTABLE_STATUSES.has(appt.status)) {
    throw new AppointmentError("not_reschedulable");
  }
  // Cutoff is on the CURRENT start: you cannot touch an imminent appointment.
  if (isWithinCancellationCutoff(appt.startsAt, now)) {
    throw new AppointmentError("cutoff");
  }
  if (input.startsAt.getTime() <= now.getTime()) {
    throw new AppointmentError("slot_in_past");
  }

  const durationMs = appt.endsAt.getTime() - appt.startsAt.getTime();
  const newEndsAt = new Date(input.startsAt.getTime() + durationMs);

  const conflict = await store.hasWindowConflict(principal, {
    practitionerId: appt.practitionerId,
    locationId: appt.locationId,
    startsAt: input.startsAt,
    endsAt: newEndsAt,
    excludeIds: [id],
  });
  if (conflict) throw new AppointmentError("no_slot");

  await store.rescheduleOwn(principal, id, { startsAt: input.startsAt, endsAt: newEndsAt });
  return getOwnAppointment(principal, id, store);
}
