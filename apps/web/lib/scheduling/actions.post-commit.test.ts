import { vi, describe, it, expect, beforeEach } from "vitest";

// SCHED-commit-then-report-failure — a COMMITTED write must never be reported to
// the caller as a failure.
//
// `revalidatePath` and the reminder enqueue run AFTER the transaction commits,
// and they used to sit inside the same try whose catch returns fail(...). A
// throw there produced `{ ok: false }` for an appointment that exists. At the
// desk that reads as "it did not save", so the booking gets made again, which is
// a route to a real double-booking. Reporting a failure for a successful write
// is worse than the failure it is reporting.
//
// These tests make each post-commit step throw and assert the action still
// returns ok. They are the regression guard for `afterCommit`.

vi.mock("server-only", () => ({}));
/**
 * `updateTag` IS MOCKED, AND ITS ABSENCE HAD DISARMED THIS WHOLE FILE.
 *
 * `revalidateAppointmentSurfaces()` calls revalidatePath AND updateTag, and it
 * runs FIRST inside every `afterCommit` block. With only revalidatePath mocked,
 * updateTag was `undefined`, calling it threw a TypeError, afterCommit swallowed
 * it exactly as designed - and the reminder enqueue on the next line never ran.
 *
 * So every assertion below that says "the enqueue threw and the action still
 * returned ok" was passing because the enqueue was never reached. The guard was
 * green and testing nothing, which is the failure mode a post-commit test is
 * least able to notice: swallowing errors is its subject.
 *
 * Found by writing the OBS-05 batch case, which asserts the enqueue was CALLED
 * rather than only that the action returned ok - an assertion no test in this
 * file previously made.
 */
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));

vi.mock("@/lib/auth/context", () => ({
  requireRequestContext: vi.fn(),
  runScoped: vi.fn(),
}));
vi.mock("@osteojp/auth", () => ({
  assertCan: vi.fn(),
  ForbiddenError: class ForbiddenError extends Error {},
}));
vi.mock("./actor", () => ({ clientIp: vi.fn(async () => null) }));
vi.mock("./audit", () => ({ writeAppointmentAudit: vi.fn(async () => {}) }));
vi.mock("./reminders", () => ({
  enqueueRemindersAfterCommit: vi.fn(async () => {}),
  enqueueStatusNotificationsAfterCommit: vi.fn(async () => {}),
}));

// OBS-05. The batch path is the fourth creation path and the last one that was
// still committing rows without emitting. Mocking the ENGINE (not the DB) keeps
// this file's subject what it has always been: what the ACTION does after a
// commit succeeds.
vi.mock("./batch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./batch")>();
  return { ...actual, batchSchedule: vi.fn() };
});
vi.mock("@/lib/auth/viewer-locations", () => ({
  bookingLocationScope: vi.fn(async () => null),
  isLocationBookable: vi.fn(() => true),
  resolveViewerLocationIds: vi.fn(async () => []),
}));
// SCHED-17: create and batch now ask whether the practitioner is a shared
// resource before they run. runScoped is mocked above to hand back a COMMITTED
// action result, so the real lookup would receive that object instead of a list.
// No shared resources is today's state everywhere, which keeps these tests about
// what happens after commit and nothing else.
vi.mock("./shared-resources", () => ({
  listSharedResources: vi.fn(async () => []),
  listSharedResourcesTx: vi.fn(async () => []),
}));

import { revalidatePath } from "next/cache";
import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { enqueueRemindersAfterCommit } from "./reminders";
import { batchSchedule, type BatchScheduleResult } from "./batch";
import { batchScheduleAppointments, createAppointment } from "./actions";
import type { RequestContext } from "@osteojp/auth";
import type { CreateAppointmentInput } from "./types";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const mockRevalidate = vi.mocked(revalidatePath);
const mockEnqueue = vi.mocked(enqueueRemindersAfterCommit);
const mockBatch = vi.mocked(batchSchedule);

const actor: RequestContext = { tenantId: "tenant-A", role: "admin", userId: "user-1" };

/** A committed transaction: runScoped resolves ok, exactly as after a real commit. */
function commitSucceeds() {
  mockRunScoped.mockImplementation(async () => ({ ok: true, data: { id: "appt-1" } }) as never);
}

const input = {
  patientId: "11111111-1111-1111-1111-111111111111",
  practitionerId: "22222222-2222-2222-2222-222222222222",
  locationId: "33333333-3333-3333-3333-333333333333",
  startsAt: "2027-06-01T09:00:00.000Z",
  endsAt: "2027-06-01T10:00:00.000Z",
} as unknown as CreateAppointmentInput;

beforeEach(() => {
  vi.clearAllMocks();
  mockCtx.mockResolvedValue(actor as never);
  mockRevalidate.mockImplementation(() => {});
  mockEnqueue.mockImplementation(async () => {});
  commitSucceeds();
});

describe("post-commit steps cannot fail a committed create", () => {
  it("returns ok when the reminder enqueue throws after commit", async () => {
    mockEnqueue.mockRejectedValueOnce(new Error("inngest unreachable"));
    const r = await createAppointment(input);
    expect(r.ok).toBe(true);
  });

  it("returns ok when revalidatePath throws after commit", async () => {
    mockRevalidate.mockImplementationOnce(() => {
      throw new Error("revalidate blew up");
    });
    const r = await createAppointment(input);
    expect(r.ok).toBe(true);
  });

  /**
   * The failure must not be silent either. It is logged with the step name and
   * the error NAME only: never the message and never a payload, because both can
   * carry patient data (CLAUDE.md rule 7).
   */
  it("logs the failed step without leaking the error message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockEnqueue.mockRejectedValueOnce(new Error("patient +351912345678 unreachable"));

    await createAppointment(input);

    expect(spy).toHaveBeenCalled();
    const logged = spy.mock.calls.flat().join(" ");
    expect(logged).toContain("post-commit");
    expect(logged).toContain("create");
    expect(logged).toContain("Error"); // the error NAME
    expect(logged).not.toContain("912345678"); // never the message
    spy.mockRestore();
  });

  it("still returns the failure when the TRANSACTION itself fails", async () => {
    // The guard must not paper over a genuine failure: nothing committed here.
    mockRunScoped.mockImplementation(async () => ({ ok: false, error: "conflict" }) as never);
    const r = await createAppointment(input);
    expect(r.ok).toBe(false);
  });
});

/* ======================================================================== */
/* OBS-05 — the batch path emits, and its post-commit steps cannot fail it   */
/* ======================================================================== */

/**
 * WHAT WAS WRONG. `batchScheduleAppointments` committed real appointment rows
 * and returned without ever reaching Stream E. No `appointment/scheduled` event,
 * so no reminder run, so no 48h email and no 24h SMS - and NOTHING FAILED, which
 * is why no alert, no log and no test caught it. The patient simply got nothing.
 *
 * These assert the behaviour rather than the presence of a line; the source-scan
 * gate in creation-paths-emit-reminders.test.ts covers the class.
 */
describe("the batch path enqueues reminders for what it booked", () => {
  const batchInput = {
    patientId: "11111111-1111-1111-1111-111111111111",
    practitionerId: "22222222-2222-2222-2222-222222222222",
    locationId: "33333333-3333-3333-3333-333333333333",
    slots: [],
  } as never;

  function booked(...rows: { appointmentId: string; startsAt: string }[]) {
    return {
      batchId: "batch-1",
      requested: rows.length,
      booked: rows.map((r, i) => ({ ...r, date: "2027-06-0" + (i + 1), hhmm: "09:00" })),
      failures: [],
    } as unknown as BatchScheduleResult;
  }

  beforeEach(() => {
    mockBatch.mockResolvedValue(booked({ appointmentId: "appt-1", startsAt: "2027-06-01T09:00:00.000Z" }));
  });

  it("emits one target per BOOKED appointment, with the start instant", async () => {
    mockBatch.mockResolvedValue(
      booked(
        { appointmentId: "appt-1", startsAt: "2027-06-01T09:00:00.000Z" },
        { appointmentId: "appt-2", startsAt: "2027-06-08T09:00:00.000Z" },
      ),
    );

    const r = await batchScheduleAppointments(batchInput);

    expect(r.ok).toBe(true);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const [tenantId, targets] = mockEnqueue.mock.calls[0]!;
    expect(tenantId).toBe("tenant-A");
    expect(targets).toEqual([
      { appointmentId: "appt-1", startsAt: new Date("2027-06-01T09:00:00.000Z") },
      { appointmentId: "appt-2", startsAt: new Date("2027-06-08T09:00:00.000Z") },
    ]);
    // A Date, not the ISO string it crossed the boundary as. computeDueReminders
    // does arithmetic on it, and a string would have produced NaN silently.
    expect(targets[0]!.startsAt).toBeInstanceOf(Date);
  });

  it("enqueues NOTHING for a batch that booked nothing", async () => {
    mockBatch.mockResolvedValue(booked());
    const r = await batchScheduleAppointments(batchInput);
    expect(r.ok).toBe(true);
    expect(mockEnqueue).toHaveBeenCalledWith("tenant-A", []);
  });

  it("returns ok when the enqueue throws after the batch committed", async () => {
    // The reason this sits inside afterCommit. enqueueRemindersAfterCommit
    // THROWS above its occurrence ceiling, and a batch is the one path that can
    // legitimately approach it - so the burst guard must not turn committed
    // appointments into "algo correu mal" at the desk.
    mockEnqueue.mockRejectedValueOnce(new Error("ReminderBurstError"));
    const r = await batchScheduleAppointments(batchInput);
    expect(r.ok).toBe(true);
  });

  it("returns ok when revalidatePath throws after the batch committed", async () => {
    mockRevalidate.mockImplementationOnce(() => {
      throw new Error("revalidate boom");
    });
    const r = await batchScheduleAppointments(batchInput);
    expect(r.ok).toBe(true);
  });

  it("still returns the failure when the batch ENGINE itself throws", async () => {
    mockBatch.mockRejectedValueOnce(new Error("engine down"));
    const r = await batchScheduleAppointments(batchInput);
    expect(r.ok).toBe(false);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
