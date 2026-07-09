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
import {
  createTimeOffBlock,
  updateTimeOffBlock,
  deleteTimeOffBlock,
  type TimeOffBlockInput,
  type TimeOffMode,
} from "@/lib/admin/time-off";
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

/**
 * Variant of `run` for the Bloquear horário actions: keeps the therapist focused
 * (?t=) so the block list stays visible after the op, and can pass a `warn:<n>`
 * message when a block overlaps existing appointments (they are warned, never
 * cancelled — Q-W5-4).
 */
async function runBlock(
  userId: string,
  fn: () => Promise<{ overlaps: unknown[] } | void>,
): Promise<never> {
  let code = "ok";
  try {
    const res = await fn();
    const n = res && "overlaps" in res ? res.overlaps.length : 0;
    if (n > 0) code = `warn:${n}`;
  } catch (e) {
    code = isAdminError(e) ? `err:${e.code}` : "err";
  }
  revalidatePath("/admin/working-hours");
  const t = userId ? `&t=${encodeURIComponent(userId)}` : "";
  redirect(`/admin/working-hours?m=${code}${t}`);
}

function parseBlockInput(fd: FormData): TimeOffBlockInput {
  const mode = String(fd.get("mode") ?? "pontual") as TimeOffMode;
  return {
    userId: String(fd.get("userId") ?? ""),
    mode,
    startDate: String(fd.get("startDate") ?? ""),
    endDate: String(fd.get("endDate") ?? ""),
    startTime: String(fd.get("startTime") ?? ""),
    endTime: String(fd.get("endTime") ?? ""),
    note: String(fd.get("note") ?? ""),
  };
}

export async function createTimeOffBlockAction(fd: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const input = parseBlockInput(fd);
  await runBlock(input.userId, () => createTimeOffBlock(actor, input));
}

export async function updateTimeOffBlockAction(fd: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const input = parseBlockInput(fd);
  const id = String(fd.get("id") ?? "");
  await runBlock(input.userId, () => updateTimeOffBlock(actor, id, input));
}

export async function deleteTimeOffBlockAction(fd: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const id = String(fd.get("id") ?? "");
  const userId = String(fd.get("userId") ?? "");
  await runBlock(userId, () => deleteTimeOffBlock(actor, id));
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

/**
 * W4-14 — reconcile a therapist's whole week from the Editar horário modal in a
 * single Guardar. For each weekday 0..6 the modal submits: `d{wd}_on` (present
 * = works that day), `d{wd}_id` (the existing active template id it manages, or
 * ""), `d{wd}_start`, `d{wd}_end`, `d{wd}_location`.
 *
 * Reconcile through the EXISTING W2-12 write paths (no new write path, no
 * schema): enabled+id → update; enabled+no id → create; disabled+id → archive
 * (soft, is_active=false — the in-modal "delete", NO password: the page is
 * admin-gated already, owner ruling 2026-07-06). All the W2-12 invariants
 * (validate, overlap-reject, end>start, active-locations-only) run unchanged
 * inside those calls.
 *
 * SAFETY (multi-shift): the modal tracks exactly ONE template id per weekday, so
 * a reconcile only ever archives/updates the id it manages. A therapist's second
 * active template on the same weekday (different location) is never surfaced and
 * never touched — it can never be silently archived.
 */
export async function saveTherapistScheduleAction(fd: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const userId = String(fd.get("userId") ?? "");
  await run(async () => {
    for (let wd = 0; wd < 7; wd++) {
      const on = fd.get(`d${wd}_on`) != null;
      const id = String(fd.get(`d${wd}_id`) ?? "");
      if (on) {
        const input: AvailabilityTemplateInput = {
          userId,
          locationId: String(fd.get(`d${wd}_location`) ?? ""),
          weekday: wd,
          startTime: String(fd.get(`d${wd}_start`) ?? ""),
          endTime: String(fd.get(`d${wd}_end`) ?? ""),
        };
        if (id) await updateAvailabilityTemplate(actor, id, input);
        else await createAvailabilityTemplate(actor, input);
      } else if (id) {
        await archiveAvailabilityTemplate(actor, id);
      }
    }
  });
}
