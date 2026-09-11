import { vi, describe, it, expect, beforeEach } from "vitest";

/**
 * W14-02 — a portal pedido accepted through the drawer's ESTADO SELECTOR gets
 * its confirmation and its reminders, exactly as one accepted through Pedidos
 * (confirmAppointmentRequest) does. Owner ruling 2026-09-10, M2 Option A.
 *
 * THE DEFECT, stated as the absence it was. A portal booking is a PEDIDO and
 * emits nothing when it is made: the owner ruled 2026-08-31 that its
 * confirmation sends when reception ACCEPTS it, and #1085 put the emit in
 * confirmAppointmentRequest. But reception can also accept a pedido by moving
 * its Estado to "Confirmada" in the drawer, which runs updateAppointment - and
 * updateAppointment emitted nothing for a confirmation. The pedido became a real
 * confirmed appointment with no reminder run behind it: no confirmation, no 48h
 * email, no 24h SMS, and nothing anywhere that failed.
 *
 * THE SAFETY HALF IS THE OTHER HALF OF THIS FILE. A staff booking already has
 * its run from creation. A second `appointment/scheduled` at an unchanged start
 * CANCELS the sleeping reminder runs (cancelOn) and the replacements are dropped
 * by the 24h idempotency key - so emitting for a row that is not an unaccepted
 * pedido would REMOVE its reminders. Every silent arm below is that guarantee.
 */

vi.mock("server-only", () => ({}));
// updateTag is mocked too: afterCommit runs revalidateAppointmentSurfaces()
// first, and an undefined updateTag throws there, gets swallowed, and the
// enqueue on the next line never runs - a green test proving nothing.
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

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { findConflictsForWindow } from "./conflict";
import { enqueueRemindersAfterCommit } from "./reminders";
import { updateAppointment } from "./actions";
import type { RequestContext } from "@osteojp/auth";
import type { AppointmentStatusValue, ConflictInfo } from "./types";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const mockConflicts = vi.mocked(findConflictsForWindow);
const mockEnqueue = vi.mocked(enqueueRemindersAfterCommit);

const actor: RequestContext = { tenantId: "tenant-A", role: "reception", userId: "user-1" };
const STARTS = new Date("2026-09-20T09:00:00.000Z");

function row(status: AppointmentStatusValue) {
  return {
    id: "appt-1",
    startsAt: STARTS,
    endsAt: new Date("2026-09-20T10:00:00.000Z"),
    practitionerId: "therapist-1",
    locationId: "loc-1",
    room: null,
    status,
    recurrenceParentId: null,
  };
}

let seriesRow = row("scheduled");
/** Ids `is_unconfirmed_pedido` reports as unaccepted pedidos. */
let pedidoIds: string[] = [];

function fakeTx() {
  return {
    // Serves the advisory lock and the is_unconfirmed_pedido probe; only the
    // probe's result is read, so it is told apart by its SQL text.
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
        limit: async () => [seriesRow],
      };
      return chain;
    },
    update: () => ({ set: () => ({ where: async () => [] }) }),
    insert: () => ({ values: async () => [] }),
  };
}

const CONFLICT: ConflictInfo = {
  kind: "therapist",
  id: "other-1",
  patientName: "Outro Paciente",
  startsAt: "2026-09-20T09:00:00.000Z",
  endsAt: "2026-09-20T10:00:00.000Z",
  room: null,
};

beforeEach(() => {
  seriesRow = row("scheduled");
  pedidoIds = [];
  vi.clearAllMocks();
  mockCtx.mockResolvedValue(actor);
  mockConflicts.mockResolvedValue([]);
  mockEnqueue.mockImplementation(async () => {});
  mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(fakeTx() as never)));
});

describe("W14-02 — the Estado selector accepting a portal pedido emits, like Pedidos does", () => {
  it("scheduled -> confirmed on an UNACCEPTED PORTAL PEDIDO emits exactly one target", async () => {
    pedidoIds = ["appt-1"];
    const r = await updateAppointment("appt-1", { status: "confirmed" });
    expect(r.ok).toBe(true);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    // ONE target, so enqueueRemindersAfterCommit makes it confirmationEligible:
    // the confirmation sends at acceptance, exactly as confirmAppointmentRequest.
    expect(mockEnqueue).toHaveBeenCalledWith("tenant-A", [
      { appointmentId: "appt-1", startsAt: STARTS },
    ]);
  });

  it("still emits under Guardar mesmo assim - allowConflict skips the conflict check, not the acceptance", async () => {
    pedidoIds = ["appt-1"];
    const r = await updateAppointment("appt-1", { status: "confirmed" }, { allowConflict: true });
    expect(r.ok).toBe(true);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  /* ---- the silent arms: every one of these rows already has its run ---- */

  it("a STAFF booking confirmed via Estado emits NOTHING - it already has its run", async () => {
    pedidoIds = []; // no portal origin, no request row
    const r = await updateAppointment("appt-1", { status: "confirmed" });
    expect(r.ok).toBe(true);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("an ALREADY-CONFIRMED pedido saved as confirmed again emits NOTHING", async () => {
    seriesRow = row("confirmed");
    pedidoIds = ["appt-1"]; // the fake would call it a pedido; the status says otherwise
    const r = await updateAppointment("appt-1", { status: "confirmed" });
    expect(r.ok).toBe(true);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("a pedido moved to COMPLETED is not an acceptance and schedules no reminders", async () => {
    pedidoIds = ["appt-1"];
    const r = await updateAppointment("appt-1", { status: "completed" });
    expect(r.ok).toBe(true);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("a REFUSED confirm (the window is taken) emits NOTHING", async () => {
    pedidoIds = ["appt-1"];
    mockConflicts.mockResolvedValue([CONFLICT]);
    const r = await updateAppointment("appt-1", { status: "confirmed" });
    expect(r.ok).toBe(false);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
