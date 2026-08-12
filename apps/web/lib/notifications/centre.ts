import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { appointments, getDbAdmin, patients, roles, staffNotifications, users } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";

// W13-02 (Wave 13 LOOP 2) — the notification centre's READ half. PG4.
//
// EVERY QUERY RUNS THROUGH runScoped, so RLS is the gate rather than a WHERE
// clause this file could forget. Migration 0055's policies pin both SELECT and
// UPDATE to `recipient_user_id = auth.uid()`, and runScoped forwards `sub` so
// auth.uid() resolves. That means a therapist cannot read reception's list even
// though both are in the same tenant, and it stays true if a future caller
// forgets a predicate — which is the point of putting it in the database.
//
// THE PATIENT NAME IS JOINED HERE, NOT STORED. staff_notifications carries
// identifiers and instants only; the name comes from `patients` at render time,
// read by a staff session that is already entitled to it. This is the same
// shape counsel required of the Inngest payloads (identifiers in the event,
// contacts fetched at execution) and it means a notification row never becomes
// a second, stale copy of a patient's name.
//
// NO SERVICE NAME. Not omitted by accident: several service names identify a
// treatment type, which is why the token landing page may not show one either
// (docs/rgpd-token-flow.md section 7). A notification centre that named the
// service would leak the treatment to every reception user on every change.

/** How many entries the centre lists. Deliberately finite; the bell is a
 * "what changed recently" surface, not an archive browser. */
export const CENTRE_PAGE_SIZE = 50;

export type CentreEntry = {
  id: string;
  kind: string;
  appointmentId: string;
  patientId: string;
  /** Joined at read time. Null when the patient row is gone — the entry still
   * renders, because "a cancellation happened" is true regardless. */
  patientName: string | null;
  previousStartsAt: Date;
  newStartsAt: Date;
  occurredAt: Date;
  readAt: Date | null;
};

/** The current user's entries, newest first. RLS confines them to this user. */
export async function listNotifications(
  ctx: RequestContext,
  limit: number = CENTRE_PAGE_SIZE,
): Promise<CentreEntry[]> {
  return runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: staffNotifications.id,
        kind: staffNotifications.kind,
        appointmentId: staffNotifications.appointmentId,
        patientId: staffNotifications.patientId,
        patientName: patients.fullName,
        previousStartsAt: staffNotifications.previousStartsAt,
        newStartsAt: staffNotifications.newStartsAt,
        occurredAt: staffNotifications.occurredAt,
        readAt: staffNotifications.readAt,
      })
      .from(staffNotifications)
      .leftJoin(patients, eq(patients.id, staffNotifications.patientId))
      .orderBy(desc(staffNotifications.occurredAt))
      .limit(limit);
    return rows;
  });
}

/**
 * One pedido waiting for reception to act on it.
 *
 * The window fields come from `appointments`, NOT from the notification's own
 * `new_starts_at`. Those two agree at emit time and can disagree later — a
 * patient may reschedule a pedido before reception ever opens the queue, and the
 * notification row is an immutable record of what happened THEN. Reception must
 * confirm the appointment as it stands NOW, so the queue reads the appointment.
 */
export type PendingRequestEntry = {
  /** The notification row that proves this appointment is a portal pedido. */
  notificationId: string;
  appointmentId: string;
  patientId: string;
  /** Joined at read time, exactly as in listNotifications. */
  patientName: string | null;
  startsAt: Date;
  endsAt: Date;
  practitionerId: string;
  locationId: string;
  /** When the PATIENT submitted the pedido. */
  requestedAt: Date;
};

/** Lifecycle status a pedido sits in until reception acts. */
const PENDING_STATUS = "scheduled";

/**
 * The reception confirm queue: portal pedidos still awaiting a decision.
 *
 * WHY THE NOTIFICATION IS THE SOURCE, and not a column on `appointments`. There
 * is no provenance column, and `created_by IS NULL` is NOT a reliable portal
 * marker — packages/db/tests/appointments-created-by-provenance.test.ts proves
 * (7/7 against live Postgres) that migration 0049's WITH CHECK is a disjunction,
 * so a staff principal satisfying a different branch may insert a row with a
 * null `created_by` and the database accepts it. The `appointment_request`
 * notification row is the ONLY record that a given appointment arrived as a
 * portal pedido, which is why it is joined rather than a status being read.
 *
 * WHY status = 'scheduled' AND NOT appointment_confirmation_state. The two axes
 * are orthogonal by design (apps/web/lib/scheduling/estado.ts:8-20): the
 * confirmation axis answers "did the PATIENT reply to the reminder" and is
 * written by the Twilio inbound webhook. Reception accepting a pedido is the
 * LIFECYCLE axis, scheduled -> confirmed. Filtering on the confirmation axis
 * here would put every reminder-unanswered appointment in reception's queue and
 * would conflate two questions the drawer deliberately keeps apart.
 *
 * THIS COVERS THE DECLINE CASE WITHOUT NAMING IT. Reception declining a pedido
 * cancels the appointment, so `status` leaves 'scheduled' and the row leaves
 * this queue by the same predicate that removes a confirmed one. There is no
 * 'declined' lifecycle status and none is invented here.
 *
 * RLS IS THE GATE, TWICE OVER. staff_notifications SELECT is pinned to
 * `recipient_user_id = auth.uid()` (0055), so this is the CALLER'S queue: a
 * therapist sees pedidos for their own appointments, reception sees the tenant's
 * because the fan-out addresses every active reception user. The inner join to
 * `appointments` is then filtered by the caller's own appointment policy (0048
 * location scope), so a pedido a caller may not act on cannot appear here even
 * though they hold the notification.
 */
export async function listPendingRequests(
  ctx: RequestContext,
  limit: number = CENTRE_PAGE_SIZE,
): Promise<PendingRequestEntry[]> {
  const rows = await runScoped(ctx, async (tx) => {
    return tx
      .select({
        notificationId: staffNotifications.id,
        appointmentId: appointments.id,
        patientId: staffNotifications.patientId,
        patientName: patients.fullName,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        practitionerId: appointments.practitionerId,
        locationId: appointments.locationId,
        requestedAt: staffNotifications.occurredAt,
      })
      .from(staffNotifications)
      .innerJoin(appointments, eq(appointments.id, staffNotifications.appointmentId))
      .leftJoin(patients, eq(patients.id, staffNotifications.patientId))
      .where(
        and(
          eq(staffNotifications.kind, "appointment_request"),
          eq(appointments.status, PENDING_STATUS),
        ),
      )
      // Soonest first: the queue is worked against the calendar, so the pedido
      // that is about to happen is the one reception must decide on. The centre
      // list is newest-first because it is a log; this is a worklist.
      .orderBy(asc(appointments.startsAt))
      .limit(limit);
  });

  // ONE ENTRY PER APPOINTMENT. The unique index in 0055 is over (recipient,
  // appointment, kind, occurred_at), so a re-emit carrying a different instant
  // would give one caller two rows for one pedido — and two identical Confirmar
  // buttons, the second of which fails on an appointment that is no longer
  // 'scheduled'. Collapsing here keeps the queue a list of DECISIONS rather than
  // a list of messages. The earliest survives: it is when the patient asked.
  const first = new Map<string, PendingRequestEntry>();
  for (const r of rows) {
    const seen = first.get(r.appointmentId);
    if (!seen || r.requestedAt < seen.requestedAt) first.set(r.appointmentId, r);
  }
  return [...first.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/**
 * The bell's badge.
 *
 * DERIVED FROM DATA, never from a client-side counter — LOOP 2's Definition of
 * Done says so explicitly, because a counter held in React state resets on
 * reload and then disagrees with the list it is supposed to describe. This is a
 * COUNT over `read_at IS NULL`, served by the partial index in 0055, so the
 * badge and the list can never drift apart: they are two reads of one column.
 */
export async function unreadCount(ctx: RequestContext): Promise<number> {
  return runScoped(ctx, async (tx) => {
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(staffNotifications)
      .where(isNull(staffNotifications.readAt));
    return row?.n ?? 0;
  });
}

/**
 * Mark one entry read. Idempotent: re-marking an already-read entry is a no-op
 * rather than an error, and it does NOT move the timestamp, so "when did I
 * first see this" survives a double click.
 *
 * The RLS UPDATE policy is what stops a user marking someone else's entry read;
 * the id predicate here is a lookup, not the security boundary.
 */
export async function markRead(ctx: RequestContext, id: string): Promise<void> {
  await runScoped(ctx, async (tx) => {
    await tx
      .update(staffNotifications)
      .set({ readAt: new Date() })
      .where(and(eq(staffNotifications.id, id), isNull(staffNotifications.readAt)));
  });
}

/** Mark everything currently unread as read. Same idempotence. */
export async function markAllRead(ctx: RequestContext): Promise<void> {
  await runScoped(ctx, async (tx) => {
    await tx
      .update(staffNotifications)
      .set({ readAt: new Date() })
      .where(isNull(staffNotifications.readAt));
  });
}

// ====================================================================
// THE WRITE HALF, staff side. 0061, acceptance item 20 / PG4.
//
// WHY THIS EXISTS AT ALL. Everything above is a READ. The only writer of
// staff_notifications was apps/api's persistingConsumer, reached from the three
// PATIENT paths in booking.ts. The staff app emitted NOTHING, so when a
// therapist accepted a pedido the row left `status = 'scheduled'`, dropped out
// of listPendingRequests above, and reception was left unable to distinguish
// "a therapist just accepted this" from "cancelled" or from "never there".
//
// WHY A MIRROR AND NOT AN IMPORT. apps/web and apps/api are separate Next
// builds and neither may import the other's source at runtime — the same
// constraint that produced lib/scheduling/slot-lock.ts, which documents the
// pattern.
//
// IT IS NOT A PARITY MIRROR, and the difference is deliberate rather than
// drift: apps/api's resolveRecipients notifies EVERY active reception user,
// because a patient-initiated change concerns all of them. This one EXCLUDES
// THE ACTOR, because a staff confirm is somebody's own click. Asserting the two
// agree would therefore be asserting something false. What is asserted instead,
// in confirm-fanout.test.ts, is this function's own recipient rule: reception
// in, assigned practitioners in, the actor out, other tenants out.
//
// WHY getDbAdmin AND NOT runScoped, unlike every read above. This writes rows
// addressed to OTHER users, and 0055 pins SELECT/UPDATE to
// `recipient_user_id = auth.uid()`. A scoped write could only ever address the
// caller to themselves, which is the one recipient that must NOT get this. The
// recipients are resolved server-side from the tenant's roles, never taken from
// a caller-supplied list. apps/api/lib/notifications/centre.ts:92-99 takes the
// same decision for the same reason.
// ====================================================================

/** The role slug whose holders all receive pedido decisions. */
const RECEPTION_ROLE_SLUG = "reception";

/**
 * Fan a staff CONFIRM out to reception and to the assigned practitioners.
 *
 * THE ACTOR IS EXCLUDED, and that is the point rather than a nicety. Reception
 * receives this fan-out, so without the exclusion a receptionist confirming a
 * pedido would immediately be notified of their own click — noise that would
 * have made the queue worse than the silence it replaces. `actorUserId` is
 * still RECORDED on every row, so the people who DO get it can see who acted.
 *
 * BEST-EFFORT, NEVER THROWS. Called after the confirm has committed. A failed
 * notification must not surface to reception as a failed confirmation: the
 * appointment really is confirmed, and reporting otherwise would invite them to
 * confirm it twice. Logged at ERROR with ids only — no name, no contact, no
 * service (CLAUDE.md rule 7).
 */
/**
 * INC-09. The notification kinds this platform can render, as a UNION rather
 * than a bare `string`.
 *
 * IT MUST STAY IN STEP WITH THE DATABASE. Migration 0055 pinned four values in a
 * CHECK constraint; 0061 widened it to five by adding `confirmed`. The staff
 * notification centre's label map went out of step with that widening and
 * rendered the raw enum to reception in English — INC-09.
 *
 * Declaring it here, beside the only writer in this app, is what lets the label
 * map be `Record<StaffNotificationKind, string>` and therefore fail to COMPILE
 * when a sixth kind arrives. `notification-kinds.test.ts` additionally pins this
 * union against the migration's CHECK values, so a widening in SQL that nobody
 * mirrors here is a red test rather than an English word on a Portuguese screen.
 */
export type StaffNotificationKind =
  | "booked"
  | "cancelled"
  | "rescheduled"
  | "appointment_request"
  | "confirmed";

export async function emitConfirmedNotification(args: {
  tenantId: string;
  actorUserId: string;
  appointmentId: string;
  patientId: string;
  practitionerIds: string[];
  startsAt: Date;
  occurredAt: Date;
}): Promise<{ delivered: boolean }> {
  try {
    const db = getDbAdmin();

    const receptionRows = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(
        and(
          eq(users.tenantId, args.tenantId),
          eq(users.isActive, true),
          eq(roles.slug, RECEPTION_ROLE_SLUG),
          // Never notify the person who just acted.
          ne(users.id, args.actorUserId),
        ),
      );

    // Practitioner ids are VALIDATED against the tenant rather than trusted: a
    // row addressed to a user from another tenant is one no policy can select,
    // so it would be a notification nobody can ever read.
    const practitionerRows = args.practitionerIds.length
      ? await db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.tenantId, args.tenantId),
              inArray(users.id, args.practitionerIds),
              ne(users.id, args.actorUserId),
            ),
          )
      : [];

    const recipients = new Set<string>();
    for (const r of receptionRows) recipients.add(r.id);
    for (const r of practitionerRows) recipients.add(r.id);

    if (recipients.size === 0) {
      // Reaching nobody is a real condition worth seeing, not a silent no-op:
      // it means a therapist confirmed their own pedido in a tenant with no
      // other active reception user.
      console.warn(
        `[notifications] confirm fan-out resolved ZERO recipients ` +
          `tenant=${args.tenantId} appointment=${args.appointmentId}`,
      );
      return { delivered: false };
    }

    await db
      .insert(staffNotifications)
      .values(
        [...recipients].map((recipientUserId) => ({
          tenantId: args.tenantId,
          recipientUserId,
          kind: "confirmed",
          actorUserId: args.actorUserId,
          appointmentId: args.appointmentId,
          patientId: args.patientId,
          // A confirmation moves nothing, so both instants are the appointment's
          // own start — the convention the emitting contract already set for
          // bookings and cancellations.
          previousStartsAt: args.startsAt,
          newStartsAt: args.startsAt,
          occurredAt: args.occurredAt,
        })),
      )
      // 0055's unique index over (recipient, appointment, kind, occurred_at) is
      // the idempotency guard. A retry must not double-post one acceptance.
      .onConflictDoNothing();

    return { delivered: true };
  } catch (err) {
    console.error(
      `[notifications] confirm fan-out FAILED tenant=${args.tenantId} ` +
        `appointment=${args.appointmentId}`,
      err instanceof Error ? `${err.name}: ${err.message}` : "unknown",
    );
    return { delivered: false };
  }
}
