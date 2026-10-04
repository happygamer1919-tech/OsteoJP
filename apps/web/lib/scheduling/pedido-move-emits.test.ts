/**
 * pedido-move-emits.test.ts - a MOVE or an UN-CANCEL of an unaccepted online
 * request emits nothing; every other row emits exactly as before.
 *
 * WHY. An `appointment/scheduled` for an unaccepted request can send nothing,
 * and it spends the idempotency keys the request's ACCEPTANCE needs at the same
 * start, so a request moved (or brought back) and accepted the same day got no
 * confirmation and no reminders. The reasoning, and why nothing is lost by
 * staying silent, is on `unconfirmedPedidoIdsAmong` in ./pedido-acceptance.ts.
 * The whole sequence is driven in lib/reminders/acceptance-after-reschedule.test.ts
 * and against Postgres in ./pedido-move-emits.db.test.ts.
 *
 * THE OTHER HALF IS THE GUARANTEE THAT MATTERS MORE: a row that is NOT an
 * unaccepted request must keep emitting. Its move is what supersedes its
 * sleeping reminders, and its un-cancel is what gives it reminders again
 * (owner, 2026-09-13). Every "emits" arm below is that guarantee.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({
  requireRequestContext: vi.fn(),
  runScoped: vi.fn(),
}));
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
vi.mock("@/lib/notifications/centre", () => ({
  emitConfirmedNotification: vi.fn(async () => {}),
  emitRescheduledNotification: vi.fn(async () => {}),
  emitCancelledNotification: vi.fn(async () => {}),
  emitCareTeamAddedNotifications: vi.fn(async () => {}),
}));

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import type { RequestContext } from "@osteojp/auth";
import { rescheduleAppointment, updateAppointment } from "./actions";
import { unconfirmedPedidoIdsAmong } from "./pedido-acceptance";
import { enqueueRemindersAfterCommit } from "./reminders";
import type { AppointmentStatusValue } from "./types";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const mockEnqueue = vi.mocked(enqueueRemindersAfterCommit);

const actor: RequestContext = { tenantId: "tenant-A", role: "reception", userId: "user-1" };

/** FUTURE and pinned: an un-cancel only emits for a start that is still ahead. */
const STARTS = new Date("2031-05-14T10:00:00.000Z");
const ENDS = new Date("2031-05-14T11:00:00.000Z");
const NEW_STARTS = new Date("2031-05-15T10:00:00.000Z");
const NEW_ENDS = new Date("2031-05-15T11:00:00.000Z");

let seriesRow = {
  id: "appt-1",
  startsAt: STARTS,
  endsAt: ENDS,
  practitionerId: "therapist-1",
  practitionerTwoId: null as string | null,
  locationId: "loc-1",
  room: null as string | null,
  status: "scheduled" as AppointmentStatusValue,
  recurrenceParentId: null,
};
/** Ids `is_unconfirmed_pedido` reports as unaccepted pedidos. */
let pedidoIds: string[] = [];
/** How many times the pedido probe was asked. */
let probes = 0;

function fakeTx() {
  return {
    execute: async (q: unknown) => {
      const text = JSON.stringify(q ?? "");
      if (text.includes("is_unconfirmed_pedido")) {
        probes += 1;
        return pedidoIds.map((id) => ({ id }));
      }
      return [];
    },
    select: (cols?: Record<string, unknown>) => {
      if (cols && "middayClosedFrom" in cols) {
        const clinic: Record<string, unknown> = {
          from: () => clinic,
          where: () => clinic,
          limit: async () => [],
        };
        return clinic;
      }
      const chain: Record<string, unknown> = {
        from: () => chain,
        innerJoin: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        then: (resolve: (rows: unknown[]) => unknown) => resolve([]),
        limit: async () => [seriesRow],
      };
      return chain;
    },
    update: () => ({ set: () => ({ where: async () => [] }) }),
    insert: () => ({ values: async () => [] }),
  };
}

/** Every target handed to the enqueue, across all calls. */
const emitted = () => mockEnqueue.mock.calls.flatMap((c) => c[1]);

const move = () =>
  rescheduleAppointment("appt-1", {
    startsAt: NEW_STARTS.toISOString(),
    endsAt: NEW_ENDS.toISOString(),
    practitionerId: "therapist-1",
    locationId: "loc-1",
  });

beforeEach(() => {
  seriesRow = { ...seriesRow, status: "scheduled" };
  pedidoIds = [];
  probes = 0;
  vi.clearAllMocks();
  mockCtx.mockResolvedValue(actor);
  mockEnqueue.mockImplementation(async () => {});
  mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(fakeTx() as never)));
});

describe("unconfirmedPedidoIdsAmong", () => {
  it("answers the ids the database calls unaccepted pedidos", async () => {
    pedidoIds = ["appt-1"];
    expect([...(await unconfirmedPedidoIdsAmong(fakeTx() as never, ["appt-1", "appt-2"]))]).toEqual(["appt-1"]);
  });

  it("an empty list asks nothing and answers the empty set", async () => {
    pedidoIds = ["appt-1"];
    expect((await unconfirmedPedidoIdsAmong(fakeTx() as never, [])).size).toBe(0);
    expect(probes).toBe(0);
  });
});

describe("rescheduleAppointment", () => {
  it("moving an UNACCEPTED request succeeds and emits NOTHING", async () => {
    pedidoIds = ["appt-1"];
    expect(await move()).toEqual({ ok: true, data: { id: "appt-1" } });
    expect(emitted()).toEqual([]);
  });

  it("moving an ACCEPTED request emits its new start, unmarked, exactly as before", async () => {
    seriesRow = { ...seriesRow, status: "confirmed" };
    pedidoIds = [];
    expect((await move()).ok).toBe(true);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith("tenant-A", [{ appointmentId: "appt-1", startsAt: NEW_STARTS }]);
  });

  it("moving a STAFF booking that is still Agendada emits: it is not a pedido", async () => {
    pedidoIds = [];
    expect((await move()).ok).toBe(true);
    expect(emitted()).toEqual([{ appointmentId: "appt-1", startsAt: NEW_STARTS }]);
  });

  it("asks the question once, inside the transaction", async () => {
    await move();
    expect(probes).toBe(1);
  });
});

describe("updateAppointment: bringing a Cancelada back", () => {
  beforeEach(() => {
    seriesRow = { ...seriesRow, status: "cancelled" };
  });

  it("an online request brought back to AGENDADA is unaccepted again: it emits NOTHING", async () => {
    pedidoIds = ["appt-1"];
    expect((await updateAppointment("appt-1", { status: "scheduled" })).ok).toBe(true);
    expect(emitted()).toEqual([]);
  });

  it("a STAFF booking brought back to Agendada emits, so its reminders exist again", async () => {
    pedidoIds = [];
    expect((await updateAppointment("appt-1", { status: "scheduled" })).ok).toBe(true);
    expect(emitted()).toEqual([{ appointmentId: "appt-1", startsAt: STARTS }]);
  });

  it("a row brought back straight to CONFIRMADA emits, and the pedido question is not asked for it", async () => {
    // Even if the fake would call it a pedido: `confirmed` cannot be one, so
    // the un-cancel does not ask. (The acceptance probe does not run either:
    // no affected row is `scheduled` before the write.)
    pedidoIds = ["appt-1"];
    expect((await updateAppointment("appt-1", { status: "confirmed" })).ok).toBe(true);
    expect(emitted()).toEqual([{ appointmentId: "appt-1", startsAt: STARTS }]);
    expect(probes).toBe(0);
  });

  it("the un-cancel target is never marked as an acceptance", async () => {
    pedidoIds = [];
    await updateAppointment("appt-1", { status: "scheduled" });
    expect(emitted().every((t) => !("acceptedPedido" in t))).toBe(true);
  });
});
