import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * BLOQUEIOS NA AGENDA / FERIAS - the writes, with the database mocked.
 *
 * Pinned: the capability (schedule:manage) and the scope check run on the
 * TARGET therapist before anything is written; the row names the actor as its
 * creator (the INSERT policy requires it); a duplicate becomes `duplicate`, a
 * missing table `unavailable`, and each successful write leaves exactly one
 * audit row with a PII-free payload. And the PONTUAL door: "intervalo" through
 * createTimeOffBlock, reason "other", the Motivo kept word for word.
 */

vi.mock("server-only", () => ({}));
const present = vi.fn<() => Promise<boolean>>();
vi.mock("@osteojp/db", async (orig) => {
  const real = await orig<typeof import("@osteojp/db")>();
  return { ...real, weeklyBlocksSchemaPresent: () => present() };
});
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("./audit", () => ({ writeAudit: vi.fn() }));
const assertTarget = vi.fn<(tx: unknown, target: string, scope: unknown) => Promise<undefined>>(async () => undefined);
vi.mock("./schedule-scope", () => ({
  resolveScheduleScope: vi.fn(async () => ({ kind: "self", userId: "ther-1" })),
  assertTargetInScheduleScope: (tx: unknown, target: string, scope: unknown) => assertTarget(tx, target, scope),
  manageableTargets: vi.fn(async () => new Set<string>()),
}));

import { runScoped, type RequestContext } from "@/lib/auth/context";
import { writeAudit } from "./audit";
import { AdminError, isAdminError } from "./errors";
import { createWeeklyBlock, deleteWeeklyBlock } from "./weekly-blocks";
import { createTimeOffBlock, __test as timeOffTest } from "./time-off";

const mockRunScoped = vi.mocked(runScoped);
const mockAudit = vi.mocked(writeAudit);
const therapist = { tenantId: "tenant-A", role: "therapist", userId: "ther-1" } as RequestContext;
const reception = { tenantId: "tenant-A", role: "reception", userId: "rec-1" } as RequestContext;

async function code(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return isAdminError(e) ? e.code : `unexpected:${String(e)}`;
  }
}

function makeTx(opts: { insertError?: unknown; existing?: { userId: string; weekday: number } | null } = {}) {
  const inserted: Record<string, unknown>[] = [];
  const deleted: string[] = [];
  const insertChain = {
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        if (opts.insertError) return { returning: async () => Promise.reject(opts.insertError) };
        inserted.push(v);
        return { returning: async () => [{ id: "wb-1" }] };
      },
    }),
  };
  const tx = {
    ...insertChain,
    transaction: async (fn: (sp: unknown) => unknown) => fn(insertChain),
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => (opts.existing ? [opts.existing] : []) }),
      }),
    }),
    delete: () => ({
      where: () => ({
        returning: async () => {
          deleted.push("wb-1");
          return [{ id: "wb-1" }];
        },
      }),
    }),
  };
  mockRunScoped.mockImplementation(async (_a, fn) => fn(tx as never));
  return { inserted, deleted };
}

const good = { userId: "ther-1", weekday: 1, startTime: "08:00", endTime: "11:00" };

beforeEach(() => {
  vi.clearAllMocks();
  present.mockResolvedValue(true);
});

describe("createWeeklyBlock", () => {
  it("writes the rule for the target, names the actor as creator, audits once without PII", async () => {
    const { inserted } = makeTx();
    expect(await createWeeklyBlock(therapist, good)).toEqual({ id: "wb-1" });
    expect(assertTarget).toHaveBeenCalledWith(expect.anything(), "ther-1", { kind: "self", userId: "ther-1" });
    expect(inserted).toEqual([
      { tenantId: "tenant-A", userId: "ther-1", weekday: 1, startTime: "08:00", endTime: "11:00", createdBy: "ther-1" },
    ]);
    expect(mockAudit).toHaveBeenCalledTimes(1);
    expect(mockAudit.mock.calls[0]![2]).toEqual({
      action: "weekly_block.create",
      entityType: "therapist_weekly_block",
      entityId: "wb-1",
      metadata: { weekday: 1 },
    });
  });

  it("refuses a malformed rule before opening a transaction", async () => {
    makeTx();
    for (const bad of [
      { ...good, endTime: "08:00" },
      { ...good, weekday: Number.NaN },
      { ...good, userId: "" },
      { ...good, startTime: "8h" },
    ]) {
      expect(await code(() => createWeeklyBlock(therapist, bad))).toBe("invalid");
    }
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("a therapist naming a colleague is refused by the scope check and nothing is written", async () => {
    const { inserted } = makeTx();
    assertTarget.mockRejectedValueOnce(new AdminError("forbidden"));
    expect(await code(() => createWeeklyBlock(therapist, { ...good, userId: "colleague" }))).toBe("forbidden");
    expect(inserted).toEqual([]);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("a duplicate rule (unique key 23505) is `duplicate`, and nothing is audited", async () => {
    makeTx({ insertError: Object.assign(new Error("dup"), { code: "23505" }) });
    expect(await code(() => createWeeklyBlock(reception, good))).toBe("duplicate");
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("any other database error is NOT dressed up as a duplicate", async () => {
    makeTx({ insertError: Object.assign(new Error("boom"), { code: "42501" }) });
    expect(await code(() => createWeeklyBlock(reception, good))).toMatch(/^unexpected:/);
  });

  it("while the table is absent the write is refused as `unavailable`, never lost", async () => {
    const { inserted } = makeTx();
    present.mockResolvedValue(false);
    expect(await code(() => createWeeklyBlock(reception, good))).toBe("unavailable");
    expect(inserted).toEqual([]);
  });

  it("a role without schedule:manage never reaches the database", async () => {
    makeTx();
    const patientish = { tenantId: "tenant-A", role: "patient", userId: "p" } as unknown as RequestContext;
    await expect(createWeeklyBlock(patientish, good)).rejects.toThrow();
    expect(mockRunScoped).not.toHaveBeenCalled();
  });
});

describe("deleteWeeklyBlock", () => {
  it("checks the rule's OWN therapist against the scope, deletes, audits", async () => {
    const { deleted } = makeTx({ existing: { userId: "ther-1", weekday: 3 } });
    await deleteWeeklyBlock(therapist, "wb-1");
    expect(assertTarget).toHaveBeenCalledWith(expect.anything(), "ther-1", expect.anything());
    expect(deleted).toEqual(["wb-1"]);
    expect(mockAudit.mock.calls[0]![2]).toMatchObject({ action: "weekly_block.delete", entityId: "wb-1", metadata: { weekday: 3 } });
  });

  it("an unknown id is not_found; an out-of-scope rule is refused before the delete", async () => {
    makeTx({ existing: null });
    expect(await code(() => deleteWeeklyBlock(reception, "nope"))).toBe("not_found");
    const { deleted } = makeTx({ existing: { userId: "other", weekday: 1 } });
    assertTarget.mockRejectedValueOnce(new AdminError("not_found"));
    expect(await code(() => deleteWeeklyBlock(reception, "wb-1"))).toBe("not_found");
    expect(deleted).toEqual([]);
  });
});

describe("the PONTUAL door: mode intervalo through createTimeOffBlock", () => {
  const { resolveWindow, reasonForMode, viewFor } = timeOffTest;

  it("resolves a start date+time to an end date+time in Lisbon (winter and summer)", () => {
    expect(
      resolveWindow({ userId: "t", mode: "intervalo", startDate: "2026-11-24", startTime: "05:00", endDate: "2026-11-26", endTime: "23:55" }),
    ).toEqual({ startsAt: new Date("2026-11-24T05:00:00Z"), endsAt: new Date("2026-11-26T23:55:00Z") });
    expect(
      resolveWindow({ userId: "t", mode: "intervalo", startDate: "2026-07-01", startTime: "09:00", endDate: "2026-07-01", endTime: "10:30" }),
    ).toEqual({ startsAt: new Date("2026-07-01T08:00:00Z"), endsAt: new Date("2026-07-01T09:30:00Z") });
  });

  it("refuses an end at or before the start, a bad date and a bad time", () => {
    const base = { userId: "t", mode: "intervalo" as const, startDate: "2026-11-24", startTime: "05:00", endDate: "2026-11-24", endTime: "05:00" };
    expect(() => resolveWindow(base)).toThrow(/after start/);
    expect(() => resolveWindow({ ...base, endDate: "2026-11-23", endTime: "23:00" })).toThrow(/after start/);
    expect(() => resolveWindow({ ...base, endDate: "" })).toThrow(/endDate/);
    expect(() => resolveWindow({ ...base, endTime: "5h" })).toThrow(/HH:mm/);
  });

  it("the reason is always `other` for intervalo; prolongada keeps `vacation`", () => {
    expect(reasonForMode("intervalo")).toBe("other");
    expect(reasonForMode("pontual")).toBe("other");
    expect(reasonForMode("prolongada")).toBe("vacation");
  });

  it("a stored row reads back by its shape: across dates -> intervalo, same day -> pontual, whole days -> prolongada", () => {
    const row = (s: string, e: string) => ({ id: "x", startsAt: new Date(s), endsAt: new Date(e), reason: "other", note: "Ferias" });
    expect(viewFor(row("2026-11-24T05:00:00Z", "2026-11-26T23:55:00Z"))).toMatchObject({
      mode: "intervalo",
      startDate: "2026-11-24",
      endDate: "2026-11-26",
      startTime: "05:00",
      endTime: "23:55",
    });
    expect(viewFor(row("2026-11-24T09:00:00Z", "2026-11-24T10:00:00Z"))).toMatchObject({ mode: "pontual", endDate: "2026-11-24" });
    expect(viewFor(row("2026-11-24T00:00:00Z", "2026-11-27T00:00:00Z"))).toMatchObject({
      mode: "prolongada",
      startDate: "2026-11-24",
      endDate: "2026-11-26",
    });
  });

  it("createTimeOffBlock writes one row with the Motivo word for word and reason `other`", async () => {
    const written: Record<string, unknown>[] = [];
    const tx = {
      select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ orderBy: async () => [] }) }) }) }),
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          written.push(v);
          return { returning: async () => [{ id: "to-9" }] };
        },
      }),
    };
    mockRunScoped.mockImplementation(async (_a, fn) => fn(tx as never));
    await createTimeOffBlock(reception, {
      userId: "ther-1",
      mode: "intervalo",
      startDate: "2026-11-24",
      startTime: "05:00",
      endDate: "2026-11-26",
      endTime: "23:55",
      note: "  Férias de Natal ",
    });
    expect(written).toEqual([
      {
        tenantId: "tenant-A",
        userId: "ther-1",
        startsAt: new Date("2026-11-24T05:00:00Z"),
        endsAt: new Date("2026-11-26T23:55:00Z"),
        reason: "other",
        note: "Férias de Natal",
      },
    ]);
    expect(mockAudit.mock.calls[0]![2]).toMatchObject({ action: "time_off.create", metadata: { mode: "intervalo" } });
  });
});
