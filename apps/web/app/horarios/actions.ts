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
import { applyAlternatingWeeks } from "@/lib/admin/alternating-schedule";
import { applyDayByDaySchedule } from "@/lib/admin/day-by-day-schedule";
// formatCreatedAt is the existing pt-PT Lisbon "dd/mm/yyyy HH:mm" formatter;
// reused rather than adding a second one that could format differently.
import { formatCreatedAt } from "@/lib/scheduling/time";
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

/**
 * ITEM 5 - apply an alternating-week pattern.
 *
 * RETURNS A RESULT RATHER THAN REDIRECTING, unlike saveScheduleAction above.
 * The affected-appointments list is the whole point of the response: PL-11 makes
 * this advisory, so the save SUCCEEDS and the caller has to be able to show what
 * it ran over. A redirect would throw that list away at exactly the moment
 * somebody needs to act on it.
 */
export type ScheduleWindowActionResult = {
  ok: boolean;
  error?: string;
  affected?: { id: string; label: string }[];
  /**
   * SCHED-04/SCHED-05: the dates already carrying dated work, when the save was
   * REFUSED for that reason. Present only on the refusal, and the caller shows
   * them verbatim - "some dates conflict" is not an answer somebody can act on.
   */
  collisionDates?: string[];
  /** How many dated rows an explicit replace superseded. */
  superseded?: number;
};

export async function applyAlternatingWeeksAction(input: {
  userId: string;
  weekdays: number[];
  startDate: string;
  endDate: string;
  locationAId: string;
  locationBId: string;
  startTime: string;
  endTime: string;
  /** The opt-in second action. Never set on a first submit. */
  replace?: boolean;
}): Promise<ScheduleWindowActionResult> {
  const actor = await requireRequestContext();
  try {
    const res = await applyAlternatingWeeks(
      actor,
      input.userId,
      {
        weekdays: input.weekdays,
        startDate: input.startDate,
        endDate: input.endDate,
        locationAId: input.locationAId,
        locationBId: input.locationBId,
        startTime: input.startTime,
        endTime: input.endTime,
      },
      { replace: input.replace },
    );
    if (!res.ok) return { ok: false, error: res.reason, collisionDates: res.dates };
    revalidatePath("/horarios");
    revalidatePath("/agenda");
    return {
      ok: true,
      superseded: res.superseded,
      affected: res.affected.map((a) => ({
        id: a.id,
        // Formatted here, on the server, where the Lisbon helpers already live.
        label: `${formatCreatedAt(a.startsAt)} · ${a.patientName}`,
      })),
    };
  } catch (e) {
    // The guard codes reach the caller as a code, never as an internal message.
    return { ok: false, error: isAdminError(e) ? e.code : "generic" };
  }
}

/**
 * SCHED-04 - apply a day-by-day window. Same response shape as the alternating
 * action above, deliberately: the panels differ in how the dates are chosen and
 * in nothing else, so the refusal, the superseded count and the advisory
 * appointment list are read by identical code on both.
 */
export async function applyDayByDayScheduleAction(input: {
  userId: string;
  startDate: string;
  endDate: string;
  entries: { date: string; locationId: string; startTime: string; endTime: string }[];
  replace?: boolean;
}): Promise<ScheduleWindowActionResult> {
  const actor = await requireRequestContext();
  try {
    const res = await applyDayByDaySchedule(
      actor,
      input.userId,
      {
        startDate: input.startDate,
        endDate: input.endDate,
        entries: input.entries,
      },
      { replace: input.replace },
    );
    if (!res.ok) return { ok: false, error: res.reason, collisionDates: res.dates };
    revalidatePath("/horarios");
    revalidatePath("/agenda");
    return {
      ok: true,
      superseded: res.superseded,
      affected: res.affected.map((a) => ({
        id: a.id,
        label: `${formatCreatedAt(a.startsAt)} · ${a.patientName}`,
      })),
    };
  } catch (e) {
    return { ok: false, error: isAdminError(e) ? e.code : "generic" };
  }
}
