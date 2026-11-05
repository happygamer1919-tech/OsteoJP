"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/context";
import { setBirthdayHeaderIcon, updateTenantSettings } from "@/lib/admin/settings";
import { setDeletePassword } from "@/lib/admin/appointment-delete-password";
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

/**
 * Indicação de Aniversários: the "Notificação de aniversariantes" switch.
 *
 * THE FORM SENDS THE VALUE IT WANTS ("true" or "false"), never "the other
 * one", as the ficha's survey switch does: a press on a stale screen sets what
 * the person saw themselves choosing. Anything else is refused without a
 * write. Who may (owner and admin) is decided in setBirthdayHeaderIcon.
 */
export async function saveBirthdayIndicationAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const wanted = formData.get("birthdayHeaderIcon");
  let code = "ok";
  if (wanted !== "true" && wanted !== "false") {
    code = "err:invalid";
  } else {
    try {
      await setBirthdayHeaderIcon(actor, wanted === "true");
    } catch (e) {
      code = isAdminError(e) ? `err:${e.code}` : "err";
    }
  }
  revalidatePath("/admin/settings");
  redirect(`/admin/settings?m=${code}`);
}

/**
 * Change the appointment-hard-delete password (W3-06). Admin-only — enforced
 * server-side by setDeletePassword (settings:manage). The plaintext is hashed
 * and never persisted, logged, or returned.
 */
export async function changeDeletePasswordAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  let code = "ok";
  try {
    await setDeletePassword(actor, String(formData.get("deletePassword") ?? ""));
  } catch (e) {
    code = isAdminError(e) ? `err:${e.code}` : "err";
  }
  revalidatePath("/admin/settings");
  redirect(`/admin/settings?m=${code}`);
}
