import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { services, therapistServices, users, type DbTx } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import { writeAudit } from "./audit";
import { AdminError } from "./errors";
import { assertStaffInScope } from "./staff-scope";

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
 *
 * TIES ARE BROKEN BY `id`, EVERYWHERE (Q-M review, 2026-10-20). Two rows can
 * share one `created_at` (a bulk insert, a data op, a seed), and an ORDER BY on
 * `created_at` alone leaves their order to the planner, so the card, the save
 * and the staff preselection could each pick a different "primary". Every read
 * that orders the mappings therefore orders by `created_at, id`, through
 * PRIMARY_ORDER below and its twin in scheduling/therapist-services.ts.
 */

/** The one ordering of a therapist's mappings: oldest first, ties by id. */
const PRIMARY_ORDER = [asc(therapistServices.createdAt), asc(therapistServices.id)] as const;

/**
 * Serialise every write to ONE member's mappings (Q-M review, 2026-10-20): the
 * services save and the primary save both read the current rows and then write
 * from what they read, so two of them interleaving could each keep or remove a
 * row on stale information. `SELECT ... FOR UPDATE` on the member's own users
 * row, the same row lock the admin settings writers take on `tenants`. It also
 * refuses a member this actor cannot see (another tenant's id), which the
 * foreign key on therapist_services would otherwise accept.
 */
async function lockMember(tx: DbTx, therapistId: string): Promise<void> {
  const [row] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, therapistId))
    .for("update");
  if (!row) throw new AdminError("not_found");
}

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
      .orderBy(asc(therapistServices.therapistUserId), ...PRIMARY_ORDER);

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
      .orderBy(...PRIMARY_ORDER)
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
  // PL-09 Phase 4: a location-scoped admin sets services only for staff at their clinics.
  const scope = await viewerLocationScope(actor);

  await runScoped(actor, async (tx) => {
    await lockMember(tx, therapistId);
    await assertStaffInScope(tx, therapistId, scope);
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
      .orderBy(...PRIMARY_ORDER);
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

/**
 * The OTHER services a therapist delivers, ticked in Equipa (owner ruling Q-M,
 * 2026-10-20). The patient app offers and assigns a therapist only for a
 * service they are mapped to, so the owner and the admins (users:manage) need
 * to mark SEVERAL services per therapist, not just the primary.
 *
 * THE PRIMARY IS NEVER TOUCHED, and that is the whole contract. The staff agenda
 * preselects the earliest-created mapping, ties by id (W3-04, read by
 * scheduling/therapist-services.ts), and PL-06a still governs the staff side.
 * So this function:
 *   - keeps the earliest row exactly as it is, whatever the form posted (its
 *     checkbox is shown ticked and disabled; the primary moves only through
 *     setTherapistPrimaryService above);
 *   - ADDS a newly ticked service as a plain INSERT stamped clock_timestamp(),
 *     which is later than the primary's committed created_at, so the primary
 *     stays the earliest;
 *   - REMOVES an unticked non-primary service with a DELETE of that row only.
 * Never an UPDATE (0023 is add/remove only; UPDATE 42501-throws). No migration:
 * one row per (therapist, service) is what `therapist_services` already holds.
 *
 * ONLY ACTIVE SERVICES ARE OFFERED, SO ONLY ACTIVE SERVICES ARE REMOVED. The form
 * lists the tenant's active services; a mapping to an archived service is not on
 * the form, so its absence from the post is not an untick and the row is kept.
 *
 * A therapist with NO primary yet is refused ("invalid"): the primary is the one
 * row the staff agenda reads, so it is chosen deliberately first, never inferred
 * from the order of a checkbox list. Admin-only, server-enforced (users:manage),
 * like the primary.
 */
export async function setTherapistServices(
  actor: RequestContext,
  therapistId: string,
  serviceIds: string[],
): Promise<void> {
  assertCan(actor.role, "users:manage");
  if (!therapistId) throw new AdminError("invalid");
  const wanted = [...new Set(serviceIds.filter((id) => id !== ""))];
  // PL-09 Phase 4: a location-scoped admin sets services only for staff at their clinics.
  const scope = await viewerLocationScope(actor);

  await runScoped(actor, async (tx) => {
    await lockMember(tx, therapistId);
    await assertStaffInScope(tx, therapistId, scope);
    const mapped = await tx
      .select({ serviceId: therapistServices.serviceId })
      .from(therapistServices)
      .where(eq(therapistServices.therapistUserId, therapistId))
      .orderBy(...PRIMARY_ORDER);
    const ids = mapped.map((m) => m.serviceId);
    const primary = ids[0];
    if (primary === undefined) throw new AdminError("invalid");

    // Every ticked id must be an ACTIVE service of this tenant (RLS scopes the
    // read); a forged or archived id refuses the whole save.
    const active = await tx
      .select({ id: services.id })
      .from(services)
      .where(eq(services.isActive, true));
    const activeIds = new Set(active.map((r) => r.id));
    if (wanted.some((id) => !activeIds.has(id))) throw new AdminError("invalid");

    const toAdd = wanted.filter((id) => !ids.includes(id));
    const toRemove = ids
      .slice(1) // never the primary
      .filter((id) => activeIds.has(id) && !wanted.includes(id));
    if (toAdd.length === 0 && toRemove.length === 0) return;

    if (toRemove.length > 0) {
      await tx
        .delete(therapistServices)
        .where(
          and(
            eq(therapistServices.therapistUserId, therapistId),
            inArray(therapistServices.serviceId, toRemove),
          ),
        ); // RLS scopes tenant
    }
    for (const s of toAdd) {
      await tx
        .insert(therapistServices)
        .values({
          tenantId: actor.tenantId, // NOT NULL + RLS WITH CHECK
          therapistUserId: therapistId,
          serviceId: s,
          createdAt: sql`clock_timestamp()`,
        })
        // A double submit that slipped past the lock finds the row there:
        // the unique (tenant, therapist, service) makes it a no-op, not a 500.
        .onConflictDoNothing();
    }

    await writeAudit(tx, actor, {
      action: "therapist.services.set",
      entityType: "therapist_services",
      entityId: therapistId,
      // PII-free: counts only.
      metadata: {
        added: toAdd.length,
        removed: toRemove.length,
        total: ids.length + toAdd.length - toRemove.length,
      },
    });
  });
}
