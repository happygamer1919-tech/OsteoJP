import "server-only";
import { asc, eq } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { services } from "@osteojp/db";
import { runScoped, type Actor } from "@/lib/auth/context";
import { writeAudit } from "./audit";
import { AdminError } from "./errors";

export type ServiceView = {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number | null;
  currency: string;
  isActive: boolean;
};

export type ServiceInput = {
  name: string;
  durationMin: number;
  // Single global price per service. Per-location price overrides are NOT
  // modelled here — see the PR description's proposed service_location_prices
  // join table. priceCents null means "price not set".
  priceCents: number | null;
};

export async function listServices(actor: Actor): Promise<ServiceView[]> {
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

export async function createService(actor: Actor, input: ServiceInput): Promise<void> {
  assertCan(actor.role, "services:write");
  const { name, durationMin } = validate(input);

  await runScoped(actor, async (tx) => {
    const rows = await tx
      .insert(services)
      // tenant_id is NOT NULL with no default; RLS WITH CHECK validates it
      // against the JWT claim. Required column data, not a hand-applied filter.
      .values({ tenantId: actor.tenantId, name, durationMin, priceCents: input.priceCents })
      .returning({ id: services.id });
    await writeAudit(tx, actor, {
      action: "service.create",
      entityType: "service",
      entityId: rows[0]?.id ?? null,
    });
  });
}

export async function updateService(
  actor: Actor,
  id: string,
  input: ServiceInput,
): Promise<void> {
  assertCan(actor.role, "services:write");
  const { name, durationMin } = validate(input);

  await runScoped(actor, async (tx) => {
    const rows = await tx
      .update(services)
      .set({ name, durationMin, priceCents: input.priceCents })
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
  actor: Actor,
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
