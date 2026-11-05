"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/context";
import { isAdminError } from "@/lib/admin/errors";
import { createClosures, deleteClosure } from "@/lib/admin/closed-days";

/**
 * ENCERRAMENTOS - the page's two writes. Thin wrappers: each library function
 * asserts `closures:manage` and the clinic scope itself, so nothing here adds
 * authority. Each redirects back with a result code the page turns into one
 * sentence; a save also names the closures it wrote, so the page can list the
 * visits already booked inside them (owner answer C5).
 */
const PAGE = "/horarios/encerramentos";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** Clinic, Dia inicial, Dia final, optional Das/Ate, Tipo, Descricao. */
export async function createClosureAction(fd: FormData): Promise<void> {
  const actor = await requireRequestContext();
  let target = `${PAGE}?m=err`;
  try {
    const res = await createClosures(actor, {
      locationId: str(fd, "locationId"),
      startsOn: str(fd, "startsOn"),
      endsOn: str(fd, "endsOn") || str(fd, "startsOn"),
      closedFrom: fd.get("wholeDay") === "on" ? "" : str(fd, "closedFrom"),
      closedTo: fd.get("wholeDay") === "on" ? "" : str(fd, "closedTo"),
      kind: str(fd, "kind"),
      label: str(fd, "label"),
    });
    const code = res.affected.length > 0 ? `warn:${res.affected.length}` : "ok";
    target = `${PAGE}?m=${code}&c=${res.ids.join(",")}`;
  } catch (e) {
    target = `${PAGE}?m=${isAdminError(e) ? `err:${e.code}` : "err"}`;
  }
  revalidatePath(PAGE);
  revalidatePath("/agenda");
  redirect(target);
}

export async function deleteClosureAction(fd: FormData): Promise<void> {
  const actor = await requireRequestContext();
  let code = "removed";
  try {
    await deleteClosure(actor, str(fd, "id"));
  } catch (e) {
    code = isAdminError(e) ? `err:${e.code}` : "err";
  }
  revalidatePath(PAGE);
  revalidatePath("/agenda");
  redirect(`${PAGE}?m=${code}`);
}
