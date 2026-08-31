import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Auth: pass the capability gate and hand every runScoped call a fake tenant tx.
// OSTEOJP-WEB-8: `authorize()` in lib/scheduling/actions.ts now asks
// `getRequestContext()` rather than `requireRequestContext()`, because the
// guard NAVIGATES and this action owes its client a result object instead.
// The mock delegates so every existing `mockResolvedValue` on the require-
// mock below still drives both, and no assertion in this file changes.
vi.mock("@/lib/auth/context", () => {
  const requireRequestContext = vi.fn();
  return {
    requireRequestContext,
    getRequestContext: vi.fn(() => requireRequestContext()),
  runScoped: vi.fn(),
  };
});
vi.mock("@osteojp/auth", () => ({
  assertCan: vi.fn(), // no-op → capability granted
  ForbiddenError: class ForbiddenError extends Error {},
}));
vi.mock("./actor", () => ({ clientIp: vi.fn(async () => null) }));
vi.mock("./audit", () => ({ writeAppointmentAudit: vi.fn(async () => {}) }));
vi.mock("./reminders", () => ({
  enqueueRemindersAfterCommit: vi.fn(async () => {}),
  enqueueStatusNotificationsAfterCommit: vi.fn(async () => {}),
}));
vi.mock("./analytics", () => ({
  writeAppointmentStatusChangedEvent: vi.fn(async () => {}),
}));

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { writeAppointmentStatusChangedEvent } from "./analytics";
import { updateAppointment } from "./actions";
import type { RequestContext } from "@osteojp/auth";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const mockEmit = vi.mocked(writeAppointmentStatusChangedEvent);

const actor: RequestContext = { tenantId: "tenant-A", role: "admin", userId: "user-1" };

const targetRow = {
  id: "appt-1",
  patientId: "patient-1", // W12-13: read by updateAppointment's note-append path
  startsAt: new Date("2026-01-05T09:00:00Z"),
  endsAt: new Date("2026-01-05T10:00:00Z"),
  practitionerId: "therapist-1",
  locationId: "loc-1",
  room: null,
  status: "confirmed",
  recurrenceParentId: null,
};

// A fake tx that satisfies resolveSeries (scope "one"), the status update, and
// the W12-13 notes-only append (a patientId select + an appointment_notes insert).
function fakeTx() {
  return {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [targetRow] }) }),
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    insert: () => ({ values: async () => undefined }),
  };
}

beforeEach(() => {
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockEmit.mockReset();
  mockCtx.mockResolvedValue(actor);
  // runScoped(actor, cb) → run cb against the fake tenant tx, return its result.
  mockRunScoped.mockImplementation((_actor, cb) => Promise.resolve(cb(fakeTx() as never)));
});

describe("updateAppointment — appointment_status_changed emission wiring", () => {
  it("emits the status-change event on the completion transition", async () => {
    const result = await updateAppointment("appt-1", { status: "completed" });

    expect(result.ok).toBe(true);
    expect(mockEmit).toHaveBeenCalledTimes(1);
    const [, args] = mockEmit.mock.calls[0];
    expect(args).toMatchObject({
      tenantId: "tenant-A",
      actorUserId: "user-1",
      appointmentId: "appt-1",
      fromStatus: "confirmed",
      toStatus: "completed",
      therapistUserId: "therapist-1",
      locationId: "loc-1",
    });
  });

  it("does NOT emit for a non-completion transition (confirmed)", async () => {
    const result = await updateAppointment("appt-1", { status: "confirmed" });

    expect(result.ok).toBe(true);
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("does NOT emit for a no_show transition", async () => {
    const result = await updateAppointment("appt-1", { status: "no_show" });

    expect(result.ok).toBe(true);
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("does NOT emit for a non-status patch (notes only)", async () => {
    const result = await updateAppointment("appt-1", { notes: "room prep" });

    expect(result.ok).toBe(true);
    expect(mockEmit).not.toHaveBeenCalled();
  });
});
