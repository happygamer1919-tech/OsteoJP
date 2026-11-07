import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * BLOQUEIOS DE REPETICAO SEMANAL - the staff readers, with the database mocked.
 *
 * Three things are pinned here, each the place a weekly rule could be lost:
 *   1. readWeeklyBlockRows is INERT while the table is absent (no query at all,
 *      so a database without the pending migration never sees 42P01), and
 *      expands the rules once it exists, labelled "Bloqueio semanal".
 *   2. findScheduleConflicts reports an expanded weekly block as a `time_off`
 *      conflict, so it BLOCKS by default and "Guardar mesmo assim" overrides it
 *      exactly as it overrides a time_off row (blockingConflicts keeps it).
 *   3. The agenda band and the availability read get the weekly blocks from
 *      the same readBlockRows, merged with time_off and sorted.
 */

vi.mock("server-only", () => ({}));

const present = vi.fn<(db: unknown) => Promise<boolean>>();
vi.mock("@osteojp/db", async (orig) => {
  const real = await orig<typeof import("@osteojp/db")>();
  return { ...real, weeklyBlocksSchemaPresent: (db: unknown) => present(db) };
});

vi.mock("./effective-availability", () => ({ readEffectiveTemplates: vi.fn(async () => []) }));
vi.mock("./shared-resources", () => ({ listSharedResourcesTx: vi.fn(async () => []) }));
vi.mock("@/lib/auth/context", () => ({
  runScoped: vi.fn(async (_ctx: unknown, fn: (tx: unknown) => unknown) => fn(currentTx)),
}));

import { readWeeklyBlockRows } from "./weekly-blocks";
import { findScheduleConflicts } from "./conflict";
import { blockingConflicts } from "./conflict-core";
import { listTherapistBlocksAndHours } from "./day-availability";
import type { DbTx } from "@osteojp/db";
import type { RequestContext } from "@osteojp/auth";

let currentTx: unknown;

/**
 * A tx whose every select resolves to `rowsFor(table)`. Drizzle's builder is
 * chainable in several orders (where/orderBy), so each step returns the same
 * thenable. `selected` records which tables were read.
 */
function makeTx(rowsFor: (table: string) => unknown[]) {
  const selected: string[] = [];
  const tx = {
    select: () => ({
      from: (t: unknown) => {
        const name = tableName(t);
        selected.push(name);
        const result = Promise.resolve(rowsFor(name));
        const chain: Record<string, unknown> = {
          where: () => chain,
          orderBy: () => chain,
          limit: () => chain,
          innerJoin: () => chain,
          leftJoin: () => chain,
          then: result.then.bind(result),
        };
        return chain;
      },
    }),
    execute: vi.fn(async () => []),
  };
  return { tx: tx as unknown as DbTx, selected };
}

function tableName(t: unknown): string {
  const sym = Object.getOwnPropertySymbols(t as object).find((s) => String(s) === "Symbol(drizzle:Name)");
  return sym ? String((t as Record<symbol, unknown>)[sym]) : "?";
}

const monday0800 = { id: "r1", userId: "t1", weekday: 1, startTime: "08:00:00", endTime: "11:00:00" };

beforeEach(() => {
  present.mockReset();
});

describe("readWeeklyBlockRows", () => {
  it("is inert while the table is absent: no query against it, no blocks", async () => {
    present.mockResolvedValue(false);
    const { tx, selected } = makeTx(() => [monday0800]);
    const out = await readWeeklyBlockRows(tx, {
      therapistId: "t1",
      rangeStart: new Date("2026-11-02T00:00:00Z"),
      rangeEnd: new Date("2026-11-03T00:00:00Z"),
    });
    expect(out).toEqual([]);
    expect(selected).toEqual([]);
  });

  it("once the table exists, expands the rules over the range, labelled for the band", async () => {
    present.mockResolvedValue(true);
    const { tx, selected } = makeTx(() => [monday0800]);
    const out = await readWeeklyBlockRows(tx, {
      therapistId: "t1",
      rangeStart: new Date("2026-11-02T00:00:00Z"),
      rangeEnd: new Date("2026-11-03T00:00:00Z"),
    });
    expect(selected).toEqual(["therapist_weekly_blocks"]);
    expect(out).toEqual([
      {
        id: "weekly:r1:2026-11-02",
        startsAt: new Date("2026-11-02T08:00:00Z"),
        endsAt: new Date("2026-11-02T11:00:00Z"),
        reason: "weekly",
        note: "Bloqueio semanal",
      },
    ]);
  });
});

describe("findScheduleConflicts: a weekly rule is a time_off conflict, overridable like one", () => {
  const window = {
    practitionerId: "t1",
    locationId: "loc",
    startsAt: new Date("2026-11-09T09:00:00Z"),
    endsAt: new Date("2026-11-09T10:00:00Z"),
  };

  it("a booking inside a weekly rule is refused by default (a blocking time_off conflict)", async () => {
    present.mockResolvedValue(true);
    const { tx } = makeTx((t) => (t === "therapist_weekly_blocks" ? [monday0800] : []));
    const found = await findScheduleConflicts(tx, window);
    expect(found).toEqual([
      {
        kind: "time_off",
        id: "weekly:r1:2026-11-09",
        patientName: null,
        startsAt: "2026-11-09T08:00:00.000Z",
        endsAt: "2026-11-09T11:00:00.000Z",
        room: null,
        reason: "weekly",
      },
    ]);
    // The SAME classifier that makes a time_off row block (and lets
    // allowConflict through) keeps it: no new override path, no new refusal.
    expect(blockingConflicts(found)).toHaveLength(1);
  });

  it("a booking on another weekday, or outside the hours, is not touched", async () => {
    present.mockResolvedValue(true);
    const { tx } = makeTx((t) => (t === "therapist_weekly_blocks" ? [monday0800] : []));
    expect(
      await findScheduleConflicts(tx, {
        ...window,
        startsAt: new Date("2026-11-10T09:00:00Z"),
        endsAt: new Date("2026-11-10T10:00:00Z"),
      }),
    ).toEqual([]);
    expect(
      await findScheduleConflicts(tx, {
        ...window,
        startsAt: new Date("2026-11-09T11:00:00Z"),
        endsAt: new Date("2026-11-09T12:00:00Z"),
      }),
    ).toEqual([]);
  });

  it("time_off and weekly are both reported, and nothing is read from the weekly table while it is absent", async () => {
    const off = { id: "to-1", startsAt: new Date("2026-11-09T09:30:00Z"), endsAt: new Date("2026-11-09T12:00:00Z"), reason: "other" };
    present.mockResolvedValue(true);
    const both = makeTx((t) => (t === "therapist_weekly_blocks" ? [monday0800] : t === "time_off" ? [off] : []));
    expect((await findScheduleConflicts(both.tx, window)).map((c) => c.id).sort()).toEqual(["to-1", "weekly:r1:2026-11-09"]);

    present.mockResolvedValue(false);
    const absent = makeTx((t) => (t === "time_off" ? [off] : t === "therapist_weekly_blocks" ? [monday0800] : []));
    expect((await findScheduleConflicts(absent.tx, window)).map((c) => c.id)).toEqual(["to-1"]);
    expect(absent.selected).not.toContain("therapist_weekly_blocks");
  });
});

describe("listTherapistBlocksAndHours: the agenda band's read carries the weekly blocks", () => {
  it("merges time_off and weekly blocks over the range, sorted by start", async () => {
    present.mockResolvedValue(true);
    const off = {
      id: "to-1",
      startsAt: new Date("2026-11-04T14:00:00Z"),
      endsAt: new Date("2026-11-04T15:00:00Z"),
      reason: "other",
      note: "Formacao",
    };
    const { tx } = makeTx((t) => (t === "therapist_weekly_blocks" ? [monday0800] : t === "time_off" ? [off] : []));
    currentTx = tx;
    const { blocks } = await listTherapistBlocksAndHours({} as RequestContext, {
      therapistId: "t1",
      rangeStart: new Date("2026-11-02T00:00:00Z"),
      rangeEnd: new Date("2026-11-09T00:00:00Z"),
    });
    expect(blocks.map((b) => [b.id, b.note])).toEqual([
      ["weekly:r1:2026-11-02", "Bloqueio semanal"],
      ["to-1", "Formacao"],
    ]);
  });
});
