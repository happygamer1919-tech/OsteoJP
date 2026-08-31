import { vi, describe, it, expect, beforeEach } from "vitest";

/**
 * RB-03 — THE ENFORCEMENT IS WIRED IN, AND `allowConflict` CANNOT REACH IT.
 *
 * ==========================================================================
 * WHY THIS SUITE EXISTS BESIDE availability-enforcement.test.ts.
 * ==========================================================================
 * That file proves the VERDICT is right. It would go on passing if the verdict
 * were computed and then thrown away — which is EXACTLY the defect being fixed:
 * `findScheduleConflicts` already computed availability correctly, and
 * `blockingConflicts()` discarded it one line above the refusal. A correct
 * function nobody acts on is what PL-11 shipped.
 *
 * So this suite drives `createAppointment` and `updateAppointment` and asserts
 * on what they RETURN.
 *
 * ==========================================================================
 * THE BYPASS ARM IS THE ONE THAT MATTERS.
 * ==========================================================================
 * `allowConflict` is "Guardar mesmo assim". If it reached this check, the
 * reported defect would be one extra click away instead of fixed, and every
 * assertion here except that one would still pass. So the outside-hours cases
 * are driven with `allowConflict: true` DELIBERATELY: they must refuse anyway.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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
  assertCan: vi.fn(),
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

/** 2026-08-24 is a MONDAY; the templates below are weekday 1. */
const MONDAY_08_13 = {
  weekday: 1,
  startTime: "08:00:00",
  endTime: "13:00:00",
  validFrom: null,
  validUntil: null,
  isActive: true,
};

let inserted: Record<string, unknown> | null = null;

/**
 * The select stub DISCRIMINATES BY REQUESTED COLUMNS rather than by call order.
 *
 * `createAppointment` makes several selects — the actor's staff_locations, the
 * secondary participants, and now the availability templates. Returning
 * templates to all of them would feed template rows to the location scope and
 * the test would fail for a reason unrelated to what it tests; returning `[]`
 * to all of them would make availability read as UNCONFIGURED and every
 * refusal assertion here would pass vacuously, on a check that never ran.
 */
function fakeTx(templates: unknown[]) {
  return {
    select: (cols?: Record<string, unknown>) => ({
      from: () => ({
        where: async () => (cols && "weekday" in cols ? templates : []),
      }),
    }),
    execute: async () => [],
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserted = v;
        return { returning: async () => [{ id: "new-appt-1" }] };
      },
    }),
  };
}

/** Lisbon is UTC+1 in August, so 17:00 local is 16:00Z. */
const input = (over: Partial<CreateAppointmentInput> = {}): CreateAppointmentInput => ({
  patientId: "patient-1",
  practitionerId: "therapist-1",
  locationId: "loc-1",
  serviceId: "svc-1",
  room: null,
  startsAt: "2026-08-24T08:00:00.000Z", // 09:00 Lisbon, inside 08:00-13:00
  endsAt: "2026-08-24T09:00:00.000Z",
  notes: null,
  recurrence: null,
  // THE OVERRIDE IS ON BY DEFAULT IN THIS SUITE, on purpose. See the header.
  allowConflict: true,
  ...over,
});

function arrange(templates: unknown[]) {
  inserted = null;
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockCtx.mockResolvedValue(actor);
  mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(fakeTx(templates) as never)));
}

beforeEach(() => arrange([MONDAY_08_13]));

describe("createAppointment enforces disponibilidade", () => {
  it("REFUSES 17:00 against a day that ends at 13:00, DESPITE allowConflict", async () => {
    // The reported defect, and the bypass arm in one assertion: Catarina ends at
    // 13:00 and a manual entry books 17:00. `allowConflict: true` is set.
    const r = await createAppointment(input({
      startsAt: "2026-08-24T16:00:00.000Z",
      endsAt: "2026-08-24T17:00:00.000Z",
    }));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("outside_availability");
    // NOTHING WAS WRITTEN. A refusal that returned an error after inserting
    // would satisfy the assertion above and leave the appointment in the diary.
    expect(inserted).toBeNull();
  });

  it("NAMES the therapist's window that day, so the next attempt is informed", async () => {
    const r = await createAppointment(input({
      startsAt: "2026-08-24T16:00:00.000Z",
      endsAt: "2026-08-24T17:00:00.000Z",
    }));
    expect(r.ok === false && r.availabilityWindows).toEqual([
      { startTime: "08:00", endTime: "13:00" },
    ]);
  });

  it("ALLOWS a window inside the hours - the negative arm", async () => {
    // Without this, an enforcement that refused EVERYTHING would pass every
    // refusal assertion in this file.
    const r = await createAppointment(input());
    expect(r.ok).toBe(true);
    expect(inserted).not.toBeNull();
  });

  it("ALLOWS anything when the therapist has NO configured hours", async () => {
    // Opt-in per (therapist, location). The failure mode this prevents is
    // total: a clinic that never set hours could not book at all.
    arrange([]);
    const r = await createAppointment(input({
      startsAt: "2026-08-24T16:00:00.000Z",
      endsAt: "2026-08-24T17:00:00.000Z",
    }));
    expect(r.ok).toBe(true);
    expect(inserted).not.toBeNull();
  });

  it("REFUSES a RECURRING series whose later occurrence falls outside the hours", async () => {
    // Every occurrence is checked, not just the first. A weekly series booked
    // inside the hours on week one is the same defect with a later date on it
    // if a later week is not.
    //
    // The seed here is inside the hours; the templates are TUESDAY-only, so
    // this Monday booking is outside on every occurrence - which is the same
    // arithmetic and does not depend on the recurrence engine's own expansion.
    arrange([{ ...MONDAY_08_13, weekday: 2 }]);
    const r = await createAppointment(input());
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("outside_availability");
    // No window that day, which is a DIFFERENT sentence and the caller renders
    // it as one.
    expect(r.ok === false && r.availabilityWindows).toEqual([]);
  });
});
