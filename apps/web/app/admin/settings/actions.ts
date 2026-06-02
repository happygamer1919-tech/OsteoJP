"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/context";
import { updateTenantSettings } from "@/lib/admin/settings";
import { isAdminError } from "@/lib/admin/errors";
import { REMINDER_LEAD_TIME_OPTIONS } from "@/lib/admin/settings-config";

/** Selected lead-time checkboxes -> number[]. Unchecked boxes are simply absent. */
function readLeadTimes(formData: FormData): number[] {
  return REMINDER_LEAD_TIME_OPTIONS.filter(
    (hours) => formData.get(`reminderLeadTime_${hours}`) === "on",
  );
}

export async function saveSettings(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();

  let code = "ok";
  try {
    await updateTenantSettings(actor, {
      name: String(formData.get("name") ?? ""),
      nif: String(formData.get("nif") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      address: String(formData.get("address") ?? ""),
      config: {
        locale: String(formData.get("locale") ?? ""),
        reminderEmailEnabled: formData.get("reminderEmailEnabled") === "on",
        reminderSmsEnabled: formData.get("reminderSmsEnabled") === "on",
        reminderLeadTimeHours: readLeadTimes(formData),
        billingCurrency: String(formData.get("billingCurrency") ?? ""),
        billingVatRate: String(formData.get("billingVatRate") ?? ""),
        billingInvoiceEmail: String(formData.get("billingInvoiceEmail") ?? ""),
      },
    });
  } catch (e) {
    code = isAdminError(e) ? `err:${e.code}` : "err";
  }

  revalidatePath("/admin/settings");
  redirect(`/admin/settings?m=${code}`);
}
