"use server";

import { revalidatePath, updateTag } from "next/cache";
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
  patientPackInstances,
  patients,
  servicePacks,
  staffNotifications,
  users,
  type DbTx,
} from "@osteojp/db";
import { packServiceChangeRefusal } from "@/lib/packs/link-core";
import { verifyDeletePassword } from "@/lib/admin/appointment-delete-password";
import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { PATIENT_STATS_TAG } from "@/lib/patients/cache-tags";
import { clientIp } from "./actor";
import {
  batchSchedule,
  ClinicHoursRefused,
  PackBatchRefused,
  type BatchGuestLink,
  type BatchScheduleInput,
  type BatchScheduleResult,
} from "./batch";
import { writeAppointmentStatusChangedEvent } from "./analytics";
import { writeAppointmentAudit } from "./audit";
import { buildClonedAppointment } from "./clone-core";
import { blockingConflicts, findConflicts, findConflictsForWindow } from "./conflict";
import { checkAvailability } from "./availability-enforcement";
import { checkClinicClosure, checkClinicWindow } from "./clinic-closure-enforcement";
import { isLegalEstadoTransition } from "./estado-transitions";
import { correctionAsksSurvey, correctionEntersBlockingSet, isLegalEstadoCorrection } from "./estado-correction";
import { isUncancel } from "./uncancel";
import { uncancelOverdrawsPack } from "./uncancel-db";
import { cancelAuthority, namesSharedResource, ownCancelRefusal } from "./cancel-authority";
import {
  bookingLocationScope,
  isLocationBookable,
  resolveViewerLocationIds,
} from "@/lib/auth/viewer-locations";
import { sharedResourceLocationAllowed, type SharedResource } from "./shared-resource-guard";
import { listSharedResources, listSharedResourcesTx } from "./shared-resources";
import { secondParticipantCheck } from "./second-participant";
import {
  emitCancelledNotification,
  emitCareTeamAddedNotifications,
  emitConfirmedNotification,
  emitRescheduledNotification,
} from "@/lib/notifications/centre";
import { addBookedTherapistsToCareTeam } from "@/lib/admin/care-team-auto";
import { careTeamNotices, type CareTeamAddition } from "@/lib/admin/care-team-core";
import { getTherapistAvailability, type DayAvailability } from "./day-availability";
import { isValidInterval } from "./overlap";
import { expandRecurrence, toRRule } from "./recurrence";
import { getTherapistServiceIds } from "./therapist-services";
import { getTherapistLocationIds } from "./therapist-locations";
import { bookPackSessionTx } from "@/lib/packs/instances";
import {
  enqueueRemindersAfterCommit,
  enqueueStatusNotificationsAfterCommit,
  enqueueSurveyAfterCorrection,
  type ReminderEnqueueTarget,
  type StatusNotificationTarget,
} from "./reminders";
import { moveConfirmation } from "./move-confirmation";
import {
  BULK_ROLES,
  BULK_STATUSES,
  bulkAlreadySaved,
  bulkRowEligible,
  bulkSelfOverlap,
  bulkRowUnchanged,
  planBulkRow,
  sideOf,
  validBulkRequest,
  verdictOfRefusal,
  type BulkRequest,
  type BulkResult,
  type BulkRowResult,
  type BulkSourceRow,
} from "./bulk-reschedule-core";
import { acceptedPedidoTarget, unconfirmedPedidoIdsAmong } from "./pedido-acceptance";
import { acceptedGuestRequestTarget, guestLinkOccurrence, linkGuestRequestTx } from "./guest-link";
import { approvalNoticeAfterAccept, type ApprovalNotice } from "./book-confirm-notice";
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

/**
 * SCHED-17 - THE APP-LAYER REFUSAL THE NESA RULING SAYS THE DATABASE CANNOT MAKE.
 *
 * Creating or moving an appointment on a SHARED RESOURCE (NESA) is refused at a
 * location where the resource is not installed, or outside the actor's own
 * assigned locations. The rule is sharedResourceLocationAllowed; this reads the
 * two facts it needs. RLS cannot hold it alone: 0078's `created_by = auth.uid()`
 * arm admits any row a therapist stamps with their own id, at any location, and
 * the create path stamps exactly that. The NESA migration does not touch 0078.
 *
 * `resource` is returned so the therapist self-guard can admit a shared resource
 * the actor may book, which is the other half of the requirement: a CB therapist
 * CAN book the CB machine. Inert until the NESA migration is applied, because
 * there are no shared resources before then (see shared-resources.ts).
 *
 * Pass `tx` when already inside a transaction, so the read joins it.
 */
async function sharedResourceBookingCheck(
  actor: RequestContext,
  practitionerId: string,
  locationId: string,
  tx?: DbTx,
): Promise<{ ok: true; resource: SharedResource | null } | { ok: false }> {
  const resources = tx ? await listSharedResourcesTx(tx) : await listSharedResources(actor);
  const resource = resources.find((r) => r.id === practitionerId) ?? null;
  if (!resource) return { ok: true, resource: null };
  const allowed = sharedResourceLocationAllowed({
    role: actor.role,
    actorLocationIds: await resolveViewerLocationIds(actor),
    resource,
    targetLocationId: locationId,
  });
  return allowed ? { ok: true, resource } : { ok: false };
}

/**
 * EVERY APPOINTMENT MUTATION INVALIDATES THE AGENDA *AND* THE PATIENT STAT
 * STRIP. SR-25 as amended by the CONFIRM-01 dispatch.
 *
 * ==========================================================================
 * WHY THE STAT STRIP, WHICH IS ON A DIFFERENT PAGE
 * ==========================================================================
 * Three of its four numbers are computed from `appointments`, not from
 * `patients`: `seenThisMonth` counts completed appointments this month,
 * `withUpcoming` asks whether a future non-cancelled one exists, and
 * `inRecoveryWindow` is a last-completed date with no future booking. So
 * booking, cancelling, rescheduling or COMPLETING an appointment moves them,
 * and none of those paths goes through `revalidatePatient`.
 *
 * SR-25 named patient create and delete only, which left those three up to
 * sixty seconds behind. The dispatch that noticed it said the ruling
 * under-specified the invalidation rather than that the cache was wrong.
 *
 * ==========================================================================
 * A HELPER, BECAUSE EIGHT SCATTERED CALLS ARE EIGHT PLACES TO FORGET
 * ==========================================================================
 * `revalidatePath(AGENDA_PATH)` appeared at eight sites in this file and the
 * ninth was going to be added without the tag. This is the same argument
 * `revalidatePatient` in `lib/patients/actions.ts` already makes, and it is why
 * that helper exists at all.
 *
 * `updateTag`, NOT `revalidateTag`: the `revalidateTag(tag, "max")` form DEFERS,
 * and `app/admin/services/actions.ts` records what that cost - a just-created
 * pack stayed invisible in the booking drawer. A receptionist who completes a
 * consultation must see the count move on the next load.
 *
 * ==========================================================================
 * WHAT THIS CANNOT REACH, AND IT IS NOT A DEFECT IN THIS FILE
 * ==========================================================================
 * TWO PATHS ARE DELIBERATELY NOT COVERED, and neither is an oversight.
 *
 * 1. `apps/api` is a SEPARATE Vercel deployment with its OWN Next data cache, so
 *    a PORTAL booking cannot invalidate this app's tag - there is no shared
 *    channel to do it through. Closing that needs a cross-deployment
 *    invalidation mechanism, which is a decision rather than a line of code.
 *
 * 2. THE PUBLIC TOKEN REDEMPTION at `app/r/[token]/actions.ts` does NOT drop the
 *    tag, and this was tried and REVERTED rather than skipped. Next refuses
 *    `updateTag` outside a Server Action - "updateTag can only be called from
 *    within a Server Action" - and while `redeemAction` IS one in production, a
 *    throwing invalidation would sit AFTER the appointment had already been
 *    written. That turns a successful cancellation into an error page for a
 *    patient, on the one path in this codebase that must never fail loudly at
 *    them. Cache freshness is not worth that trade.
 *
 *    IT ALSO BUYS ALMOST NOTHING, which is what settles it. CONFIRM does not
 *    move any of the four numbers: `withUpcoming` counts future appointments
 *    NOT IN ('cancelled','no_show'), and both `scheduled` and `confirmed`
 *    qualify, so `agendada -> confirmada` changes nothing. Only CANCEL moves
 *    them, and only by up to sixty seconds, on numbers that describe the whole
 *    clinic rather than the viewer's own last action.
 */
function revalidateAppointmentSurfaces(): void {
  revalidatePath(AGENDA_PATH);
  updateTag(PATIENT_STATS_TAG);
}
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


/**
 * CARE-02c. Tell each therapist a booking has just put on a patient's care team
 * for the first time. Runs after commit, in its own `afterCommit` step at every
 * caller, so a reminder enqueue that throws cannot swallow it. The additions are
 * the rows the INSERT really wrote (care-team-auto.ts), which is what makes it
 * first time only; `careTeamNotices` drops the actor and folds one booking into
 * one notice per therapist.
 */
async function emitCareTeamNotices(
  actor: RequestContext,
  additions: readonly CareTeamAddition[],
): Promise<void> {
  if (additions.length === 0) return;
  await emitCareTeamAddedNotifications({
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    notices: careTeamNotices(additions, actor.userId),
    occurredAt: new Date(),
  });
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
 * APPT-EDIT-02: thrown inside moveAppointment's transaction when a
 * therapist's UPDATE finds the row no longer has the Terapeuta its guard
 * checked (reassigned between the read and the write). Throwing, not
 * returning, so the transaction rolls back every row and audit this save
 * already wrote; moveAppointment's catch turns it into the guard's own refusal.
 * Not exported: this file is "use server" and exports only actions.
 */
class TherapistChangeRace extends Error {
  constructor() {
    super("therapist_change_race");
    this.name = "TherapistChangeRace";
  }
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
  /** SCHED-29.2: read so a row re-entering a slot checks NESA in either role. */
  practitionerTwoId: string | null;
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

/**
 * R37. Each completed appointment's patient, so the completion can ask the
 * survey's canary list whether the 24 hour run may start
 * (lib/reminders/follow-up-start.ts). INSIDE the save's transaction, under RLS,
 * like every read here. `resolveSeries` is not widened for it, for the reason
 * `StaffTransitionFanOut` gives.
 *
 * NO CATCH, deliberately, unlike `readStaffTransitionFanOut`: a failed
 * statement aborts the Postgres transaction whatever JavaScript does with the
 * error, so swallowing it here would only hide why the save failed. The limit
 * is the number of ids asked: one row per appointment at most.
 */
async function readPatientIdsOf(tx: DbTx, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await tx
    .select({ id: appointments.id, patientId: appointments.patientId })
    .from(appointments)
    .where(inArray(appointments.id, ids))
    .limit(ids.length);
  return new Map(rows.map((r) => [r.id, r.patientId]));
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
      practitionerTwoId: appointments.practitionerTwoId,
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
    practitionerTwoId: target.practitionerTwoId,
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
      practitionerTwoId: appointments.practitionerTwoId,
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
  fixed: {
    practitionerId: string;
    /** SCHED-29.2: read by findConflicts only when it is a shared resource. */
    practitionerTwoId?: string | null;
    locationId: string;
    room: string | null;
  },
  excludeIds?: string[],
): Promise<ConflictInfo[]> {
  const conflicts: ConflictInfo[] = [];
  for (const w of windows) {
    const c = await findConflictsForWindow(tx, {
      practitionerId: fixed.practitionerId,
      practitionerTwoId: fixed.practitionerTwoId,
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
): Promise<ActionResult<{ id: string; notice?: ApprovalNotice }>> {
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
  // Kept, not recomputed: the guest-request link below asks the same scope
  // about the REQUEST's clinic.
  const locationScope = await bookingLocationScope(actor);
  if (!isLocationBookable(locationScope, input.locationId)) {
    return { ok: false, error: "location_not_assigned" };
  }
  // PL-10 (defense in depth): a therapist self-books ONLY. The create form hides
  // the Terapeuta selector and forces practitionerId = self, so a therapist
  // request naming a DIFFERENT practitioner did not come from the form — reject
  // it. Gated on role "therapist" ONLY: admin/reception/owner book on behalf of
  // any therapist, unchanged. RLS is untouched; this is an app-layer guard.
  //
  // SCHED-17: ONE exception, a shared resource (NESA) installed at one of the
  // therapist's own clinics - and first, for every role, the shared-resource
  // location rule itself.
  const shared = await sharedResourceBookingCheck(actor, input.practitionerId, input.locationId);
  if (!shared.ok) return { ok: false, error: "shared_resource_location" };
  if (actor.role === "therapist" && input.practitionerId !== actor.userId && !shared.resource) {
    return { ok: false, error: "forbidden" };
  }
  // SCHED-29: a therapist's "Terapeuta 2" is a shared resource (NESA) installed
  // at this clinic, never a person. Owner, admin and reception are unchanged.
  // Refused at the door, before any read of availability or conflicts.
  const second = await secondParticipantCheck(actor, {
    practitionerTwoId: input.practitionerTwoId,
    primaryId: input.practitionerId,
    locationId: input.locationId,
  });
  if (!second.ok) return { ok: false, error: second.error };
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
  // CARE-02c: the care-team rows this booking wrote, notified AFTER commit.
  let careTeamAdded: CareTeamAddition[] = [];
  // BOOK-CONFIRM: the occurrence a guest request was linked to, if any. A
  // holder, so the read after the transaction sees what the callback wrote.
  const guestLinked: { appointmentId: string | null } = { appointmentId: null };
  try {
    const result = await runScoped<ActionResult<{ id: string; notice?: ApprovalNotice }>>(
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

          // 0085 - THE CLINIC BEING SHUT, CHECKED IN THE SAME PLACE AND FOR
          // THE SAME REASON. Beside checkAvailability and OUTSIDE the
          // allowConflict gate below: the owner ruled the closure "not
          // blockable-around", and everything inside that gate is by
          // definition something "Guardar mesmo assim" can reach.
          //
          // Every occurrence, like the check above it: a recurring series whose
          // third week lands in the lunch hour is the same refusal with a later
          // date on it.
          const cl = await checkClinicClosure(tx, {
            locationId: input.locationId,
            startsAt: w.startsAt,
            endsAt: w.endsAt,
          });
          if (!cl.ok) {
            return {
              ok: false,
              error: "clinic_closed",
              clinicClosure: { locationName: cl.locationName, from: cl.from, to: cl.to },
            };
          }

          // AGENDA-2100 - AND THE CLINIC'S OWN DAY, beside the closure and for the
          // same reason. `closes_at` minus 60 minutes is the last start; before
          // `opens_at` is the other half of the same rule. Outside the allowConflict
          // gate, so "Guardar mesmo assim" cannot reach it.
          const cw = await checkClinicWindow(tx, {
            locationId: input.locationId,
            startsAt: w.startsAt,
          });
          if (!cw.ok) {
            return {
              ok: false,
              error: "outside_clinic_hours",
              clinicWindow: {
                reason: cw.reason,
                locationName: cw.locationName,
                opensAt: cw.opensAt,
                closesAt: cw.closesAt,
                latestStart: cw.latestStart,
              },
            };
          }
        }

        if (!input.allowConflict) {
          const conflicts = await collectConflicts(tx, occ, {
            practitionerId: input.practitionerId,
            practitionerTwoId: input.practitionerTwoId ?? null,
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
        // SCHED-29.2: Terapeuta 2 is locked too, so a booking naming NESA as
        // Terapeuta 2 serialises against one naming NESA as Terapeuta. For a
        // person it only orders writes, which changes no decision.
        const slotLocks = acquireSlotLocksForMany(
          actor.tenantId,
          occ.flatMap((o) =>
            [input.practitionerId, input.practitionerTwoId]
              .filter((p): p is string => !!p)
              .map((p) => ({ practitionerId: p, startsAt: o.startsAt, endsAt: o.endsAt })),
          ),
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

        // CARE-02c (sites 2 and 3, the first occurrence and the recurrence
        // children): every therapist on these rows joins every patient on them,
        // first time only, in THIS transaction and under THIS actor. Owner and
        // reception only, which is who 0091's insert policy admits; it never
        // fails the booking (care-team-auto.ts).
        careTeamAdded = await addBookedTherapistsToCareTeam(
          tx,
          actor,
          created.map((c) => c.id),
        );

        // ============================================================== //
        // BOOK-CONFIRM, THE PUBLIC-FORM PATH. S-1004-A, R40 (owner,
        // 2026-10-04): "public-form requests get linked to the appointment
        // reception books for them, and that link is the approval trigger."
        // ============================================================== //
        // When the drawer was opened from a converted guest request, the
        // request id rides the input. It is UNTRUSTED (it came from a URL), so
        // it is verified here, inside this transaction, and a value that does
        // not verify changes nothing and never fails the booking
        // (lib/scheduling/guest-link.ts says why).
        //
        // ONE occurrence is linked: the earliest. A series booked for a guest
        // is one answer to one request.
        const linkTarget = input.guestRequestId ? guestLinkOccurrence(created) : null;
        if (
          linkTarget &&
          (await linkGuestRequestTx(tx, actor, {
            guestRequestId: input.guestRequestId,
            patientId: input.patientId,
            appointmentId: linkTarget.id,
            locationScope,
          }))
        ) {
          guestLinked.appointmentId = linkTarget.id;
        }

        reminderTargets = created.map((c) =>
          // The LINKED occurrence carries the marker, and only it. The marker
          // asks the dispatch to read the link row; it decides nothing itself.
          c.id === guestLinked.appointmentId
            ? acceptedGuestRequestTarget(c.id, c.startsAt, input.practitionerId)
            : { appointmentId: c.id, startsAt: c.startsAt, practitionerId: input.practitionerId },
        );
        return { ok: true, data: { id: parent.id } };
      },
    );
    if (result.ok) {
      // Stream E: schedule reminders for the new appointment(s). Best-effort,
      // post-commit; safe with REMINDERS_LIVE_SEND off (sandbox downstream).
      await afterCommit("create", async () => {
        revalidateAppointmentSurfaces();
        // A linked request has just left reception's queue.
        if (guestLinked.appointmentId) revalidatePath("/notificacoes");
        await enqueueRemindersAfterCommit(actor.tenantId, reminderTargets);
      });
      await afterCommit("createCareTeam", () => emitCareTeamNotices(actor, careTeamAdded));
      // BOOK-CONFIRM: "Paciente sem email: avise por telefone", when nothing
      // can be sent to the guest. After the commit and never throwing, and only
      // for a booking that really was linked.
      const notice = await approvalNoticeAfterAccept(
        actor,
        guestLinked.appointmentId ? [guestLinked.appointmentId] : [],
      );
      if (notice) return { ok: true, data: { ...result.data, notice } };
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
  /**
   * BOOK-CONFIRM, the public-form path. The guest request this batch answers,
   * when the drawer was opened from a converted request's deep link. UNTRUSTED,
   * verified inside the batch's transaction exactly as `createAppointment`
   * verifies it; a value that does not verify changes nothing.
   */
  opts?: { guestRequestId?: string | null },
): Promise<ActionResult<BatchScheduleResult & { notice?: ApprovalNotice }>> {
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
  const locationScope = await bookingLocationScope(actor);
  if (!isLocationBookable(locationScope, input.locationId)) {
    return { ok: false, error: "location_not_assigned" };
  }
  // PL-10 (defense in depth): the "Agendar lote" path is also a create form —
  // a self-locked therapist may only batch-book their OWN calendar. Same guard,
  // same role gate as createAppointment; admin/reception/owner unaffected.
  //
  // SCHED-17: the same shared-resource rule and the same one exception as single
  // booking. Missing either here would leave Agendar lote refusing what Nova
  // marcação allows, or allowing what it refuses.
  const shared = await sharedResourceBookingCheck(actor, input.practitionerId, input.locationId);
  if (!shared.ok) return { ok: false, error: "shared_resource_location" };
  if (actor.role === "therapist" && input.practitionerId !== actor.userId && !shared.resource) {
    return { ok: false, error: "forbidden" };
  }
  try {
    const guestLink: BatchGuestLink = {
      guestRequestId: opts?.guestRequestId ?? null,
      locationScope,
      linkedAppointmentId: null,
    };
    const result = await batchSchedule(actor, input, guestLink);
    /**
     * OBS-05 — THE BATCH PATH NOW EMITS, AND IT IS THE FOURTH CREATION PATH TO
     * DO SO RATHER THAN THE FIRST TO NEED IT.
     *
     * `batchSchedule` commits real appointment rows and this action returned
     * without ever reaching Stream E, so no `appointment/scheduled` event was
     * emitted, no reminder run was ever created, and the patient got neither the
     * 48h email nor the 24h SMS. Nothing failed anywhere: there was no run to
     * fail. It is the same omission shape as the portal booking path
     * (W14-portal-bookings-emit-no-reminder-events), reached through a third
     * door, which is why this batch also lands the gate that makes a fourth one
     * impossible to add silently - see creation-paths-emit-reminders.test.ts.
     *
     * IT MOVES INSIDE `afterCommit`, WITH THE REVALIDATE, AND THAT IS PART OF
     * THE FIX RATHER THAN TIDYING. The rows are already durable by this line.
     * `enqueueRemindersAfterCommit` THROWS ReminderBurstError above its
     * occurrence ceiling, and the revalidate can throw too; either one landing
     * in the catch below would return `fail(...)` for appointments that exist.
     * At the desk that reads as "it did not save", and the natural next action
     * is to book the whole batch again. `afterCommit` is the helper the other
     * five mutations already use for exactly this, and the batch path was the
     * one that never got it.
     *
     * ONLY WHAT WAS ACTUALLY BOOKED. `result.booked` excludes every slot that
     * failed on availability, so a partial-success batch enqueues reminders for
     * its successes and nothing for its refusals.
     */
    await afterCommit("batchSchedule", async () => {
      revalidateAppointmentSurfaces();
      await enqueueRemindersAfterCommit(
        actor.tenantId,
        result.booked.map((b) =>
          // `BatchBooked.startsAt` is an ISO string (it crosses the server-action
          // boundary to the client); the enqueue takes the instant.
          //
          // BOOK-CONFIRM: the ONE occurrence a guest request was linked to
          // carries the marker; every other target is what it always was.
          b.appointmentId === guestLink.linkedAppointmentId
            ? acceptedGuestRequestTarget(b.appointmentId, new Date(b.startsAt), input.practitionerId)
            : {
                appointmentId: b.appointmentId,
                startsAt: new Date(b.startsAt),
                practitionerId: input.practitionerId,
              },
        ),
      );
      if (guestLink.linkedAppointmentId) revalidatePath("/notificacoes");
    });
    const notice = await approvalNoticeAfterAccept(
      actor,
      guestLink.linkedAppointmentId ? [guestLink.linkedAppointmentId] : [],
    );
    return { ok: true, data: notice ? { ...result, notice } : result };
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
    // AGENDA-2100: the batch asked for an hour the clinic is not open for.
    // Mapped by INSTANCE like the refusal below it, and it carries the payload
    // so Agendar lote can name the clinic and the last start it accepts.
    if (e instanceof ClinicHoursRefused) {
      return { ok: false, error: "outside_clinic_hours", clinicWindow: e.window };
    }
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
 * SCHED-15 — THIS ACTION NOW PAYS AVAILABILITY AND CONFLICT CHECKING, AND THE
 * PARAGRAPH IT REPLACES IS QUOTED BECAUSE THE DECISION IT RECORDED IS NOT BEING
 * REVERSED, ONLY SPLIT IN TWO:
 *
 *   "this action does NOT enforce availability — the UI surfaces availability
 *    and the clinic may deliberately book over a busy slot, so the clone is
 *    created unconditionally at the requested start."
 *
 * The clinic MAY still deliberately book over a busy slot: `allowConflict` is
 * the same override `createAppointment` gives the drawer's "Guardar mesmo
 * assim", and pressing it books the clone exactly as before. What is no longer
 * true is that the check is SKIPPED — the old shape did not offer the override,
 * it simply never asked, so a clone landed on top of another patient's visit
 * with nothing on screen. RB-03's split is the one this now follows:
 *
 *   AVAILABILITY is HARD. Outside the therapist's disponibilidade is refused
 *   and `allowConflict` does not reach it, because a therapist who genuinely
 *   works late is expressed by extending their hours, not by pressing past a
 *   check. This is the defect RB-03 was written for, arriving through the one
 *   create path that had no such check.
 *
 *   A DOUBLE BOOKING is ADVISORY. It is surfaced, and reception decides.
 *
 * Availability is still ALSO in the read-only query the UI consumes; that stays
 * the courtesy and this is the deliverable (the STAFF-02 argument, same shape).
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
  /**
   * SCHED-15. "Guardar mesmo assim" — the caller has SEEN the conflicts and is
   * booking anyway. Never reaches the availability check (see the doc above).
   */
  allowConflict = false,
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
  // CARE-02c: the care-team rows this clone wrote, notified AFTER commit.
  let careTeamAdded: CareTeamAddition[] = [];
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
        // SCHED-17: Marcar novamente creates an appointment too, on the source's
        // practitioner and location. A NESA copy is held to the create rule.
        const shared = await sharedResourceBookingCheck(
          actor,
          source.practitionerId,
          source.locationId,
          tx,
        );
        if (!shared.ok) return { ok: false, error: "shared_resource_location" };
        // SCHED-29: a clone COPIES the source's second participant, so a
        // therapist's "Marcar novamente" is held to the same rule as their
        // create - otherwise it would be the door that still writes a person.
        const second = await secondParticipantCheck(
          actor,
          {
            practitionerTwoId: source.practitionerTwoId,
            primaryId: source.practitionerId,
            locationId: source.locationId,
          },
          tx,
        );
        if (!second.ok) return { ok: false, error: second.error };

        const values = buildClonedAppointment(source, newStart, {
          tenantId: actor.tenantId,
          userId: actor.userId,
        });
        // Defensive: the duration comes from an already-valid stored row, so this
        // only trips on a corrupt source or a NaN start slipping the guard above.
        if (!isValidInterval(values.startsAt, values.endsAt)) {
          return { ok: false, error: "validation" };
        }

        // ============================================================= //
        // SCHED-15 — THE SAME CHECKS `createAppointment` PAYS, IN THE SAME
        // ORDER, ON THE SAME HELPERS.
        // ============================================================= //
        // Deliberately AFTER buildClonedAppointment: the practitioner, the
        // location and the derived window are the CLONE's, read from the
        // source, and there is no door-side value to check them on — the same
        // honest exception the STAFF-02 location guard states above.
        //
        // Availability first and outside the `allowConflict` gate, per RB-03.
        const av = await checkAvailability(tx, {
          practitionerId: values.practitionerId,
          locationId: values.locationId,
          startsAt: values.startsAt,
          endsAt: values.endsAt,
        });
        if (!av.ok) {
          return {
            ok: false,
            error: "outside_availability",
            availabilityWindows: av.windows,
          };
        }

        // 0085 - THE CLINIC BEING SHUT, and this was the one create path
        // without it. createAppointment and rescheduleAppointment refused the
        // closed hour; a Marcar novamente into CB 13:00-14:00 was simply
        // written (reproduced on the purple lane with 0085 applied, recorded
        // on the MIG-0085 card). Same helper, same place: beside availability
        // and OUTSIDE the `allowConflict` gate below, because the closure is
        // "not blockable-around" and "Marcar mesmo assim" is exactly the
        // override that must not reach it.
        //
        // On the CLONE's location and window. The source's own window is in
        // the past and says nothing about whether the new one is open.
        const cl = await checkClinicClosure(tx, {
          locationId: values.locationId,
          startsAt: values.startsAt,
          endsAt: values.endsAt,
        });
        if (!cl.ok) {
          return {
            ok: false,
            error: "clinic_closed",
            clinicClosure: { locationName: cl.locationName, from: cl.from, to: cl.to },
          };
        }

        // AGENDA-2100 - AND THE CLINIC'S OWN DAY, beside the closure and for the
        // same reason. `closes_at` minus 60 minutes is the last start; before
        // `opens_at` is the other half of the same rule. Outside the allowConflict
        // gate, so "Guardar mesmo assim" cannot reach it.
        const cw = await checkClinicWindow(tx, {
          locationId: values.locationId,
          startsAt: values.startsAt,
        });
        if (!cw.ok) {
          return {
            ok: false,
            error: "outside_clinic_hours",
            clinicWindow: {
              reason: cw.reason,
              locationName: cw.locationName,
              opensAt: cw.opensAt,
              closesAt: cw.closesAt,
              latestStart: cw.latestStart,
            },
          };
        }

        if (!allowConflict) {
          // `room` is null on every clone (clone-core drops it), so a room
          // conflict is unreachable here by construction — this finds the
          // practitioner and patient collisions, which are the ones a
          // schedule-again can actually cause.
          const conflicts = await collectConflicts(
            tx,
            [{ startsAt: values.startsAt, endsAt: values.endsAt }],
            {
              practitionerId: values.practitionerId,
              // SCHED-29.2: the clone copies Terapeuta 2, so NESA there holds
              // the new hour exactly as on a fresh booking.
              practitionerTwoId: values.practitionerTwoId,
              locationId: values.locationId,
              room: values.room,
            },
          );
          if (conflicts.length > 0) {
            return { ok: false, error: "conflict", conflicts };
          }
        }

        // 2.9 — same slot lock as the create path. A clone lands a real
        // appointment in a real slot and races exactly like a fresh booking.
        // SCHED-29.2: and Terapeuta 2's slot, which the clone copies.
        const cloneLocks = acquireSlotLocksForMany(
          actor.tenantId,
          [values.practitionerId, values.practitionerTwoId]
            .filter((p): p is string => !!p)
            .map((p) => ({ practitionerId: p, startsAt: values.startsAt, endsAt: values.endsAt })),
        );
        if (cloneLocks) await tx.execute(cloneLocks);

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

        // CARE-02c (site 4, Marcar novamente): the clone is a real booking, so
        // its therapists join its patients' care teams exactly as a fresh
        // booking's do. Usually a no-op, since the source's booking already
        // added them; it is not one for a source older than this feature.
        careTeamAdded = await addBookedTherapistsToCareTeam(tx, actor, [created.id]);

        reminderTargets = [
          { appointmentId: created.id, startsAt: values.startsAt, practitionerId: values.practitionerId },
        ];
        return { ok: true, data: { id: created.id } };
      },
    );
    if (result.ok) {
      // A clone is a real new appointment: schedule its reminders like any other
      // creation. Best-effort, post-commit; safe with REMINDERS_LIVE_SEND off.
      await afterCommit("clone", async () => {
        revalidateAppointmentSurfaces();
        await enqueueRemindersAfterCommit(actor.tenantId, reminderTargets);
      });
      await afterCommit("cloneCareTeam", () => emitCareTeamNotices(actor, careTeamAdded));
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
): Promise<ActionResult<{ id: string; notice?: ApprovalNotice }>> {
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
  // SCHED-30: a therapist's clinics, read before the transaction as STAFF-02
  // reads them. Only a status patch can bring a row back, so only then.
  const ownCancelScope =
    patch.status && cancelAuthority(actor.role) === "own"
      ? { locations: await bookingLocationScope(actor) }
      : null;

  const ip = await clientIp();
  // Captured inside the tx, emitted AFTER commit (network out of the tx).
  let statusTargets: StatusNotificationTarget[] = [];
  // W14-02: the portal pedidos this patch ACCEPTS. Same capture-then-emit shape.
  let reminderTargets: ReminderEnqueueTarget[] = [];
  // BOOK-CONFIRM: the ids of those accepted pedidos, for the approver's notice.
  // A holder object, so the read after the transaction sees what the callback
  // wrote (a bare `let` assigned in a closure narrows back to its initialiser).
  const acceptedForNotice: { ids: string[] } = { ids: [] };
  try {
    const result = await runScoped<ActionResult<{ id: string; notice?: ApprovalNotice }>>(
      actor,
      async (tx) => {
        const affected = await resolveSeries(tx, id, scope);
        if (!affected || affected.length === 0) {
          return { ok: false, error: "not_found" };
        }
        const ids = affected.map((a) => a.id);

        // The is_unconfirmed_pedido answer for `ids`, read at most once. Both the
        // conflict check (INC-08 (b)) and the acceptance emit (W14-02) need it,
        // and both need it BEFORE the UPDATE, while the rows are still
        // `scheduled` - afterwards the function answers false for every row.
        let probedPedidoIds: Set<string> | null = null;
        const unconfirmedPedidoIds = async (): Promise<Set<string>> => {
          if (probedPedidoIds) return probedPedidoIds;
          const pedidoRows = (await tx.execute(sql`
            SELECT a.id::text AS id
              FROM public.appointments a
             WHERE a.id IN (${sql.join(
               ids.map((i) => sql`${i}::uuid`),
               sql`, `,
             )})
               AND public.is_unconfirmed_pedido(a.id)
          `)) as unknown;
          probedPedidoIds = new Set(
            (Array.isArray(pedidoRows)
              ? pedidoRows
              : ((pedidoRows as { rows?: unknown[] }).rows ?? [])
            ).map((r) => (r as { id: string }).id),
          );
          return probedPedidoIds;
        };

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

        // ==============================================================
        // SCHED-27 — BRINGING A CANCELADA BACK. Owner approval 2026-09-13:
        // Cancelada -> Agendada | Confirmada through this control, for the
        // people who can cancel, and a future one gets its reminders again.
        //
        // WHY EACH CHECK IS HERE, and none is decoration:
        //   - ROLE. The Estado control is appointments:write, which a therapist
        //     holds; un-cancelling is the inverse of cancelling, which is
        //     appointments:delete. Without this a therapist could undo reception.
        //   - CLINIC CLOSURE (0085) and NESA LOCATION (SCHED-17). The row goes
        //     back into a slot; both rules guard slots and neither is
        //     blockable-around, so they sit OUTSIDE the allowConflict gate, as on
        //     create and reschedule.
        //   - PACOTE. A cancelled row stopped using its session; bringing it back
        //     uses it again and must fit in what the instance has left.
        // The CONFLICT check for these rows is INC-08 (b) below, which now runs
        // for a row leaving Cancelada as well as for an unconfirmed pedido.
        // ==============================================================
        const uncancelling = patch.status
          ? affected.filter((a) => isUncancel(a.status, patch.status!))
          : [];
        if (uncancelling.length > 0) {
          // SCHED-30 (owner dispatch 2026-09-14) replaced the appointments:delete
          // assertion. Owner, admin and reception are unchanged. A therapist may
          // bring a row back where they are Terapeuta or Terapeuta 2, at one of
          // their clinics (cancel-authority.ts), and every check below still
          // runs for them.
          if (cancelAuthority(actor.role) === "none") return { ok: false, error: "forbidden" };
          if (cancelAuthority(actor.role) === "own") {
            // Read before the transaction. `locations: null` is STAFF-02's
            // unassigned fallback and means unrestricted; a missing read (which a
            // status patch cannot produce) refuses every clinic instead.
            const refusal = ownCancelRefusal(
              actor.userId,
              ownCancelScope ? ownCancelScope.locations : [],
              uncancelling,
            );
            if (refusal) return { ok: false, error: refusal };
            // THE NESA HOLE, closed by refusal rather than accepted. The conflict
            // check reads a shared resource's Terapeuta 2 rows under the caller's
            // RLS, and a therapist sees a colleague's such row only once 0088 is
            // applied. An un-cancel the check cannot fully see is the double
            // booking the owner named, so it is refused and left to reception.
            const sharedIds = new Set((await listSharedResourcesTx(tx)).map((r) => r.id));
            if (namesSharedResource(uncancelling, sharedIds)) {
              return { ok: false, error: "uncancel_shared_resource" };
            }
          }
          for (const a of uncancelling) {
            const cl = await checkClinicClosure(tx, {
              locationId: a.locationId,
              startsAt: a.startsAt,
              endsAt: a.endsAt,
            });
            if (!cl.ok) {
              return {
                ok: false,
                error: "clinic_closed",
                clinicClosure: { locationName: cl.locationName, from: cl.from, to: cl.to },
              };
            }

            // AGENDA-2100 - AND THE CLINIC'S OWN DAY, beside the closure and for the
            // same reason. `closes_at` minus 60 minutes is the last start; before
            // `opens_at` is the other half of the same rule. Outside the allowConflict
            // gate, so "Guardar mesmo assim" cannot reach it.
            const cw = await checkClinicWindow(tx, {
              locationId: a.locationId,
              startsAt: a.startsAt,
            });
            if (!cw.ok) {
              return {
                ok: false,
                error: "outside_clinic_hours",
                clinicWindow: {
                  reason: cw.reason,
                  locationName: cw.locationName,
                  opensAt: cw.opensAt,
                  closesAt: cw.closesAt,
                  latestStart: cw.latestStart,
                },
              };
            }
            const shared = await sharedResourceBookingCheck(actor, a.practitionerId, a.locationId, tx);
            if (!shared.ok) return { ok: false, error: "shared_resource_location" };
          }
          if (await uncancelOverdrawsPack(tx, uncancelling.map((a) => a.id))) {
            return { ok: false, error: "pack_insufficient" };
          }
        }

        // ==============================================================
        // PACK-03 — A PACOTE BINDS TO ONE SERVICE, AND THIS IS THE HALF
        // THAT WAS MISSING. Owner ruling: ten NESA sessions are spendable
        // on NESA only, no cross-service mixing.
        //
        // `link-core.ts` has refused `service_mismatch` since PACK-01, but
        // only in the direction of attaching a pacote to an appointment.
        // The reverse was unguarded: line 1053 below wrote `set.serviceId`
        // from the patch with no reference to `pack_instance_id` at all. So
        // an appointment already drawing a NESA session could be edited to
        // Fisioterapia and saved, keeping its link — and the derived balance
        // (sessionsTotal - legacyConsumed - linked appointments) went on
        // counting it. Ten NESA sessions, spendable on anything, one edit at
        // a time.
        //
        // IT IS ENFORCED HERE AND NOT ONLY IN THE DRAWER, for the same
        // reason INC-08 moved the Estado map to the server: the drawer's
        // disabled Select is a courtesy that arrives a fetch late and is
        // absent entirely from a stale tab, and one caller guarding while
        // another does not is indistinguishable, from the database's point
        // of view, from nobody guarding.
        //
        // READ INSIDE THE TRANSACTION, so it cannot race a concurrent link.
        // ==============================================================
        if ("serviceId" in patch) {
          const linked = await tx
            .select({
              id: appointments.id,
              packInstanceId: appointments.packInstanceId,
              packBaseServiceId: servicePacks.baseServiceId,
            })
            .from(appointments)
            .leftJoin(
              patientPackInstances,
              eq(appointments.packInstanceId, patientPackInstances.id),
            )
            .leftJoin(servicePacks, eq(patientPackInstances.packId, servicePacks.id))
            .where(inArray(appointments.id, ids));

          const refusal = packServiceChangeRefusal(patch.serviceId ?? null, linked);
          if (refusal) {
            return { ok: false, error: "pack_service_locked" };
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
        // SCHED-30: a THERAPIST bringing a row back is checked whatever
        // allowConflict says. The owner's rule is that an un-cancel into a slot
        // taken since is refused; "Guardar mesmo assim" stays with owner, admin
        // and reception, who keep the rule stated above.
        const overrideAllowed = !(uncancelling.length > 0 && cancelAuthority(actor.role) === "own");
        if (patch.status && (!opts?.allowConflict || !overrideAllowed)) {
          const NON_BLOCKING_STATUS = new Set(["cancelled", "no_show"]);
          const willBlock = !NON_BLOCKING_STATUS.has(patch.status);
          // Only a row at `scheduled` can be an unconfirmed pedido — 0059:145
          // requires it — so a series with none cannot contain one, and the
          // probe below would be a guaranteed-empty round trip. Skipping it
          // matters: `confirmed -> completed` is what reception does to every
          // appointment of every day, and it can never enter the blocking set.
          const anyScheduled = affected.some((a) => a.status === "scheduled");
          // SCHED-27: a row leaving Cancelada re-enters the blocking set too.
          // The `entering` filter below has always counted such a row; this
          // gate never let it get there, because no legal move left Cancelada
          // when the shortcut was written. Measured 2026-09-12: without it an
          // un-cancel onto a slot booked since was accepted.
          const anyReleased = affected.some((a) => NON_BLOCKING_STATUS.has(a.status));
          if (willBlock && (anyScheduled || anyReleased)) {
            // The pedido probe is only meaningful for `scheduled` rows (0059:145).
            const pedidoIds = anyScheduled ? await unconfirmedPedidoIds() : new Set<string>();

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
              // SCHED-29.2: Terapeuta 2's slot too, so NESA in either role serialises.
              const locks = acquireSlotLocksForMany(
                actor.tenantId,
                entering.flatMap((a) =>
                  [a.practitionerId, a.practitionerTwoId]
                    .filter((p): p is string => !!p)
                    .map((p) => ({ practitionerId: p, startsAt: a.startsAt, endsAt: a.endsAt })),
                ),
              );
              if (locks) await tx.execute(locks);
            }

            const conflicts: ConflictInfo[] = [];
            for (const a of entering) {
              const c = await findConflictsForWindow(tx, {
                practitionerId: a.practitionerId,
                practitionerTwoId: a.practitionerTwoId,
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
                ...(overrideAllowed ? {} : { conflictOverridable: false as const }),
              };
            }
          }
        }

        // ==============================================================
        // W14-02 — CONFIRMING AN UNACCEPTED PORTAL PEDIDO HERE IS ACCEPTING
        // IT, AND IT EMITS EXACTLY AS confirmAppointmentRequest DOES. Owner
        // ruling 2026-09-10 (M2 Option A).
        //
        // Reception can accept a pedido from Pedidos (confirmAppointmentRequest,
        // which has emitted since #1085) OR by moving its Estado to Confirmada in
        // the drawer, which is this function - and this function emitted nothing
        // for a confirmation. The pedido became a confirmed appointment with no
        // run behind it: no confirmation, no 48h email, no 24h SMS.
        //
        // ONLY UNACCEPTED PEDIDOS. A staff booking already has its run, and a
        // second appointment/scheduled at an unchanged start would cancel it
        // (see lib/scheduling/pedido-acceptance.ts; since 2026-10-07 a
        // replacement run starts, so nothing is lost, but nothing is needed
        // either). Read BEFORE the UPDATE and
        // regardless of allowConflict: "Guardar mesmo assim" overrides a
        // conflict warning, not the acceptance.
        // ==============================================================
        let acceptedPedidos: SeriesMember[] = [];
        if (patch.status === "confirmed" && affected.some((a) => a.status === "scheduled")) {
          const pedidoIds = await unconfirmedPedidoIds();
          acceptedPedidos = affected.filter((a) => a.status === "scheduled" && pedidoIds.has(a.id));
        }

        // Only run the column update when there is a column to change; a
        // notes-only edit (W12-13) touches no `appointments` column.
        if (Object.keys(set).length > 0) {
          await tx
            .update(appointments)
            .set(set)
            .where(inArray(appointments.id, ids)); // RLS scopes tenant
        }

        // SCHED-27: a patient's "declined" confirmation would keep a row that
        // was brought back reading Cancelada, because deriveEstado lets the
        // decline win over a non-terminal status (estado.ts). Reset to pending
        // on exactly the rows being brought back. Nothing writes "declined"
        // today (only the schema and 0024/0063 name it), so this is defensive,
        // and it is scoped so it can never touch a row this patch did not move.
        if (uncancelling.length > 0) {
          await tx
            .update(appointments)
            .set({ confirmationState: "pending" })
            .where(
              and(
                inArray(appointments.id, uncancelling.map((a) => a.id)),
                eq(appointments.confirmationState, "declined"),
              ),
            );
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
              // SCHED-30: an override the server did not honour is not recorded
              // as one.
              allowConflict: !!opts?.allowConflict && overrideAllowed,
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
          // R37: a completion carries each row's patient, for the canary list
          // the follow-up run's start is decided against. A no-show does not
          // need it and does not read it.
          const patientOf =
            patch.status === "completed"
              ? await readPatientIdsOf(tx, affected.map((a) => a.id))
              : new Map<string, string>();
          statusTargets = affected.map((a) => ({
            appointmentId: a.id,
            endsAt: a.endsAt,
            patientId: patientOf.get(a.id) ?? null,
          }));
        }

        // W14-02's accepted pedidos, plus SCHED-27: a FUTURE appointment brought
        // back from Cancelada emits appointment/scheduled so its reminders exist
        // again (owner, 2026-09-13). A past one is left out on purpose: its
        // offsets have passed and it would fire nothing, which the owner ruled
        // is expected, not a defect.
        const nowMs = Date.now();
        // A ROW BROUGHT BACK AS AN UNACCEPTED PEDIDO EMITS NOTHING. A portal
        // request returned to Agendada is waiting for reception again; an event
        // for it could send nothing and would spend the idempotency keys its
        // acceptance needs (lib/scheduling/pedido-acceptance.ts,
        // `unconfirmedPedidoIdsAmong`). Its acceptance emits instead.
        //
        // READ AFTER THE UPDATE, unlike the acceptance probe above, and that is
        // not an oversight: before the write these rows are `cancelled`, so
        // is_unconfirmed_pedido answers false for all of them. The question is
        // what they have BECOME, and the function reads this transaction's own
        // write. Only `scheduled` can be a pedido, so nothing is asked when the
        // row is brought back straight to Confirmada, which emits as before.
        const backAsPedido =
          patch.status === "scheduled"
            ? await unconfirmedPedidoIdsAmong(tx, uncancelling.map((a) => a.id))
            : new Set<string>();
        acceptedForNotice.ids = acceptedPedidos.map((a) => a.id);
        reminderTargets = [
          // BOOK-CONFIRM: an ACCEPTANCE carries the marker. The rows brought
          // back from Cancelada below do not, and keep today's confirmation.
          ...acceptedPedidos.map((a) => acceptedPedidoTarget(a.id, a.startsAt, a.practitionerId)),
          // Q-K rule 3: brought back to Confirmada keeps today's confirmation,
          // so these carry no `confirmation` field.
          ...uncancelling
            .filter((a) => a.startsAt.getTime() > nowMs)
            .filter((a) => !backAsPedido.has(a.id))
            .map((a) => ({
              appointmentId: a.id,
              startsAt: a.startsAt,
              practitionerId: a.practitionerId,
              ...(patch.status ? { status: patch.status } : {}),
            })),
        ];
        return { ok: true, data: { id } };
      },
    );
    if (result.ok) {
      await afterCommit("update", async () => {
        revalidateAppointmentSurfaces();
        if (
          (patch.status === "completed" || patch.status === "no_show") &&
          statusTargets.length > 0
        ) {
          await enqueueStatusNotificationsAfterCommit(actor.tenantId, statusTargets, patch.status);
        }
        // W14-02: the accepted pedidos' confirmation and reminders, post-commit.
        if (reminderTargets.length > 0) {
          await enqueueRemindersAfterCommit(actor.tenantId, reminderTargets);
        }
      });
      // BOOK-CONFIRM: "Paciente sem email: avise por telefone". After the
      // commit and never throwing, so it cannot fail the save it follows.
      const notice = await approvalNoticeAfterAccept(actor, acceptedForNotice.ids);
      if (notice) return { ok: true, data: { ...result.data, notice } };
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

  const ip = await clientIp();
  const moved = await moveAppointment(actor, ip, id, input, "apply");
  if (moved.result.ok) {
    // Stream E: re-enqueue at the NEW time. The new appointment/scheduled event
    // supersedes the prior sleeping run (cancelOn on appointment id), so the old
    // time never fires. Best-effort, post-commit.
    await afterCommit("reschedule", async () => {
      revalidateAppointmentSurfaces();
      revalidatePath("/notificacoes");
      await enqueueRemindersAfterCommit(actor.tenantId, moved.reminderTargets);
      await emitRescheduledFanOut(actor, moved.rescheduleFanOut);
    });
    // The fan-out above reads the PRE-update practitioners, so the NEW
    // Terapeuta is not among its recipients. This is the one notice they get.
    await afterCommit("rescheduleCareTeam", () => emitCareTeamNotices(actor, moved.careTeamAdded));
  }
  return moved.result;
}

/**
 * APPT-BULK-01: what one move produced, for the post-commit step. The three
 * lists are filled only when the move committed.
 */
type MoveOutcome = {
  result: ActionResult<{ id: string }>;
  reminderTargets: ReminderEnqueueTarget[];
  rescheduleFanOut: Array<StaffTransitionFanOut & { newStartsAt: Date }>;
  careTeamAdded: CareTeamAddition[];
};

/**
 * THE ONE MOVE, shared by `rescheduleAppointment` (the agenda's edit panel,
 * the ficha) and `bulkRescheduleAppointments` (the ficha's "Alterar várias
 * marcações"). APPT-BULK-01 moved the body here UNCHANGED, so a bulk change
 * runs every check a single move runs, in the same order, and writes exactly
 * what a single move writes: one update, one `appointment.reschedule` audit
 * row with the same metadata, the care-team join, and the reminder targets
 * and staff notices handed back for the door's ONE post-commit step.
 *
 * `mode: "preview"` runs every check up to and including the conflict list,
 * then returns BEFORE the slot lock and before any write, so a preview writes
 * nothing. What a preview cannot see is what only a write can raise: the
 * double-confirmed constraint (0061) and the RLS WITH CHECK. An apply still
 * meets both.
 *
 * THE POST-COMMIT STEP STAYS IN EACH DOOR, in its own exported body: the
 * reminder call, the "remarcada" notices and the care-team notices. Each
 * door makes ONE reminder call per action, and the scanners that list every
 * emitter of appointment/scheduled (lib/reminders/*.test.ts) read it there.
 *
 * NOT EXPORTED, ON PURPOSE: this file is "use server", and an exported
 * function is a server action any client can call with any arguments.
 */
/**
 * APPT-BULK-01, the bulk change's two extras, both absent on a single move.
 *   expect          the row as the bulk change last saw it: this patient, one
 *                   of these statuses, this start. Re-read INSIDE the row's
 *                   transaction; a row that changed since answers not_found
 *                   and is left alone (a retried save cannot shift it twice,
 *                   and a visit cancelled since is not moved).
 *   previewVacated  PREVIEW ONLY: the other selected rows that this action
 *                   will have moved away before this one, so a preview of a
 *                   shift by N days does not report the series in its own
 *                   way. An apply never reads it: it meets the database as
 *                   it then stands, after those rows have really moved.
 */
type MoveExtras = {
  expect?: { patientId: string; statuses: ReadonlySet<string>; startsAt: Date };
  previewVacated?: readonly string[];
};

async function moveAppointment(
  actor: RequestContext,
  ip: string | null,
  id: string,
  input: RescheduleInput,
  mode: "preview" | "apply",
  extras: MoveExtras = {},
): Promise<MoveOutcome> {
  const outcome = (result: ActionResult<{ id: string }>): MoveOutcome => ({
    result,
    reminderTargets,
    rescheduleFanOut,
    careTeamAdded,
  });
  // Captured inside the tx, enqueued AFTER commit (network out of the tx).
  let reminderTargets: ReminderEnqueueTarget[] = [];
  let rescheduleFanOut: Array<StaffTransitionFanOut & { newStartsAt: Date }> = [];
  // CARE-02c: care-team rows written because the Terapeuta changed.
  let careTeamAdded: CareTeamAddition[] = [];

  if (!id || !input.practitionerId || !input.locationId) {
    return outcome({ ok: false, error: "validation" });
  }
  // STAFF-02: a reschedule carries a locationId and can therefore MOVE an
  // appointment into an unassigned clinic. Guarded on the DESTINATION, which is
  // the only location this call can create a booking at.
  if (!isLocationBookable(await bookingLocationScope(actor), input.locationId)) {
    return outcome({ ok: false, error: "location_not_assigned" });
  }
  // SCHED-17: MOVING a shared-resource appointment is held to the same rule as
  // creating one - the ruling names both. The therapist rule for a move is
  // not the create rule: see APPT-EDIT-02 inside the transaction below.
  const shared = await sharedResourceBookingCheck(actor, input.practitionerId, input.locationId);
  if (!shared.ok) return outcome({ ok: false, error: "shared_resource_location" });
  const inStart = new Date(input.startsAt);
  const inEnd = new Date(input.endsAt);
  if (!isValidInterval(inStart, inEnd)) {
    return outcome({ ok: false, error: "validation" });
  }
  const scope: SeriesScope = input.scope ?? "one";

  try {
    const result = await runScoped<ActionResult<{ id: string }>>(
      actor,
      async (tx) => {
        const affected = await resolveSeries(tx, id, scope);
        if (!affected || affected.length === 0) {
          return { ok: false, error: "not_found" };
        }
        // APPT-BULK-01: is the row still as the bulk change saw it? Read here
        // WITHOUT a lock (a preview takes none), and again with the row lock
        // after the slot lock, below, before an apply writes.
        const stillAsSeen = async (lock: boolean): Promise<boolean> => {
          if (!extras.expect) return true;
          const q = tx
            .select({
              patientId: appointments.patientId,
              status: appointments.status,
              startsAt: appointments.startsAt,
            })
            .from(appointments)
            .where(eq(appointments.id, id));
          const [now] = await (lock ? q.for("update").limit(1) : q.limit(1));
          return (
            !!now &&
            now.patientId === extras.expect.patientId &&
            extras.expect.statuses.has(now.status) &&
            now.startsAt.getTime() === extras.expect.startsAt.getTime()
          );
        };
        if (!(await stillAsSeen(false))) return { ok: false, error: "not_found" };
        const ids = affected.map((a) => a.id);

        // APPT-EDIT-02 - A THERAPIST KEEPS THEIR OWN VISITS. Owner ruling
        // 2026-10-31: "A therapist may NOT change the therapist of a visit;
        // reception does it." So for role therapist every row this save moves
        // must already carry the Terapeuta it sends; the date, the hour and the
        // clinic may still change. Owner, admin and reception are unchanged.
        //
        // AGAINST THE STORED ROW, not the request: `affected` is what the
        // database holds before this save, read under the caller's RLS.
        //
        // AND AGAIN AT THE WRITE, for the therapist only: the read above takes
        // no row lock, so reception may reassign the visit between it and the
        // UPDATE below. That UPDATE matches on the Terapeuta checked here, and
        // a row that no longer has it rolls the whole save back (see
        // TherapistChangeRace). Owner, admin and reception write as before.
        //
        // NO SHARED-RESOURCE EXCEPTION, unlike the create door. There it lets a
        // therapist BOOK the NESA machine; here a NESA row moved in time keeps
        // NESA and passes, and swapping NESA for a person (or back) is a change
        // of Terapeuta like any other. Refused before any write, audit or emit.
        const therapistKeeps = actor.role === "therapist";
        if (therapistKeeps && affected.some((a) => a.practitionerId !== input.practitionerId)) {
          return { ok: false, error: "therapist_change_reception_only" };
        }

        // BEFORE the update, so `startsAt` here is the instant the appointment
        // is moving FROM. Read once and reused below rather than re-read after
        // the write, which would return the new value and silently make every
        // notification say it moved from where it now is.
        const before = await readStaffTransitionFanOut(tx, ids);

        // WHICH OF THESE ROWS ARE UNACCEPTED PEDIDOS, read before the write as
        // the acceptance doors read it. A move does not change the status, so
        // the answer holds for the whole transaction. Used once, at the bottom,
        // to keep such a row's move from emitting.
        const unacceptedPedidoIds = await unconfirmedPedidoIdsAmong(tx, ids);

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

          // 0085 - THE CLINIC BEING SHUT, CHECKED IN THE SAME PLACE AND FOR
          // THE SAME REASON. Beside checkAvailability and OUTSIDE the
          // allowConflict gate below: the owner ruled the closure "not
          // blockable-around", and everything inside that gate is by
          // definition something "Guardar mesmo assim" can reach.
          //
          // Every TARGET, not just the first: rescheduling a series moves every
          // occurrence, and one landing in the lunch hour is the same refusal.
          const cl = await checkClinicClosure(tx, {
            locationId: input.locationId,
            startsAt: t.startsAt,
            endsAt: t.endsAt,
          });
          if (!cl.ok) {
            return {
              ok: false,
              error: "clinic_closed",
              clinicClosure: { locationName: cl.locationName, from: cl.from, to: cl.to },
            };
          }

          // AGENDA-2100 - AND THE CLINIC'S OWN DAY, beside the closure and for the
          // same reason. `closes_at` minus 60 minutes is the last start; before
          // `opens_at` is the other half of the same rule. Outside the allowConflict
          // gate, so "Guardar mesmo assim" cannot reach it.
          const cw = await checkClinicWindow(tx, {
            locationId: input.locationId,
            startsAt: t.startsAt,
          });
          if (!cw.ok) {
            return {
              ok: false,
              error: "outside_clinic_hours",
              clinicWindow: {
                reason: cw.reason,
                locationName: cw.locationName,
                opensAt: cw.opensAt,
                closesAt: cw.closesAt,
                latestStart: cw.latestStart,
              },
            };
          }
        }

        // SCHED-29.2: a reschedule moves the row with its Terapeuta 2 unchanged,
        // so NESA there moves into the new hour and is checked and locked for it.
        const practitionerTwoOf = (targetId: string) =>
          affected.find((a) => a.id === targetId)?.practitionerTwoId ?? null;

        if (!input.allowConflict) {
          const conflicts: ConflictInfo[] = [];
          for (const t of targets) {
            const c = await findConflictsForWindow(tx, {
              practitionerId: input.practitionerId,
              practitionerTwoId: practitionerTwoOf(t.id),
              locationId: input.locationId,
              room: t.room,
              startsAt: t.startsAt,
              endsAt: t.endsAt,
              excludeIds:
                mode === "preview" && extras.previewVacated
                  ? [...ids, ...extras.previewVacated]
                  : ids,
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

        // APPT-BULK-01: a preview stops HERE, every check above run and
        // nothing below it reached: no slot lock, no update, no audit row, no
        // care-team join, no reminder target, no staff notice.
        if (mode === "preview") return { ok: true, data: { id } };

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
          targets.flatMap((t) =>
            [input.practitionerId, practitionerTwoOf(t.id)]
              .filter((p): p is string => !!p)
              .map((p) => ({ practitionerId: p, startsAt: t.startsAt, endsAt: t.endsAt })),
          ),
        );
        if (slotLocks) await tx.execute(slotLocks);
        // APPT-BULK-01, APPLY ONLY (a preview returned above): the row lock,
        // AFTER the slot lock, the same order as every move takes them, so a
        // drawer move and a bulk save cannot deadlock. Two saves of the same
        // plan (a double submit) share the destination slot lock, so the
        // second gets here after the first has committed, reads the start it
        // wrote, and writes nothing.
        if (extras.expect && !(await stillAsSeen(true))) return { ok: false, error: "not_found" };

        const startBeforeTheMove = new Map(affected.map((a) => [a.id, a.startsAt]));
        for (const t of targets) {
          const moved = tx
            .update(appointments)
            .set({
              startsAt: t.startsAt,
              endsAt: t.endsAt,
              practitionerId: input.practitionerId,
              locationId: input.locationId,
            });
          if (therapistKeeps) {
            // APPT-EDIT-02: only while the row still has the Terapeuta the guard
            // checked (input.practitionerId, equal to it by then). None back
            // means it was reassigned since: throw, so nothing of this save
            // commits, and the catch below answers with the guard's refusal.
            const kept = await moved
              .where(and(eq(appointments.id, t.id), eq(appointments.practitionerId, input.practitionerId)))
              .returning({ id: appointments.id });
            if (kept.length === 0) throw new TherapistChangeRace();
          } else {
            await moved.where(eq(appointments.id, t.id)); // RLS scopes tenant
          }
          await writeAppointmentAudit(tx, {
            tenantId: actor.tenantId,
            actorUserId: actor.userId,
            action: "appointment.reschedule",
            appointmentId: t.id,
            metadata: {
              practitionerId: input.practitionerId,
              locationId: input.locationId,
              // R33 (the reminder sweep's gate): the start this move LEFT, as
              // the row held it before this save (`affected`, read in this
              // transaction). With `startsAt` it tells a move that kept the
              // start from one that changed it (lib/reminders/reminder-population.ts).
              fromStartsAt: startBeforeTheMove.get(t.id)?.toISOString() ?? null,
              startsAt: t.startsAt.toISOString(),
              endsAt: t.endsAt.toISOString(),
              scope,
              allowConflict: !!input.allowConflict,
            },
            ip,
          });
        }
        // CARE-02c: A RESCHEDULE TO A NEW TERAPEUTA puts that therapist on the
        // care team, first time only, in this transaction. Only the rows whose
        // Terapeuta actually changed (`affected` holds the PRE-update value),
        // and only the Terapeuta slot, because a reschedule never moves the
        // Terapeuta 2. A move in time alone adds nobody.
        const movedToNewTherapist = affected
          .filter((a) => targets.some((t) => t.id === a.id))
          .filter((a) => a.practitionerId !== input.practitionerId)
          .map((a) => a.id);
        careTeamAdded = await addBookedTherapistsToCareTeam(tx, actor, movedToNewTherapist, {
          slots: "primary",
        });

        // MOVING AN UNACCEPTED PEDIDO EMITS NOTHING. It has no reminder run to
        // supersede (nothing emitted for it when the patient booked), the
        // dispatch would refuse the confirmation anyway, and the event would
        // spend the idempotency keys the acceptance needs at this same start -
        // which is how a request moved and then accepted the same day got no
        // confirmation and no reminders. The full reasoning, including the row
        // that was accepted once and brought back, is on
        // `unconfirmedPedidoIdsAmong` in ./pedido-acceptance.ts.
        //
        // An ACCEPTED appointment is not in that set: its move re-emits exactly
        // as before, and that event is what supersedes its sleeping reminders.
        //
        // Q-K (strategy's ruling): WHAT THE MOVE OWES THE CONFIRMATION, per
        // row, from `affected` (the row BEFORE this save) against what it
        // became. A new start or a new clinic: today's confirmation. The
        // Terapeuta only: the email alone. None of those: none, though the
        // event still goes out for the reminders. See `moveConfirmation` in
        // ./move-confirmation.ts.
        const beforeById = new Map(affected.map((a) => [a.id, a]));
        reminderTargets = targets
          .filter((t) => !unacceptedPedidoIds.has(t.id))
          .map((t) => {
            const before = beforeById.get(t.id);
            const confirmation = moveConfirmation(before, {
              startsAt: t.startsAt,
              practitionerId: input.practitionerId,
              locationId: input.locationId,
            });
            return {
              appointmentId: t.id,
              startsAt: t.startsAt,
              practitionerId: input.practitionerId,
              ...(confirmation ? { confirmation } : {}),
              // A move does not change the status: a cancelled occurrence
              // moved with its series stays cancelled and cannot confirm.
              ...(before ? { status: before.status } : {}),
            };
          });
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
    // A preview wrote nothing, so it hands nothing to the post-commit step.
    if (mode === "preview" || !result.ok) {
      reminderTargets = [];
      rescheduleFanOut = [];
      careTeamAdded = [];
    }
    return outcome(result);
  } catch (e) {
    // The transaction rolled back: nothing of this move is handed on.
    reminderTargets = [];
    rescheduleFanOut = [];
    careTeamAdded = [];
    if (e instanceof TherapistChangeRace) return outcome({ ok: false, error: "therapist_change_reception_only" });
    return outcome(fail("reschedule", e));
  }
}

/**
 * LE-staff-transitions-emit-nothing: one "remarcada" notice per moved row, to
 * its PREVIOUS therapists. Best-effort and post-commit: the appointment really
 * has moved, so a failed notification must never be reported as a failed
 * reschedule. Shared by the single move and the bulk change, each of which
 * makes its own ONE reminder call beside it.
 */
async function emitRescheduledFanOut(
  actor: RequestContext,
  fanOut: ReadonlyArray<StaffTransitionFanOut & { newStartsAt: Date }>,
): Promise<void> {
  for (const f of fanOut) {
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
}

/**
 * APPT-BULK-01 - "Alterar várias marcações": change many of ONE patient's
 * future visits in one go (a new therapist, a new clinic, a new hour with the
 * dates kept, a shift by N days, a new length), from the ficha.
 *
 * EVERY ROW IS A SINGLE MOVE. Each ticked row is planned (bulk-reschedule-
 * core.ts) and then handed to `moveAppointment`, the code
 * `rescheduleAppointment` runs, in its OWN transaction, scope "one". So each
 * row meets every check a drawer move meets, in the same order (clinic
 * assignment, NESA, the therapist's working hours, the closure, the clinic's
 * hours, the conflicts, the slot lock, the double-confirmed constraint, RLS),
 * and a saved row writes exactly what a drawer move writes: one update and one
 * `appointment.reschedule` audit row with the same metadata, and the care-team
 * join. Nothing here re-implements or loosens a check.
 *
 * TWO MODES.
 *   preview  writes nothing: each row runs the checks and stops before the
 *            slot lock (see `moveAppointment`). Each row comes back with its
 *            old values, its new values and its verdict.
 *   apply    saves each row that passes and SKIPS each row that does not;
 *            a skipped row's transaction writes nothing. The rows that saved
 *            then get ONE post-commit step for the whole action, below: one
 *            reminder call, so one save marker, the one-confirmation rule (the
 *            earliest eligible row) and the cap all hold as for a series move,
 *            plus the staff notices.
 *
 * DEFAULTS PENDING THE OWNER (stated in the PR): conflicting rows are skipped
 * and listed, the rest are saved; a row's three overridable conflicts are
 * passed only by that row's explicit tick (`allowConflict`), never the hard
 * refusals; the patient gets today's messages, nothing new.
 *
 * OWNER, ADMIN AND RECEPTION ONLY. A therapist holds appointments:write and
 * moves their own visits on the agenda; RLS would refuse them a colleague's
 * row anyway, but the bulk change is not offered to them at all.
 */
/** The bulk change's rows as stored, under RLS. */
async function readBulkSources(actor: RequestContext, ids: string[]): Promise<BulkSourceRow[]> {
  return runScoped(actor, (tx) =>
    tx
      .select({
        id: appointments.id,
        patientId: appointments.patientId,
        status: appointments.status,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        practitionerId: appointments.practitionerId,
        locationId: appointments.locationId,
      })
      .from(appointments)
      .where(inArray(appointments.id, ids)),
  );
}

export async function bulkRescheduleAppointments(
  request: BulkRequest,
): Promise<ActionResult<BulkResult>> {
  const auth = await authorize("appointments:write");
  if (isDenied(auth)) return auth;
  const { actor } = auth;
  if (!BULK_ROLES.has(actor.role)) return { ok: false, error: "forbidden" };
  if (!validBulkRequest(request)) return { ok: false, error: "validation" };
  const mode = request.mode;

  // The rows as stored, under RLS: a row the viewer cannot read is not found,
  // and reads as not eligible below.
  let sources: BulkSourceRow[];
  try {
    sources = await readBulkSources(actor, request.rows.map((r) => r.id));
  } catch (e) {
    return fail("bulk-reschedule", e);
  }
  const byId = new Map(sources.map((r) => [r.id, r]));
  const nowMs = Date.now();
  const ip = await clientIp();

  // THE ORDER FOLLOWS THE SHIFT. A weekly series moved a week later lands each
  // visit on the next one's old slot: processed latest first, that slot is
  // already free when the visit before it arrives, and if the later visit was
  // refused the earlier one meets it and is refused too (never an overlap).
  // Earlier, or no shift: earliest first, by the same reasoning.
  const startOf = (id: string) => byId.get(id)?.startsAt.getTime() ?? Number.MAX_SAFE_INTEGER;
  const later = (request.change.shiftDays ?? 0) > 0;
  const ordered = [...request.rows].sort((a, b) =>
    later ? startOf(b.id) - startOf(a.id) : startOf(a.id) - startOf(b.id),
  );

  const rows: BulkRowResult[] = [];
  const committed: MoveOutcome[] = [];
  // PREVIEW ONLY: the rows this preview has passed so far, which the apply
  // will have moved before the row now being checked (see MoveExtras).
  const passed: { id: string; plan: ReturnType<typeof planBulkRow> }[] = [];
  try {
    for (const asked of ordered) {
      const source = byId.get(asked.id);
      if (!source || !bulkRowEligible(source, request.patientId, nowMs)) {
        rows.push({
          id: asked.id,
          before: source ? sideOf(source) : null,
          after: null,
          verdict: { kind: "not_eligible" },
          applied: false,
        });
        continue;
      }
      // The row as the client last saw it. A row that moved since (a second
      // tab, or a save retried after its answer was lost) is left alone.
      if (asked.expectedStartsAt && new Date(asked.expectedStartsAt).getTime() !== source.startsAt.getTime()) {
        // A save retried after its answer was lost finds its own work done:
        // the row already holds what this plan makes of the start she saw.
        const done = bulkAlreadySaved(source, asked.expectedStartsAt, request.change, asked.time);
        rows.push({
          id: asked.id,
          before: sideOf(source),
          after: done ? sideOf(source) : null,
          verdict: { kind: done ? "already_saved" : "changed" },
          applied: false,
        });
        continue;
      }
      const plan = planBulkRow(source, request.change, asked.time);
      if (bulkRowUnchanged(source, plan)) {
        rows.push({ id: asked.id, before: sideOf(source), after: sideOf(plan), verdict: { kind: "unchanged" }, applied: false });
        continue;
      }
      // A visit is never moved into the past from here.
      if (plan.startsAt.getTime() <= nowMs) {
        rows.push({ id: asked.id, before: sideOf(source), after: sideOf(plan), verdict: { kind: "past" }, applied: false });
        continue;
      }
      // PREVIEW ONLY: two rows of this selection landing on each other with
      // one therapist. The apply needs no such check: the second row meets the
      // first in the database and is refused there.
      if (mode === "preview") {
        const clash = bulkSelfOverlap(plan, passed);
        if (clash) {
          rows.push({
            id: asked.id,
            before: sideOf(source),
            after: sideOf(plan),
            verdict: { kind: "overlap", with: clash },
            applied: false,
          });
          continue;
        }
      }
      let moved: MoveOutcome;
      try {
        moved = await moveAppointment(
          actor,
          ip,
          asked.id,
          {
            startsAt: plan.startsAt.toISOString(),
            endsAt: plan.endsAt.toISOString(),
            practitionerId: plan.practitionerId,
            locationId: plan.locationId,
            scope: "one",
            // A preview never overrides: it shows the conflict. An apply passes
            // it only for a row ticked for it.
            allowConflict: mode === "apply" && asked.allowConflict === true,
          },
          mode,
          {
            expect: { patientId: request.patientId, statuses: BULK_STATUSES, startsAt: source.startsAt },
            previewVacated: passed.map((x) => x.id),
          },
        );
      } catch (e) {
        // A check that threw outside the row's transaction: this row is not
        // moved, the rows already saved stay saved and still get their
        // post-commit step below.
        moved = { result: fail("bulk-reschedule", e), reminderTargets: [], rescheduleFanOut: [], careTeamAdded: [] };
      }
      if (moved.result.ok) {
        if (mode === "apply") committed.push(moved);
        else passed.push({ id: asked.id, plan });
        rows.push({ id: asked.id, before: sideOf(source), after: sideOf(plan), verdict: { kind: "ok" }, applied: mode === "apply" });
      } else if (moved.result.error === "not_found") {
        // The row changed inside its own transaction: another save (the same
        // plan submitted twice, or another desk) got there first. Read it as
        // it now stands, and say "already saved" when that save was this one.
        const [now] = await readBulkSources(actor, [asked.id]).catch(() => []);
        const done = !!now && asked.expectedStartsAt
          ? bulkAlreadySaved(now, asked.expectedStartsAt, request.change, asked.time)
          : false;
        rows.push({
          id: asked.id,
          before: sideOf(source),
          after: done && now ? sideOf(now) : sideOf(plan),
          verdict: { kind: done ? "already_saved" : "changed" },
          applied: false,
        });
      } else {
        rows.push({
          id: asked.id,
          before: sideOf(source),
          after: sideOf(plan),
          verdict: verdictOfRefusal(moved.result),
          applied: false,
        });
      }
    }
  } finally {
    // THE POST-COMMIT STEP, ONCE FOR THE WHOLE ACTION, exactly the single
    // move's: ONE reminder call holding every saved row (one save marker; the
    // one-confirmation rule picks the earliest eligible row; the cap is the
    // same 52 the row limit already respects), the "remarcada" notices, the
    // care-team notices. In a finally, so rows already saved get it whatever
    // happens to a later row. A new emitter of appointment/scheduled.
    if (mode === "apply" && committed.length > 0) {
      await afterCommit("reschedule", async () => {
        revalidateAppointmentSurfaces();
        revalidatePath("/notificacoes");
        await enqueueRemindersAfterCommit(
          actor.tenantId,
          committed.flatMap((m) => m.reminderTargets),
        );
        await emitRescheduledFanOut(actor, committed.flatMap((m) => m.rescheduleFanOut));
      });
      await afterCommit("rescheduleCareTeam", () =>
        emitCareTeamNotices(actor, committed.flatMap((m) => m.careTeamAdded)),
      );
    }
  }

  // Shown in the order of the visits, whatever order they were processed in.
  const shownAt = (r: BulkRowResult) => (r.before ? new Date(r.before.startsAt).getTime() : Number.MAX_SAFE_INTEGER);
  rows.sort((a, b) => shownAt(a) - shownAt(b));
  const okCount = rows.filter((r) => r.verdict.kind === "ok").length;
  const alreadySavedCount = rows.filter((r) => r.verdict.kind === "already_saved").length;
  return {
    ok: true,
    data: { mode, rows, okCount, alreadySavedCount, skippedCount: rows.length - okCount - alreadySavedCount },
  };
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
): Promise<ActionResult<{ id: string; notice?: ApprovalNotice }>> {
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
    const result = await runScoped<ActionResult<{ id: string; notice?: ApprovalNotice }>>(
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
        // BOOK-CONFIRM: the target carries the acceptance marker, so the
        // dispatch can tell this event from a reschedule of the same row.
        reminderTargets = [acceptedPedidoTarget(pedido.id, pedido.startsAt, pedido.practitionerId)];
        return { ok: true, data: { id: pedido.id } };
      },
    );
    if (result.ok) {
      await afterCommit("confirmRequest", async () => {
        revalidateAppointmentSurfaces();
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
      // BOOK-CONFIRM: "Paciente sem email: avise por telefone". After the
      // commit and never throwing, so it cannot fail the acceptance it follows.
      const notice = await approvalNoticeAfterAccept(actor, [result.data.id]);
      if (notice) return { ok: true, data: { ...result.data, notice } };
    }
    return result;
  } catch (e) {
    return fail("confirmRequest", e);
  }
}

/**
 * CORRIGIR ESTADO — move one FINAL state to another. Owner ruling 2026-09-10.
 *
 * ==========================================================================
 * WHY THIS IS NOT `updateAppointment` WITH A LOOSER MAP
 * ==========================================================================
 * `updateAppointment` enforces `isLegalEstadoTransition` (INC-08 (a)), and that
 * map sends all three final states to `[]`. Widening it would have put
 * "cancelada -> concluida" inside the same Estado <Select> that records real
 * lifecycle events, and the audit trail could no longer separate an operator
 * CORRECTING a mistake from one RECORDING an outcome. The ruling is explicit
 * that a correction never goes through the normal control, so this is a second
 * action with a second audit action, and `LEGAL` is untouched.
 *
 * ==========================================================================
 * RECEPTION AND UP, EXPRESSED AS A CAPABILITY RATHER THAN A ROLE LIST
 * ==========================================================================
 * `appointments:delete` is held by owner, admin and reception and NOT by
 * therapist - checked in packages/auth/permissions.ts, not assumed. It is the
 * same gate `cancelAppointment` uses, and it is the existing name for exactly
 * the population the ruling calls "reception and up". A hand-written role list
 * here would rot the next time a role is added; this cannot.
 *
 * ONE ROW, NEVER A SERIES. A correction is about one record being wrong. There
 * is no `scope` parameter on purpose: applying a typo fix to a whole recurrence
 * would assert that every occurrence was mistyped the same way.
 */
export async function correctAppointmentEstadoAction(
  id: string,
  to: AppointmentStatusValue,
  opts?: { allowConflict?: boolean },
): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("appointments:delete");
  if (isDenied(auth)) return auth;
  const { actor } = auth;

  if (!id || !to) return { ok: false, error: "validation" };

  const allowConflict = !!opts?.allowConflict;
  const ip = await clientIp();
  // Q-O: set inside the transaction, emitted only after it commits.
  let surveyTarget: StatusNotificationTarget | null = null;
  try {
    const result = await runScoped<ActionResult<{ id: string }>>(actor, async (tx) => {
      const [row] = await tx
        .select({
          id: appointments.id,
          status: appointments.status,
          // R37: the canary list is asked about this patient before the
          // survey's run is started (enqueueSurveyAfterCorrection).
          patientId: appointments.patientId,
          practitionerId: appointments.practitionerId,
          practitionerTwoId: appointments.practitionerTwoId,
          locationId: appointments.locationId,
          room: appointments.room,
          startsAt: appointments.startsAt,
          endsAt: appointments.endsAt,
        })
        .from(appointments)
        .where(eq(appointments.id, id))
        .limit(1); // RLS scopes the tenant
      if (!row) return { ok: false, error: "not_found" };

      // The SAME predicate the UI offers from, re-asserted here. The affordance
      // is never the enforcement: a hand-made request naming a non-final state,
      // or naming the state the row is already in, is refused on the server.
      if (!isLegalEstadoCorrection(row.status, to)) {
        return { ok: false, error: "illegal_transition" };
      }

      // ==============================================================
      // SCHED-28 — A CORRECTION INTO `completed` RE-CHECKS THE SLOT.
      //
      // This door shipped with no conflict check, and it double-booked on
      // production: a Cancelada row released its slot (0052), another booking
      // took the slot lawfully, and "Corrigir estado" put the first row back as
      // Concluída on top of it. Measured on a lane database before this fix and
      // reproduced in the UI by marcacoes-tab-edit.spec.ts (SCHED-28), which was
      // red on the unchanged code at the conflict assertion.
      //
      // WHICH CORRECTIONS, derived: only the two INTO `completed` from a state
      // that had released the slot. See correctionEntersBlockingSet.
      //
      // SERIALISE, THEN READ, then write - the order create, reschedule and
      // INC-08 (b) use, so two writers cannot both see the slot empty.
      //
      // "Guardar mesmo assim" is HONOURED, exactly as on a reschedule: the
      // owner ruled it overrides this check as it does a new booking's. What it
      // cannot reach is two CONFIRMED rows, which 0061 refuses in the database;
      // a correction never produces `confirmed`, so that is not in play here.
      //
      // NOT ADDED, DELIBERATELY: therapist hours and the clinic closure. Both
      // guard a NEW time being booked. A correction records what happened at a
      // time that was already held, and a past visit outside hours a clinic
      // defined later would be refused for nothing it did.
      // ==============================================================
      if (correctionEntersBlockingSet(row.status, to)) {
        // SCHED-29.2: Terapeuta 2 is locked and checked too, so NESA coming back
        // in either role meets NESA already there in either role.
        const locks = acquireSlotLocksForMany(
          actor.tenantId,
          [row.practitionerId, row.practitionerTwoId]
            .filter((p): p is string => !!p)
            .map((p) => ({ practitionerId: p, startsAt: row.startsAt, endsAt: row.endsAt })),
        );
        if (locks) await tx.execute(locks);
        if (!allowConflict) {
          const c = await findConflictsForWindow(tx, {
            practitionerId: row.practitionerId,
            practitionerTwoId: row.practitionerTwoId,
            locationId: row.locationId,
            room: row.room,
            startsAt: row.startsAt,
            endsAt: row.endsAt,
            excludeIds: [row.id],
          });
          const conflicts = blockingConflicts(c);
          if (conflicts.length > 0) {
            return { ok: false, error: "conflict", conflicts: conflicts.slice(0, CONFLICT_CAP) };
          }
        }
      }

      await tx.update(appointments).set({ status: to }).where(eq(appointments.id, id));

      await writeAppointmentAudit(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "appointment.estado_correction",
        appointmentId: id,
        metadata: {
          // STRUCTURED FROM AND TO, NO FREE TEXT. Both are enum values - one
          // word, no whitespace - so they pass assertPiiFreeAuditMetadata by
          // being identifiers rather than by being short. No reason field: the
          // ruling did not ask for one, and a prose "why" in an append-only log
          // is the defect SEC-audit-metadata-free-text-in-scheduling removed.
          fromStatus: row.status,
          toStatus: to,
          // So a reader filtering this log can tell a correction from a
          // lifecycle event without knowing that the ACTION name encodes it.
          correction: true,
          // SCHED-28: whether "Guardar mesmo assim" was pressed. Recorded on
          // every correction, not only the checked ones, so its absence can
          // never be read as "no override" on a row written before this field.
          // Spelled out rather than shorthand: audit-override-trace.test.ts
          // recognises a recorded override by this exact shape.
          allowConflict: !!opts?.allowConflict,
        },
        ip,
      });

      // Q-O (strategy's ruling of 2026-10-22). A correction INTO Concluida
      // of a visit that ended in the last 7 days, or has not ended yet (Q-V
      // (1), 2026-10-25), asks for the satisfaction survey, as the ordinary
      // Estado path does (enqueueStatusNotificationsAfterCommit). Decided
      // here, against the clock at the moment of the correction; emitted
      // after the commit. Every other correction emits nothing, as before.
      //
      // ACCEPTED RESIDUAL (Q-V (2), strategy 2026-10-25). The event shares
      // the follow-up's idempotency key, `appointmentId:follow_up`, which
      // Inngest holds for 24 hours from the first event. A correction back
      // into Concluida that lands after the visit's end + 24 h (the first
      // run has woken, read a status that was not Concluida and sent
      // nothing) but before the first completed event + 24 h is dropped by
      // the key, and that visit gets no survey. Its own key would need a
      // Resync, so it is accepted and documented (docs/DECISIONS.md, Q-V).
      if (correctionAsksSurvey(row.status, to, row.endsAt, Date.now())) {
        surveyTarget = { appointmentId: row.id, endsAt: row.endsAt, patientId: row.patientId };
      }
      return { ok: true, data: { id } };
    });
    if (result.ok) {
      revalidateAppointmentSurfaces();
      const target = surveyTarget;
      if (target) {
        await afterCommit("estadoCorrection", () => enqueueSurveyAfterCorrection(actor.tenantId, target));
      }
    }
    return result;
  } catch (e) {
    console.error("scheduling: estado correction failed", e instanceof Error ? e.name : "unknown");
    return { ok: false, error: "error" };
  }
}

export async function cancelAppointment(
  id: string,
  reason?: string,
  opts?: SeriesOptions,
): Promise<ActionResult<{ id: string }>> {
  // SCHED-30 (owner dispatch 2026-09-14): owner, admin and reception cancel any
  // row they can write, as before (appointments:delete). A therapist cancels
  // where they are Terapeuta or Terapeuta 2, at one of their clinics
  // (appointments:cancel_own). The capability decides WHO; the row test inside
  // the transaction decides WHICH, because RLS alone would also admit NESA's
  // rows at their clinic (0086).
  const auth = await authorize("appointments:write");
  if (isDenied(auth)) return auth;
  const { actor } = auth;
  const authority = cancelAuthority(actor.role);
  if (authority === "none") return { ok: false, error: "forbidden" };

  if (!id) return { ok: false, error: "validation" };
  const scope: SeriesScope = opts?.scope ?? "one";
  // STAFF-02's write scope, read before the transaction as every door reads it.
  const ownScope = authority === "own" ? await bookingLocationScope(actor) : null;

  // WHETHER a reason was given — the only thing about it that reaches the audit
  // row. See the metadata block below for why the text does not, and
  // LE-cancel-reason-is-not-retained for the consequence: with the log no longer
  // carrying it, NOTHING persists a cancellation reason. That is a gap to close
  // with a column, not by putting free text back into an append-only log.
  const hadReason = Boolean(reason?.trim());

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

        // SCHED-30: every row this call cancels is the therapist's own and at one
        // of their clinics, or nothing is cancelled.
        if (authority === "own") {
          const refusal = ownCancelRefusal(actor.userId, ownScope, affected);
          if (refusal) return { ok: false, error: refusal };
        }

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
              // A BOOLEAN AND A REFERENCE, NEVER THE PROSE.
              //
              // This key used to be `reason: reason?.trim() || null` — the raw
              // string, straight into an append-only log that this helper's own
              // contract says carries ids, status and ISO timestamps only. And
              // the string was not even a cancellation reason typed for the
              // purpose: the agenda drawer passes `form.notes`, the
              // appointment's OWN notes field, pre-filled from the row. So an
              // existing clinical note about a named patient was copied verbatim
              // into `audit_log` on every cancel taken from the agenda, and
              // `audit_log` is not editable afterwards.
              //
              // `clinical/records.ts` annulRecord had the same decision and took
              // this branch: `metadata: { hadReason: Boolean(trimmed) }`, with
              // the prose in `record_annulments.reason`, a real domain column.
              hadReason,
              // THE REFERENCE, and it is the appointment this row is already
              // about. Named explicitly rather than left implicit in
              // `entity_id`, because a reader who filters on `hadReason` needs
              // the next place to look without knowing this file.
              //
              // IT DOES NOT NAME A FIELD, and the omission is deliberate: the
              // two callers source this argument differently — the agenda drawer
              // from `appointments.notes`, the patient-profile cancel drawer
              // from a box typed for the purpose — and naming one of them would
              // put a false provenance in an audit row, which is the class of
              // defect this change exists to remove.
              reasonRef: hadReason ? { entityType: "appointment", entityId: aid } : null,
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
      revalidateAppointmentSurfaces();
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
    if (result.ok) revalidateAppointmentSurfaces();
    return result;
  } catch (e) {
    return fail("hardDelete", e);
  }
}
