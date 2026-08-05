import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { patients, staffNotifications } from "@osteojp/db";
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
