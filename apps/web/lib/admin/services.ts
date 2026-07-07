import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import {
  analyticsEvents,
  appointments,
  serviceLocationPrices,
  services,
  therapistServices,
} from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { writeAudit } from "./audit";
import { AdminError } from "./errors";
import { effectivePriceCents } from "./pricing";

// Re-export so callers can pull the pure fallback helper from the services lib
// alongside the read functions that use it.
export { effectivePriceCents };

export type ServiceView = {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number | null;
  currency: string;
  isActive: boolean;
  contraindicationSensitive: boolean;
};

export type ServiceInput = {
  name: string;
  durationMin: number;
  // The service base price. Per-location overrides sit on top of this in the
  // service_location_prices table (see setServiceLocationPrices /
  // resolveServicePriceCents below); effectivePriceCents resolves
  // override-then-base. priceCents null means "no base price set".
  priceCents: number | null;
  // NESA contraindication sensitivity (0031) — drives the soft booking warning.
  contraindicationSensitive?: boolean;
};

export async function listServices(actor: RequestContext): Promise<ServiceView[]> {
  assertCan(actor.role, "services:read");
  return runScoped(actor, (tx) =>
    tx
      .select({
        id: services.id,
        name: services.name,
        durationMin: services.durationMin,
        priceCents: services.priceCents,
        currency: services.currency,
        isActive: services.isActive,
        contraindicationSensitive: services.contraindicationSensitive,
      })
      .from(services)
      .orderBy(asc(services.name)),
  );
}

function validate(input: ServiceInput): { name: string; durationMin: number } {
  const name = input.name.trim();
  if (!name) throw new AdminError("invalid", "service name is required");
  if (!Number.isInteger(input.durationMin) || input.durationMin <= 0) {
    throw new AdminError("invalid", "duration must be a positive integer");
  }
  if (input.priceCents !== null && (!Number.isInteger(input.priceCents) || input.priceCents < 0)) {
    throw new AdminError("invalid", "price must be a non-negative integer (cents)");
  }
  return { name, durationMin: input.durationMin };
}

export async function createService(actor: RequestContext, input: ServiceInput): Promise<void> {
  assertCan(actor.role, "services:write");
  const { name, durationMin } = validate(input);

  await runScoped(actor, async (tx) => {
    const rows = await tx
      .insert(services)
      // tenant_id is NOT NULL with no default; RLS WITH CHECK validates it
      // against the JWT claim. Required column data, not a hand-applied filter.
      .values({
        tenantId: actor.tenantId,
        name,
        durationMin,
        priceCents: input.priceCents,
        contraindicationSensitive: input.contraindicationSensitive ?? false,
      })
      .returning({ id: services.id });
    await writeAudit(tx, actor, {
      action: "service.create",
      entityType: "service",
      entityId: rows[0]?.id ?? null,
    });
  });
}

export async function updateService(
  actor: RequestContext,
  id: string,
  input: ServiceInput,
): Promise<void> {
  assertCan(actor.role, "services:write");
  const { name, durationMin } = validate(input);

  await runScoped(actor, async (tx) => {
    const rows = await tx
      .update(services)
      .set({
        name,
        durationMin,
        priceCents: input.priceCents,
        contraindicationSensitive: input.contraindicationSensitive ?? false,
      })
      .where(eq(services.id, id))
      .returning({ id: services.id });
    if (!rows[0]) throw new AdminError("not_found");
    await writeAudit(tx, actor, {
      action: "service.update",
      entityType: "service",
      entityId: id,
    });
  });
}

/** Soft archive (is_active=false). Hard delete is avoided to preserve the FK
 *  references from appointments.service_id and clinical history. */
export async function setServiceActive(
  actor: RequestContext,
  id: string,
  active: boolean,
): Promise<void> {
  assertCan(actor.role, "services:write");
  await runScoped(actor, async (tx) => {
    const rows = await tx
      .update(services)
      .set({ isActive: active })
      .where(eq(services.id, id))
      .returning({ id: services.id });
    if (!rows[0]) throw new AdminError("not_found");
    await writeAudit(tx, actor, {
      action: active ? "service.restore" : "service.archive",
      entityType: "service",
      entityId: id,
    });
  });
}

/**
 * W4-15 — the CONFIRMED reference set for a service. Recon (schema FKs into
 * `services.id`) found FOUR relations, one more than the loop's three named:
 *   appointments.service_id, therapist_services.service_id,
 *   service_location_prices.service_id, analytics_events.service_id.
 * A service is "zero-reference" (hard-deletable) only when NONE of these
 * reference it. Returns the set of referenced service ids for the tenant, so the
 * UI can disable the delete control (archive-only) for referenced services.
 */
export async function getReferencedServiceIds(actor: RequestContext): Promise<Set<string>> {
  assertCan(actor.role, "services:read");
  return runScoped(actor, async (tx) => {
    const referenced = new Set<string>();
    const add = (rows: { serviceId: string | null }[]) => {
      for (const r of rows) if (r.serviceId) referenced.add(r.serviceId);
    };
    add(await tx.selectDistinct({ serviceId: appointments.serviceId }).from(appointments));
    add(await tx.selectDistinct({ serviceId: therapistServices.serviceId }).from(therapistServices));
    add(await tx.selectDistinct({ serviceId: serviceLocationPrices.serviceId }).from(serviceLocationPrices));
    add(await tx.selectDistinct({ serviceId: analyticsEvents.serviceId }).from(analyticsEvents));
    return referenced;
  });
}

/**
 * W4-15 — hard-delete a service, reference-guarded (owner ruling 2026-07-06),
 * NO password (services are not clinical/staff principals). Mirrors the W3-07
 * location-delete shape: a service with ANY reference across the confirmed set
 * is refused (`has_references`) and must be archived instead; a zero-reference
 * service is hard-deleted with RETURNING. Server-enforced (the disabled UI
 * control is only an affordance). Admin-only, tenant-scoped.
 */
export async function deleteService(actor: RequestContext, id: string): Promise<void> {
  assertCan(actor.role, "services:write");
  if (!id) throw new AdminError("invalid");
  await runScoped(actor, async (tx) => {
    const [svc] = await tx.select({ id: services.id }).from(services).where(eq(services.id, id)).limit(1);
    if (!svc) throw new AdminError("not_found");

    // Reference guard across the confirmed set (defense-in-depth; the UI also
    // disables delete for these). Any single reference → archive-only.
    const refChecks: Array<Promise<{ id: string }[]>> = [
      tx.select({ id: appointments.id }).from(appointments).where(eq(appointments.serviceId, id)).limit(1),
      tx.select({ id: therapistServices.id }).from(therapistServices).where(eq(therapistServices.serviceId, id)).limit(1),
      tx.select({ id: serviceLocationPrices.id }).from(serviceLocationPrices).where(eq(serviceLocationPrices.serviceId, id)).limit(1),
      tx.select({ id: analyticsEvents.id }).from(analyticsEvents).where(eq(analyticsEvents.serviceId, id)).limit(1),
    ];
    const results = await Promise.all(refChecks);
    if (results.some((rows) => rows.length > 0)) throw new AdminError("has_references");

    const del = await tx.delete(services).where(eq(services.id, id)).returning({ id: services.id });
    if (!del[0]) throw new AdminError("not_found");
    await writeAudit(tx, actor, {
      action: "service.delete",
      entityType: "service",
      entityId: id,
    });
  });
}

/* ------------------------------------------------------------------ */
/* Per-location pricing — overrides over services.price_cents (base)  */
/* ------------------------------------------------------------------ */

export type ServiceLocationPriceView = {
  serviceId: string;
  locationId: string;
  priceCents: number;
};

/** All active per-location price overrides for the tenant (RLS-scoped). */
export async function listServiceLocationPrices(
  actor: RequestContext,
): Promise<ServiceLocationPriceView[]> {
  assertCan(actor.role, "services:read");
  return runScoped(actor, (tx) =>
    tx
      .select({
        serviceId: serviceLocationPrices.serviceId,
        locationId: serviceLocationPrices.locationId,
        priceCents: serviceLocationPrices.priceCents,
      })
      .from(serviceLocationPrices)
      .where(eq(serviceLocationPrices.isActive, true)),
  );
}

/**
 * Read path: the effective price of a service at a given location, resolving
 * per-location override first, then the service base price. Returns null when
 * the service has no price at all (no override and no base).
 */
export async function resolveServicePriceCents(
  actor: RequestContext,
  serviceId: string,
  locationId: string,
): Promise<number | null> {
  assertCan(actor.role, "services:read");
  return runScoped(actor, async (tx) => {
    const base = await tx
      .select({ priceCents: services.priceCents })
      .from(services)
      .where(eq(services.id, serviceId))
      .limit(1);
    if (!base[0]) return null;
    const override = await tx
      .select({ priceCents: serviceLocationPrices.priceCents })
      .from(serviceLocationPrices)
      .where(
        and(
          eq(serviceLocationPrices.serviceId, serviceId),
          eq(serviceLocationPrices.locationId, locationId),
          eq(serviceLocationPrices.isActive, true),
        ),
      )
      .limit(1);
    return effectivePriceCents(base[0].priceCents, override[0]?.priceCents ?? null);
  });
}

/**
 * Set per-location prices for one service in a single tenant-scoped tx. Each
 * entry either upserts an override (priceCents) or clears it (null) so the
 * location falls back to the base price. One audit row records the change.
 */
export async function setServiceLocationPrices(
  actor: RequestContext,
  serviceId: string,
  entries: { locationId: string; priceCents: number | null }[],
): Promise<void> {
  assertCan(actor.role, "services:write");
  if (!serviceId) throw new AdminError("invalid", "service id is required");
  for (const e of entries) {
    if (
      e.priceCents !== null &&
      (!Number.isInteger(e.priceCents) || e.priceCents < 0)
    ) {
      throw new AdminError("invalid", "price must be a non-negative integer (cents)");
    }
  }

  await runScoped(actor, async (tx) => {
    // Confirm the service exists in this tenant (RLS scopes the read).
    const svc = await tx
      .select({ id: services.id })
      .from(services)
      .where(eq(services.id, serviceId))
      .limit(1);
    if (!svc[0]) throw new AdminError("not_found");

    for (const e of entries) {
      if (e.priceCents === null) {
        // Clear the override: removing the row lets the location inherit base.
        await tx
          .delete(serviceLocationPrices)
          .where(
            and(
              eq(serviceLocationPrices.serviceId, serviceId),
              eq(serviceLocationPrices.locationId, e.locationId),
            ),
          );
      } else {
        // tenant_id is set explicitly (NOT NULL, no default); RLS WITH CHECK
        // validates it against the JWT claim.
        await tx
          .insert(serviceLocationPrices)
          .values({
            tenantId: actor.tenantId,
            serviceId,
            locationId: e.locationId,
            priceCents: e.priceCents,
          })
          .onConflictDoUpdate({
            target: [
              serviceLocationPrices.tenantId,
              serviceLocationPrices.serviceId,
              serviceLocationPrices.locationId,
            ],
            set: { priceCents: e.priceCents, isActive: true },
          });
      }
    }

    await writeAudit(tx, actor, {
      action: "service.price.set",
      entityType: "service",
      entityId: serviceId,
      // PII-free: only ids and which locations were cleared, never amounts.
      metadata: {
        locationIds: entries.map((e) => e.locationId),
        clearedLocationIds: entries
          .filter((e) => e.priceCents === null)
          .map((e) => e.locationId),
      },
    });
  });
}
