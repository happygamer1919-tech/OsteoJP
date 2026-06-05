"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/auth/operator";
import {
  createTenant,
  setTenantStatus,
  isTenantInputError,
  type TenantStatus,
} from "@/lib/tenants";

export type CreateState = { ok: boolean; created?: boolean; code?: string };

export async function createTenantAction(
  _prev: CreateState,
  formData: FormData,
): Promise<CreateState> {
  const operator = await requireOperator();
  try {
    const { created } = await createTenant(operator, {
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      nif: String(formData.get("nif") ?? ""),
    });
    revalidatePath("/");
    return { ok: true, created };
  } catch (e) {
    return { ok: false, code: isTenantInputError(e) ? e.code : "error" };
  }
}

export async function setStatusAction(formData: FormData): Promise<void> {
  const operator = await requireOperator();
  const tenantId = String(formData.get("tenantId") ?? "");
  const status = String(formData.get("status") ?? "");
  let m = "ok";
  try {
    if (status !== "active" && status !== "suspended") throw new Error("bad status");
    await setTenantStatus(operator, tenantId, status as TenantStatus);
  } catch {
    m = "err";
  }
  revalidatePath("/");
  redirect(`/?m=${m}`);
}
