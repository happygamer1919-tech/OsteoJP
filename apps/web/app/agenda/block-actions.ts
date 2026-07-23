"use server";

import { requireRequestContext } from "@/lib/auth/context";
import { createTimeOffBlock } from "@/lib/admin/time-off";
import { isAdminError } from "@/lib/admin/errors";

/**
 * W12-28 - create a "pontual" (same-day hour range) time_off block from the
 * AGENDA, reusing the existing `createTimeOffBlock` (which server-enforces
 * settings:manage) + the existing booking-exclusion + BlockSpan rendering. No
 * new block model. Unlike the Admin > Working Hours FormData actions, this one
 * returns a result (no redirect) so the agenda can refresh in place and surface
 * an overlap warning (overlapping appointments are WARNED, never cancelled).
 *
 * Reception scoping is a SEPARATE decision (Q-W12-10): today blocks are
 * settings:manage (admin/owner); this affordance never relaxes that guard.
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
    // createTimeOffBlock asserts settings:manage + validates the window; surface
    // the guard/validation outcome without leaking internals.
    return { ok: false, error: isAdminError(e) ? e.code : "generic" };
  }
}
