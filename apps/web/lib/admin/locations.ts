import "server-only";
import { asc, eq } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { locations } from "@osteojp/db";
import { runScoped, type Actor } from "@/lib/auth/context";
import { writeAudit } from "./audit";
import { AdminError } from "./errors";

export type LocationView = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
};

export type LocationInput = {
  name: string;
  address: string;
  phone: string;
};

export async function listLocations(actor: Actor): Promise<LocationView[]> {
  assertCan(actor.role, "locations:read");
  return runScoped(actor, (tx) =>
    tx
      .select({
        id: locations.id,
        name: locations.name,
        address: locations.address,
        phone: locations.phone,
        isActive: locations.isActive,
      })
      .from(locations)
      .orderBy(asc(locations.name)),
  );
}

function validate(input: LocationInput): {
  name: string;
  address: string | null;
  phone: string | null;
} {
  const name = input.name.trim();
  if (!name) throw new AdminError("invalid", "location name is required");
  return {
    name,
    address: input.address.trim() || null,
    phone: input.phone.trim() || null,
  };
}

export async function createLocation(actor: Actor, input: LocationInput): Promise<void> {
  assertCan(actor.role, "locations:write");
  const v = validate(input);
  await runScoped(actor, async (tx) => {
    const rows = await tx
      .insert(locations)
      // tenant_id is NOT NULL with no default; RLS WITH CHECK validates it
      // against the JWT claim. Required column data, not a hand-applied filter.
      .values({ tenantId: actor.tenantId, name: v.name, address: v.address, phone: v.phone })
      .returning({ id: locations.id });
    await writeAudit(tx, actor, {
      action: "location.create",
      entityType: "location",
      entityId: rows[0]?.id ?? null,
    });
  });
}

export async function updateLocation(
  actor: Actor,
  id: string,
  input: LocationInput,
): Promise<void> {
  assertCan(actor.role, "locations:write");
  const v = validate(input);
  await runScoped(actor, async (tx) => {
    const rows = await tx
      .update(locations)
      .set({ name: v.name, address: v.address, phone: v.phone })
      .where(eq(locations.id, id))
      .returning({ id: locations.id });
    if (!rows[0]) throw new AdminError("not_found");
    await writeAudit(tx, actor, {
      action: "location.update",
      entityType: "location",
      entityId: id,
    });
  });
}

/** Soft archive (is_active=false) — appointments.location_id references these. */
export async function setLocationActive(
  actor: Actor,
  id: string,
  active: boolean,
): Promise<void> {
  assertCan(actor.role, "locations:write");
  await runScoped(actor, async (tx) => {
    const rows = await tx
      .update(locations)
      .set({ isActive: active })
      .where(eq(locations.id, id))
      .returning({ id: locations.id });
    if (!rows[0]) throw new AdminError("not_found");
    await writeAudit(tx, actor, {
      action: active ? "location.restore" : "location.archive",
      entityType: "location",
      entityId: id,
    });
  });
}
