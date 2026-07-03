import "server-only";
import { eq } from "drizzle-orm";
import type { RequestContext } from "@osteojp/auth";
import { therapistServices } from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";

/**
 * Read-only lookup of the service IDs a therapist is mapped to deliver
 * (`therapist_services`, migration 0023 — admin-managed, add/remove only).
 * Feeds the new-appointment service auto-select (SPEC-appointments §6):
 * picking a therapist filters the service Select to their mapped service(s)
 * and preselects when there is exactly one.
 *
 * Runs through runScoped, so RLS scopes the read to the caller's tenant; this
 * module never filters tenant_id by hand, matching day-availability.ts.
 */
export async function getTherapistServiceIds(
  ctx: RequestContext,
  therapistId: string,
): Promise<string[]> {
  return runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({ serviceId: therapistServices.serviceId })
      .from(therapistServices)
      .where(eq(therapistServices.therapistUserId, therapistId));
    return rows.map((r) => r.serviceId);
  });
}
