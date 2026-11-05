import { vi, describe, it, expect, beforeEach } from "vitest";

/**
 * TIER C 0114 - the drawer's Estado selector is one of the four doors that
 * ACCEPT a portal pedido (lib/scheduling/pedido-acceptance.ts). Accepting a
 * pedido made before a closure was entered must be refused here exactly as
 * confirmAppointmentRequest refuses it: `clinic_closed`, nothing written,
 * nothing emitted. A row that is not an unaccepted pedido is not asked
 * (its booking door checked the closure when it was made).
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requireRequestContext: vi.fn(), runScoped: vi.fn() }));
vi.mock("@osteojp/auth", () => ({
  assertCan: vi.fn(),
  can: vi.fn(() => true),
  ForbiddenError: class ForbiddenError extends Error {},
}));
vi.mock("./actor", () => ({ clientIp: vi.fn(async () => null) }));
vi.mock("./audit", () => ({ writeAppointmentAudit: vi.fn(async () => {}) }));
vi.mock("./analytics", () => ({ writeAppointmentStatusChangedEvent: vi.fn(async () => {}) }));
vi.mock("./reminders", () => ({
  enqueueRemindersAfterCommit: vi.fn(async () => {}),
  enqueueStatusNotificationsAfterCommit: vi.fn(async () => {}),
}));
vi.mock("./conflict", () => ({
  findConflicts: vi.fn(async () => []),
  findConflictsForWindow: vi.fn(async () => []),
  blockingConflicts: (c: unknown[]) => c,
}));
vi.mock("./clinic-closure-enforcement", () => ({
  checkClinicClosure: vi.fn(async () => ({ ok: true })),
  checkClinicWindow: vi.fn(async () => ({ ok: true })),
  clinicClosurePayload: (v: { locationName: string; from: string; to: string; closedDay?: unknown }) => {
    const { locationName, from, to, closedDay } = v;
    return closedDay ? { locationName, from, to, closedDay } : { locationName, from, to };
  },
}));

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { checkClinicClosure } from "./clinic-closure-enforcement";
import { enqueueRemindersAfterCommit } from "./reminders";
import { updateAppointment } from "./actions";
import type { RequestContext } from "@osteojp/auth";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const mockClosure = vi.mocked(checkClinicClosure);
const mockEnqueue = vi.mocked(enqueueRemindersAfterCommit);

const actor: RequestContext = { tenantId: "tenant-A", role: "reception", userId: "user-1" };
const ROW = {
  id: "appt-1",
  startsAt: new Date("2026-12-25T10:00:00.000Z"),
  endsAt: new Date("2026-12-25T11:00:00.000Z"),
  practitionerId: "therapist-1",
  locationId: "loc-1",
  room: null,
  status: "scheduled",
  recurrenceParentId: null,
};

let pedidoIds: string[] = [];
let updates = 0;

function fakeTx() {
  return {
    execute: async (q: unknown) => {
      const text = JSON.stringify(q ?? "");
      if (text.includes("is_unconfirmed_pedido")) return pedidoIds.map((id) => ({ id }));
      return [];
    },
    select: () => {
      const chain: Record<string, unknown> = {
        from: () => chain,
        innerJoin: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        limit: async () => [ROW],
      };
      return chain;
    },
    update: () => ({
      set: () => ({
        where: async () => {
          updates++;
          return [];
        },
      }),
    }),
    insert: () => ({ values: async () => [] }),
  };
}

const CLOSED = {
  ok: false as const,
  locationName: "Clinica A",
  from: "",
  to: "",
  closedDay: { kind: "feriado_nacional", label: "Natal", wholeDay: true },
};

beforeEach(() => {
  pedidoIds = [];
  updates = 0;
  vi.clearAllMocks();
  mockCtx.mockResolvedValue(actor);
  mockClosure.mockResolvedValue({ ok: true });
  mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(fakeTx() as never)));
});

describe("Tier C 0114: accepting a pedido from the drawer refuses a closure", () => {
  it("an unaccepted pedido inside a closure: clinic_closed, nothing written, nothing emitted", async () => {
    pedidoIds = ["appt-1"];
    mockClosure.mockResolvedValue(CLOSED);
    const r = await updateAppointment("appt-1", { status: "confirmed" });
    expect(r).toEqual({
      ok: false,
      error: "clinic_closed",
      clinicClosure: { locationName: "Clinica A", from: "", to: "", closedDay: CLOSED.closedDay },
    });
    expect(updates).toBe(0);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("asks about the pedido's OWN clinic and window", async () => {
    pedidoIds = ["appt-1"];
    await updateAppointment("appt-1", { status: "confirmed" });
    expect(mockClosure).toHaveBeenCalledWith(expect.anything(), {
      locationId: "loc-1",
      startsAt: ROW.startsAt,
      endsAt: ROW.endsAt,
    });
  });

  it("the override does not reach it: allowConflict still refuses", async () => {
    pedidoIds = ["appt-1"];
    mockClosure.mockResolvedValue(CLOSED);
    const r = await updateAppointment("appt-1", { status: "confirmed" }, { allowConflict: true });
    expect(r.ok === false && r.error).toBe("clinic_closed");
    expect(updates).toBe(0);
  });

  it("CONTROL: the same pedido outside any closure is accepted", async () => {
    pedidoIds = ["appt-1"];
    const r = await updateAppointment("appt-1", { status: "confirmed" });
    expect(r.ok).toBe(true);
    expect(updates).toBeGreaterThan(0);
  });

  it("a staff booking (not a pedido) moving to confirmed is not asked", async () => {
    const r = await updateAppointment("appt-1", { status: "confirmed" });
    expect(r.ok).toBe(true);
    expect(mockClosure).not.toHaveBeenCalled();
  });
});
