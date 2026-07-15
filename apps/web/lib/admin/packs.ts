import "server-only";
import { asc, eq } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { patientPackInstances, servicePacks, services } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { writeAudit } from "./audit";
import { AdminError } from "./errors";

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

    const del = await tx.delete(servicePacks).where(eq(servicePacks.id, id)).returning({ id: servicePacks.id });
    if (!del[0]) throw new AdminError("not_found");
    await writeAudit(tx, actor, { action: "pack.delete", entityType: "service_pack", entityId: id });
  });
}
