import { vi, describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W13-04 — reception confirms a portal pedido, under the owner's option-B
 * ruling of 2026-08-06: "o horario fica livre ate a rececao confirmar".
 *
 * The ruling makes three things load-bearing, and each has a test here that
 * FAILS if the thing is removed:
 *
 *   1. The availability re-check is MANDATORY and runs in the SAME transaction
 *      as the status write, behind the slot lock. Under option B another
 *      booking may legitimately have taken the slot since the pedido was
 *      written, so this is the only thing standing between a pedido and a
 *      double booking.
 *   2. On conflict there is NO WRITE and the pedido stays pending. No partial
 *      states: reception is told, the row stays in their queue, and they choose
 *      what to offer the patient.
 *   3. It writes the LIFECYCLE axis only. `appointment_confirmation_state`
 *      belongs to the Twilio reminder-reply webhook; writing it here would
 *      record a patient reply that never happened.
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
  assertCan: vi.fn(), // no-op → capability granted
  ForbiddenError: class ForbiddenError extends Error {},
}));
vi.mock("./actor", () => ({ clientIp: vi.fn(async () => null) }));
vi.mock("./audit", () => ({ writeAppointmentAudit: vi.fn(async () => {}) }));
vi.mock("./reminders", () => ({
  enqueueRemindersAfterCommit: vi.fn(async () => {}),
  enqueueStatusNotificationsAfterCommit: vi.fn(async () => {}),
}));
vi.mock("./conflict", () => ({
  findConflicts: vi.fn(async () => []),
  findConflictsForWindow: vi.fn(async () => []),
  blockingConflicts: (c: unknown[]) => c,
}));

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { findConflictsForWindow } from "./conflict";
import { writeAppointmentAudit } from "./audit";
import { confirmAppointmentRequest } from "./actions";
import type { RequestContext } from "@osteojp/auth";
import type { ConflictInfo } from "./types";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const mockConflicts = vi.mocked(findConflictsForWindow);
const mockAudit = vi.mocked(writeAppointmentAudit);

const actor: RequestContext = { tenantId: "tenant-A", role: "reception", userId: "user-1" };

const PEDIDO = {
  id: "appt-1",
  startsAt: new Date("2026-09-01T09:00:00.000Z"),
  endsAt: new Date("2026-09-01T10:00:00.000Z"),
  practitionerId: "therapist-1",
  locationId: "loc-1",
  room: null,
  status: "scheduled",
};

/** Ordered log of everything the action did inside the transaction, so the
 *  ORDER (lock → check → write) can be asserted, not just the presence. */
let trace: string[] = [];
/** Every `set(...)` payload handed to an UPDATE. */
let sets: Record<string, unknown>[] = [];
/** Rows the joined pedido SELECT returns. Empty = not the caller's pedido. */
let selectRows: unknown[] = [];
/** Rows the UPDATE ... RETURNING gives back. Empty = someone else got there. */
let updateReturns: unknown[] = [{ id: "appt-1" }];

function fakeTx() {
  return {
    execute: async () => {
      trace.push("lock");
      return [];
    },
    select: () => {
      const chain: Record<string, unknown> = {
        from: () => chain,
        innerJoin: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        limit: async () => {
          trace.push("select");
          return selectRows;
        },
      };
      return chain;
    },
    update: () => ({
      set: (v: Record<string, unknown>) => {
        sets.push(v);
        return {
          where: () => ({
            returning: async () => {
              trace.push("update");
              return updateReturns;
            },
          }),
        };
      },
    }),
  };
}

beforeEach(() => {
  trace = [];
  sets = [];
  selectRows = [PEDIDO];
  updateReturns = [{ id: "appt-1" }];
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockConflicts.mockReset();
  mockAudit.mockReset();
  mockCtx.mockResolvedValue(actor);
  mockConflicts.mockResolvedValue([]);
  mockRunScoped.mockImplementation((_actor, cb) => Promise.resolve(cb(fakeTx() as never)));
});

const taken: ConflictInfo = {
  kind: "therapist",
  id: "appt-other",
  patientName: "Outro Paciente",
  startsAt: "2026-09-01T09:00:00.000Z",
  endsAt: "2026-09-01T10:00:00.000Z",
  room: null,
};

describe("confirm succeeds on a free slot", () => {
  it("writes status = confirmed and returns ok", async () => {
    const result = await confirmAppointmentRequest("appt-1");

    expect(result).toEqual({ ok: true, data: { id: "appt-1" } });
    expect(sets).toHaveLength(1);
    expect(sets[0]).toEqual({ status: "confirmed" });
  });

  it("takes the slot lock BEFORE it checks, and checks BEFORE it writes", async () => {
    await confirmAppointmentRequest("appt-1");

    // The check itself is mocked, so its position is proven by the call order
    // of the trace against the mock's invocation, not by a label in the trace.
    expect(trace).toEqual(["select", "lock", "update"]);
    expect(mockConflicts).toHaveBeenCalledTimes(1);
    // The lock is taken before the update; the check ran between them.
    expect(trace.indexOf("lock")).toBeLessThan(trace.indexOf("update"));
  });

  it("re-checks the appointment's OWN window and excludes only itself", async () => {
    await confirmAppointmentRequest("appt-1");

    expect(mockConflicts).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        practitionerId: "therapist-1",
        locationId: "loc-1",
        startsAt: PEDIDO.startsAt,
        endsAt: PEDIDO.endsAt,
        excludeIds: ["appt-1"],
      }),
    );
  });

  it("records the acceptance in the audit trail, naming both statuses", async () => {
    await confirmAppointmentRequest("appt-1");

    expect(mockAudit).toHaveBeenCalledTimes(1);
    const args = mockAudit.mock.calls[0][1];
    expect(args.appointmentId).toBe("appt-1");
    expect(args.metadata).toMatchObject({
      from_status: "scheduled",
      to_status: "confirmed",
      via: "portal_request_confirm",
    });
  });
});

describe("confirm fails CLEAN on a taken slot", () => {
  beforeEach(() => {
    mockConflicts.mockResolvedValue([taken]);
  });

  it("returns the conflict and performs NO write", async () => {
    const result = await confirmAppointmentRequest("appt-1");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toBe("conflict");
    expect(result.conflicts).toEqual([taken]);

    // The whole of option B's cost is here: no row was touched, so the pedido
    // is still `scheduled` and still in reception's queue.
    expect(sets).toHaveLength(0);
    expect(trace).not.toContain("update");
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("names the conflict, so reception can tell the patient what happened", async () => {
    const result = await confirmAppointmentRequest("appt-1");
    if (result.ok) throw new Error("unreachable");

    expect(result.conflicts?.[0]).toMatchObject({
      kind: "therapist",
      startsAt: "2026-09-01T09:00:00.000Z",
    });
  });
});

describe("a pedido that is no longer pending is refused, not silently confirmed", () => {
  it("returns not_found when the joined SELECT yields nothing", async () => {
    selectRows = []; // confirmed, cancelled, or not this caller's notification

    const result = await confirmAppointmentRequest("appt-1");

    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(sets).toHaveLength(0);
    expect(mockConflicts).not.toHaveBeenCalled();
  });

  it("returns not_found when the guarded UPDATE matches zero rows", async () => {
    // The race the SELECT cannot close on its own: another writer moved the row
    // out of `scheduled` between the read and the write.
    updateReturns = [];

    const result = await confirmAppointmentRequest("appt-1");

    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("refuses an empty id before touching the database", async () => {
    const result = await confirmAppointmentRequest("");

    expect(result).toEqual({ ok: false, error: "validation" });
    expect(mockRunScoped).not.toHaveBeenCalled();
  });
});

describe("the action writes the LIFECYCLE axis and never the confirmation axis", () => {
  it("the only column it ever sets is status", async () => {
    await confirmAppointmentRequest("appt-1");

    for (const set of sets) {
      expect(Object.keys(set)).toEqual(["status"]);
      expect(set).not.toHaveProperty("confirmationState");
    }
  });

  it("the source of the action mentions no confirmation-state column at all", () => {
    // A behavioural test can only prove that THIS path does not write it. The
    // corrected-axis ruling is about the whole action, so the source is read as
    // text — the same technique blocking-status.test.ts uses to stop two sites
    // drifting. If a future edit adds a confirmation_state write anywhere in
    // this function, this fails.
    const source = readFileSync(join(__dirname, "actions.ts"), "utf-8");
    const start = source.indexOf("export async function confirmAppointmentRequest");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("export async function cancelAppointment", start);
    expect(end).toBeGreaterThan(start);
    const body = source.slice(start, end);

    expect(body).not.toMatch(/confirmationState/);
    expect(body).not.toMatch(/confirmation_state/);
  });
});
