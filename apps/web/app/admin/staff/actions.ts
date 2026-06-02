"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/context";
import { changeStaffRole, editStaff, inviteStaff, setStaffActive } from "@/lib/admin/staff";
import { isAdminError } from "@/lib/admin/errors";

export type InviteState = { ok: boolean; tempPassword?: string; code?: string };

export async function inviteAction(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const actor = await requireRequestContext();
  try {
    const { tempPassword } = await inviteStaff(actor, {
      email: String(formData.get("email") ?? ""),
      fullName: String(formData.get("fullName") ?? ""),
      roleSlug: String(formData.get("role") ?? ""),
    });
    revalidatePath("/admin/staff");
    return { ok: true, tempPassword };
  } catch (e) {
    return { ok: false, code: isAdminError(e) ? e.code : "error" };
  }
}

export async function changeRoleAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  let code = "ok";
  try {
    await changeStaffRole(
      actor,
      String(formData.get("userId") ?? ""),
      String(formData.get("role") ?? ""),
    );
  } catch (e) {
    code = isAdminError(e) ? `err:${e.code}` : "err";
  }
  revalidatePath("/admin/staff");
  redirect(`/admin/staff?m=${code}`);
}

export async function editStaffAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  let code = "ok";
  try {
    await editStaff(actor, String(formData.get("userId") ?? ""), {
      fullName: String(formData.get("fullName") ?? ""),
      email: String(formData.get("email") ?? ""),
    });
  } catch (e) {
    code = isAdminError(e) ? `err:${e.code}` : "err";
  }
  revalidatePath("/admin/staff");
  redirect(`/admin/staff?m=${code}`);
}

export async function setActiveAction(formData: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const active = String(formData.get("active") ?? "") === "true";
  let code = "ok";
  try {
    await setStaffActive(actor, String(formData.get("userId") ?? ""), active);
  } catch (e) {
    code = isAdminError(e) ? `err:${e.code}` : "err";
  }
  revalidatePath("/admin/staff");
  redirect(`/admin/staff?m=${code}`);
}
