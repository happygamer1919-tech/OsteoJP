"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/context";
import {
  createService,
  deleteService,
  setServiceActive,
  setServiceLocationPrices,
  updateService,
} from "@/lib/admin/services";
import { createPack, deletePack, setPackActive, updatePack } from "@/lib/admin/packs";
import { AdminError, isAdminError } from "@/lib/admin/errors";

function parsePriceToCents(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) throw new AdminError("invalid", "invalid price");
  return Math.round(n * 100);
}

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
