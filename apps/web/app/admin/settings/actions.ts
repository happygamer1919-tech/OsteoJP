"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/context";
import { updateTenantSettings } from "@/lib/admin/settings";
import { setDeletePassword } from "@/lib/admin/appointment-delete-password";
import { isAdminError } from "@/lib/admin/errors";
import { REMINDER_LEAD_TIME_OPTIONS } from "@/lib/admin/settings-config";
import {
  createHealthSystem,
  setHealthSystemActive,
  setHealthSystemsPriceTable,
} from "@/lib/admin/health-systems";

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

/* ------------------------------------------------------------------ */
/* Sistemas / SubSistemas (owner request 2026-11-02)                   */
/* ------------------------------------------------------------------ */
/* Each is its own form, so none rides on the main settings save. The  */
/* lib functions enforce settings:manage and audit every write; these  */
/* only read the form and redirect with an hs- code the page maps to a */
/* message inside the panel.                                           */

function hsCode(e: unknown): string {
  return isAdminError(e) ? `hs-err:${e.code}` : "hs-err";
}

function backToPanel(code: string): never {
  revalidatePath("/admin/settings");
  redirect(`/admin/settings?m=${code}#sistemas`);
}

export async function addHealthSystemAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  let code = "hs-ok";
  try {
    const outcome = await createHealthSystem(actor, String(formData.get("name") ?? ""));
    if (outcome === "reactivated") code = "hs-reactivated";
  } catch (e) {
    code = hsCode(e);
  }
  backToPanel(code);
}

export async function setHealthSystemActiveAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  let code = "hs-ok";
  try {
    await setHealthSystemActive(
      actor,
      String(formData.get("id") ?? ""),
      formData.get("active") === "true",
    );
  } catch (e) {
    code = hsCode(e);
  }
  backToPanel(code);
}

/** "Usa tabela de preços de Sistemas". Stored only: nothing reads it yet. */
export async function setHealthSystemsPriceTableAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  let code = "hs-ok";
  try {
    await setHealthSystemsPriceTable(actor, formData.get("enabled") === "true");
  } catch (e) {
    code = hsCode(e);
  }
  backToPanel(code);
}
