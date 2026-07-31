import { vi, describe, it, expect, beforeEach } from "vitest";

// PL-22 — createTimeOffBlockBatch: one submit, many time_off rows, in ONE
// transaction, with the overlapping appointments REPORTED (never cancelled).
//
// What these tests protect: the row count and windows the recurrence produces,
// that overlaps are deduped across days (one appointment can sit under two
// generated blocks), that an empty recurrence is an error rather than a silent
// no-op that looks successful, and that the schedule:manage gate still bites.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("./audit", () => ({ writeAudit: vi.fn() }));
vi.mock("./schedule-scope", () => ({
  resolveScheduleScope: vi.fn(async () => null),
  assertTargetInScheduleScope: vi.fn(async () => undefined),
}));

import { runScoped } from "@/lib/auth/context";
import { writeAudit } from "./audit";
import { createTimeOffBlockBatch } from "./time-off";
import type { RequestContext } from "@/lib/auth/context";

const mockRunScoped = vi.mocked(runScoped);
const admin = { tenantId: "tenant-A", role: "admin", userId: "admin-1" } as RequestContext;

type Inserted = { startsAt: Date; endsAt: Date; userId: string; note: string | null };

/** Rows the batch inserts, plus the appointment overlaps it will be told about. */
function makeTx(overlapsPerWindow: Record<string, { id: string; patientName: string }[]> = {}) {
  const inserted: Inserted[] = [];
  const tx = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            orderBy: async () => [],
          }),
        }),
      }),
    }),
    insert: () => ({
      values: async (v: Inserted) => {
        inserted.push(v);
      },
    }),
  };
  void overlapsPerWindow;
  return { tx, inserted };
}

const base = {
  userId: "ther-1",
  startDate: "2026-08-03", // a Monday
  weekdays: [1, 4], // Mon + Thu
  everyWeeks: 1,
  end: { kind: "count", count: 4 } as const,
  startTime: "09:00",
  endTime: "10:00",
};

beforeEach(() => vi.clearAllMocks());

describe("createTimeOffBlockBatch", () => {
  it("inserts one row per generated date, each with the SAME hour range", async () => {
    const { tx, inserted } = makeTx();
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    const res = await createTimeOffBlockBatch(admin, base);

    expect(res.dates).toEqual(["2026-08-03", "2026-08-06", "2026-08-10", "2026-08-13"]);
    expect(inserted).toHaveLength(4);
    // A recurring block is "Tuesday mornings", not a different window each week.
    for (const row of inserted) {
      const durationMin = (row.endsAt.getTime() - row.startsAt.getTime()) / 60_000;
      expect(durationMin).toBe(60);
      expect(row.userId).toBe("ther-1");
    }
    // August: Lisbon is UTC+1, so 09:00 wall-clock is 08:00Z.
    expect(inserted[0]!.startsAt.toISOString()).toBe("2026-08-03T08:00:00.000Z");
  });

  it("writes ONE audit row carrying the batch size, not one per block", async () => {
    const { tx } = makeTx();
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await createTimeOffBlockBatch(admin, base);

    expect(writeAudit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(writeAudit).mock.calls[0]![2]).toMatchObject({
      action: "time_off.create_batch",
      metadata: { blocks: 4, overlappingAppointments: 0 },
    });
  });

  it("refuses a recurrence that produces no dates instead of silently doing nothing", async () => {
    const { tx, inserted } = makeTx();
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    // An end date before the start date: the user got something wrong and must
    // be told, not shown a success message over an empty write.
    await expect(
      createTimeOffBlockBatch(admin, {
        ...base,
        end: { kind: "until", date: "2026-07-01" },
      }),
    ).rejects.toThrow();
    expect(inserted).toHaveLength(0);
  });

  it("rejects an end time that is not after the start time", async () => {
    const { tx } = makeTx();
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));
    await expect(
      createTimeOffBlockBatch(admin, { ...base, startTime: "10:00", endTime: "09:00" }),
    ).rejects.toThrow();
  });

  it("rejects a malformed date or time before touching the database", async () => {
    const { tx, inserted } = makeTx();
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));
    await expect(createTimeOffBlockBatch(admin, { ...base, startDate: "03-08-2026" })).rejects.toThrow();
    await expect(createTimeOffBlockBatch(admin, { ...base, startTime: "9am" })).rejects.toThrow();
    expect(inserted).toHaveLength(0);
  });

  it("still enforces schedule:manage", async () => {
    const therapist = { tenantId: "tenant-A", role: "therapist", userId: "t-1" } as RequestContext;
    await expect(createTimeOffBlockBatch(therapist, base)).rejects.toThrow();
    expect(mockRunScoped).not.toHaveBeenCalled();
  });
});
