"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/context";
import {
  archiveAvailabilityTemplate,
  createAvailabilityTemplate,
  updateAvailabilityTemplate,
} from "@/lib/admin/availability";
import { reconcileWeek } from "@/lib/admin/schedule-reconcile";
import {
  createTimeOffBlock,
  createTimeOffBlockBatch,
  updateTimeOffBlock,
  deleteTimeOffBlock,
  type TimeOffBlockInput,
  type TimeOffMode,
} from "@/lib/admin/time-off";
import { parseTimeOffBatchForm } from "@/lib/admin/time-off-batch-form";
import { isAdminError } from "@/lib/admin/errors";

/**
 * PL-09 Phase 5 — reception-facing schedule actions. IDENTICAL data behaviour to
 * app/admin/working-hours/actions.ts (same lib write paths, same invariants), but
 * they revalidate + redirect to /horarios (the reception surface) instead of
 * /admin/staff, which reception cannot reach. The lib functions themselves enforce
 * the schedule:manage capability AND the own-location scope, so these thin wrappers
 * add no authority — a therapist the actor may not manage is rejected inside.
 */
async function run(fn: () => Promise<void>): Promise<never> {
  let code = "ok";
  try {
    await fn();
  } catch (e) {
    code = isAdminError(e) ? `err:${e.code}` : "err";
  }
  revalidatePath("/horarios");
  redirect(`/horarios?m=${code}`);
}

async function runBlock(
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
  revalidatePath("/horarios");
  redirect(`/horarios?m=${code}`);
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
  // PL-22: the third mode posts to the SAME action, so the form keeps one
  // submit button and one redirect. Only the write underneath differs.
  if (String(fd.get("mode") ?? "") === "lote") {
    // runBlock redirects (Promise<never>); returning it makes that explicit
    // rather than relying on the reader to know the lines below are dead.
    return runBlock(() => createTimeOffBlockBatch(actor, parseTimeOffBatchForm(fd)));
  }
  await runBlock(() => createTimeOffBlock(actor, parseBlockInput(fd)));
}

export async function updateTimeOffBlockAction(fd: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const id = String(fd.get("id") ?? "");
  await runBlock(() => updateTimeOffBlock(actor, id, parseBlockInput(fd)));
}

export async function deleteTimeOffBlockAction(fd: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const id = String(fd.get("id") ?? "");
  await runBlock(() => deleteTimeOffBlock(actor, id));
}

/**
 * Reconcile one therapist's whole week (the W4-14 shape), now with W13-A's
 * optional SECOND PERIOD per weekday: per weekday 0..6 the form submits
 * d{wd}_on / d{wd}_id / d{wd}_start / d{wd}_end / d{wd}_location, plus
 * d{wd}p2_on / d{wd}p2_id / d{wd}p2_start / d{wd}p2_end when a split shift is
 * set. enabled+id → update; enabled+no id → create; disabled+id → archive, per
 * period.
 *
 * THE LOOP ITSELF IS SHARED with app/admin/working-hours/actions.ts
 * (lib/admin/schedule-reconcile.ts). These two actions held identical copies
 * that differed only in where they redirect, and a split shift saved on one
 * surface would have been archived by the other the moment they disagreed.
 */
export async function saveScheduleAction(fd: FormData): Promise<void> {
  const actor = await requireRequestContext();
  const userId = String(fd.get("userId") ?? "");
  await run(() =>
    reconcileWeek(fd, userId, {
      create: (input) => createAvailabilityTemplate(actor, input),
      update: (id, input) => updateAvailabilityTemplate(actor, id, input),
      archive: (id) => archiveAvailabilityTemplate(actor, id),
    }),
  );
}
