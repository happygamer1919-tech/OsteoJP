"use server";

import { revalidatePath } from "next/cache";
import { tenants } from "@osteojp/db";
import { requireRequestContext, runScoped } from "@/lib/auth/context";

const NOTES_MAX = 2000;

/**
 * Persist tenant-wide quick notes to tenants.settings.notes. Any authenticated
 * staff member may write; no specific capability is required (shared scratchpad).
 * RLS scopes the write to the caller's own tenant row.
 */
export async function saveQuickNotes(rawText: string): Promise<void> {
  const ctx = await requireRequestContext();
  const text = rawText.slice(0, NOTES_MAX);

  await runScoped(ctx, async (tx) => {
    const [row] = await tx.select({ settings: tenants.settings }).from(tenants);
    const existing = (row?.settings ?? {}) as Record<string, unknown>;
    await tx.update(tenants).set({ settings: { ...existing, notes: text } });
  });

  revalidatePath("/dashboard");
}
