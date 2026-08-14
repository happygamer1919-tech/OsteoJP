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
  resolveScheduleScope: vi.fn(async () => ({ kind: "all" })),
  assertTargetInScheduleScope: vi.fn(async () => undefined),
}));

import { runScoped } from "@/lib/auth/context";
import { assertTargetInScheduleScope } from "./schedule-scope";
import { writeAudit } from "./audit";
import { createTimeOffBlockBatch } from "./time-off";
import type { RequestContext } from "@/lib/auth/context";

const mockRunScoped = vi.mocked(runScoped);
const mockAssertTarget = vi.mocked(assertTargetInScheduleScope);
const admin = { tenantId: "tenant-A", role: "admin", userId: "admin-1" } as RequestContext;

type Inserted = { startsAt: Date; endsAt: Date; userId: string; note: string | null };

type Appt = { id: string; patientName: string; startsAt: Date; endsAt: Date };

/**
 * Rows the batch inserts, plus the appointments the overlap query will report.
 *
 * `overlaps` is returned for EVERY window, which is the realistic shape for the
 * dedupe case: a long-running appointment sits under more than one generated
 * block, and the user must be told about it once, not once per day.
 */
function makeTx(overlaps: Appt[] = []) {
  const inserted: Inserted[] = [];
  const tx = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            orderBy: async () => overlaps,
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

  it("reports an overlapping appointment ONCE, not once per generated day", async () => {
    const appt: Appt = {
      id: "appt-1",
      patientName: "Ana Paciente",
      startsAt: new Date("2026-08-03T08:00:00.000Z"),
      endsAt: new Date("2026-08-03T09:00:00.000Z"),
    };
    // The same appointment comes back for all four windows.
    const { tx, inserted } = makeTx([appt]);
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    const res = await createTimeOffBlockBatch(admin, base);

    expect(inserted).toHaveLength(4);
    expect(res.overlaps).toHaveLength(1);
    expect(res.overlaps[0]!.id).toBe("appt-1");
    // ...and the audit row carries the deduped count, not the raw hit count.
    expect(vi.mocked(writeAudit).mock.calls[0]![2]).toMatchObject({
      metadata: { blocks: 4, overlappingAppointments: 1 },
    });
  });

  it("creates the blocks anyway when they overlap - warn, never cancel", async () => {
    // Q-W5-4, inherited from the single-block path: the clinic decides what to
    // do about the patients; the system does not silently cancel them.
    const { tx, inserted } = makeTx([
      {
        id: "appt-1",
        patientName: "Ana Paciente",
        startsAt: new Date("2026-08-03T08:00:00.000Z"),
        endsAt: new Date("2026-08-03T09:00:00.000Z"),
      },
    ]);
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    const res = await createTimeOffBlockBatch(admin, base);
    expect(inserted).toHaveLength(4);
    expect(res.overlaps).toHaveLength(1);
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

  /**
   * ITEM 3 CHANGED WHAT PROTECTS THIS PATH, so this test changed with it.
   *
   * IT USED TO ASSERT that a therapist is refused by `assertCan(schedule:manage)`
   * before the transaction opens. That is no longer true and cannot be made true
   * by any role: owner, admin, reception AND therapist all hold schedule:manage
   * now, so the CAPABILITY gate is vacuous at the role level. Leaving the old
   * assertion would have meant deleting a real protection and keeping a test
   * that no longer describes one.
   *
   * WHAT ACTUALLY PROTECTS THE BATCH WRITE IS THE TARGET ASSERT, and what this
   * file can prove about it is the WIRING: that the batch path calls it, with
   * the requested target, before inserting anything. The RULE the assert applies
   * (a therapist may act on themselves and nobody else) is proven against the
   * real implementation in ./therapist-self-schedule.test.ts.
   */
  it("ITEM 3: the batch write goes through the target assert, and a refusal inserts nothing", async () => {
    const { tx, inserted } = makeTx();
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));
    mockAssertTarget.mockRejectedValueOnce(new Error("out of scope"));

    const therapist = { tenantId: "tenant-A", role: "therapist", userId: "t-1" } as RequestContext;
    // base.userId is "ther-1" - a COLLEAGUE, not this therapist.
    await expect(createTimeOffBlockBatch(therapist, base)).rejects.toThrow();
    expect(mockAssertTarget).toHaveBeenCalledWith(expect.anything(), "ther-1", expect.anything());
    // NEGATIVE ARM: the refusal must land BEFORE any row is written. A gate that
    // throws after four inserts is not a gate.
    expect(inserted).toHaveLength(0);
  });

  it("NEGATIVE ARM: a therapist blocking their OWN schedule is not refused by this path", async () => {
    const { tx, inserted } = makeTx();
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));
    // The assert resolves, as it does for a self-target.
    const therapist = { tenantId: "tenant-A", role: "therapist", userId: "t-1" } as RequestContext;
    await expect(createTimeOffBlockBatch(therapist, { ...base, userId: "t-1" })).resolves.toBeTruthy();
    expect(inserted.length).toBeGreaterThan(0);
    expect(inserted.every((r) => r.userId === "t-1")).toBe(true);
  });
});
