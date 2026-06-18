import "server-only";
import { tenants } from "@osteojp/db";
import type { RequestContext } from "@osteojp/auth";
import { runScoped } from "@/lib/auth/context";

/** Read the tenant's quick-notes string from tenants.settings.notes. */
export async function getQuickNotes(ctx: RequestContext): Promise<string> {
  const rows = await runScoped(ctx, (tx) =>
    tx.select({ settings: tenants.settings }).from(tenants),
  );
  const settings = (rows[0]?.settings ?? {}) as Record<string, unknown>;
  return typeof settings.notes === "string" ? settings.notes : "";
}
