import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { services, therapistServices } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { writeAudit } from "./audit";
import { AdminError } from "./errors";

/**
 * Per-therapist PRIMARY service (W3-04) — the service W3-03 auto-selects into
 * the Serviço field when a therapist is chosen at booking.
 *
 * Representation (migration-free, no-UPDATE): `therapist_services` (0023) is
 * append-only — RLS grants SELECT/INSERT/DELETE only and UPDATE 42501-throws
 * (DECISIONS 2026-07-01). "Primary" is therefore a deterministic CONVENTION
 * over the existing rows: the mapped service with the EARLIEST `created_at` is
 * primary. This needs no new column and no UPDATE, and it is exactly what
 * scheduling/therapist-services.ts already reads (oldest-first), so W3-03
 * consumes the primary with no change.
 *
 * Re-designation to X is delete+insert of the OTHER mapped rows: re-inserting
 * them stamps their `created_at` at now(), which is strictly later than X's
 * (X was inserted in a prior transaction), so X becomes the earliest = primary.
 * X itself is never touched, so its row is stable. Adding a NEW service is a
 * plain INSERT (newest) and never disturbs the primary.
 */

export type TherapistServiceOption = { id: string; name: string };
export type TherapistPrimary = {
  therapistId: string;
  /** Mapped services, oldest-first — the first is the primary. */
  services: TherapistServiceOption[];
  primaryServiceId: string | null;
};

/** All therapists' mapped services (+ primary), tenant-scoped. Keyed by therapist id. */
export async function listTherapistPrimaries(
  actor: RequestContext,
): Promise<Map<string, TherapistPrimary>> {
  assertCan(actor.role, "users:read");
  return runScoped(actor, async (tx) => {
    const rows = await tx
      .select({
        therapistId: therapistServices.therapistUserId,
        serviceId: services.id,
        name: services.name,
      })
      .from(therapistServices)
      .innerJoin(services, eq(therapistServices.serviceId, services.id))
      .orderBy(asc(therapistServices.therapistUserId), asc(therapistServices.createdAt));

    const byTherapist = new Map<string, TherapistPrimary>();
    for (const r of rows) {
      const entry =
        byTherapist.get(r.therapistId) ??
        { therapistId: r.therapistId, services: [], primaryServiceId: null };
      entry.services.push({ id: r.serviceId, name: r.name });
      if (entry.primaryServiceId === null) entry.primaryServiceId = r.serviceId; // oldest = primary
      byTherapist.set(r.therapistId, entry);
    }
    return byTherapist;
  });
}

/**
 * Tenant-scoped read of ONE therapist's primary service id (earliest mapping),
 * or null when the therapist has no mapped service. This is the read W3-03's
 * auto-select consumes.
 */
export async function getTherapistPrimaryServiceId(
  actor: RequestContext,
  therapistId: string,
): Promise<string | null> {
  assertCan(actor.role, "users:read");
  return runScoped(actor, async (tx) => {
    const [row] = await tx
      .select({ serviceId: therapistServices.serviceId })
      .from(therapistServices)
      .where(eq(therapistServices.therapistUserId, therapistId))
      .orderBy(asc(therapistServices.createdAt))
      .limit(1);
    return row?.serviceId ?? null;
  });
}

/**
 * Set a therapist's primary service to `serviceId`, which MUST already be one of
 * the therapist's mapped services. Admin-only, server-enforced. Never issues an
 * UPDATE against `therapist_services` (which 42501-throws): it delete+inserts
 * the other mapped rows so `serviceId` becomes the earliest = primary.
 */
export async function setTherapistPrimaryService(
  actor: RequestContext,
  therapistId: string,
  serviceId: string,
): Promise<void> {
  assertCan(actor.role, "users:manage");
  if (!therapistId || !serviceId) throw new AdminError("invalid");

  await runScoped(actor, async (tx) => {
    const mapped = await tx
      .select({ serviceId: therapistServices.serviceId })
      .from(therapistServices)
      .where(eq(therapistServices.therapistUserId, therapistId))
      .orderBy(asc(therapistServices.createdAt));
    const ids = mapped.map((m) => m.serviceId);

    // The primary must be chosen from the therapist's existing mapped services.
    if (!ids.includes(serviceId)) throw new AdminError("invalid");

    // Already primary (earliest) → nothing to do.
    if (ids[0] === serviceId) return;

    // Bump every OTHER mapped service after the chosen one (delete+insert, never
    // UPDATE) so the chosen service becomes the earliest = primary.
    for (const other of ids.filter((id) => id !== serviceId)) {
      await tx
        .delete(therapistServices)
        .where(
          and(
            eq(therapistServices.therapistUserId, therapistId),
            eq(therapistServices.serviceId, other),
          ),
        ); // RLS scopes tenant
      await tx.insert(therapistServices).values({
        tenantId: actor.tenantId, // NOT NULL + RLS WITH CHECK
        therapistUserId: therapistId,
        serviceId: other,
      });
    }

    await writeAudit(tx, actor, {
      action: "therapist.primary_service.set",
      entityType: "therapist_services",
      entityId: therapistId,
      metadata: { serviceId, rebumped: ids.length - 1 },
    });
  });
}
