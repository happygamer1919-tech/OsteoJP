"use server";

import { revalidatePath } from "next/cache";

import { requireRequestContext } from "@/lib/auth/context";
import { markAllRead, markRead } from "@/lib/notifications/centre";

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
