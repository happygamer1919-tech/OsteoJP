"use server";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/context";
import {
  createService,
  deleteService,
  saveServiceTypesTable,
  setServiceContraindicationSensitive,
  setServiceLocationPrices,
} from "@/lib/admin/services";
import {
  ServiceTypesFormError,
  parseNewServiceType,
  parseServiceTypesTable,
} from "@/lib/admin/service-types-form";
import {
  createPack,
  deletePack,
  setPackActive,
  setPackLocationPrices,
  updatePack,
} from "@/lib/admin/packs";
import { AdminError, isAdminError } from "@/lib/admin/errors";

function parsePriceToCents(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) throw new AdminError("invalid", "invalid price");
  return Math.round(n * 100);
}

function parseSessionCount(raw: string): number {
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n <= 0) throw new AdminError("invalid", "invalid session count");
  return n;
}

// Empty select value ("") means "all locations" (locationId null), consistent
// with the service_packs schema (location_id null = all locations).
function parseLocationId(raw: string): string | null {
  const t = raw.trim();
  return t ? t : null;
}

async function run(fn: () => Promise<void>): Promise<never> {
  let code = "ok";
  try {
    await fn();
  } catch (e) {
    code = isAdminError(e) ? `err:${e.code}` : "err";
  }
  revalidatePath("/admin/services");
  redirect(`/admin/services?m=${code}`);
}

// Pack mutations report on a separate `mp` param so the pack banner is distinct
// from the service banner (both live on /admin/services). Accepts any resolved
// value (createPack returns the new id).
async function runPack(fn: () => Promise<unknown>): Promise<never> {
  let code = "ok";
  try {
    await fn();
  } catch (e) {
    code = isAdminError(e) ? `err:${e.code}` : "err";
  }
  revalidatePath("/admin/services");
  // W8-01c — packs are bookable types in the agenda drawer, sourced from the
  // cached agenda reference data. updateTag (not revalidateTag(tag,"max"))
  // invalidates IMMEDIATELY (read-your-writes) so the drawer sees a just-created
  // pack on the very next agenda load, not after the 60s TTL. The "max"-profile
  // form defers invalidation and left new packs invisible in booking.
  updateTag("agenda-reference-data");
  redirect(`/admin/services?mp=${code}`);
}

/**
 * TIPOS DE MARCACAO: the table's one save button and its new-type row.
 *
 * A form value the table cannot hold (a VAT rate Fisiozero does not offer, a
 * price that is not euros) reads as `err:invalid`, and nothing is saved. The
 * agenda's cached reference data is invalidated at once (as the pack actions
 * do): a type's name, duration and active switch feed the booking drawer.
 *
 * Each action reports on its OWN query parameter (`mt` the table save, `mn` the
 * new-type row), so the banner can say which of the two failed and why: "a value
 * in the table is invalid" and "the new type has an invalid value" point at
 * different boxes on the page.
 */
async function runTypes(param: "mt" | "mn", fn: () => Promise<void>): Promise<never> {
  let code = "ok";
  try {
    await fn();
  } catch (e) {
    code =
      e instanceof ServiceTypesFormError ? "err:invalid" : isAdminError(e) ? `err:${e.code}` : "err";
  }
  revalidatePath("/admin/services");
  updateTag("agenda-reference-data");
  redirect(`/admin/services?${param}=${code}`);
}

export async function saveServiceTypesTableAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  await runTypes("mt", () => saveServiceTypesTable(actor, parseServiceTypesTable(formData.entries())));
}

export async function createServiceTypeAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  await runTypes("mn", () => createService(actor, parseNewServiceType(formData.entries())));
}

/** The NESA contraindication flag, from the row's Gerir drawer. */
export async function setServiceContraindicationAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const id = String(formData.get("id") ?? "");
  const sensitive = formData.get("contraindicationSensitive") === "on";
  await run(() => setServiceContraindicationSensitive(actor, id, sensitive));
}

export async function deleteServiceAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const id = String(formData.get("id") ?? "");
  await run(() => deleteService(actor, id));
}

export async function setServiceLocationPricesAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const serviceId = String(formData.get("serviceId") ?? "");
  // One input per location, named `price__<locationId>`. Empty clears the
  // override (the location falls back to the service base price).
  const entries: { locationId: string; priceCents: number | null }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("price__")) continue;
    entries.push({
      locationId: key.slice("price__".length),
      priceCents: parsePriceToCents(String(value)),
    });
  }
  await run(() => setServiceLocationPrices(actor, serviceId, entries));
}

/* ------------------------------------------------------------------ */
/* Pack definitions (W8-01b) — admin CRUD over the W8-01a pack model.  */
/* Per-patient instances are booking-side (W8-01c), never here.        */
/* ------------------------------------------------------------------ */

export async function createPackAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  await runPack(() =>
    createPack(actor, {
      name: String(formData.get("name") ?? ""),
      baseServiceId: String(formData.get("baseServiceId") ?? ""),
      locationId: parseLocationId(String(formData.get("locationId") ?? "")),
      sessionCount: parseSessionCount(String(formData.get("sessionCount") ?? "")),
      priceCents: parsePriceToCents(String(formData.get("price") ?? "")) ?? 0,
    }),
  );
}

export async function updatePackAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const id = String(formData.get("id") ?? "");
  await runPack(() =>
    updatePack(actor, id, {
      name: String(formData.get("name") ?? ""),
      baseServiceId: String(formData.get("baseServiceId") ?? ""),
      locationId: parseLocationId(String(formData.get("locationId") ?? "")),
      sessionCount: parseSessionCount(String(formData.get("sessionCount") ?? "")),
      priceCents: parsePriceToCents(String(formData.get("price") ?? "")) ?? 0,
    }),
  );
}

export async function setPackActiveAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  await runPack(() => setPackActive(actor, id, active));
}

export async function deletePackAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const id = String(formData.get("id") ?? "");
  await runPack(() => deletePack(actor, id));
}

export async function setPackLocationPricesAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const packId = String(formData.get("packId") ?? "");
  // One input per location, named `price__<locationId>` (mirrors the services
  // grid). Empty clears the override (the location falls back to the pack base
  // price). Runs through runPack so the agenda reference cache is invalidated —
  // a pack's per-location price feeds booking display just like its base price.
  const entries: { locationId: string; priceCents: number | null }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("price__")) continue;
    entries.push({
      locationId: key.slice("price__".length),
      priceCents: parsePriceToCents(String(value)),
    });
  }
  await runPack(() => setPackLocationPrices(actor, packId, entries));
}
