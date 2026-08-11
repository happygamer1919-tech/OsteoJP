import type { PatientPrincipal } from "@osteojp/auth";
import { AppointmentError } from "./errors";
import { isWithinCancellationCutoff, isBeforeMinimumNotice } from "./cutoff";
import { emitPatientChange } from "@/lib/notifications/patient-change";
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
  /**
   * DECISION C — the patient's usual service, PRESELECTED, NEVER A RESTRICTION.
   *
   * The id of the service on the patient's most recent COMPLETED appointment,
   * and null when they have no completed history or when that service is no
   * longer offered to patients.
   *
   * IT IS ALWAYS A MEMBER OF `services` ABOVE, and that is the structural
   * guarantee rather than a promise: getBookableCatalog only sets it after
   * finding it in the very array it is returning. A service that has since been
   * turned off drops the PRESELECTION, never a row from the list — which is the
   * whole of Decision C ("the patient's history preselects; it never removes an
   * option they are entitled to book", WAVE-13.md:230-232).
   *
   * The catalog is UNFILTERED by it. A caller that used this to narrow the list
   * would turn preselection into restriction, which the loop forbids in the UI
   * AND in the query (WAVE-13.md:809).
   */
  preselectedServiceId: string | null;

  /**
   * A1, DECISION C — the patient's HOME CLINIC, PRESELECTED, NEVER A RESTRICTION.
   *
   * Null when the patient has no home clinic on file, or when the one they have
   * is no longer an active bookable location.
   *
   * IT IS ALWAYS A MEMBER OF `locations` ABOVE, by the same structural guarantee
   * as `preselectedServiceId`: getBookableCatalog only sets it after finding it
   * in the very array it returns. A clinic that has since been deactivated drops
   * the PRESELECTION, never a row from the list.
   *
   * The catalog is UNFILTERED by it. A caller that used this to narrow
   * `locations` would turn preselection into restriction, which Decision C
   * forbids in the UI and in the query alike. The portal's contract is that the
   * other clinic stays reachable in at most one interaction from anywhere in the
   * flow.
   *
   * NULL IS THE ONLY VALUE THIS FIELD TAKES TODAY, and that is expected rather
   * than broken: `primary_location_id` is unpopulated until LAUNCH-03 brings the
   * real book across (LE-primary-location-backfill). The unpreselected path is
   * the one that must be correct now.
   */
  preselectedLocationId: string | null;
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

  /**
   * Decision C: the service id on the patient's most recent COMPLETED
   * appointment, or null. `completed` and not `scheduled` deliberately - a
   * booking the patient made and then did not attend is not what they usually
   * come for, and a future booking has not happened yet.
   */
  priorCompletedServiceId(principal: PatientPrincipal): Promise<string | null>;

  /**
   * A1, Decision C: the patient's HOME CLINIC, read off the patient row
   * (`patients.primary_location_id`), or null.
   *
   * A STORED FACT, NOT A DERIVATION, unlike the service above. Recency is a good
   * signal for a repeated service and a bad one for a place: one visit to the
   * other clinic while travelling would move the patient's home. Null for every
   * patient until LAUNCH-03 (LE-primary-location-backfill).
   */
  primaryLocationId(principal: PatientPrincipal): Promise<string | null>;

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
  const [catalog, priorServiceId, homeLocationId] = await Promise.all([
    store.getCatalog(principal),
    store.priorCompletedServiceId(principal),
    store.primaryLocationId(principal),
  ]);

  // THE MEMBERSHIP CHECK IS THE DECISION-C GUARANTEE, and it is why this is a
  // find over the catalog rather than a value passed straight through. The
  // prior service may have been turned off for patients, made internal-only, or
  // bound to a location that is no longer active since the patient last came.
  // In every one of those cases the PRESELECTION disappears and the LIST is
  // untouched. The list is never narrowed by this, in either direction.
  const preselectedServiceId =
    priorServiceId && catalog.services.some((s) => s.id === priorServiceId)
      ? priorServiceId
      : null;

  // A1: the SAME membership check, for the same reason. A home clinic that has
  // been deactivated since the patient's last visit drops the PRESELECTION and
  // leaves `locations` untouched, so the patient is shown the choice rather than
  // being advanced past a step onto a clinic that is no longer bookable.
  const preselectedLocationId =
    homeLocationId && catalog.locations.some((l) => l.id === homeLocationId)
      ? homeLocationId
      : null;

  return { ...catalog, preselectedServiceId, preselectedLocationId };
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
/**
 * The launch posture, per JP's ruling of 2026-08-06, relayed and confirmed.
 *
 * TRUE means every patient booking is a pedido that reception confirms. It is a
 * named constant rather than an inline literal so the ruling it encodes is
 * greppable, and so the day it stops being uniform the compiler points at every
 * place that assumed it was.
 */
const PORTAL_BOOKINGS_ARE_REQUESTS = true;

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

  // POST-COMMIT, same rule as cancel and reschedule: the booking already exists,
  // so a failed notification must never surface to the patient as a failed
  // booking. W13-02 adds this site; cancel and reschedule were already emitting.
  // Both instants are equal because a booking does not move an appointment — the
  // same convention a cancellation already uses.
  //
  // W13-04: THE KIND IS `appointment_request`, NOT `booked`, AND THAT IS JP'S
  // RULING RATHER THAN A RENAME. Confirmed 2026-08-06 ("certo"): request-mode
  // for all 12 patient-bookable services, ZERO auto-confirmed. Every booking a
  // patient makes through the portal is a PEDIDO DE MARCACAO that reception
  // confirms — which is already what the patient is told
  // (portal booking/pending: "a aguardar confirmacao pela recepcao") and what
  // the row records (confirmation_state defaults to pending). The notification
  // was the one place still calling it a completed booking, so reception read
  // "marcou" where the truth was "pediu", and the thing needing their action
  // looked like a thing already done.
  //
  // `booked` KEEPS ITS MEANING AND LOSES ITS CALLER, deliberately. It is the
  // kind for a booking that IS confirmed on arrival, which is what JP's
  // post-launch graduation produces when a service moves to direct booking. The
  // constant below is the launch posture, not a permanent truth: graduation is
  // per service, so it becomes a column and a migration when JP rules the first
  // one across. It is a constant today because the ruling is currently uniform,
  // and inventing a column ahead of the ruling would take the one in-flight
  // migration slot that belongs to LOOP 5.
  await emitPatientChange({
    kind: PORTAL_BOOKINGS_ARE_REQUESTS ? "appointment_request" : "booked",
    tenantId: principal.tenantId,
    appointmentId: id,
    patientId: principal.patientId,
    audience: { reception: true, practitionerIds: [practitionerId] },
    previousStartsAt: input.startsAt.toISOString(),
    newStartsAt: input.startsAt.toISOString(),
    occurredAt: now.toISOString(),
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

  // POST-COMMIT. Staff notification for a patient-initiated change (JP,
  // 2026-08-03). Never inside the write, never able to fail the cancellation:
  // the appointment is already cancelled, and a missing staff notification is a
  // far better outcome than telling the patient their cancellation failed.
  await emitPatientChange({
    kind: "cancelled",
    tenantId: principal.tenantId,
    appointmentId: id,
    patientId: principal.patientId,
    audience: { reception: true, practitionerIds: [appt.practitionerId] },
    previousStartsAt: appt.startsAt.toISOString(),
    // A cancellation does not move the appointment; the start is unchanged.
    newStartsAt: appt.startsAt.toISOString(),
    occurredAt: now.toISOString(),
  });
}

/**
 * The slots a patient may move THIS appointment to.
 *
 * Deliberately takes only the appointment id. The portal never learns the
 * service or location identifier: they are resolved server-side from the stored
 * row. Data minimisation is a documented compliance property (see
 * docs/rgpd-token-flow.md), and AppointmentView stays at 8 keys.
 *
 * Zero duplicated slot computation. The duration comes from the appointment
 * itself rather than from the service, which is both simpler and MORE correct
 * here: reschedule preserves the original window by design, so a service whose
 * duration changed after booking must not silently resize an existing
 * appointment. Generation and conflict filtering are the same store call that
 * backs GET /booking/slots.
 */
export async function listRescheduleOptions(
  principal: PatientPrincipal,
  id: string,
  store: AppointmentsStore,
  now: Date,
): Promise<string[]> {
  const appt = await store.getOwnMutable(principal, id);
  if (!appt) throw new AppointmentError("not_found");
  if (!MUTABLE_STATUSES.has(appt.status)) {
    throw new AppointmentError("not_reschedulable");
  }
  // Same gate as the action: if it is too late to reschedule at all, offer
  // nothing rather than a list the patient cannot act on.
  if (isWithinCancellationCutoff(appt.startsAt, now)) {
    throw new AppointmentError("cutoff");
  }

  const durationMin = Math.round((appt.endsAt.getTime() - appt.startsAt.getTime()) / 60_000);

  const slots = await store.listOpenSlots(principal, {
    locationId: appt.locationId,
    durationMin,
    horizonDays: OPEN_SLOTS_HORIZON_DAYS,
    now,
  });

  // Never offer a slot the action would refuse. Same predicate, one source.
  return slots.filter((iso) => !isBeforeMinimumNotice(new Date(iso), now));
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
  // Minimum notice on the NEW slot (JP, 2026-08-03). The options endpoint already
  // filters these out, but the client is not trusted: enforcement lives here, at
  // action time, so a forged request cannot move an appointment to two hours
  // from now. Filtering the list is a courtesy; this is the control.
  if (isBeforeMinimumNotice(input.startsAt, now)) {
    throw new AppointmentError("min_notice");
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

  // POST-COMMIT, same rule as cancel. Both instants are carried so the centre
  // can render "moved from X to Y" without a second read.
  await emitPatientChange({
    kind: "rescheduled",
    tenantId: principal.tenantId,
    appointmentId: id,
    patientId: principal.patientId,
    audience: { reception: true, practitionerIds: [appt.practitionerId] },
    previousStartsAt: appt.startsAt.toISOString(),
    newStartsAt: input.startsAt.toISOString(),
    occurredAt: now.toISOString(),
  });

  return getOwnAppointment(principal, id, store);
}
