import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
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
 * Set a therapist's primary service to `serviceId` — any ACTIVE tenant service
 * (W4-01). Handles all three cases with ONE delete+insert path (never UPDATE,
 * which 42501-throws):
 *   - zero mappings  → INSERT `serviceId` (trivially the earliest = primary);
 *   - `serviceId` not yet mapped → it is added AND made primary;
 *   - `serviceId` already mapped → re-designated to primary.
 *
 * "Primary" is the earliest-created mapping (W3-04; consumed by W3-03's booking
 * auto-fill). To make `serviceId` the earliest we DELETE the therapist's current
 * mappings and re-INSERT them in `[serviceId, ...others]` order, stamping each
 * `created_at` with `clock_timestamp()` — which advances WITHIN the transaction,
 * unlike `now()`/`transaction_timestamp()` which would tie every row. All of the
 * therapist's existing services are preserved. Admin-only, server-enforced.
 */
export async function setTherapistPrimaryService(
  actor: RequestContext,
  therapistId: string,
  serviceId: string,
): Promise<void> {
  assertCan(actor.role, "users:manage");
  if (!therapistId || !serviceId) throw new AdminError("invalid");

  await runScoped(actor, async (tx) => {
    // Defense: `serviceId` must be an ACTIVE service of this tenant (the dropdown
    // only lists active services; reject a forged / archived id). RLS scopes the
    // read to the actor's tenant.
    const [svc] = await tx
      .select({ id: services.id })
      .from(services)
      .where(and(eq(services.id, serviceId), eq(services.isActive, true)))
      .limit(1);
    if (!svc) throw new AdminError("invalid");

    const mapped = await tx
      .select({ serviceId: therapistServices.serviceId })
      .from(therapistServices)
      .where(eq(therapistServices.therapistUserId, therapistId))
      .orderBy(asc(therapistServices.createdAt));
    const ids = mapped.map((m) => m.serviceId);

    // Already the primary (earliest) and already mapped → nothing to change.
    if (ids[0] === serviceId) return;

    const others = ids.filter((id) => id !== serviceId);
    const ordered = [serviceId, ...others]; // primary first; all services kept

    // Delete every current mapping, then re-insert in order with a strictly
    // increasing clock_timestamp() so `serviceId` is the earliest = primary.
    if (ids.length > 0) {
      await tx
        .delete(therapistServices)
        .where(eq(therapistServices.therapistUserId, therapistId)); // RLS scopes tenant
    }
    for (const s of ordered) {
      await tx.insert(therapistServices).values({
        tenantId: actor.tenantId, // NOT NULL + RLS WITH CHECK
        therapistUserId: therapistId,
        serviceId: s,
        createdAt: sql`clock_timestamp()`,
      });
    }

    await writeAudit(tx, actor, {
      action: "therapist.primary_service.set",
      entityType: "therapist_services",
      entityId: therapistId,
      // PII-free: ids + counts only.
      metadata: { serviceId, added: !ids.includes(serviceId), total: ordered.length },
    });
  });
}
