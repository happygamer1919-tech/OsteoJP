import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/viewer-locations", () => ({
  viewerLocationScope: vi.fn(async () => null as string[] | null),
}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
// The real assertCan, observed: every role in the matrix holds schedule:manage,
// so the refusal arm has to make it refuse rather than find a role that does.
vi.mock("@osteojp/auth", async (importOriginal) => {
  const real = await importOriginal<typeof import("@osteojp/auth")>();
  return { ...real, assertCan: vi.fn(real.assertCan) };
});
// Where clauses as inspectable values, so a test can say WHICH row was written.
vi.mock("drizzle-orm", async (importOriginal) => {
  const real = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...real,
    eq: (col: { name?: string }, value: unknown) => ({ col: col.name, value }),
    and: (...parts: unknown[]) => ({ and: parts }),
    inArray: (col: { name?: string }, value: unknown) => ({ col: col.name, in: value }),
  };
});

import { assertCan, ForbiddenError, type RequestContext } from "@osteojp/auth";
import { auditLog } from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import { assertPiiFreeAuditMetadata } from "@/lib/audit/metadata-contract";
import { removeDayDefined } from "./day-defined-remove";

/**
 * SR-62 PU-3 - the writer's gates, in order, against a fake transaction.
 *
 * The planner's reasoning is proven in lib/scheduling/day-defined-removal.test.ts
 * against the real schedule planners. This file proves the part a planner test
 * cannot: that a refusal of ANY kind writes nothing, that a success writes the
 * rows the plan named and exactly one audit row, and that the audit row goes
 * through the enforced metadata contract (writeAudit is NOT mocked).
 */

const THERAPIST_ID = "00000000-0000-4000-8000-0000000000a1";
const OTHER_THERAPIST = "00000000-0000-4000-8000-0000000000a2";
const DD_ID = "00000000-0000-4000-8000-00000000d001";
const HEAD_ID = "00000000-0000-4000-8000-00000000b001";
const TAIL_ID = "00000000-0000-4000-8000-00000000b002";
const LV = "00000000-0000-4000-8000-0000000010c1";
const CB = "00000000-0000-4000-8000-0000000010c2";

const owner: RequestContext = { tenantId: "t-1", role: "owner", userId: "owner-1" };
const reception: RequestContext = { tenantId: "t-1", role: "reception", userId: "recep-1" };
const therapist: RequestContext = { tenantId: "t-1", role: "therapist", userId: THERAPIST_ID };

type Stored = {
  id: string;
  locationId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
};
const row = (o: Partial<Stored> & { id: string }): Stored => ({
  locationId: LV,
  weekday: 1,
  startTime: "09:00:00",
  endTime: "17:00:00",
  validFrom: null,
  validUntil: null,
  isActive: true,
  ...o,
});

/** The carve a one-day edit on Monday 2026-09-14 leaves: head, tail, dated row. */
const carved = (): Stored[] => [
  row({ id: HEAD_ID, validUntil: "2026-09-13" }),
  row({ id: TAIL_ID, validFrom: "2026-09-15" }),
  row({ id: DD_ID, locationId: CB, startTime: "10:00:00", endTime: "14:00:00", validFrom: "2026-09-14", validUntil: "2026-09-14" }),
];

type Where = { col?: string; value?: unknown; and?: Where[] };
const idOf = (w: Where): unknown => w.and?.find((p) => p.col === "id")?.value;

/**
 * A tx whose SELECTs answer from a queue in call order, and whose UPDATEs and
 * INSERTs are recorded. `updateMisses` names ids whose update matches no row.
 */
function makeTx(selects: unknown[][], opts: { updateMisses?: string[] } = {}) {
  const queue = [...selects];
  const updates: { id: unknown; set: Record<string, unknown> }[] = [];
  const inserts: { table: unknown; values: Record<string, unknown> }[] = [];
  const answer = () => {
    const rows = queue.shift() ?? [];
    return {
      limit: async () => rows,
      then: (res: (v: unknown[]) => void, rej: (e: unknown) => void) => Promise.resolve(rows).then(res, rej),
    };
  };
  const tx = {
    select: () => ({ from: () => ({ where: answer }) }),
    update: () => ({
      set: (set: Record<string, unknown>) => ({
        where: (w: Where) => ({
          returning: async () => {
            const id = idOf(w);
            updates.push({ id, set });
            return opts.updateMisses?.includes(String(id)) ? [] : [{ id }];
          },
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        inserts.push({ table, values });
      },
    }),
  };
  vi.mocked(runScoped).mockImplementation(async (_actor, fn) => fn(tx as never));
  return { updates, inserts };
}

const target = (o: Partial<{ userId: string; validFrom: string | null; validUntil: string | null }> = {}) => [
  { userId: THERAPIST_ID, validFrom: "2026-09-14", validUntil: "2026-09-14", ...o },
];

beforeEach(() => {
  vi.mocked(runScoped).mockReset();
  vi.mocked(viewerLocationScope).mockReset();
  vi.mocked(viewerLocationScope).mockResolvedValue(null);
  vi.mocked(assertCan).mockClear();
});

describe("removeDayDefined - refusals write nothing", () => {
  it("checks schedule:manage FIRST, and a refusal there never opens a transaction", async () => {
    vi.mocked(assertCan).mockImplementationOnce(() => {
      throw new ForbiddenError("reception", "schedule:manage");
    });
    await expect(removeDayDefined(reception, DD_ID)).rejects.toBeInstanceOf(ForbiddenError);
    expect(runScoped).not.toHaveBeenCalled();
  });

  it("asks for exactly schedule:manage on the ordinary path", async () => {
    makeTx([target(), carved()]);
    await removeDayDefined(owner, DD_ID);
    expect(assertCan).toHaveBeenCalledWith("owner", "schedule:manage");
  });

  it("refuses a malformed id before any database work", async () => {
    await expect(removeDayDefined(owner, "not-a-uuid")).rejects.toMatchObject({ code: "invalid" });
    expect(runScoped).not.toHaveBeenCalled();
  });

  it("a therapist may not remove a colleague's Dia definido: forbidden, nothing written", async () => {
    const { updates, inserts } = makeTx([target({ userId: OTHER_THERAPIST }), carved()]);
    await expect(removeDayDefined(therapist, DD_ID)).rejects.toMatchObject({ code: "forbidden" });
    expect(updates).toEqual([]);
    expect(inserts).toEqual([]);
  });

  it("a located receptionist may not reach another clinic's therapist: not_found, nothing written", async () => {
    vi.mocked(viewerLocationScope).mockResolvedValue([CB]);
    // target row, then the staff_locations membership probe (empty).
    const { updates, inserts } = makeTx([target(), [], carved()]);
    await expect(removeDayDefined(reception, DD_ID)).rejects.toMatchObject({ code: "not_found" });
    expect(updates).toEqual([]);
    expect(inserts).toEqual([]);
  });

  it("an unknown or already-retired row is not_found", async () => {
    const { updates } = makeTx([[]]);
    await expect(removeDayDefined(owner, DD_ID)).rejects.toMatchObject({ code: "not_found" });
    expect(updates).toEqual([]);
  });

  it("a Base row is refused as invalid: this is not a second door to archive the week", async () => {
    const { updates, inserts } = makeTx([target({ validFrom: null, validUntil: null }), carved()]);
    await expect(removeDayDefined(owner, DD_ID)).rejects.toMatchObject({ code: "invalid" });
    expect(updates).toEqual([]);
    expect(inserts).toEqual([]);
  });

  it("the middle day of a multi-day window is REFUSED with its date, and nothing is written", async () => {
    // Mondays 7, 14, 21 dated inside one window: head ends the 6th, tail resumes the 28th.
    const rows = [
      row({ id: HEAD_ID, validUntil: "2026-09-06" }),
      row({ id: TAIL_ID, validFrom: "2026-09-28" }),
      row({ id: "00000000-0000-4000-8000-00000000d007", locationId: CB, validFrom: "2026-09-07", validUntil: "2026-09-07" }),
      row({ id: DD_ID, locationId: CB, validFrom: "2026-09-14", validUntil: "2026-09-14" }),
      row({ id: "00000000-0000-4000-8000-00000000d021", locationId: CB, validFrom: "2026-09-21", validUntil: "2026-09-21" }),
    ];
    const { updates, inserts } = makeTx([target(), rows]);
    await expect(removeDayDefined(owner, DD_ID)).resolves.toEqual({
      ok: false,
      reason: "restore_needs_single_day",
      date: "2026-09-14",
    });
    expect(updates).toEqual([]);
    expect(inserts).toEqual([]);
  });
});

describe("removeDayDefined - the write", () => {
  it("archives the dated row, retires the tail, rejoins the head, and writes ONE audit row", async () => {
    const { updates, inserts } = makeTx([target(), carved()]);
    await expect(removeDayDefined(owner, DD_ID)).resolves.toEqual({
      ok: true,
      date: "2026-09-14",
      outcome: "base_restored",
      restored: 1,
    });
    expect(updates).toEqual([
      { id: DD_ID, set: { isActive: false } },
      { id: TAIL_ID, set: { isActive: false } },
      { id: HEAD_ID, set: { validFrom: null, validUntil: null } },
    ]);
    // Never a hard delete and never an insert of a schedule row.
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.table).toBe(auditLog);
    expect(inserts[0]!.values).toMatchObject({
      tenantId: "t-1",
      actorUserId: "owner-1",
      action: "availability_template.day_defined_remove",
      entityType: "availability_template",
      entityId: DD_ID,
      metadata: {
        therapistId: THERAPIST_ID,
        date: "2026-09-14",
        outcome: "base_restored",
        restoredIds: [HEAD_ID],
        restoredCount: 1,
        retiredIds: [TAIL_ID],
      },
    });
    expect(() =>
      assertPiiFreeAuditMetadata(inserts[0]!.values.metadata as Record<string, unknown>, "test"),
    ).not.toThrow();
  });

  it("a therapist removes their OWN Dia definido", async () => {
    const { updates } = makeTx([target(), carved()]);
    await expect(removeDayDefined(therapist, DD_ID)).resolves.toMatchObject({ ok: true });
    expect(updates[0]).toEqual({ id: DD_ID, set: { isActive: false } });
  });

  it("with no Base the dated row is archived alone and the day reads Não trabalha", async () => {
    const { updates, inserts } = makeTx([target(), [carved()[2]!]]);
    await expect(removeDayDefined(owner, DD_ID)).resolves.toEqual({
      ok: true,
      date: "2026-09-14",
      outcome: "no_base",
      restored: 0,
    });
    expect(updates).toEqual([{ id: DD_ID, set: { isActive: false } }]);
    expect(inserts[0]!.values.metadata).toMatchObject({ restoredIds: [], restoredCount: 0, retiredIds: [] });
  });

  it("an update that matches no row THROWS, so no audit row describes a write that did not happen", async () => {
    const { inserts } = makeTx([target(), carved()], { updateMisses: [HEAD_ID] });
    await expect(removeDayDefined(owner, DD_ID)).rejects.toMatchObject({ code: "not_found" });
    expect(inserts).toEqual([]);
  });
});
