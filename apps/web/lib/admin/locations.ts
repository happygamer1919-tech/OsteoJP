import "server-only";
import { asc, count, eq } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import {
  analyticsEvents,
  appointments,
  availabilityTemplates,
  locations,
  patientLocations,
  serviceLocationPrices,
  services,
} from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { writeAudit } from "./audit";
import { AdminError } from "./errors";

export type LocationView = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  // W3-07: a location is hard-deletable ONLY when no appointment references it;
  // otherwise the admin table offers Archive only (delete disabled + tooltip).
  hasAppointments: boolean;
  // PL-25: the portal's booking step for THIS clinic, in minutes (0041).
  slotGranularityMin: number;
};

export type LocationInput = {
  name: string;
  address: string;
  phone: string;
  /** PL-25: minutes. Omitted on paths that do not edit it (creation keeps 30). */
  slotGranularityMin?: string | number | null;
};

/**
 * PL-25 (owner CR 2026-07-31): the offsets a PATIENT may pick on the portal.
 * Deliberately two values, not a free number:
 *   60 - hourly only (09:00, 10:00, 11:00), what the owner asked for;
 *   30 - the historical default, kept so the change is reversible from the UI.
 * 15 is absent on purpose: ":15" is precisely what the CR removes, and an admin
 * control that can re-create the reported problem is not a control worth having.
 * Staff booking ignores this entirely - the agenda still books any time.
 */
export const SLOT_GRANULARITY_CHOICES = [30, 60] as const;

export async function listLocations(actor: RequestContext): Promise<LocationView[]> {
  assertCan(actor.role, "locations:read");
  return runScoped(actor, async (tx) => {
    const rows = await tx
      .select({
        id: locations.id,
        name: locations.name,
        address: locations.address,
        phone: locations.phone,
        isActive: locations.isActive,
        slotGranularityMin: locations.slotGranularityMin,
      })
      .from(locations)
      .orderBy(asc(locations.name));
    // Which locations have at least one appointment (tenant-scoped by RLS).
    const referenced = await tx
      .selectDistinct({ locationId: appointments.locationId })
      .from(appointments);
    const withAppointments = new Set(referenced.map((r) => r.locationId));
    return rows.map((r) => ({ ...r, hasAppointments: withAppointments.has(r.id) }));
  });
}

function validate(input: LocationInput): {
  name: string;
  address: string | null;
  phone: string | null;
  slotGranularityMin: number | null;
} {
  const name = input.name.trim();
  if (!name) throw new AdminError("invalid", "location name is required");
  return {
    name,
    address: input.address.trim() || null,
    phone: input.phone.trim() || null,
    slotGranularityMin: parseSlotGranularity(input.slotGranularityMin),
  };
}

/**
 * `null` means "the caller is not editing this", so the column keeps its value.
 * Anything present must be one of the offered choices - a hand-posted 5 would
 * hand patients a five-minute grid, so this rejects rather than clamps.
 */
function parseSlotGranularity(v: string | number | null | undefined): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || !SLOT_GRANULARITY_CHOICES.includes(n as 30 | 60)) {
    throw new AdminError("invalid", "invalid slot granularity");
  }
  return n;
}

export async function createLocation(actor: RequestContext, input: LocationInput): Promise<void> {
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
  actor: RequestContext,
  id: string,
  input: LocationInput,
): Promise<void> {
  assertCan(actor.role, "locations:write");
  const v = validate(input);
  await runScoped(actor, async (tx) => {
    const rows = await tx
      .update(locations)
      .set({
        name: v.name,
        address: v.address,
        phone: v.phone,
        // Absent -> untouched, so a caller that does not render the control
        // cannot silently reset a clinic's booking step.
        ...(v.slotGranularityMin === null ? {} : { slotGranularityMin: v.slotGranularityMin }),
      })
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
  actor: RequestContext,
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

/**
 * Hard-delete a location — allowed ONLY when NO appointment references it
 * (DECISIONS 2026-07-05). Referenced locations must be archived instead
 * (setLocationActive). Admin-only, tenant-scoped.
 *
 * FK handling (all six FKs into `locations` are ON DELETE no action, so a hard
 * delete must clear them first): the two NULLABLE, meaningful references are
 * preserved by NULLING them — a `service` survives as "all locations" and
 * `analytics_events` history stays, just unlinked. The purely location-scoped
 * config rows (`service_location_prices`, `availability_templates`,
 * `patient_locations`) are deleted child-first with RETURNING. Nothing
 * meaningful is discarded and no FK errors.
 */
export async function deleteLocation(actor: RequestContext, id: string): Promise<void> {
  assertCan(actor.role, "locations:write");
  if (!id) throw new AdminError("invalid");

  await runScoped(actor, async (tx) => {
    const [loc] = await tx
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.id, id))
      .limit(1);
    if (!loc) throw new AdminError("not_found");

    // Ruling gate (defense-in-depth; the UI disables delete for these too).
    const [{ n }] = await tx
      .select({ n: count() })
      .from(appointments)
      .where(eq(appointments.locationId, id));
    if (Number(n) > 0) throw new AdminError("has_appointments");

    // Preserve the nullable, meaningful references (service / analytics survive).
    await tx.update(services).set({ locationId: null }).where(eq(services.locationId, id));
    await tx
      .update(analyticsEvents)
      .set({ locationId: null })
      .where(eq(analyticsEvents.locationId, id));

    // Delete the purely location-scoped config rows child-first (RETURNING),
    // then the location — no orphans, no FK error.
    await tx
      .delete(serviceLocationPrices)
      .where(eq(serviceLocationPrices.locationId, id))
      .returning({ id: serviceLocationPrices.id });
    await tx
      .delete(availabilityTemplates)
      .where(eq(availabilityTemplates.locationId, id))
      .returning({ id: availabilityTemplates.id });
    await tx
      .delete(patientLocations)
      .where(eq(patientLocations.locationId, id))
      .returning({ id: patientLocations.id });

    const del = await tx
      .delete(locations)
      .where(eq(locations.id, id))
      .returning({ id: locations.id });
    if (!del[0]) throw new AdminError("not_found");

    await writeAudit(tx, actor, {
      action: "location.delete",
      entityType: "location",
      entityId: id,
    });
  });
}
