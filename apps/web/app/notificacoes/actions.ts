"use server";

import { revalidatePath } from "next/cache";

import { requireRequestContext } from "@/lib/auth/context";
import { markAllRead, markRead } from "@/lib/notifications/centre";
import { markRescheduleRequestHandled } from "@/lib/notifications/reschedule-requests";

// W13-02 — the centre's only mutations. "Mark read" is the whole state machine;
// there is no delete, and migration 0055 revokes DELETE at the table gate so a
// future handler cannot quietly add one.
//
// Both actions re-derive the context from the verified session and never take a
// user id from the caller. RLS pins the write to the recipient's own rows, so
// the boundary holds even if this file were wrong.

export async function markNotificationRead(id: string): Promise<void> {
  const ctx = await requireRequestContext();
  await markRead(ctx, id);
  // The badge lives in the shell, which every authenticated route renders.
  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead(): Promise<void> {
  const ctx = await requireRequestContext();
  await markAllRead(ctx);
  revalidatePath("/", "layout");
}

/**
 * SEC-reschedule-request-has-no-row — clear one reschedule request off the queue.
 *
 * IT STAMPS `handled_at`; IT DOES NOT MOVE THE BOOKING AND IT DOES NOT DELETE.
 * Reception reschedules in the agenda, where the conflict checks, the slot lock
 * and the audit trail live. A second, thinner write path onto the same
 * appointment rows from this screen is how the double-booking family of
 * incidents got in, and 0080 grants no DELETE to anybody.
 *
 * The id comes from the caller and is NOT trusted: the UPDATE is scoped by RLS
 * to requests whose appointment this user may see, and carries its own
 * `handled_at IS NULL` predicate so two receptionists pressing at once cannot
 * both win.
 */
export async function markRescheduleHandled(id: string): Promise<{ ok: boolean }> {
  const ctx = await requireRequestContext();
  const result = await markRescheduleRequestHandled(ctx, id);
  revalidatePath("/notificacoes");
  return result;
}
