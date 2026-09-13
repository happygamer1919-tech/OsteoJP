import { vi, describe, it, expect, beforeEach } from "vitest";

/**
 * SCHED-25 — A SCHEDULE BLOCK ALWAYS CARRIES A NOTE, AT EVERY DOOR.
 *
 * ==========================================================================
 * WHY THIS FILE EXISTS AND WHY IT IS NOT IN block-actions.note.test.ts
 * ==========================================================================
 * SCHED-18 put the note rule in `apps/web/app/agenda/block-actions.ts` and
 * tested it there. That file is the AGENDA dialog. The Bloquear horário modal on
 * Equipa goes through `apps/web/app/admin/working-hours/actions.ts` ->
 * `createTimeOffBlock` and never touches it, so for two days it wrote anonymous
 * blocks while `agenda-blocked-time.spec.ts` created one on every run, green.
 *
 * A RULE TESTED AT ONE CALLER IS A CLAIM ABOUT THAT CALLER. This file asserts it
 * where it now lives - beside the insert, in `time-off.ts` - so it holds for
 * every caller including ones not written yet.
 *
 * THE UPDATE PATH IS HALF OF IT, and it is the half that reads as an
 * afterthought until you try it: `updateTimeOffBlock` took the same input type
 * and mapped an empty note to null, so a block created WITH a reason could have
 * that reason deleted afterwards through the same modal. A rule that only guards
 * creation leaves the archive reachable by the back door.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("./audit", () => ({ writeAudit: vi.fn() }));
vi.mock("./schedule-scope", () => ({
  resolveScheduleScope: vi.fn(async () => ({ kind: "all" })),
  assertTargetInScheduleScope: vi.fn(async () => undefined),
}));

import { runScoped } from "@/lib/auth/context";
import { createTimeOffBlock, createTimeOffBlockBatch, updateTimeOffBlock } from "./time-off";
import { isAdminError } from "./errors";
import type { RequestContext } from "@/lib/auth/context";

const mockRunScoped = vi.mocked(runScoped);
const admin = { tenantId: "tenant-A", role: "admin", userId: "admin-1" } as RequestContext;

type Written = { note: string | null };

/**
 * A tx that records what reached `timeOff`. The INSERT and the UPDATE are both
 * recorded into the same list: what every case below actually asserts is "did a
 * row get written", and which verb wrote it is not the question.
 */
function makeTx() {
  const written: Written[] = [];
  const tx = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({ where: () => ({ orderBy: async () => [] }) }),
      }),
    }),
    insert: () => ({
      values: (v: Written) => {
        written.push(v);
        return { returning: async () => [{ id: "block-1" }] };
      },
    }),
    update: () => ({
      set: (v: Written) => {
        written.push(v);
        return { where: () => ({ returning: async () => [{ id: "block-1" }] }) };
      },
    }),
  };
  return { tx, written };
}

const pontual = {
  userId: "ther-1",
  mode: "pontual" as const,
  startDate: "2026-08-03",
  startTime: "09:00",
  endTime: "10:00",
};

const batch = {
  userId: "ther-1",
  startDate: "2026-08-03",
  weekdays: [1],
  everyWeeks: 1,
  end: { kind: "count", count: 2 } as const,
  startTime: "09:00",
  endTime: "10:00",
};

beforeEach(() => {
  vi.clearAllMocks();
});

/** Run `fn` and return the AdminError code it threw, or null if it resolved. */
async function refusalCode(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return isAdminError(e) ? e.code : `unexpected:${String(e)}`;
  }
}

describe("SCHED-25: a block cannot be written without a note", () => {
  /**
   * THE THREE DOORS, ONE TABLE. Absent, empty and whitespace are listed
   * separately rather than folded into one case because they arrive from
   * different places: `undefined` from a programmatic caller, `""` from a
   * FormData field nobody filled, and `"   "` from an operator who pressed the
   * space bar to get past a required field. A guard written against `!note`
   * catches the first two and lets the third through.
   */
  for (const [label, note] of [
    ["absent", undefined],
    ["empty", ""],
    ["whitespace only", "   "],
  ] as const) {
    it(`createTimeOffBlock refuses a ${label} note, and writes nothing`, async () => {
      const { tx, written } = makeTx();
      mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

      expect(await refusalCode(() => createTimeOffBlock(admin, { ...pontual, note }))).toBe(
        "note_required",
      );
      // The refusal lands BEFORE the write. A guard that throws after the insert
      // has already put the anonymous block on the agenda.
      expect(written, "a row was written despite the refusal").toHaveLength(0);
    });

    it(`createTimeOffBlockBatch refuses a ${label} note, and writes nothing`, async () => {
      const { tx, written } = makeTx();
      mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

      expect(await refusalCode(() => createTimeOffBlockBatch(admin, { ...batch, note }))).toBe(
        "note_required",
      );
      expect(written).toHaveLength(0);
    });

    it(`updateTimeOffBlock refuses a ${label} note, so an existing reason cannot be cleared`, async () => {
      const { tx, written } = makeTx();
      mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

      expect(
        await refusalCode(() => updateTimeOffBlock(admin, "block-1", { ...pontual, note })),
      ).toBe("note_required");
      expect(written).toHaveLength(0);
    });
  }

  /**
   * THE POSITIVE ARM, and it is not a formality: without it every case above
   * would still pass if `requireNote` threw unconditionally, which is the
   * cheapest possible way to make a refusal test green while breaking blocking
   * entirely.
   */
  it("accepts a real note and stores it TRIMMED, on all three paths", async () => {
    const { tx, written } = makeTx();
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await createTimeOffBlock(admin, { ...pontual, note: "  Formação NESA  " });
    await createTimeOffBlockBatch(admin, { ...batch, note: "Férias do JP" });
    await updateTimeOffBlock(admin, "block-1", { ...pontual, note: "Atende em LV" });

    expect(written.map((w) => w.note)).toEqual([
      "Formação NESA",
      // The batch writes one row per generated date; both carry the same note.
      "Férias do JP",
      "Férias do JP",
      "Atende em LV",
    ]);
  });

  /**
   * `note_required` IS ITS OWN CODE, not `invalid`. The refusal has to be
   * distinguishable at the caller, because /admin/staff maps it to the sentence
   * that names the note box - and `invalid` is where a missing date and a
   * backwards hour range land. An operator whose dates are fine and who is told
   * "invalid" goes and re-checks the dates.
   */
  it("does not collapse into `invalid`, which points at the date fields", async () => {
    const { tx } = makeTx();
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    expect(await refusalCode(() => createTimeOffBlock(admin, { ...pontual, note: "" }))).toBe(
      "note_required",
    );
    // And a genuinely malformed window still reports `invalid`, so the two
    // refusals have not been merged from the other direction either.
    expect(
      await refusalCode(() =>
        createTimeOffBlock(admin, { ...pontual, startTime: "11:00", endTime: "09:00", note: "x" }),
      ),
    ).toBe("invalid");
  });
});
