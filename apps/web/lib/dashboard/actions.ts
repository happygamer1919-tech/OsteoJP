"use server";

import { revalidatePath } from "next/cache";
import { quickNotes } from "@osteojp/db";
import { requireRequestContext, runScoped } from "@/lib/auth/context";

const NOTES_MAX = 2000;

/**
 * Persist the current staff user's quick notes. One row per (tenant, user);
 * INSERT on first save, UPDATE on subsequent saves (conflict on the unique
 * constraint). RLS scopes every read/write to the caller's own row — another
 * staff member's notes are never visible or writable.
 */
export async function saveQuickNotesAction(
  _prev: { content: string; saved: boolean },
  formData: FormData,
): Promise<{ content: string; saved: boolean }> {
  const text = (formData.get("notes") as string | null) ?? "";
  await saveQuickNotes(text);
  return { content: text, saved: true };
}

export async function saveQuickNotes(rawText: string): Promise<void> {
  const ctx = await requireRequestContext();
  const text = rawText.slice(0, NOTES_MAX);

  await runScoped(ctx, async (tx) => {
    await tx
      .insert(quickNotes)
      .values({
        tenantId: ctx.tenantId,
        staffUserId: ctx.userId,
        content: text,
      })
      .onConflictDoUpdate({
        target: [quickNotes.tenantId, quickNotes.staffUserId],
        set: { content: text, updatedAt: new Date() },
      });
  });

  revalidatePath("/dashboard");
}
