"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/context";
import { createLocation, deleteLocation, setLocationActive, updateLocation } from "@/lib/admin/locations";
import { isAdminError } from "@/lib/admin/errors";

async function run(fn: () => Promise<void>): Promise<never> {
  let code = "ok";
  try {
    await fn();
  } catch (e) {
    code = isAdminError(e) ? `err:${e.code}` : "err";
  }
  revalidatePath("/admin/locations");
  redirect(`/admin/locations?m=${code}`);
}

export async function createLocationAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  await run(() =>
    createLocation(actor, {
      name: String(formData.get("name") ?? ""),
      address: String(formData.get("address") ?? ""),
      phone: String(formData.get("phone") ?? ""),
    }),
  );
}

export async function updateLocationAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const id = String(formData.get("id") ?? "");
  await run(() =>
    updateLocation(actor, id, {
      name: String(formData.get("name") ?? ""),
      address: String(formData.get("address") ?? ""),
      phone: String(formData.get("phone") ?? ""),
    }),
  );
}

export async function setLocationActiveAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  await run(() => setLocationActive(actor, id, active));
}

export async function deleteLocationAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const id = String(formData.get("id") ?? "");
  await run(() => deleteLocation(actor, id));
}
