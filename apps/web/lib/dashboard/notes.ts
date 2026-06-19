import "server-only";
import { eq } from "drizzle-orm";
import { quickNotes } from "@osteojp/db";
import type { RequestContext } from "@osteojp/auth";
import { runScoped } from "@/lib/auth/context";

/** Read the current staff user's quick-notes string from quick_notes. */
export async function getQuickNotes(ctx: RequestContext): Promise<string> {
  const rows = await runScoped(ctx, (tx) =>
    tx
      .select({ content: quickNotes.content })
      .from(quickNotes)
      .where(eq(quickNotes.staffUserId, ctx.userId))
      .limit(1),
  );
  return rows[0]?.content ?? "";
}
