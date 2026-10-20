import "server-only";
import { asc, eq } from "drizzle-orm";
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
      .where(eq(therapistServices.therapistUserId, therapistId))
      // Deterministic order (W3-03): the booking form defaults Serviço to the
      // FIRST mapped service, so the order must be stable across requests.
      // Oldest mapping first — a stand-in for "primary" until W3-04 lands a
      // dedicated primary designation. Ties on created_at are broken by id
      // (Q-M review, 2026-10-20), the SAME order admin/therapist-primary-service
      // uses, so the Equipa card, the save and this preselection always agree.
      .orderBy(asc(therapistServices.createdAt), asc(therapistServices.id));
    return rows.map((r) => r.serviceId);
  });
}
