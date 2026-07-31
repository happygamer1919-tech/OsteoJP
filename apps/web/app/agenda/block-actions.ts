"use server";

import { requireRequestContext } from "@/lib/auth/context";
import { createTimeOffBlock, createTimeOffBlockBatch } from "@/lib/admin/time-off";
import type { LoteEnd } from "@/lib/scheduling/lote";
import { isAdminError } from "@/lib/admin/errors";

/**
 * W12-28 - create a "pontual" (same-day hour range) time_off block from the
 * AGENDA, reusing the existing `createTimeOffBlock` + the existing
 * booking-exclusion + BlockSpan rendering. No new block model. Unlike the
 * Admin > Working Hours FormData actions, this one returns a result (no
 * redirect) so the agenda can refresh in place and surface an overlap warning
 * (overlapping appointments are WARNED, never cancelled).
 *
 * PL-27: the guard is `schedule:manage`, asserted inside createTimeOffBlock,
 * which reception holds (PL-09 Phase 5). The old comment here claimed
 * settings:manage; that was true at W12-28 and stopped being true at PL-09
 * Phase 5, which is how the agenda button came to be hidden from the role that
 * owns scheduling. Location scope is enforced separately and unchanged
 * (resolveScheduleScope + assertTargetInScheduleScope), so reception can only
 * ever block a therapist at their own clinic.
 */
export type AgendaBlockInput = {
  userId: string;
  /** "yyyy-mm-dd" Lisbon date. */
  date: string;
  /** "HH:mm" Lisbon. */
  startTime: string;
  /** "HH:mm" Lisbon. */
  endTime: string;
};

export async function createAgendaBlockAction(
  input: AgendaBlockInput,
): Promise<{ ok: boolean; error?: string; overlaps?: number }> {
  const actor = await requireRequestContext();
  if (!input.userId || !input.date || !input.startTime || !input.endTime) {
    return { ok: false, error: "validation" };
  }
  try {
    const { overlaps } = await createTimeOffBlock(actor, {
      userId: input.userId,
      mode: "pontual",
      startDate: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
    });
    return { ok: true, overlaps: overlaps.length };
  } catch (e) {
    // createTimeOffBlock asserts schedule:manage + validates the window; surface
    // the guard/validation outcome without leaking internals.
    return { ok: false, error: isAdminError(e) ? e.code : "generic" };
  }
}

/**
 * PL-27 - the same block, REPEATED. Owner report 2026-07-31: "reception still
 * doesn't have batch schedule block, same as you made in the new appointment
 * panel".
 *
 * PL-22 shipped bulk blocking, but only inside the per-therapist Bloquear
 * horário modal on Horarios/Equipa. The agenda is where the day is actually
 * managed, and the agenda offered single blocks only - so from where reception
 * works, batch blocking did not exist. This wires the agenda dialog to the SAME
 * createTimeOffBlockBatch PL-22 built: one transaction, overlaps reported and
 * deduped, never cancelled.
 */
export type AgendaBlockBatchInput = AgendaBlockInput & {
  /** Weekdays to block, 0=Sunday..6=Saturday. Empty = the date's own weekday. */
  weekdays: number[];
  everyWeeks: number;
  end: LoteEnd;
};

export async function createAgendaBlockBatchAction(
  input: AgendaBlockBatchInput,
): Promise<{ ok: boolean; error?: string; overlaps?: number; blocks?: number }> {
  const actor = await requireRequestContext();
  if (!input.userId || !input.date || !input.startTime || !input.endTime) {
    return { ok: false, error: "validation" };
  }
  try {
    const { dates, overlaps } = await createTimeOffBlockBatch(actor, {
      userId: input.userId,
      startDate: input.date,
      weekdays: input.weekdays,
      everyWeeks: input.everyWeeks,
      end: input.end,
      startTime: input.startTime,
      endTime: input.endTime,
    });
    return { ok: true, blocks: dates.length, overlaps: overlaps.length };
  } catch (e) {
    return { ok: false, error: isAdminError(e) ? e.code : "generic" };
  }
}
