import { vi, describe, it, expect, beforeEach } from "vitest";

// W3-01 — the creation invariant is server-enforced: every new appointment is
// persisted with lifecycle `status = scheduled`, and `confirmation_state` is
// left to its DB default (`pending`), NEVER taken from the payload. There is no
// lifecycle Estado selector in the creation UI (removed W2-02 #454, hardened
// here). These tests pin the server contract so the axis can never be set at
// booking time again, regardless of what a caller sends.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Auth: pass the capability gate and hand every runScoped call a fake tenant tx.
vi.mock("@/lib/auth/context", () => ({
  requireRequestContext: vi.fn(),
  runScoped: vi.fn(),
}));
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

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { createAppointment } from "./actions";
import type { RequestContext } from "@osteojp/auth";
import type { CreateAppointmentInput } from "./types";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);

const actor: RequestContext = { tenantId: "tenant-A", role: "admin", userId: "user-1" };

// Captures the row object handed to `tx.insert(appointments).values(...)`.
let captured: Record<string, unknown> | null = null;

function fakeTx() {
  return {
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        captured = v; // non-recurring create inserts a single row object
        return { returning: async () => [{ id: "new-appt-1" }] };
      },
    }),
  };
}

const baseInput: CreateAppointmentInput = {
  patientId: "patient-1",
  practitionerId: "therapist-1",
  locationId: "loc-1",
  serviceId: "svc-1",
  room: null,
  startsAt: "2026-08-06T09:00:00.000Z",
  endsAt: "2026-08-06T10:00:00.000Z",
  notes: null,
  recurrence: null,
  allowConflict: true, // skip the conflict pre-check (no ./conflict mock needed)
};

beforeEach(() => {
  captured = null;
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockCtx.mockResolvedValue(actor);
  mockRunScoped.mockImplementation((_actor, cb) => Promise.resolve(cb(fakeTx() as never)));
});

describe("createAppointment — creation invariant (W3-01)", () => {
  it("persists a new appointment with status = scheduled", async () => {
    const result = await createAppointment(baseInput);

    expect(result.ok).toBe(true);
    expect(captured).not.toBeNull();
    expect(captured!.status).toBe("scheduled");
  });

  it("never sets confirmation_state, so the DB default (pending) applies", async () => {
    await createAppointment(baseInput);

    // The action writes no confirmationState — the column default is `pending`
    // (schema.ts). The two axes stay orthogonal; creation touches only status.
    expect(captured).not.toBeNull();
    expect("confirmationState" in captured!).toBe(false);
  });

  it("ignores a lifecycle status smuggled in via the payload — still scheduled", async () => {
    // The public type has no `status` field; a rogue/legacy caller casting past
    // it must not be able to open an appointment already completed/cancelled.
    const rogue = { ...baseInput, status: "completed" } as unknown as CreateAppointmentInput;

    const result = await createAppointment(rogue);

    expect(result.ok).toBe(true);
    expect(captured!.status).toBe("scheduled");
  });
});
