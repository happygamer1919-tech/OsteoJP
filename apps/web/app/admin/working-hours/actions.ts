"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/context";
import {
  archiveAvailabilityTemplate,
  createAvailabilityTemplate,
  updateAvailabilityTemplate,
  type AvailabilityTemplateInput,
} from "@/lib/admin/availability";
import { isAdminError } from "@/lib/admin/errors";

async function run(fn: () => Promise<void>): Promise<never> {
  let code = "ok";
  try {
    await fn();
  } catch (e) {
    code = isAdminError(e) ? `err:${e.code}` : "err";
  }
  revalidatePath("/admin/working-hours");
  redirect(`/admin/working-hours?m=${code}`);
}

function parseInput(fd: FormData): AvailabilityTemplateInput {
  return {
    userId: String(fd.get("userId") ?? ""),
    locationId: String(fd.get("locationId") ?? ""),
    weekday: Number.parseInt(String(fd.get("weekday") ?? ""), 10),
    startTime: String(fd.get("startTime") ?? ""),
    endTime: String(fd.get("endTime") ?? ""),
  };
}

export async function createAvailabilityTemplateAction(fd: FormData): Promise<void> {
  const actor = await requireRequestContext();
  await run(() => createAvailabilityTemplate(actor, parseInput(fd)));
}

export async function updateAvailabilityTemplateAction(fd: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const id = String(fd.get("id") ?? "");
  await run(() => updateAvailabilityTemplate(actor, id, parseInput(fd)));
}

export async function archiveAvailabilityTemplateAction(fd: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const id = String(fd.get("id") ?? "");
  await run(() => archiveAvailabilityTemplate(actor, id));
}
