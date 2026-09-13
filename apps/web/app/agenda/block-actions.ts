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
  /**
   * SCHED-18 - WHY. REQUIRED HERE, NOT NULL IN THE DATABASE, AND THE TWO ARE
   * DIFFERENT CLAIMS.
   *
   * `time_off.note` is nullable and stays nullable. A NOT NULL column would be a
   * statement about every row ever written, and this clinic already holds
   * blocks with no note - 19 of one therapist's 35 are in the past. Migrating
   * those would mean inventing a reason for each, which is worse than the gap.
   *
   * What IS new is a rule about writes through THIS dialog, and a rule about
   * writes is the action layer's to enforce. So: required at the door, optional
   * in the archive.
   */
  note: string;
};

/**
 * SCHED-18 - the note rule, in ONE place because there are two callers.
 *
 * The single and the batch action both write blocks and both must refuse an
 * empty note. Restating the test in each is how two write paths come to disagree
 * about the same rule; `blockNote` returns the trimmed value or null, and null
 * IS the refusal.
 *
 * TRIMMED, so a space bar is not a reason. The whole point of the field is that
 * somebody reading the agenda in three weeks can tell what the block was for -
 * "Atende em LV" is what the September outage's note said, and it was the only
 * thing on the row that recorded anybody's intent.
 *
 * === SCHED-25: "ONE PLACE" WAS TWO CALLERS, NOT EVERY CALLER. ===
 *
 * The sentence above said ONE PLACE and meant "one place in this file", and
 * this file is the AGENDA dialog. The Equipa modal writes through
 * `app/admin/working-hours/actions.ts` -> `createTimeOffBlock`, never reaches
 * here, and accepted anonymous blocks until SCHED-25 moved the rule beside the
 * insert (`lib/admin/time-off.ts`, `requireNote`).
 *
 * THIS CHECK STAYS, AND IT IS NOT A RESTATEMENT OF THE RULE. It is a
 * fast-refusal so the dialog gets `note_required` without a round trip through
 * the permission check and the scope resolution. The two agree BY CONSTRUCTION
 * rather than by care: `requireNote` throws `AdminError("note_required")`, the
 * catch below maps an AdminError to its own code, so both arms of this function
 * return the same string whichever one fires. Deleting this block changes the
 * latency and nothing else.
 */
function blockNote(note: string | undefined): string | null {
  const trimmed = (note ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

export async function createAgendaBlockAction(
  input: AgendaBlockInput,
): Promise<{ ok: boolean; error?: string; overlaps?: number }> {
  const actor = await requireRequestContext();
  if (!input.userId || !input.date || !input.startTime || !input.endTime) {
    return { ok: false, error: "validation" };
  }
  const note = blockNote(input.note);
  // A DISTINCT CODE, not "validation". The dialog can only say the useful
  // sentence - "write a note saying why" - if it can tell this refusal from a
  // missing date, and a caller that lumps them together sends somebody looking
  // at the wrong field.
  if (note === null) return { ok: false, error: "note_required" };
  try {
    const { overlaps } = await createTimeOffBlock(actor, {
      userId: input.userId,
      mode: "pontual",
      startDate: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      note,
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
  // ALL MODES, which is what the card asks for. A repeated block is many rows
  // and every one of them carries the same note; an unexplained block is no
  // better for being one of eight.
  const note = blockNote(input.note);
  if (note === null) return { ok: false, error: "note_required" };
  try {
    const { dates, overlaps } = await createTimeOffBlockBatch(actor, {
      userId: input.userId,
      startDate: input.date,
      weekdays: input.weekdays,
      everyWeeks: input.everyWeeks,
      end: input.end,
      startTime: input.startTime,
      endTime: input.endTime,
      note,
    });
    return { ok: true, blocks: dates.length, overlaps: overlaps.length };
  } catch (e) {
    return { ok: false, error: isAdminError(e) ? e.code : "generic" };
  }
}
