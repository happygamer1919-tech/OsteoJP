import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import {
  patientPackInstances,
  servicePackLocationPrices,
  servicePacks,
  services,
} from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { writeAudit } from "./audit";
import { AdminError } from "./errors";
import { effectivePriceCents } from "./pricing";

// Re-export so the packs admin surface can pull the pure override-then-base
// fallback helper from the packs lib alongside the read functions that use it.
// The SAME resolver services use (per-location override wins, else base price).
export { effectivePriceCents };

/**
 * Pack definitions (W8-01a). A pack is a bookable TYPE: a base service each
 * session draws down, a session count, a pack price (integer cents), and
 * location scoping consistent with services (locationId null = all locations).
 * Per-patient pack instances (consumption) are booking-side (W8-01c), not here.
 * Gated on the services capability (packs live in Administracao > Servicos).
 */
export type PackView = {
  id: string;
  name: string;
  baseServiceId: string;
  locationId: string | null;
  sessionCount: number;
  priceCents: number;
  currency: string;
  isActive: boolean;
};

export type PackInput = {
  name: string;
  baseServiceId: string;
  locationId: string | null;
  sessionCount: number;
  priceCents: number;
};

/**
 * All packs for the tenant, no isActive filter (filters INCLUDE inactive per the
 * W6-01b split; the "select a pack" creation dropdown filters to active in the
 * UI). RLS-scoped.
 */
export async function listPacks(actor: RequestContext): Promise<PackView[]> {
  assertCan(actor.role, "services:read");
  return runScoped(actor, (tx) =>
    tx
      .select({
        id: servicePacks.id,
        name: servicePacks.name,
        baseServiceId: servicePacks.baseServiceId,
        locationId: servicePacks.locationId,
        sessionCount: servicePacks.sessionCount,
        priceCents: servicePacks.priceCents,
        currency: servicePacks.currency,
        isActive: servicePacks.isActive,
      })
      .from(servicePacks)
      .orderBy(asc(servicePacks.name)),
  );
}

/**
 * Validate + normalize a pack definition. Pure (no DB) so the rules are
 * unit-testable: name required, base service required, session_count a positive
 * integer, price a non-negative integer (cents, never float). locationId null =
 * offered at all locations.
 */
export function normalizePackInput(input: PackInput): PackInput {
  const name = input.name.trim();
  if (!name) throw new AdminError("invalid", "pack name is required");
  if (!input.baseServiceId) throw new AdminError("invalid", "a base service is required");
  if (!Number.isInteger(input.sessionCount) || input.sessionCount <= 0) {
    throw new AdminError("invalid", "session count must be a positive integer");
  }
  if (!Number.isInteger(input.priceCents) || input.priceCents < 0) {
    throw new AdminError("invalid", "pack price must be a non-negative integer (cents)");
  }
  return {
    name,
    baseServiceId: input.baseServiceId,
    locationId: input.locationId ?? null,
    sessionCount: input.sessionCount,
    priceCents: input.priceCents,
  };
}

export async function createPack(actor: RequestContext, input: PackInput): Promise<string> {
  assertCan(actor.role, "services:write");
  const v = normalizePackInput(input);
  return runScoped(actor, async (tx) => {
    // Base service must exist in this tenant (RLS scopes the read).
    const svc = await tx
      .select({ id: services.id })
      .from(services)
      .where(eq(services.id, v.baseServiceId))
      .limit(1);
    if (!svc[0]) throw new AdminError("not_found", "base service not found");

    const rows = await tx
      .insert(servicePacks)
      // tenant_id NOT NULL, no default; RLS WITH CHECK validates it vs the JWT claim.
      .values({
        tenantId: actor.tenantId,
        baseServiceId: v.baseServiceId,
        locationId: v.locationId,
        name: v.name,
        sessionCount: v.sessionCount,
        priceCents: v.priceCents,
      })
      .returning({ id: servicePacks.id });
    const id = rows[0]!.id;
    await writeAudit(tx, actor, { action: "pack.create", entityType: "service_pack", entityId: id });
    return id;
  });
}

export async function updatePack(actor: RequestContext, id: string, input: PackInput): Promise<void> {
  assertCan(actor.role, "services:write");
  const v = normalizePackInput(input);
  await runScoped(actor, async (tx) => {
    const svc = await tx
      .select({ id: services.id })
      .from(services)
      .where(eq(services.id, v.baseServiceId))
      .limit(1);
    if (!svc[0]) throw new AdminError("not_found", "base service not found");

    const rows = await tx
      .update(servicePacks)
      .set({
        baseServiceId: v.baseServiceId,
        locationId: v.locationId,
        name: v.name,
        sessionCount: v.sessionCount,
        priceCents: v.priceCents,
      })
      .where(eq(servicePacks.id, id))
      .returning({ id: servicePacks.id });
    if (!rows[0]) throw new AdminError("not_found");
    await writeAudit(tx, actor, { action: "pack.update", entityType: "service_pack", entityId: id });
  });
}

/** Soft archive (is_active=false). A pack with patient instances is never
 *  hard-deleted (see deletePack) — archive instead so history survives. */
export async function setPackActive(actor: RequestContext, id: string, active: boolean): Promise<void> {
  assertCan(actor.role, "services:write");
  await runScoped(actor, async (tx) => {
    const rows = await tx
      .update(servicePacks)
      .set({ isActive: active })
      .where(eq(servicePacks.id, id))
      .returning({ id: servicePacks.id });
    if (!rows[0]) throw new AdminError("not_found");
    await writeAudit(tx, actor, {
      action: active ? "pack.restore" : "pack.archive",
      entityType: "service_pack",
      entityId: id,
    });
  });
}

/** Packs that have at least one patient instance (not hard-deletable). */
export async function getReferencedPackIds(actor: RequestContext): Promise<Set<string>> {
  assertCan(actor.role, "services:read");
  return runScoped(actor, async (tx) => {
    const rows = await tx
      .selectDistinct({ packId: patientPackInstances.packId })
      .from(patientPackInstances);
    return new Set(rows.map((r) => r.packId));
  });
}

/**
 * Reference-guarded hard delete: refused (`has_references`) if ANY patient
 * instance references the pack — archive instead so a purchased pack's history
 * survives. A zero-instance pack (e.g. a mistyped definition) is hard-deleted.
 * Server-enforced; tenant-scoped.
 */
export async function deletePack(actor: RequestContext, id: string): Promise<void> {
  assertCan(actor.role, "services:write");
  if (!id) throw new AdminError("invalid");
  await runScoped(actor, async (tx) => {
    const [pack] = await tx
      .select({ id: servicePacks.id })
      .from(servicePacks)
      .where(eq(servicePacks.id, id))
      .limit(1);
    if (!pack) throw new AdminError("not_found");

    const inst = await tx
      .select({ id: patientPackInstances.id })
      .from(patientPackInstances)
      .where(eq(patientPackInstances.packId, id))
      .limit(1);
    if (inst.length > 0) throw new AdminError("has_references");

    // No patient instances: remove the pack's OWN per-location price overrides
    // (config) in the same tx, then hard-delete. The service_pack_location_prices
    // FK is ON DELETE no action, so the price rows must go first or the pack
    // delete would FK-fail. Mirrors deleteService's service_location_prices cleanup:
    // a pack's own price overrides are config, never a hard reference.
    const removedPrices = await tx
      .delete(servicePackLocationPrices)
      .where(eq(servicePackLocationPrices.packId, id))
      .returning({ id: servicePackLocationPrices.id });

    const del = await tx.delete(servicePacks).where(eq(servicePacks.id, id)).returning({ id: servicePacks.id });
    if (!del[0]) throw new AdminError("not_found");
    await writeAudit(tx, actor, {
      action: "pack.delete",
      entityType: "service_pack",
      entityId: id,
      metadata: { removedPriceOverrides: removedPrices.length },
    });
  });
}

/* ------------------------------------------------------------------ */
/* Per-location PACK pricing — overrides over service_packs.price_cents */
/* (the pack base). The exact mirror of the services per-location layer  */
/* (see services.ts): a row wins for its (pack, location); absent -> the */
/* pack base price. W12-20 (owner ruling 2026-07-25 — pacote edits SAME  */
/* as services).                                                         */
/* ------------------------------------------------------------------ */

export type PackLocationPriceView = {
  packId: string;
  locationId: string;
  priceCents: number;
};

/** All active per-location pack price overrides for the tenant (RLS-scoped). */
export async function listPackLocationPrices(
  actor: RequestContext,
): Promise<PackLocationPriceView[]> {
  assertCan(actor.role, "services:read");
  return runScoped(actor, (tx) =>
    tx
      .select({
        packId: servicePackLocationPrices.packId,
        locationId: servicePackLocationPrices.locationId,
        priceCents: servicePackLocationPrices.priceCents,
      })
      .from(servicePackLocationPrices)
      .where(eq(servicePackLocationPrices.isActive, true)),
  );
}

/**
 * Read path: the effective price of a pack at a given location, resolving the
 * per-location override first, then the pack base price. Mirrors
 * resolveServicePriceCents. service_packs.price_cents is NOT NULL, so a pack
 * always has a base — this returns null only when the pack itself is not found.
 */
export async function resolvePackPriceCents(
  actor: RequestContext,
  packId: string,
  locationId: string,
): Promise<number | null> {
  assertCan(actor.role, "services:read");
  return runScoped(actor, async (tx) => {
    const base = await tx
      .select({ priceCents: servicePacks.priceCents })
      .from(servicePacks)
      .where(eq(servicePacks.id, packId))
      .limit(1);
    if (!base[0]) return null;
    const override = await tx
      .select({ priceCents: servicePackLocationPrices.priceCents })
      .from(servicePackLocationPrices)
      .where(
        and(
          eq(servicePackLocationPrices.packId, packId),
          eq(servicePackLocationPrices.locationId, locationId),
          eq(servicePackLocationPrices.isActive, true),
        ),
      )
      .limit(1);
    return effectivePriceCents(base[0].priceCents, override[0]?.priceCents ?? null);
  });
}

/**
 * Offered-only-where-priced for packs (mirrors isServiceOfferedAtLocation): a
 * pack is OFFERED at a location when an ACTIVE service_pack_location_prices row
 * exists for that (pack, location) pair. The base price is a fallback AMOUNT,
 * never an implicit "offered everywhere" signal.
 */
export async function isPackOfferedAtLocation(
  actor: RequestContext,
  packId: string,
  locationId: string,
): Promise<boolean> {
  assertCan(actor.role, "services:read");
  return runScoped(actor, async (tx) => {
    const rows = await tx
      .select({ id: servicePackLocationPrices.id })
      .from(servicePackLocationPrices)
      .where(
        and(
          eq(servicePackLocationPrices.packId, packId),
          eq(servicePackLocationPrices.locationId, locationId),
          eq(servicePackLocationPrices.isActive, true),
        ),
      )
      .limit(1);
    return rows.length > 0;
  });
}

/**
 * Every (packId, locationId) pair a pack is offered at (an active price row
 * exists). Drives the "Oferecido aqui" affordance on the pack price grid, the
 * mirror of listServiceOfferings. RLS-scoped.
 */
export async function listPackOfferings(
  actor: RequestContext,
): Promise<{ packId: string; locationId: string }[]> {
  assertCan(actor.role, "services:read");
  return runScoped(actor, (tx) =>
    tx
      .select({
        packId: servicePackLocationPrices.packId,
        locationId: servicePackLocationPrices.locationId,
      })
      .from(servicePackLocationPrices)
      .where(eq(servicePackLocationPrices.isActive, true)),
  );
}

/**
 * Set per-location prices for one pack in a single tenant-scoped tx. Each entry
 * either upserts an override (priceCents) or clears it (null) so the location
 * falls back to the pack base price. One audit row records the change. The exact
 * mirror of setServiceLocationPrices.
 */
export async function setPackLocationPrices(
  actor: RequestContext,
  packId: string,
  entries: { locationId: string; priceCents: number | null }[],
): Promise<void> {
  assertCan(actor.role, "services:write");
  if (!packId) throw new AdminError("invalid", "pack id is required");
  for (const e of entries) {
    if (e.priceCents !== null && (!Number.isInteger(e.priceCents) || e.priceCents < 0)) {
      throw new AdminError("invalid", "price must be a non-negative integer (cents)");
    }
  }

  await runScoped(actor, async (tx) => {
    // Confirm the pack exists in this tenant (RLS scopes the read).
    const pack = await tx
      .select({ id: servicePacks.id })
      .from(servicePacks)
      .where(eq(servicePacks.id, packId))
      .limit(1);
    if (!pack[0]) throw new AdminError("not_found");

    for (const e of entries) {
      if (e.priceCents === null) {
        // Clear the override: removing the row lets the location inherit base.
        await tx
          .delete(servicePackLocationPrices)
          .where(
            and(
              eq(servicePackLocationPrices.packId, packId),
              eq(servicePackLocationPrices.locationId, e.locationId),
            ),
          );
      } else {
        // tenant_id is set explicitly (NOT NULL, no default); RLS WITH CHECK
        // validates it against the JWT claim.
        await tx
          .insert(servicePackLocationPrices)
          .values({
            tenantId: actor.tenantId,
            packId,
            locationId: e.locationId,
            priceCents: e.priceCents,
          })
          .onConflictDoUpdate({
            target: [
              servicePackLocationPrices.tenantId,
              servicePackLocationPrices.packId,
              servicePackLocationPrices.locationId,
            ],
            set: { priceCents: e.priceCents, isActive: true },
          });
      }
    }

    await writeAudit(tx, actor, {
      action: "pack.price.set",
      entityType: "service_pack",
      entityId: packId,
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
