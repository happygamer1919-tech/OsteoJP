"use server";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/context";
import {
  createService,
  deleteService,
  setServiceActive,
  setServiceLocationPrices,
  setServicePatientBookable,
  updateService,
} from "@/lib/admin/services";
import {
  createPack,
  deletePack,
  setPackActive,
  setPackLocationPrices,
  updatePack,
  updatePackPrice,
} from "@/lib/admin/packs";
import { AdminError, isAdminError } from "@/lib/admin/errors";
import { locationPriceEntries, parsePriceToCents } from "@/lib/admin/price-input";


function parseDuration(raw: string): number {
  const n = Number(raw.trim());
  if (!Number.isInteger(n)) throw new AdminError("invalid", "invalid duration");
  return n;
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

export async function createServiceAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  await run(() =>
    createService(actor, {
      name: String(formData.get("name") ?? ""),
      durationMin: parseDuration(String(formData.get("durationMin") ?? "")),
      priceCents: parsePriceToCents(String(formData.get("price") ?? "")),
      contraindicationSensitive: formData.get("contraindicationSensitive") === "on",
    }),
  );
}

export async function updateServiceAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const id = String(formData.get("id") ?? "");
  await run(() =>
    updateService(actor, id, {
      name: String(formData.get("name") ?? ""),
      durationMin: parseDuration(String(formData.get("durationMin") ?? "")),
      priceCents: parsePriceToCents(String(formData.get("price") ?? "")),
      contraindicationSensitive: formData.get("contraindicationSensitive") === "on",
    }),
  );
}

export async function setServiceActiveAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  await run(() => setServiceActive(actor, id, active));
}

/**
 * W13-04 step 7 — toggle whether PATIENTS may book a service in the portal.
 *
 * A separate action from setServiceActiveAction because the two answer
 * different questions: `active` is "does the clinic still offer this at all",
 * `patient_bookable` is "may a patient book it themselves". Folding them into
 * one control would make archiving a service the only way to take it off the
 * portal, which would also take it off the staff agenda.
 */
export async function setServicePatientBookableAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const id = String(formData.get("id") ?? "");
  const bookable = String(formData.get("bookable") ?? "") === "true";
  await run(() => setServicePatientBookable(actor, id, bookable));
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
  // override (the location falls back to the service base price). Parsed
  // INSIDE run(): a refused price is then the page's banner, not an uncaught
  // throw that lands on the global error page.
  await run(() =>
    setServiceLocationPrices(actor, serviceId, locationPriceEntries(formData.entries())),
  );
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

/**
 * The inline price box on a "LISTA DE PACKS" row. Writes the price only
 * (`updatePackPrice` says why). An empty box is refused rather than read as 0:
 * a free pacote is typed as 0, never left blank by accident.
 */
export async function updatePackPriceAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const id = String(formData.get("id") ?? "");
  await runPack(async () => {
    const cents = parsePriceToCents(String(formData.get("price") ?? ""));
    if (cents === null) throw new AdminError("invalid", "price is required");
    await updatePackPrice(actor, id, cents);
  });
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
  // Parsed INSIDE runPack(), so a refused price is the banner, not a crash.
  await runPack(() =>
    setPackLocationPrices(actor, packId, locationPriceEntries(formData.entries())),
  );
}
