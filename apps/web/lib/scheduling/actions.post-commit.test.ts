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
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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

import { revalidatePath } from "next/cache";
import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { enqueueRemindersAfterCommit } from "./reminders";
import { createAppointment } from "./actions";
import type { RequestContext } from "@osteojp/auth";
import type { CreateAppointmentInput } from "./types";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const mockRevalidate = vi.mocked(revalidatePath);
const mockEnqueue = vi.mocked(enqueueRemindersAfterCommit);

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
