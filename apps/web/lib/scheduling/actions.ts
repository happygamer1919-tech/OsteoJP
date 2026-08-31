"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, inArray, or, sql } from "drizzle-orm";
import {
  assertCan,
  ForbiddenError,
  type Capability,
  type RequestContext,
} from "@osteojp/auth";
import {
  analyticsEvents,
  appointmentNotes,
  appointments,
  clinicalRecords,
  invoices,
  patients,
  staffNotifications,
  users,
  type DbTx,
} from "@osteojp/db";
import { verifyDeletePassword } from "@/lib/admin/appointment-delete-password";
import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { clientIp } from "./actor";
import { batchSchedule, type BatchScheduleInput, type BatchScheduleResult, PackBatchRefused } from "./batch";
import { writeAppointmentStatusChangedEvent } from "./analytics";
import { writeAppointmentAudit } from "./audit";
import { buildClonedAppointment } from "./clone-core";
import { blockingConflicts, findConflicts, findConflictsForWindow } from "./conflict";
import { checkAvailability } from "./availability-enforcement";
import { isLegalEstadoTransition } from "./estado-transitions";
import { bookingLocationScope, isLocationBookable } from "@/lib/auth/viewer-locations";
import {
  emitCancelledNotification,
  emitConfirmedNotification,
  emitRescheduledNotification,
} from "@/lib/notifications/centre";
import { getTherapistAvailability, type DayAvailability } from "./day-availability";
import { isValidInterval } from "./overlap";
import { expandRecurrence, toRRule } from "./recurrence";
import { getTherapistServiceIds } from "./therapist-services";
import { getTherapistLocationIds } from "./therapist-locations";
import { bookPackSessionTx } from "@/lib/packs/instances";
import {
  enqueueRemindersAfterCommit,
  enqueueStatusNotificationsAfterCommit,
  type ReminderEnqueueTarget,
  type StatusNotificationTarget,
} from "./reminders";
import { lisbonDateTimeToUtc, lisbonParts } from "./time";
import type {
  ActionResult,
  AppointmentStatusValue,
  ConflictInfo,
  CreateAppointmentInput,
  RescheduleInput,
  SeriesOptions,
  SeriesScope,
  UpdateAppointmentPatch,
} from "./types";
import { acquireSlotLocks, acquireSlotLocksForMany } from "./slot-lock";

const AGENDA_PATH = "/agenda";
const CONFLICT_CAP = 10; // cap aggregated conflict lists across a series

/**
 * Run post-commit side effects so they can NEVER turn a committed write into a
 * reported failure.
 *
 * WHY THIS EXISTS. `revalidatePath` and the reminder/notification enqueues used
 * to sit inside the same try whose catch returns `fail(...)`. By the time they
 * run the transaction has already committed, so a throw there reported an error
 * for an appointment that exists. At the desk that reads as "it did not save",
 * the natural response is to book again, and that is a route to a real double
 * booking. Reporting a failure for a successful write is worse than the failure
 * it is reporting.
 *
 * Errors are swallowed deliberately: every caller is best-effort, and the write
 * is already durable. Only the step label and the error NAME are logged, never
 * the error message or any payload, because those can carry patient data
 * (CLAUDE.md rule 7).
 */
async function afterCommit(step: string, run: () => void | Promise<void>): Promise<void> {
  try {
    await run();
  } catch (e) {
    console.error(
      `scheduling: post-commit step failed (${step}); the write is committed and stands`,
      e instanceof Error ? e.name : "unknown",
    );
  }
}


type Authorized = { actor: RequestContext };
type Denied = Extract<ActionResult<never>, { ok: false }>;

/** Resolve the acting user and assert the capability. Returns a Denied result on failure. */
async function authorize(
  capability: Capability,
): Promise<Authorized | Denied> {
  let actor: RequestContext;
  // This is a server action that owes its client a RESULT OBJECT, not a
  // navigation: "unauthenticated" becomes a session-expired message beside the
  // form, with what the user typed still on screen. The catch below therefore
  // swallows the guard's redirect ON PURPOSE, reproducing exactly the behaviour
  // this function already had.
  //
  // An Auth OUTAGE is still reported. The guard captures it to Sentry before it
  // throws, so the incident is never lost - only its presentation to this one
  // client is a session-expired message rather than a generic error.
  //
  // OSTEOJP-WEB-8-ALLOW-SWALLOW: server action returning a result object to its
  // own client; the outage is reported by the guard before this catch sees it.
  try {
    actor = await requireRequestContext();
  } catch {
    return { ok: false, error: "unauthenticated" };
  }
  try {
    assertCan(actor.role, capability);
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: "forbidden" };
    throw e;
  }
  return { actor };
}

function isDenied(a: Authorized | Denied): a is Denied {
  return "ok" in a;
}

/**
 * Postgres `exclusion_violation`. Raised by 0061's
 * `appointments_no_double_confirmed` when a write would leave two CONFIRMED
 * appointments overlapping for one practitioner.
 */
const EXCLUSION_VIOLATION = "23P01";

/**
 * Was this thrown by the double-confirmed constraint?
 *
 * MATCHES ON THE SQLSTATE AND ON THE CONSTRAINT NAME, not on the message text.
 * The message is locale- and version-dependent; the code and the name are
 * neither. Both are checked because 23P01 belongs to any exclusion constraint,
 * and mapping an unrelated one to "this slot is taken" would be a confident lie.
 *
 * The driver shape is not assumed: postgres.js puts `code`/`constraint_name` on
 * the error, node-postgres uses `code`/`constraint`, and a wrapper may nest the
 * original under `cause`. All are read defensively rather than cast.
 */
function isDoubleConfirmedViolation(e: unknown): boolean {
  const seen = new Set<unknown>();
  let cur: unknown = e;
  for (let depth = 0; cur && typeof cur === "object" && depth < 4; depth++) {
    if (seen.has(cur)) break;
    seen.add(cur);
    const o = cur as Record<string, unknown>;
    if (o.code === EXCLUSION_VIOLATION) {
      const name = String(o.constraint_name ?? o.constraint ?? "");
      if (name === "appointments_no_double_confirmed") return true;
    }
    cur = o.cause;
  }
  return false;
}

/**
 * Log a sanitized failure (no PII / payload) and return a generic error.
 *
 * EXCEPT for the double-confirmed constraint, which gets its OWN code so the
 * agenda can say what happened in pt-PT. THE DEMO IS THE REASON THIS IS NOT
 * DEFERRED: the owner is showing this build to the clinic team, and a raw
 * database error on screen during that is worse than the bug it replaced.
 *
 * It is deliberately NOT mapped to `conflict`. That code carries a list of
 * conflicting appointments and the drawer answers it with "Guardar mesmo
 * assim" — an override that this constraint exists to refuse, so offering it
 * would invite the user to retry something that cannot succeed.
 */
function fail(action: string, e: unknown): Denied {
  if (isDoubleConfirmedViolation(e)) {
    console.error(`scheduling: ${action} refused by appointments_no_double_confirmed`);
    return { ok: false, error: "double_booked" };
  }
  console.error(`scheduling: ${action} failed`, e instanceof Error ? e.name : "unknown");
  return { ok: false, error: "error" };
}

function hhmmOf(d: Date): string {
  const p = lisbonParts(d);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

type SeriesMember = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  practitionerId: string;
  locationId: string;
  room: string | null;
  // Pre-mutation lifecycle status — the `from_status` a status-change event
  // records. Read inside the tx BEFORE the update is applied.
  status: AppointmentStatusValue;
};

/**
 * The appointment rows a scoped mutation applies to.
 *   one       → just the target.
 *   series    → the whole series (parent + all children).
 *   following → series members at/after the target's start.
 * A non-recurring appointment resolves to itself for every scope.
 */
/**
 * What a staff-transition fan-out needs, per appointment.
 *
 * SEPARATE FROM `SeriesMember` because `resolveSeries` deliberately selects only
 * what the SCHEDULING logic needs, and widening it to carry notification fields
 * would make every caller pay for a concern most of them do not have.
 */
type StaffTransitionFanOut = {
  appointmentId: string;
  patientId: string;
  practitionerIds: string[];
  startsAt: Date;
};

/**
 * Read the fan-out subjects for a set of appointment ids, INSIDE the caller's
 * transaction and therefore under RLS.
 *
 * BOTH PRACTITIONERS, because a two-therapist appointment has two people who
 * need to know it moved, and the confirm path already established that shape.
 * Nulls are filtered rather than passed through: `emitStaffTransitionNotification`
 * validates ids against the tenant anyway, but sending it a null would be asking
 * it to ignore something rather than not sending it.
 */
async function readStaffTransitionFanOut(
  tx: DbTx,
  ids: string[],
): Promise<StaffTransitionFanOut[]> {
  if (ids.length === 0) return [];
  try {
    return await readStaffTransitionFanOutOrThrow(tx, ids);
  } catch (e) {
    // ================================================================= //
    // A NOTIFICATION READ MUST NEVER ABORT A CLINICAL ACTION.
    // ================================================================= //
    // This read runs INSIDE the caller's transaction, because it needs the
    // PRE-UPDATE instants and it must be RLS-scoped. That placement means an
    // unhandled throw here would roll back the cancellation or the reschedule
    // itself - a staff member's clinical action failing because the notification
    // centre could not be told about it. That trade is the wrong way round.
    //
    // THIS IS NOT THE SECTION 1.3 FALLBACK, AND THE DISTINCTION IS THE POINT.
    // That rule is about VERDICT paths: an unhandled case must fail rather than
    // map onto a benign-looking one. The verdict here - did the cancel succeed -
    // is untouched; only the notification is lost, and it is lost LOUDLY. 1.3's
    // own wording is that a fallback is right "where the cost of stopping
    // exceeds the cost of being wrong", and stopping a clinical cancellation
    // because a fan-out read failed is exactly that case.
    console.error(
      `[notifications] staff-transition fan-out READ failed for ${ids.length} ` +
        `appointment(s); the transition itself is unaffected and will proceed, ` +
        `but no notification will be written for it`,
      e instanceof Error ? `${e.name}: ${e.message}` : "unknown",
    );
    return [];
  }
}

/** The read itself. Separated so the caller above owns the failure policy. */
async function readStaffTransitionFanOutOrThrow(
  tx: DbTx,
  ids: string[],
): Promise<StaffTransitionFanOut[]> {
  const rows = await tx
    .select({
      id: appointments.id,
      patientId: appointments.patientId,
      practitionerId: appointments.practitionerId,
      practitionerTwoId: appointments.practitionerTwoId,
      startsAt: appointments.startsAt,
    })
    .from(appointments)
    .where(inArray(appointments.id, ids));

  return rows.map((r) => ({
    appointmentId: r.id,
    patientId: r.patientId,
    practitionerIds: [r.practitionerId, r.practitionerTwoId].filter(
      (p): p is string => Boolean(p),
    ),
    startsAt: r.startsAt,
  }));
}

async function resolveSeries(
  tx: DbTx,
  targetId: string,
  scope: SeriesScope,
): Promise<SeriesMember[] | null> {
  const [target] = await tx
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      practitionerId: appointments.practitionerId,
      locationId: appointments.locationId,
      room: appointments.room,
      status: appointments.status,
      recurrenceParentId: appointments.recurrenceParentId,
    })
    .from(appointments)
    .where(eq(appointments.id, targetId))
    .limit(1);
  if (!target) return null;

  const self: SeriesMember = {
    id: target.id,
    startsAt: target.startsAt,
    endsAt: target.endsAt,
    practitionerId: target.practitionerId,
    locationId: target.locationId,
    room: target.room,
    status: target.status,
  };
  if (scope === "one") return [self];

  const seriesId = target.recurrenceParentId ?? target.id;
  const members = await tx
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      practitionerId: appointments.practitionerId,
      locationId: appointments.locationId,
      room: appointments.room,
      status: appointments.status,
    })
    .from(appointments)
    .where(
      or(
        eq(appointments.id, seriesId),
        eq(appointments.recurrenceParentId, seriesId),
      ),
    );
  if (scope === "series") return members;
  return members.filter((m) => m.startsAt.getTime() >= target.startsAt.getTime());
}

/** Aggregate conflicts across a set of candidate windows (capped). */
async function collectConflicts(
  tx: DbTx,
  windows: { startsAt: Date; endsAt: Date }[],
  fixed: { practitionerId: string; locationId: string; room: string | null },
  excludeIds?: string[],
): Promise<ConflictInfo[]> {
  const conflicts: ConflictInfo[] = [];
  for (const w of windows) {
    const c = await findConflictsForWindow(tx, {
      practitionerId: fixed.practitionerId,
      locationId: fixed.locationId,
      room: fixed.room,
      startsAt: w.startsAt,
      endsAt: w.endsAt,
      excludeIds,
    });
    // PL-11: availability is advisory — never blocks. Filter before the cap so
    // an outside-hours window can't crowd out a real double-booking.
    conflicts.push(...blockingConflicts(c));
    if (conflicts.length >= CONFLICT_CAP) break;
  }
  return conflicts.slice(0, CONFLICT_CAP);
}

/**
 * Read-only availability for one therapist on one Lisbon calendar day. Feeds
 * the new-appointment availability panel (SPEC-appointments §5) — same
 * getTherapistAvailability query the batch engine uses, single-day range.
 */
export async function getTherapistDayAvailability(
  input: { therapistId: string; date: string; locationId?: string | null },
): Promise<ActionResult<DayAvailability>> {
  const auth = await authorize("appointments:read");
  if (isDenied(auth)) return auth;
  const { actor } = auth;

  if (!input.therapistId || !input.date) {
    return { ok: false, error: "validation" };
  }

  try {
    const days = await getTherapistAvailability(actor, {
      therapistId: input.therapistId,
      from: input.date,
      to: input.date,
      locationId: input.locationId ?? null,
    });
    return {
      ok: true,
      data: days[0] ?? { date: input.date, working: [], booked: [], blocks: [], free: [] },
    };
  } catch (e) {
    return fail("availability", e);
  }
}

/**
 * Read-only service IDs a therapist is mapped to deliver (`therapist_services`,
 * migration 0023). Feeds the new-appointment service auto-select (SPEC-
 * appointments §6): the drawer filters its service Select to this list and
 * preselects when there is exactly one.
 */
export async function getTherapistServices(
  therapistId: string,
): Promise<ActionResult<string[]>> {
  const auth = await authorize("appointments:read");
  if (isDenied(auth)) return auth;
  const { actor } = auth;

  if (!therapistId) {
    return { ok: false, error: "validation" };
  }

  try {
    const serviceIds = await getTherapistServiceIds(actor, therapistId);
    return { ok: true, data: serviceIds };
  } catch (e) {
    return fail("therapist-services", e);
  }
}

/**
 * Read-only ACTIVE location ids a therapist is assigned to (`availability_
 * templates`, migration 0006). Feeds the new-appointment Localização auto-fill
 * (W4-12): the drawer auto-fills the location when the therapist has exactly one
 * active location, and leaves it manual for zero or multiple.
 */
export async function getTherapistLocations(
  therapistId: string,
): Promise<ActionResult<string[]>> {
  const auth = await authorize("appointments:read");
  if (isDenied(auth)) return auth;
  const { actor } = auth;

  if (!therapistId) {
    return { ok: false, error: "validation" };
  }

  try {
    const locationIds = await getTherapistLocationIds(actor, therapistId);
    return { ok: true, data: locationIds };
  } catch (e) {
    return fail("therapist-locations", e);
  }
}

export async function createAppointment(
  input: CreateAppointmentInput,
): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("appointments:write");
  if (isDenied(auth)) return auth;
  const { actor } = auth;

  if (!input.patientId || !input.practitionerId || !input.locationId) {
    return { ok: false, error: "validation" };
  }

  // ================================================================= //
  // STAFF-02 - THE SERVER REFUSES A LOCATION OUTSIDE THE ACTOR'S SCOPE.
  // ================================================================= //
  // THE FORM RESTRICTION IS THE COURTESY; THIS IS THE DELIVERABLE. A UI-only
  // lock is the INC-08 root cause repeated: the Estado <Select> offered every
  // status with no server check, and reception reached an illegal transition in
  // one click. A restricted dropdown is defeated by a stale tab, a second
  // window, or any request that did not come from the form.
  //
  // THE DEFECT THIS CLOSES: the READ path was scoped by PL-09 and the WRITE path
  // was scoped by NOTHING. An LV-only receptionist selected CB and created
  // appointments at CB he could then never see. PL-09 was not the bug; it is
  // what made the bug visible.
  //
  // OWNER IS EXCEPTED via `bookingLocationScope`, which returns null for them.
  if (!isLocationBookable(await bookingLocationScope(actor), input.locationId)) {
    return { ok: false, error: "location_not_assigned" };
  }
  // PL-10 (defense in depth): a therapist self-books ONLY. The create form hides
  // the Terapeuta selector and forces practitionerId = self, so a therapist
  // request naming a DIFFERENT practitioner did not come from the form — reject
  // it. Gated on role "therapist" ONLY: admin/reception/owner book on behalf of
  // any therapist, unchanged. RLS is untouched; this is an app-layer guard.
  if (actor.role === "therapist" && input.practitionerId !== actor.userId) {
    return { ok: false, error: "forbidden" };
  }
  const firstStart = new Date(input.startsAt);
  const firstEnd = new Date(input.endsAt);
  if (!isValidInterval(firstStart, firstEnd)) {
    return { ok: false, error: "validation" };
  }

  const recurring = !!input.recurrence && input.recurrence.count >= 2;
  /**
   * RB-02 — A PACOTE MAY NOW BOOK N APPOINTMENTS, AND THE OLD REFUSAL IS GONE.
   *
   * W8-01c rejected pack + recurrence with the reason "a pack booking is
   * single-session (one appointment consumes one session)... rather than
   * silently draining N". **That reasoning is exactly what this card inverts.**
   * A pacote of ten is ten sessions, and booking them is the point; draining N
   * is no longer a hazard to be avoided, it is the feature. It is also no longer
   * SILENT: every occurrence gets a `pack_instance_id`, so all N are visible in
   * the diary and reconcilable against the balance.
   *
   * The refusal moves rather than disappearing: the batch is checked against the
   * instance's AVAILABLE balance inside the transaction, below, where the
   * instance is known. Over-booking a pacote is refused there.
   */
  const durationMin = (firstEnd.getTime() - firstStart.getTime()) / 60_000;
  const occ = recurring
    ? expandRecurrence(
        lisbonParts(firstStart).date,
        hhmmOf(firstStart),
        durationMin,
        input.recurrence!,
      )
    : [{ startsAt: firstStart, endsAt: firstEnd }];

  const common = {
    tenantId: actor.tenantId, // required by NOT NULL + RLS WITH CHECK
    patientId: input.patientId,
    practitionerId: input.practitionerId,
    locationId: input.locationId,
    serviceId: input.serviceId ?? null,
    room: input.room ?? null,
    // Optional secondary participants (W4-19, 0032) — persisted as-is; NULL when
    // absent. runScoped enforces tenant isolation on the write; the options the
    // UI offers are already tenant-scoped, so the secondary pair belongs to the
    // same tenant exactly as the primary pair does. Primary-only semantics: the
    // secondary is never read for availability/analytics/AI/estado.
    patientTwoId: input.patientTwoId ?? null,
    practitionerTwoId: input.practitionerTwoId ?? null,
    // Creation invariant (W3-01, DECISIONS 2026-07-01): a new appointment is
    // always `scheduled`, hardcoded here — never taken from the payload. There
    // is no lifecycle Estado selector in the creation UI. `confirmation_state`
    // is left unset so its DB default (`pending`) applies; the two axes stay
    // orthogonal. Lifecycle transitions happen later via updateAppointment.
    status: "scheduled" as const,
    // W12-13 (notes unification R3): the per-visit note is no longer written to
    // the legacy `appointments.notes` column — it is APPENDED to the unified
    // `appointment_notes` relation below (append-only history). The legacy column
    // stays readable (coalesced in the agenda read) until the owner-gated
    // backfill retires it.
    createdBy: actor.userId,
  };
  const noteBody = input.notes?.trim() ? input.notes.trim() : null;

  const ip = await clientIp();
  // Captured inside the tx, enqueued AFTER commit (network out of the tx).
  let reminderTargets: ReminderEnqueueTarget[] = [];
  try {
    const result = await runScoped<ActionResult<{ id: string }>>(
      actor,
      async (tx) => {
        // RB-03 — AVAILABILITY IS ENFORCED, AND IT IS CHECKED BEFORE THE
        // `allowConflict` GATE ON PURPOSE.
        //
        // PL-11 made availability advisory: `findScheduleConflicts` computed it
        // correctly and `blockingConflicts()` threw the verdict away one line
        // above the refusal. That is how a manual entry booked 17:00 for a
        // therapist whose day ends at 13:00.
        //
        // OUTSIDE the `if (!input.allowConflict)` block, because "Guardar mesmo
        // assim" must not reach it. A therapist who genuinely works late is
        // expressed by EXTENDING THEIR DISPONIBILIDADE - the data being
        // enforced - not by pressing past the check.
        //
        // EVERY occurrence is checked, not just the first: a recurring series
        // whose second week falls outside the hours is the same defect with a
        // later date on it.
        for (const w of occ) {
          const av = await checkAvailability(tx, {
            practitionerId: input.practitionerId,
            locationId: input.locationId,
            startsAt: w.startsAt,
            endsAt: w.endsAt,
          });
          if (!av.ok) {
            return {
              ok: false,
              error: "outside_availability",
              availabilityWindows: av.windows,
            };
          }
        }

        if (!input.allowConflict) {
          const conflicts = await collectConflicts(tx, occ, {
            practitionerId: input.practitionerId,
            locationId: input.locationId,
            room: input.room ?? null,
          });
          if (conflicts.length > 0) {
            return { ok: false, error: "conflict", conflicts };
          }
        }

        // Secondary participants (W4-19) — a bare FK does NOT verify tenant match,
        // so enforce app-layer that any provided secondary belongs to THIS tenant.
        // The tx runs under RLS (runScoped), so a scoped lookup only finds
        // same-tenant rows; a cross-tenant id therefore fails validation and is
        // never written. Mirrors how the primary pair is implicitly same-tenant.
        if (input.patientTwoId) {
          const [p2] = await tx
            .select({ id: patients.id })
            .from(patients)
            .where(eq(patients.id, input.patientTwoId))
            .limit(1);
          if (!p2) return { ok: false, error: "validation" };
        }
        if (input.practitionerTwoId) {
          const [u2] = await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, input.practitionerTwoId))
            .limit(1);
          if (!u2) return { ok: false, error: "validation" };
        }

        // W8-01c — booking a PACK: register/decrement one session in THIS tx
        // (so it commits or rolls back with the appointment) and force the
        // appointment's serviceId to the pack's base service. Reads before it
        // writes, so a missing/inactive pack returns validation with nothing
        // written. Non-recurring only (guarded above).
        let serviceIdForAppt = common.serviceId;
        let packInstanceId: string | null = null;
        if (input.packId) {
          const booked = await bookPackSessionTx(tx, actor, input.patientId, input.packId);
          if (!booked) return { ok: false, error: "validation" };
          serviceIdForAppt = booked.baseServiceId;
          packInstanceId = booked.instanceId;

          /**
           * RB-02 — REFUSE A BATCH LARGER THAN THE BALANCE, rather than booking
           * it and letting the balance go negative.
           *
           * The check is HERE and not in `bookPackSessionTx` because only this
           * caller knows how many appointments it is about to insert. It is
           * inside the transaction and after the instance is resolved, so it
           * cannot race a concurrent booking on the same pacote: both writers
           * are serialised on the instance row they read.
           *
           * A REFUSAL, NOT A TRUNCATION. Booking eight of the ten asked for
           * would look like success and leave reception to discover the missing
           * two from the diary - the "harmless-looking known case" §1.3 is
           * about. The clinic is told the pacote has fewer sessions than the
           * booking needs, and decides.
           */
          if (occ.length > booked.sessionsAvailableBefore) {
            return { ok: false, error: "pack_insufficient" };
          }
        }

        // 2.9 — order concurrent writers for these therapist/slot pairs before
        // any row is inserted. Covers the parent AND every recurrence child in
        // one acquisition, sorted, so two overlapping batches cannot deadlock.
        // This ORDERS writes only: the conflict decision above, including the
        // deliberate "Save anyway" override, is untouched.
        const slotLocks = acquireSlotLocksForMany(
          actor.tenantId,
          occ.map((o) => ({
            practitionerId: input.practitionerId,
            startsAt: o.startsAt,
            endsAt: o.endsAt,
          })),
        );
        if (slotLocks) await tx.execute(slotLocks);

        const [parent] = await tx
          .insert(appointments)
          .values({
            ...common,
            serviceId: serviceIdForAppt,
            // RB-02 — the link that makes the balance derivable. Null for every
            // non-pacote appointment, which is almost all of them.
            packInstanceId,
            startsAt: occ[0].startsAt,
            endsAt: occ[0].endsAt,
            recurrenceRule: recurring ? toRRule(input.recurrence!) : null,
          })
          .returning({ id: appointments.id });

        const created: { id: string; startsAt: Date }[] = [
          { id: parent.id, startsAt: occ[0].startsAt },
        ];

        if (occ.length > 1) {
          const children = await tx
            .insert(appointments)
            .values(
              occ.slice(1).map((o) => ({
                ...common,
                // RB-02 — the CHILDREN carry the base service and the link too.
                // Before this they inherited `common.serviceId`, so a pacote
                // recurrence would have recorded the wrong service on every
                // occurrence after the first. The refusal above hid that; with
                // the refusal lifted it would have shipped.
                serviceId: serviceIdForAppt,
                packInstanceId,
                startsAt: o.startsAt,
                endsAt: o.endsAt,
                recurrenceParentId: parent.id,
              })),
            )
            .returning({ id: appointments.id });
          children.forEach((c, i) =>
            created.push({ id: c.id, startsAt: occ[i + 1].startsAt }),
          );
        }

        // W12-13: append the per-visit note to the UNIFIED store, one row per
        // created occurrence (mirrors the pre-W12-13 behaviour of the same note
        // on every occurrence of a recurring booking). Append-only; author =
        // current staff; patient from the appointment. Same tx, so the note
        // commits or rolls back with the appointment(s).
        if (noteBody) {
          await tx.insert(appointmentNotes).values(
            created.map((c) => ({
              tenantId: actor.tenantId,
              patientId: input.patientId,
              appointmentId: c.id,
              authorUserId: actor.userId,
              body: noteBody,
            })),
          );
        }

        for (let i = 0; i < created.length; i++) {
          await writeAppointmentAudit(tx, {
            tenantId: actor.tenantId,
            actorUserId: actor.userId,
            action: "appointment.create",
            appointmentId: created[i].id,
            metadata: {
              patientId: input.patientId,
              practitionerId: input.practitionerId,
              locationId: input.locationId,
              serviceId: serviceIdForAppt,
              packId: input.packId ?? null,
              status: "scheduled",
              startsAt: created[i].startsAt.toISOString(),
              seriesId: recurring ? parent.id : null,
              occurrence: recurring ? i : null,
              count: recurring ? created.length : null,
              // SEC-allowconflict-not-audited. See the note on writeAppointmentAudit
              // callers below: ALWAYS a boolean, never omitted when false, or the
              // absence would again be unreadable.
              allowConflict: !!input.allowConflict,
            },
            ip,
          });
        }

        reminderTargets = created.map((c) => ({
          appointmentId: c.id,
          startsAt: c.startsAt,
        }));
        return { ok: true, data: { id: parent.id } };
      },
    );
    if (result.ok) {
      // Stream E: schedule reminders for the new appointment(s). Best-effort,
      // post-commit; safe with REMINDERS_LIVE_SEND off (sandbox downstream).
      await afterCommit("create", async () => {
        revalidatePath(AGENDA_PATH);
        await enqueueRemindersAfterCommit(actor.tenantId, reminderTargets);
      });
    }
    return result;
  } catch (e) {
    return fail("create", e);
  }
}

/**
 * Partial-success batch booking (ruling G, DECISIONS 2026-07-03). Books every
 * FREE slot in the expanded recurrence and reports each busy slot in `failures`
 * (with its reason and nearest free alternative) — it never refuses the whole
 * batch. The recorrente ("Marcação recorrente") drawer path routes here instead
 * of createAppointment's all-or-nothing recurring branch. Thin wrapper: auth +
 * validate, then delegate to the batch engine (no engine change here).
 */
export async function batchScheduleAppointments(
  input: BatchScheduleInput,
): Promise<ActionResult<BatchScheduleResult>> {
  const auth = await authorize("appointments:write");
  if (isDenied(auth)) return auth;
  const { actor } = auth;
  if (!input.patientId || !input.practitionerId || !input.locationId) {
    return { ok: false, error: "validation" };
  }
  /**
   * RB-02b — an EMPTY packId is not a pacote booking, it is a form that sent
   * "". Normalised to null at the door so the engine's `if (packId)` cannot be
   * fooled by a falsy-but-present value, and so a pacote batch is decided in one
   * place rather than by every truthiness test downstream.
   */
  if ("slots" in input && input.packId !== undefined) {
    input = { ...input, packId: input.packId || null };
  }
  // STAFF-02: the batch path is a create path and is guarded identically. It
  // would otherwise be the obvious way around the single-create check.
  if (!isLocationBookable(await bookingLocationScope(actor), input.locationId)) {
    return { ok: false, error: "location_not_assigned" };
  }
  // PL-10 (defense in depth): the "Agendar lote" path is also a create form —
  // a self-locked therapist may only batch-book their OWN calendar. Same guard,
  // same role gate as createAppointment; admin/reception/owner unaffected.
  if (actor.role === "therapist" && input.practitionerId !== actor.userId) {
    return { ok: false, error: "forbidden" };
  }
  try {
    const result = await batchSchedule(actor, input);
    revalidatePath(AGENDA_PATH);
    return { ok: true, data: result };
  } catch (e) {
    /**
     * RB-02b — a pacote batch refusal is a VERDICT, not a crash.
     *
     * `fail()` maps an unrecognised throw to the generic error, which on this
     * screen reads "algo correu mal" - and the one thing the person needs to
     * know is that the pacote does not have enough sessions. Caught by TYPE
     * rather than by message so a reworded message cannot silently downgrade a
     * named refusal into a generic one.
     */
    if (e instanceof PackBatchRefused) return { ok: false, error: e.kind };
    return fail("batchSchedule", e);
  }
}

/**
 * Schedule-again clone. Given an existing appointment's id and a new start time,
 * create ONE new standalone appointment that copies the source's clinical shape
 * (patient / practitioner / service / location) and duration, on a fresh
 * lifecycle. The caller supplies ONLY the new `startsAt`; `endsAt` is derived
 * from the source duration. Unblocks Max's "schedule-again" UI action.
 *
 * Scope (loop-decided): this action does NOT enforce availability — the UI
 * surfaces availability and the clinic may deliberately book over a busy slot,
 * so the clone is created unconditionally at the requested start. Availability
 * lives in the read-only availability query the UI consumes, not here.
 *
 * Cross-tenant safety: the source is read INSIDE the tenant-scoped tx, so RLS
 * confines the lookup to the caller's tenant. A cross-tenant (or missing) source
 * id resolves to zero rows and the clone is refused (`not_found`) — no row is
 * inserted. tenant_id and created_by come from the JWT context, never the source
 * or the payload.
 */
export async function cloneAppointment(
  sourceId: string,
  startsAt: string, // ISO UTC — the new start; endsAt is derived from the source
): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("appointments:write");
  if (isDenied(auth)) return auth;
  const { actor } = auth;

  if (!sourceId) return { ok: false, error: "validation" };
  const newStart = new Date(startsAt);
  if (Number.isNaN(newStart.getTime())) return { ok: false, error: "validation" };

  const ip = await clientIp();
  // Captured inside the tx, enqueued AFTER commit (network out of the tx).
  let reminderTargets: ReminderEnqueueTarget[] = [];
  try {
    const result = await runScoped<ActionResult<{ id: string }>>(
      actor,
      async (tx) => {
        // RLS scopes this read to the caller's tenant: a cross-tenant / missing
        // source id returns zero rows → hard failure, nothing inserted.
        const [source] = await tx
          .select({
            patientId: appointments.patientId,
            practitionerId: appointments.practitionerId,
            locationId: appointments.locationId,
            serviceId: appointments.serviceId,
            // Secondary participants (W4-19) — read so the clone copies them.
            patientTwoId: appointments.patientTwoId,
            practitionerTwoId: appointments.practitionerTwoId,
            startsAt: appointments.startsAt,
            endsAt: appointments.endsAt,
          })
          .from(appointments)
          .where(eq(appointments.id, sourceId))
          .limit(1);
        if (!source) return { ok: false, error: "not_found" };

        // STAFF-02: a clone INHERITS the source's location, so it is a write
        // path that can land an appointment at a clinic the actor is not
        // assigned to - without ever naming one. Guarded on the SOURCE's
        // location, which is the clone's destination.
        //
        // THE CHECK IS INSIDE THE TRANSACTION BECAUSE THE LOCATION IS NOT KNOWN
        // UNTIL THE SOURCE IS READ. That is the one honest exception to
        // "refuse at the door": there is no door-side value to refuse on. It
        // still refuses before the INSERT, and the read it depends on is the
        // cheap one.
        //
        // AND IT DOES NOT RELY ON THE ACTOR BEING UNABLE TO FIND THE ID. They
        // cannot see CB appointments on a PL-09-scoped agenda, but "they cannot
        // find it" is the read scope doing the write scope's job - which is the
        // exact confusion this card exists to end.
        if (!isLocationBookable(await bookingLocationScope(actor), source.locationId)) {
          return { ok: false, error: "location_not_assigned" };
        }

        const values = buildClonedAppointment(source, newStart, {
          tenantId: actor.tenantId,
          userId: actor.userId,
        });
        // Defensive: the duration comes from an already-valid stored row, so this
        // only trips on a corrupt source or a NaN start slipping the guard above.
        if (!isValidInterval(values.startsAt, values.endsAt)) {
          return { ok: false, error: "validation" };
        }

        // 2.9 — same slot lock as the create path. A clone lands a real
        // appointment in a real slot and races exactly like a fresh booking.
        await tx.execute(
          acquireSlotLocks(
            actor.tenantId,
            values.practitionerId,
            values.startsAt,
            values.endsAt,
          ),
        );

        const [created] = await tx
          .insert(appointments)
          .values(values)
          .returning({ id: appointments.id });

        await writeAppointmentAudit(tx, {
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: "appointment.create",
          appointmentId: created.id,
          metadata: {
            patientId: values.patientId,
            practitionerId: values.practitionerId,
            locationId: values.locationId,
            serviceId: values.serviceId,
            status: values.status,
            startsAt: values.startsAt.toISOString(),
            clonedFrom: sourceId, // id only — no PII
          },
          ip,
        });

        reminderTargets = [{ appointmentId: created.id, startsAt: values.startsAt }];
        return { ok: true, data: { id: created.id } };
      },
    );
    if (result.ok) {
      // A clone is a real new appointment: schedule its reminders like any other
      // creation. Best-effort, post-commit; safe with REMINDERS_LIVE_SEND off.
      await afterCommit("clone", async () => {
        revalidatePath(AGENDA_PATH);
        await enqueueRemindersAfterCommit(actor.tenantId, reminderTargets);
      });
    }
    return result;
  } catch (e) {
    return fail("clone", e);
  }
}

export async function updateAppointment(
  id: string,
  patch: UpdateAppointmentPatch,
  opts?: SeriesOptions,
): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("appointments:write");
  if (isDenied(auth)) return auth;
  const { actor } = auth;

  if (!id) return { ok: false, error: "validation" };
  // Cancelling is a delete-capability action — route it through cancelAppointment.
  if (patch.status === "cancelled") return { ok: false, error: "validation" };

  const set: Partial<typeof appointments.$inferInsert> = {};
  if ("serviceId" in patch) set.serviceId = patch.serviceId ?? null;
  if ("room" in patch) set.room = patch.room ?? null;
  if ("status" in patch && patch.status) set.status = patch.status;
  // W12-13 (notes unification R3): a note edit is an APPEND to the unified
  // `appointment_notes` (not an in-place mutation of `appointments.notes`), so it
  // is handled separately from `set`. Appended to the TARGET appointment only (a
  // note documents one visit). Clearing a note is a no-op under append-only —
  // prior notes stay as history and the latest non-empty one keeps showing.
  const noteBody =
    "notes" in patch && patch.notes != null && patch.notes.trim()
      ? patch.notes.trim()
      : null;
  if (Object.keys(set).length === 0 && !noteBody) {
    return { ok: false, error: "validation" };
  }

  const scope: SeriesScope = opts?.scope ?? "one";
  const newRoom = typeof set.room === "string" ? set.room.trim() : "";

  const ip = await clientIp();
  // Captured inside the tx, emitted AFTER commit (network out of the tx).
  let statusTargets: StatusNotificationTarget[] = [];
  try {
    const result = await runScoped<ActionResult<{ id: string }>>(
      actor,
      async (tx) => {
        const affected = await resolveSeries(tx, id, scope);
        if (!affected || affected.length === 0) {
          return { ok: false, error: "not_found" };
        }
        const ids = affected.map((a) => a.id);

        // ==============================================================
        // INC-08 (a) — THE ESTADO MAP IS ENFORCED HERE, ON THE SERVER.
        //
        // `isLegalEstadoTransition` has existed since W5-09 and forbids
        // `confirmed -> scheduled`, but it was imported by exactly ONE caller,
        // app/patients/[id]/appointments-list.tsx:312. estado-transitions.ts
        // said so in its own header: "the server itself is unchanged (no new
        // lifecycle rule authored there)". The agenda drawer offers all five
        // statuses from an unguarded <Select> (appointment-drawer.tsx:112-118)
        // and never imported the map, so the illegal move was one click.
        //
        // THAT IS NOT A THEORETICAL HOLE. It is the first step of the confirmed
        // production double booking: the owner flipped a CONFIRMED pedido back
        // to `scheduled` while testing whether a conflict would show. A pedido
        // at `scheduled` with an appointment_request row is exactly what
        // `is_unconfirmed_pedido` (0059:139-148) calls non-blocking, so the row
        // vanished from every conflict check and a staff appointment was
        // rescheduled onto its window sixteen seconds later.
        //
        // CLIENT-SIDE ALONE IS NOT ENFORCEMENT. One caller guarding and one not
        // is indistinguishable, from the database's point of view, from nobody
        // guarding.
        // ==============================================================
        if (patch.status) {
          const illegal = affected.filter(
            (a) => a.status !== patch.status && !isLegalEstadoTransition(a.status, patch.status!),
          );
          if (illegal.length > 0) {
            return { ok: false, error: "illegal_transition" };
          }
        }

        // A room change can create a room double-booking at each occurrence's
        // existing time. Therapist/time are untouched here, so only room
        // conflicts are relevant.
        if (!opts?.allowConflict && "room" in set && newRoom) {
          const conflicts: ConflictInfo[] = [];
          for (const a of affected) {
            const c = await findConflicts(tx, {
              practitionerId: a.practitionerId,
              locationId: a.locationId,
              room: newRoom,
              startsAt: a.startsAt,
              endsAt: a.endsAt,
              excludeIds: ids,
            });
            conflicts.push(...c.filter((x) => x.kind === "room"));
            if (conflicts.length >= CONFLICT_CAP) break;
          }
          if (conflicts.length > 0) {
            return {
              ok: false,
              error: "conflict",
              conflicts: conflicts.slice(0, CONFLICT_CAP),
            };
          }
        }

        // ==============================================================
        // INC-08 (b) — A STATUS PATCH THAT MAKES A ROW START BLOCKING IS
        // CHECKED FOR CONFLICTS. Until now this path ran NONE: the only
        // conflict branch above is gated on `"room" in set`, so a status-only
        // patch reached the UPDATE unchecked, which is how both rows in the
        // production incident were flipped to `confirmed` on an already
        // double-booked window at 17:00:01 and 17:00:14.
        //
        // WHICH TRANSITIONS NEED IT, derived rather than guessed. A row is
        // visible to `appointment_conflicts` when its status is not
        // cancelled/no_show AND it is not an unconfirmed pedido (0059). So the
        // only way a status patch ADDS a row to that set is by moving an
        // unconfirmed pedido out of `scheduled`. Everything else either was
        // already blocking (confirmed -> completed), or is leaving the set
        // (-> no_show), or is now refused as illegal by (a) above.
        //
        // THE PEDIDO READ GOES THROUGH is_unconfirmed_pedido AND NOT THROUGH A
        // JOIN, for the reason 0059:26-40 gives: `staff_notifications` SELECT
        // is pinned by 0055 to `recipient_user_id = auth.uid()`, so a caller
        // who is not the notified recipient would see no row, conclude "not a
        // pedido", and skip the very check they need. The function is SECURITY
        // DEFINER precisely so the answer does not depend on who is asking.
        // It is evaluated BEFORE the UPDATE, while the status is still
        // `scheduled` — afterwards it would answer false for every row.
        //
        // allowConflict IS STILL HONOURED HERE, deliberately. This mirrors
        // create and reschedule: staff may override a warning and "Guardar
        // mesmo assim". What is NOT overridable is two CONFIRMED appointments
        // on one therapist — that is refused by the database itself (0061), so
        // it cannot be reached by any path, overridden, or forgotten.
        // ==============================================================
        if (patch.status && !opts?.allowConflict) {
          const NON_BLOCKING_STATUS = new Set(["cancelled", "no_show"]);
          const willBlock = !NON_BLOCKING_STATUS.has(patch.status);
          // Only a row at `scheduled` can be an unconfirmed pedido — 0059:145
          // requires it — so a series with none cannot contain one, and the
          // probe below would be a guaranteed-empty round trip. Skipping it
          // matters: `confirmed -> completed` is what reception does to every
          // appointment of every day, and it can never enter the blocking set.
          const anyScheduled = affected.some((a) => a.status === "scheduled");
          if (willBlock && anyScheduled) {
            const pedidoRows = (await tx.execute(sql`
              SELECT a.id::text AS id
                FROM public.appointments a
               WHERE a.id IN (${sql.join(
                 ids.map((i) => sql`${i}::uuid`),
                 sql`, `,
               )})
                 AND public.is_unconfirmed_pedido(a.id)
            `)) as unknown;
            const pedidoIds = new Set(
              (Array.isArray(pedidoRows)
                ? pedidoRows
                : ((pedidoRows as { rows?: unknown[] }).rows ?? [])
              ).map((r) => (r as { id: string }).id),
            );

            // Rows already blocking are skipped: this patch changes nothing
            // about their occupancy, and re-checking a row against itself
            // proves nothing — the same reasoning confirmAppointmentRequest
            // gives for not re-checking an ordinary staff row.
            const entering = affected.filter(
              (a) => NON_BLOCKING_STATUS.has(a.status) || pedidoIds.has(a.id),
            );

            // SERIALISE BEFORE READING, exactly as create, reschedule and
            // confirmAppointmentRequest do. Check-then-write across two
            // statements is how two writers both pass and both write; the
            // advisory lock orders them for this therapist and window, and the
            // check below runs inside it.
            if (entering.length > 0) {
              const locks = acquireSlotLocksForMany(
                actor.tenantId,
                entering.map((a) => ({
                  practitionerId: a.practitionerId,
                  startsAt: a.startsAt,
                  endsAt: a.endsAt,
                })),
              );
              if (locks) await tx.execute(locks);
            }

            const conflicts: ConflictInfo[] = [];
            for (const a of entering) {
              const c = await findConflictsForWindow(tx, {
                practitionerId: a.practitionerId,
                locationId: a.locationId,
                room: a.room,
                startsAt: a.startsAt,
                endsAt: a.endsAt,
                excludeIds: ids,
              });
              conflicts.push(...blockingConflicts(c));
              if (conflicts.length >= CONFLICT_CAP) break;
            }
            if (conflicts.length > 0) {
              return {
                ok: false,
                error: "conflict",
                conflicts: conflicts.slice(0, CONFLICT_CAP),
              };
            }
          }
        }

        // Only run the column update when there is a column to change; a
        // notes-only edit (W12-13) touches no `appointments` column.
        if (Object.keys(set).length > 0) {
          await tx
            .update(appointments)
            .set(set)
            .where(inArray(appointments.id, ids)); // RLS scopes tenant
        }

        // W12-13: append the note to the UNIFIED store for the TARGET appointment
        // (patient derived server-side). Before the completion event below so a
        // "concluída + nota" save captures note_present = true.
        if (noteBody) {
          const [tgt] = await tx
            .select({ patientId: appointments.patientId })
            .from(appointments)
            .where(eq(appointments.id, id))
            .limit(1);
          if (tgt) {
            await tx.insert(appointmentNotes).values({
              tenantId: actor.tenantId,
              patientId: tgt.patientId,
              appointmentId: id,
              authorUserId: actor.userId,
              body: noteBody,
            });
          }
        }

        const setChanged = Object.keys(set);
        // SEC-allowconflict-not-audited: the PRE-mutation status, per row.
        // `affected` was read before the UPDATE above, so this is the only
        // place `from_status` is still knowable.
        const statusBefore = new Map(affected.map((a) => [a.id, a.status]));
        for (const aid of ids) {
          const changed =
            aid === id && noteBody ? [...setChanged, "notes"] : setChanged;
          if (changed.length === 0) continue;
          await writeAppointmentAudit(tx, {
            tenantId: actor.tenantId,
            actorUserId: actor.userId,
            action: "appointment.update",
            appointmentId: aid,
            metadata: {
              changed,
              scope,
              allowConflict: !!opts?.allowConflict,
              // Only on a status patch, and BOTH ends or neither. A `to` with
              // no `from` is the shape that made the INC-08 timeline an
              // inference rather than a reading.
              ...(patch.status
                ? {
                    fromStatus: statusBefore.get(aid) ?? null,
                    toStatus: patch.status,
                  }
                : {}),
            },
            ip,
          });
        }

        // Completion is the transition the soft gate cares about: emit the
        // status-change event carrying note_present, so closing a visit without
        // a per-visit note is recorded, never blocked (Q-ROW8-1). Same tx as the
        // status write — the event and the transition commit atomically. Other
        // transitions are intentionally not logged here (out of Q-ROW8-1 scope).
        if (patch.status === "completed") {
          const occurredAt = new Date();
          for (const a of affected) {
            await writeAppointmentStatusChangedEvent(tx, {
              tenantId: actor.tenantId,
              actorUserId: actor.userId,
              appointmentId: a.id,
              fromStatus: a.status,
              toStatus: "completed",
              therapistUserId: a.practitionerId,
              locationId: a.locationId,
              occurredAt,
            });
          }
        }

        if (patch.status === "completed" || patch.status === "no_show") {
          statusTargets = affected.map((a) => ({ appointmentId: a.id, endsAt: a.endsAt }));
        }

        return { ok: true, data: { id } };
      },
    );
    if (result.ok) {
      await afterCommit("update", async () => {
        revalidatePath(AGENDA_PATH);
        if (
          (patch.status === "completed" || patch.status === "no_show") &&
          statusTargets.length > 0
        ) {
          await enqueueStatusNotificationsAfterCommit(actor.tenantId, statusTargets, patch.status);
        }
      });
    }
    return result;
  } catch (e) {
    return fail("update", e);
  }
}

export async function rescheduleAppointment(
  id: string,
  input: RescheduleInput,
): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("appointments:write");
  if (isDenied(auth)) return auth;
  const { actor } = auth;

  if (!id || !input.practitionerId || !input.locationId) {
    return { ok: false, error: "validation" };
  }
  // STAFF-02: a reschedule carries a locationId and can therefore MOVE an
  // appointment into an unassigned clinic. Guarded on the DESTINATION, which is
  // the only location this call can create a booking at.
  if (!isLocationBookable(await bookingLocationScope(actor), input.locationId)) {
    return { ok: false, error: "location_not_assigned" };
  }
  const inStart = new Date(input.startsAt);
  const inEnd = new Date(input.endsAt);
  if (!isValidInterval(inStart, inEnd)) {
    return { ok: false, error: "validation" };
  }
  const scope: SeriesScope = input.scope ?? "one";

  const ip = await clientIp();
  // Captured inside the tx, enqueued AFTER commit (network out of the tx).
  let reminderTargets: ReminderEnqueueTarget[] = [];
  let rescheduleFanOut: Array<StaffTransitionFanOut & { newStartsAt: Date }> = [];
  try {
    const result = await runScoped<ActionResult<{ id: string }>>(
      actor,
      async (tx) => {
        const affected = await resolveSeries(tx, id, scope);
        if (!affected || affected.length === 0) {
          return { ok: false, error: "not_found" };
        }
        const ids = affected.map((a) => a.id);

        // BEFORE the update, so `startsAt` here is the instant the appointment
        // is moving FROM. Read once and reused below rather than re-read after
        // the write, which would return the new value and silently make every
        // notification say it moved from where it now is.
        const before = await readStaffTransitionFanOut(tx, ids);

        // scope "one": move to the exact window from input (date may change).
        // scope following/series: keep each occurrence's date, apply the new
        // time-of-day + duration (preserves wall-clock across DST).
        const newHHMM = hhmmOf(inStart);
        const durationMin = (inEnd.getTime() - inStart.getTime()) / 60_000;
        const targets =
          scope === "one"
            ? [{ id, startsAt: inStart, endsAt: inEnd, room: affected[0].room }]
            : affected.map((a) => {
                const start = lisbonDateTimeToUtc(
                  lisbonParts(a.startsAt).date,
                  newHHMM,
                );
                return {
                  id: a.id,
                  startsAt: start,
                  endsAt: new Date(start.getTime() + durationMin * 60_000),
                  room: a.room,
                };
              });

        // RB-03 — the reschedule half. Same rule, same reason, same position
        // relative to `allowConflict`: a time moved into a therapist's evening
        // is the reported defect with an extra step in front of it.
        for (const t of targets) {
          const av = await checkAvailability(tx, {
            practitionerId: input.practitionerId,
            locationId: input.locationId,
            startsAt: t.startsAt,
            endsAt: t.endsAt,
          });
          if (!av.ok) {
            return {
              ok: false,
              error: "outside_availability",
              availabilityWindows: av.windows,
            };
          }
        }

        if (!input.allowConflict) {
          const conflicts: ConflictInfo[] = [];
          for (const t of targets) {
            const c = await findConflictsForWindow(tx, {
              practitionerId: input.practitionerId,
              locationId: input.locationId,
              room: t.room,
              startsAt: t.startsAt,
              endsAt: t.endsAt,
              excludeIds: ids,
            });
            // PL-11: availability is advisory in the CONFLICT LIST, still. The
            // enforced check above already refused an outside-hours window, so
            // this filter now only prevents an advisory entry crowding the cap.
            conflicts.push(...blockingConflicts(c));
            if (conflicts.length >= CONFLICT_CAP) break;
          }
          if (conflicts.length > 0) {
            return {
              ok: false,
              error: "conflict",
              conflicts: conflicts.slice(0, CONFLICT_CAP),
            };
          }
        }

        // 2.9 — lock the DESTINATION slots before any row moves. Only the
        // destination matters: vacating a slot cannot create a double-booking,
        // occupying one can. One sorted, deduplicated acquisition covers every
        // target in a series move, so two concurrent reschedules touching
        // overlapping destinations serialize instead of interleaving.
        //
        // Moving an appointment INTO its own current slot is safe: the buckets
        // deduplicate to a single key, and pg_advisory_xact_lock is re-entrant
        // within a transaction, so re-taking a lock this transaction already
        // holds cannot deadlock against itself.
        const slotLocks = acquireSlotLocksForMany(
          actor.tenantId,
          targets.map((t) => ({
            practitionerId: input.practitionerId,
            startsAt: t.startsAt,
            endsAt: t.endsAt,
          })),
        );
        if (slotLocks) await tx.execute(slotLocks);

        for (const t of targets) {
          await tx
            .update(appointments)
            .set({
              startsAt: t.startsAt,
              endsAt: t.endsAt,
              practitionerId: input.practitionerId,
              locationId: input.locationId,
            })
            .where(eq(appointments.id, t.id)); // RLS scopes tenant
          await writeAppointmentAudit(tx, {
            tenantId: actor.tenantId,
            actorUserId: actor.userId,
            action: "appointment.reschedule",
            appointmentId: t.id,
            metadata: {
              practitionerId: input.practitionerId,
              locationId: input.locationId,
              startsAt: t.startsAt.toISOString(),
              endsAt: t.endsAt.toISOString(),
              scope,
              allowConflict: !!input.allowConflict,
            },
            ip,
          });
        }
        reminderTargets = targets.map((t) => ({
          appointmentId: t.id,
          startsAt: t.startsAt,
        }));
        // THE OLD INSTANTS, matched to the new ones by id. This is the only kind
        // where the two differ, and it is why staff_notifications carries the
        // column pair at all: a reader needs to know what it moved FROM.
        // `before` was read at the top of this transaction, so it still holds
        // the pre-update value even though the rows have now been written.
        const newStartById = new Map(targets.map((t) => [t.id, t.startsAt]));
        rescheduleFanOut = before
          .filter((b) => newStartById.has(b.appointmentId))
          .map((b) => ({
            ...b,
            newStartsAt: newStartById.get(b.appointmentId)!,
          }));
        return { ok: true, data: { id } };
      },
    );
    if (result.ok) {
      // Stream E: re-enqueue at the NEW time. The new appointment/scheduled event
      // supersedes the prior sleeping run (cancelOn on appointment id), so the old
      // time never fires. Best-effort, post-commit.
      await afterCommit("reschedule", async () => {
        revalidatePath(AGENDA_PATH);
        revalidatePath("/notificacoes");
        await enqueueRemindersAfterCommit(actor.tenantId, reminderTargets);
        // LE-staff-transitions-emit-nothing. Best-effort and post-commit: the
        // appointment really has moved, so a failed notification must never be
        // reported as a failed reschedule.
        for (const f of rescheduleFanOut) {
          await emitRescheduledNotification({
            tenantId: actor.tenantId,
            actorUserId: actor.userId,
            appointmentId: f.appointmentId,
            patientId: f.patientId,
            practitionerIds: f.practitionerIds,
            previousStartsAt: f.startsAt,
            newStartsAt: f.newStartsAt,
            occurredAt: new Date(),
          });
        }
      });
    }
    return result;
  } catch (e) {
    return fail("reschedule", e);
  }
}

/**
 * Reception accepts a portal pedido: lifecycle `scheduled` -> `confirmed`.
 *
 * OWNER RULING 2026-08-06 (W13-04a, option B): "o horario fica livre ate a
 * rececao confirmar". An unconfirmed pedido does NOT hold the slot, and JP
 * accepted the stated trade-off: this confirm CAN fail because another booking
 * took the slot first. That is what makes the re-check below mandatory rather
 * than defensive, and it is why this is a distinct action instead of
 * `updateAppointment(id, { status: "confirmed" })`. The Estado selector in the
 * drawer performs the same transition with no availability check, which is
 * correct there — a staff row already occupies its slot, so re-checking it
 * against itself proves nothing. A pedido is the one case where the slot may
 * have been taken since the row was written.
 *
 * THE RE-CHECK IS IN THE SAME TRANSACTION AS THE WRITE, and behind the same slot
 * lock every other write path takes. Check-then-write across two statements is
 * how two confirms both pass and both write; the lock serialises writers for
 * this therapist and window, and the check runs inside it.
 *
 * NO PARTIAL STATES. On conflict nothing is written and the pedido stays
 * `scheduled`, so it is still in reception's queue and they can call the patient
 * and offer another time. There is no "confirmed but conflicting" outcome and no
 * "cancelled by the system" outcome — declining is a decision a person makes.
 *
 * IT NEVER TOUCHES `appointment_confirmation_state`. That axis answers "did the
 * PATIENT reply to the reminder" and is written by the Twilio inbound webhook
 * (apps/web/lib/scheduling/estado.ts:8-20). Writing it here would record a
 * patient reply that never happened and would corrupt the reminder-reply data
 * the clinic reads. `pedido-confirm-axis.test.ts` asserts that on the source.
 *
 * AUTHORITY COMES FROM THE SAME ROW THE QUEUE COMES FROM. The caller must hold
 * an `appointment_request` notification for this appointment, and RLS (0055)
 * pins that read to `recipient_user_id = auth.uid()`. So this action can only
 * ever confirm a pedido the caller was actually notified about — it is not a
 * general "set status to confirmed" back door reachable with any id.
 */
export async function confirmAppointmentRequest(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("appointments:write");
  if (isDenied(auth)) return auth;
  const { actor } = auth;

  if (!id) return { ok: false, error: "validation" };

  const ip = await clientIp();
  // Captured inside the tx, emitted AFTER commit (the fan-out is a separate
  // admin-scoped write and must not hold the confirm's transaction open).
  let confirmFanOut: {
    patientId: string;
    practitionerIds: string[];
    startsAt: Date;
  } | null = null;
  // W14-07. Captured inside the tx, enqueued AFTER commit (a network call must
  // never run inside an open Postgres transaction).
  let reminderTargets: ReminderEnqueueTarget[] = [];
  try {
    const result = await runScoped<ActionResult<{ id: string }>>(
      actor,
      async (tx) => {
        // The pedido, joined to its provenance. Both halves are RLS-scoped: the
        // appointment by the caller's own policy (0048 location scope), the
        // notification to the caller personally (0055). A missing either half is
        // the same not_found — the caller may not act on this pedido, and which
        // half was missing is not information they are owed.
        const [pedido] = await tx
          .select({
            id: appointments.id,
            startsAt: appointments.startsAt,
            endsAt: appointments.endsAt,
            practitionerId: appointments.practitionerId,
            // WF-05: a dual-participant service (Massagem 4 Maos, Sessao
            // Familia) has two assigned therapists and JP's standing ruling is
            // that BOTH are notified. Read here so the post-commit fan-out does
            // not need a second query.
            practitionerTwoId: appointments.practitionerTwoId,
            patientId: appointments.patientId,
            locationId: appointments.locationId,
            room: appointments.room,
            status: appointments.status,
          })
          .from(appointments)
          .innerJoin(
            staffNotifications,
            and(
              eq(staffNotifications.appointmentId, appointments.id),
              eq(staffNotifications.kind, "appointment_request"),
            ),
          )
          .where(and(eq(appointments.id, id), eq(appointments.status, "scheduled")))
          .limit(1);

        if (!pedido) return { ok: false, error: "not_found" };

        // Serialise concurrent writers for this therapist + window BEFORE the
        // check reads, exactly as createAppointment and rescheduleAppointment do.
        await tx.execute(
          acquireSlotLocks(actor.tenantId, pedido.practitionerId, pedido.startsAt, pedido.endsAt),
        );

        // excludeIds is the pedido itself: its own row occupies this window and
        // would otherwise be reported as the conflict that blocks its own
        // confirmation. Every OTHER occupant still counts.
        const found = await findConflictsForWindow(tx, {
          practitionerId: pedido.practitionerId,
          locationId: pedido.locationId,
          room: pedido.room,
          startsAt: pedido.startsAt,
          endsAt: pedido.endsAt,
          excludeIds: [pedido.id],
        });
        // PL-11: availability stays advisory here too. Reception confirming a
        // pedido that falls outside the therapist's declared hours is a decision
        // they are allowed to make; a real double booking is not.
        const blocking = blockingConflicts(found);
        if (blocking.length > 0) {
          return {
            ok: false,
            error: "conflict",
            conflicts: blocking.slice(0, CONFLICT_CAP),
          };
        }

        // The status predicate is repeated on the UPDATE, not assumed from the
        // SELECT: it is the last guard against a writer that slipped in ahead of
        // the lock acquisition. Zero rows means someone else already decided.
        const updated = await tx
          .update(appointments)
          .set({ status: "confirmed" })
          .where(and(eq(appointments.id, pedido.id), eq(appointments.status, "scheduled")))
          .returning({ id: appointments.id });

        if (updated.length === 0) return { ok: false, error: "not_found" };

        await writeAppointmentAudit(tx, {
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: "appointment.update",
          appointmentId: pedido.id,
          metadata: {
            changed: ["status"],
            scope: "one",
            from_status: "scheduled",
            to_status: "confirmed",
            // Distinguishes a reception acceptance of a portal pedido from an
            // ordinary Estado change, in a trail that otherwise records both as
            // "status changed".
            via: "portal_request_confirm",
          },
          ip,
        });

        confirmFanOut = {
          patientId: pedido.patientId,
          practitionerIds: [pedido.practitionerId, pedido.practitionerTwoId].filter(
            (p): p is string => Boolean(p),
          ),
          startsAt: pedido.startsAt,
        };
        reminderTargets = [{ appointmentId: pedido.id, startsAt: pedido.startsAt }];
        return { ok: true, data: { id: pedido.id } };
      },
    );
    if (result.ok) {
      await afterCommit("confirmRequest", async () => {
        revalidatePath(AGENDA_PATH);
        revalidatePath("/notificacoes");
        // ================================================================== //
        // THE PORTAL PATIENT'S REMINDERS AND CONFIRMATION START HERE, AND
        // NOWHERE ELSE. Owner ruling 2026-08-31.
        // ================================================================== //
        // TWO DEFECTS CLOSE ON THIS ONE LINE, and they are worth separating.
        //
        // 1. THE CONFIRMATION HAD NO CORRECT MOMENT. Decision A scopes it to
        //    portal-originated appointments, and JP ruled 2026-08-06 that every
        //    portal booking is a PEDIDO the clinic has not accepted. So sending
        //    it at request time would say "A sua marcacao esta confirmada"
        //    about a request nobody had looked at. The owner ruled the moment
        //    is ACCEPTANCE, which is this function, and by the time this runs
        //    the status is `confirmed` - so dispatchConfirmation's two gates
        //    (origin = patient_portal, and not an unaccepted pedido) both pass
        //    and the approved body is TRUE when it arrives.
        //
        // 2. A PORTAL BOOKING RECEIVED NO REMINDERS AT ALL, EVER. This is the
        //    wider one and it was not about copy. apps/api - the portal API -
        //    emits no background event of any kind: it has no Inngest client
        //    and store.createBooking sends nothing. The three staff paths in
        //    this file were the ONLY emitters in the repo, so a patient who
        //    booked through the portal was never scheduled a 48h email or a
        //    24h SMS even after reception accepted them. This call fixes that
        //    with no new dependency and no new environment variable: one
        //    `appointment/scheduled` event fans out the confirmation AND both
        //    reminder offsets, exactly as a staff-created booking does.
        //
        // WHY HERE AND NOT IN apps/api. Emitting at booking time would have
        // needed the Inngest client, an event key in the portal project's
        // environment, and a second place that knows the reminder contract -
        // and it would still have been the WRONG MOMENT under the ruling above.
        // The event belongs where the appointment becomes real.
        //
        // `confirmationEligible` is true for this single target by construction
        // (confirmationEligibleIndex over a one-element list), so the
        // confirmation fires exactly once. Best-effort and post-commit, the
        // same contract every other emit on this path already has: the pedido
        // really is accepted, so a failed enqueue must never be reported as a
        // failed acceptance.
        await enqueueRemindersAfterCommit(actor.tenantId, reminderTargets);
        // ITEM 20 / PG4. Until 0061 the staff app emitted NOTHING, so a
        // therapist accepting a pedido made it vanish from reception's queue
        // (listPendingRequests filters `status = 'scheduled'`) with no record
        // written anywhere — indistinguishable from cancelled, or from never
        // there. POST-COMMIT and best-effort: the appointment really is
        // confirmed, so a failed notification must never be reported as a
        // failed confirmation.
        if (confirmFanOut) {
          await emitConfirmedNotification({
            tenantId: actor.tenantId,
            actorUserId: actor.userId,
            appointmentId: result.data.id,
            patientId: confirmFanOut.patientId,
            practitionerIds: confirmFanOut.practitionerIds,
            startsAt: confirmFanOut.startsAt,
            occurredAt: new Date(),
          });
        }
      });
    }
    return result;
  } catch (e) {
    return fail("confirmRequest", e);
  }
}

export async function cancelAppointment(
  id: string,
  reason?: string,
  opts?: SeriesOptions,
): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("appointments:delete");
  if (isDenied(auth)) return auth;
  const { actor } = auth;

  if (!id) return { ok: false, error: "validation" };
  const scope: SeriesScope = opts?.scope ?? "one";

  const ip = await clientIp();
  // Captured inside the tx, emitted AFTER commit. LE-staff-transitions-emit-nothing:
  // until 2026-08-13 only the CONFIRM path was instrumented, so a staff
  // cancellation left no record in the notification centre at all.
  let cancelFanOut: StaffTransitionFanOut[] = [];
  try {
    const result = await runScoped<ActionResult<{ id: string }>>(
      actor,
      async (tx) => {
        const affected = await resolveSeries(tx, id, scope);
        if (!affected || affected.length === 0) {
          return { ok: false, error: "not_found" };
        }
        const ids = affected.map((a) => a.id);

        // The fan-out needs the patient and BOTH practitioners, which
        // resolveSeries does not select. Read BEFORE the update: after it the
        // rows are cancelled, and a later reader would have to know that a
        // cancelled row is still a legitimate notification subject.
        cancelFanOut = await readStaffTransitionFanOut(tx, ids);

        // Never hard delete — cancel via the status field only.
        await tx
          .update(appointments)
          .set({ status: "cancelled" })
          .where(inArray(appointments.id, ids)); // RLS scopes tenant

        // Pre-mutation status, per row, captured from the read above.
        const statusBefore = new Map(affected.map((a) => [a.id, a.status]));
        for (const aid of ids) {
          await writeAppointmentAudit(tx, {
            tenantId: actor.tenantId,
            actorUserId: actor.userId,
            action: "appointment.cancel",
            appointmentId: aid,
            metadata: {
              reason: reason?.trim() || null,
              scope,
              // A cancel IS a status patch. It carries no allowConflict because
              // this path never reads one - vacating a slot cannot create a
              // conflict - and writing `false` here would imply a decision
              // nobody made.
              fromStatus: statusBefore.get(aid) ?? null,
              toStatus: "cancelled",
            },
            ip,
          });
        }
        return { ok: true, data: { id } };
      },
    );
    if (result.ok) {
      revalidatePath(AGENDA_PATH);
      await afterCommit("cancel", async () => {
        revalidatePath("/notificacoes");
        // POST-COMMIT and best-effort, the same contract the confirm path set:
        // the appointment really is cancelled, so a failed notification must
        // never be reported as a failed cancellation.
        for (const f of cancelFanOut) {
          await emitCancelledNotification({
            tenantId: actor.tenantId,
            actorUserId: actor.userId,
            appointmentId: f.appointmentId,
            patientId: f.patientId,
            practitionerIds: f.practitionerIds,
            startsAt: f.startsAt,
            occurredAt: new Date(),
          });
        }
      });
    }
    return result;
  } catch (e) {
    return fail("cancel", e);
  }
}

/**
 * Hard-delete an appointment behind the password gate (W3-06, DECISIONS
 * 2026-07-05). Admin-only (`settings:manage` — the Tenant-settings tier;
 * reception/therapist cannot). Verifies the tenant delete password server-side
 * (hashed, never client-checked), REFUSES if any clinical note / record / invoice
 * is linked, then in one tenant-scoped tx deletes the child analytics rows first
 * (RETURNING), the appointment (RETURNING), and writes a PII-free audit snapshot.
 * Distinct from cancelAppointment, which only sets status = 'cancelled'.
 */
export async function hardDeleteAppointment(
  id: string,
  password: string,
): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("settings:manage");
  if (isDenied(auth)) return auth;
  const { actor } = auth;
  if (!id) return { ok: false, error: "validation" };

  // Password gate — server-side, hashed. A client-side check is never trusted.
  if (!(await verifyDeletePassword(actor, password))) {
    return { ok: false, error: "password" };
  }

  const ip = await clientIp();
  try {
    const result = await runScoped<ActionResult<{ id: string }>>(actor, async (tx) => {
      // Snapshot + existence. RLS scopes tenant → cross-tenant/missing = 0 rows.
      const [appt] = await tx
        .select({
          id: appointments.id,
          patientId: appointments.patientId,
          practitionerId: appointments.practitionerId,
          serviceId: appointments.serviceId,
          locationId: appointments.locationId,
          startsAt: appointments.startsAt,
          endsAt: appointments.endsAt,
          status: appointments.status,
          confirmationState: appointments.confirmationState,
        })
        .from(appointments)
        .where(eq(appointments.id, id))
        .limit(1);
      if (!appt) return { ok: false, error: "not_found" };

      // Linked-records guard: never hard-delete an appointment that carries
      // clinical documentation or an invoice (tenant-scoped counts).
      const [{ n: notes }] = await tx
        .select({ n: count() })
        .from(appointmentNotes)
        .where(eq(appointmentNotes.appointmentId, id));
      const [{ n: records }] = await tx
        .select({ n: count() })
        .from(clinicalRecords)
        .where(eq(clinicalRecords.appointmentId, id));
      const [{ n: invs }] = await tx
        .select({ n: count() })
        .from(invoices)
        .where(eq(invoices.appointmentId, id));
      if (Number(notes) > 0 || Number(records) > 0 || Number(invs) > 0) {
        return { ok: false, error: "linked_records" };
      }

      // Child rows FIRST (RETURNING), then the parent — no orphans. Analytics
      // events reference the appointment by entity_id (no FK), so they are
      // cleared explicitly here.
      await tx
        .delete(analyticsEvents)
        .where(
          and(eq(analyticsEvents.entityType, "appointment"), eq(analyticsEvents.entityId, id)),
        )
        .returning({ id: analyticsEvents.id });

      const deleted = await tx
        .delete(appointments)
        .where(eq(appointments.id, id))
        .returning({ id: appointments.id });
      if (deleted.length === 0) return { ok: false, error: "not_found" };

      // Audit (same tx). PII-FREE snapshot: ids + ISO timestamps + enums ONLY —
      // never the notes body or patient name (CLAUDE.md rule 7).
      await writeAppointmentAudit(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "appointment.hard_delete",
        appointmentId: id,
        metadata: {
          appointmentId: appt.id,
          patientId: appt.patientId,
          practitionerId: appt.practitionerId,
          serviceId: appt.serviceId,
          locationId: appt.locationId,
          startsAt: appt.startsAt.toISOString(),
          endsAt: appt.endsAt.toISOString(),
          status: appt.status,
          confirmationState: appt.confirmationState,
        },
        ip,
      });

      return { ok: true, data: { id } };
    });
    if (result.ok) revalidatePath(AGENDA_PATH);
    return result;
  } catch (e) {
    return fail("hardDelete", e);
  }
}
