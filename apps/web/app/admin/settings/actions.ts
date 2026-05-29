"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/context";
import { updateTenantSettings } from "@/lib/admin/settings";
import { isAdminError } from "@/lib/admin/errors";

export async function saveSettings(formData: FormData): Promise<void> {
  const actor = await requireActor();

  let code = "ok";
  try {
    await updateTenantSettings(actor, {
      name: String(formData.get("name") ?? ""),
      nif: String(formData.get("nif") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      address: String(formData.get("address") ?? ""),
    });
  } catch (e) {
    code = isAdminError(e) ? `err:${e.code}` : "err";
  }

  revalidatePath("/admin/settings");
  redirect(`/admin/settings?m=${code}`);
}
