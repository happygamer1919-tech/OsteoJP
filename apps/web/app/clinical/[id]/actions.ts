"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/context";
import {
  createAddendum,
  signAndLockRecord,
  updateRecordData,
} from "@/lib/clinical/records";
import {
  confirmAttachment,
  createAttachmentDownloadUrl,
  createAttachmentUploadUrl,
} from "@/lib/clinical/storage";
import { isClinicalError } from "@/lib/clinical/errors";
import type { SaveState } from "./RecordForm";

export async function saveRecordAction(
  id: string,
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const ctx = await requireRequestContext();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(String(formData.get("data") ?? "{}")) as Record<string, unknown>;
  } catch {
    return { ok: false, code: "error" };
  }
  try {
    await updateRecordData(ctx, id, data);
  } catch (e) {
    if (isClinicalError(e)) {
      return { ok: false, code: e.code, errors: e.fieldErrors };
    }
    return { ok: false, code: "error" };
  }
  revalidatePath(`/clinical/${id}`);
  return { ok: true };
}

export async function signRecordAction(id: string): Promise<void> {
  const ctx = await requireRequestContext();
  let m = "signed";
  try {
    await signAndLockRecord(ctx, id);
  } catch (e) {
    m = isClinicalError(e) ? `err:${e.code}` : "err";
  }
  revalidatePath(`/clinical/${id}`);
  redirect(`/clinical/${id}?m=${m}`);
}

export async function versionRecordAction(id: string): Promise<void> {
  const ctx = await requireRequestContext();
  const { id: newId } = await createAddendum(ctx, id);
  revalidatePath(`/clinical/${newId}`);
  redirect(`/clinical/${newId}`);
}

/* Called programmatically from the Attachments client component. */

export async function createUploadUrlAction(
  recordId: string,
  fileName: string,
): Promise<{ ok: true; path: string; token: string } | { ok: false }> {
  const ctx = await requireRequestContext();
  try {
    const { path, token } = await createAttachmentUploadUrl(ctx, recordId, fileName);
    return { ok: true, path, token };
  } catch {
    return { ok: false };
  }
}

export async function confirmAttachmentAction(input: {
  recordId: string;
  path: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
}): Promise<{ ok: boolean }> {
  const ctx = await requireRequestContext();
  try {
    await confirmAttachment(ctx, input);
    revalidatePath(`/clinical/${input.recordId}`);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function downloadUrlAction(path: string): Promise<{ url: string | null }> {
  const ctx = await requireRequestContext();
  try {
    return { url: await createAttachmentDownloadUrl(ctx, path) };
  } catch {
    return { url: null };
  }
}
