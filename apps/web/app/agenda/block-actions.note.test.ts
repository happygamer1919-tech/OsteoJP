/**
 * SCHED-18 - AN AGENDA BLOCK WITHOUT A NOTE IS REFUSED BY THE SERVER.
 *
 * ==========================================================================
 * WHY THE ASSERTION IS "NOTHING WAS WRITTEN", NOT "AN ERROR WAS RETURNED"
 * ==========================================================================
 * A refusal that still writes the row is the worst outcome available here, and
 * it is a real shape: the guard could be placed after the create call, or the
 * batch path could be given a copy of the rule that drifts. So every negative
 * case below asserts that `createTimeOffBlock` / `createTimeOffBlockBatch` were
 * NOT CALLED, and the returned code is checked second.
 *
 * BOTH PATHS, because "all modes" is the card's wording and the two actions are
 * separate functions. A repeated block writes one row per generated date and
 * every one of them carries this note; an unexplained block is no better for
 * being one of eight.
 *
 * THE CODE IS `note_required` AND NOT `validation`, and that is asserted rather
 * than incidental: the dialog can only say "write a note saying why" if it can
 * tell this refusal from a missing date. A caller that lumps them together sends
 * somebody looking at the wrong field.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const createTimeOffBlock = vi.fn();
const createTimeOffBlockBatch = vi.fn();

vi.mock("@/lib/auth/context", () => ({
  requireRequestContext: async () => ({ tenantId: "t-1", userId: "u-1", role: "reception" }),
}));
vi.mock("@/lib/admin/time-off", () => ({
  createTimeOffBlock: (...a: unknown[]) => createTimeOffBlock(...a),
  createTimeOffBlockBatch: (...a: unknown[]) => createTimeOffBlockBatch(...a),
}));
vi.mock("@/lib/admin/errors", () => ({ isAdminError: () => false }));

import { createAgendaBlockAction, createAgendaBlockBatchAction } from "./block-actions";

const ok = { userId: "u-2", date: "2026-09-21", startTime: "09:00", endTime: "10:00" };
const batchExtras = { weekdays: [1], everyWeeks: 1, end: { kind: "count", count: 2 } as const };

beforeEach(() => {
  createTimeOffBlock.mockReset().mockResolvedValue({ id: "b-1", overlaps: [] });
  createTimeOffBlockBatch.mockReset().mockResolvedValue({ dates: ["2026-09-21"], overlaps: [] });
});

describe("SCHED-18 - the single block", () => {
  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["only spaces", "   "],
    ["only a tab", "\t"],
  ])("refuses a note that is %s, and writes nothing", async (_label, note) => {
    const r = await createAgendaBlockAction({ ...ok, note: note as string });
    expect(createTimeOffBlock, "the block was created despite the refusal").not.toHaveBeenCalled();
    expect(r).toEqual({ ok: false, error: "note_required" });
  });

  it("accepts a real note and passes it through TRIMMED", async () => {
    const r = await createAgendaBlockAction({ ...ok, note: "  Atende em LV  " });
    expect(r.ok).toBe(true);
    expect(createTimeOffBlock).toHaveBeenCalledTimes(1);
    expect(createTimeOffBlock.mock.calls[0]![1]).toMatchObject({ note: "Atende em LV" });
  });

  it("still refuses a missing DATE before it looks at the note", async () => {
    // The two refusals must stay distinguishable in both directions: a form with
    // neither field filled should not be told to write a note.
    const r = await createAgendaBlockAction({ ...ok, date: "", note: "" });
    expect(r).toEqual({ ok: false, error: "validation" });
    expect(createTimeOffBlock).not.toHaveBeenCalled();
  });
});

describe("SCHED-18 - the repeated block, which is the path most likely to drift", () => {
  it("refuses an empty note and writes NO rows at all", async () => {
    const r = await createAgendaBlockBatchAction({ ...ok, ...batchExtras, note: "  " });
    expect(
      createTimeOffBlockBatch,
      "the batch ran despite the refusal - a recurrence that half-applies is the " +
        "worst outcome this guard exists to prevent",
    ).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: false, error: "note_required" });
  });

  it("carries the trimmed note onto the batch", async () => {
    const r = await createAgendaBlockBatchAction({
      ...ok,
      ...batchExtras,
      note: " Formação NESA ",
    });
    expect(r.ok).toBe(true);
    expect(createTimeOffBlockBatch.mock.calls[0]![1]).toMatchObject({ note: "Formação NESA" });
  });
});
