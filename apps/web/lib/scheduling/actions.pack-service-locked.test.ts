import { vi, describe, it, expect, beforeEach } from "vitest";

/**
 * PACK-03 — A PACOTE BINDS TO ONE SERVICE, ENFORCED ON THE WRITE.
 *
 * ==========================================================================
 * WHY THIS SUITE EXISTS BESIDE link-core.test.ts
 * ==========================================================================
 * `packServiceChangeRefusal` is pure and is tested there. It would go on
 * passing if `updateAppointment` computed the refusal and then wrote anyway —
 * which is exactly the defect this closes, one layer along: `link-core.ts` has
 * refused `service_mismatch` since PACK-01 and `updateAppointment` never asked
 * it anything. A correct function nobody calls is what the create path shipped.
 *
 * So this suite drives the ACTION and asserts on what it returns AND on whether
 * the row was written. A refusal that still issues the UPDATE is not a refusal.
 */

vi.mock("server-only", () => ({}));
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
vi.mock("./analytics", () => ({
  writeAppointmentStatusChangedEvent: vi.fn(async () => {}),
}));

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { updateAppointment } from "./actions";
import type { RequestContext } from "@osteojp/auth";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const actor: RequestContext = { tenantId: "tenant-A", role: "admin", userId: "user-1" };

const NESA = "svc-nesa";
const FISIO = "svc-fisioterapia";

const targetRow = {
  id: "appt-1",
  patientId: "patient-1",
  startsAt: new Date("2026-01-05T09:00:00Z"),
  endsAt: new Date("2026-01-05T10:00:00Z"),
  practitionerId: "therapist-1",
  locationId: "loc-1",
  room: null,
  status: "confirmed",
  recurrenceParentId: null,
};

/** Every `set()` the action actually issued. Empty means the row is untouched. */
let writes: Record<string, unknown>[] = [];

/**
 * The select stub DISCRIMINATES BY REQUESTED COLUMNS, not by call order.
 *
 * `updateAppointment` selects twice on this path: `resolveSeries` (which ends
 * in `.limit(1)`) and the PACK-03 link read (two leftJoins, awaited directly).
 * Returning the link rows to both would feed them to `resolveSeries` and the
 * test would fail for an unrelated reason; returning `[]` to both would make
 * every row read as UNLINKED and every refusal assertion here would pass
 * vacuously, on a guard that never fired.
 */
function fakeTx(linkRows: Record<string, unknown>[]) {
  const linkQuery = {
    leftJoin: () => linkQuery,
    where: async () => linkRows,
  };
  return {
    select: (cols?: Record<string, unknown>) => ({
      from: () =>
        cols && "packBaseServiceId" in cols
          ? linkQuery
          : { where: () => ({ limit: async () => [targetRow] }) },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        writes.push(values);
        return { where: async () => undefined };
      },
    }),
    insert: () => ({ values: async () => undefined }),
  };
}

function withLink(rows: Record<string, unknown>[]) {
  mockRunScoped.mockImplementation((_actor, cb) => Promise.resolve(cb(fakeTx(rows) as never)));
}

/** The row as the join returns it when the appointment draws a NESA session. */
const linkedToNesa = [
  { id: "appt-1", packInstanceId: "inst-1", packBaseServiceId: NESA },
];
/** The same shape for an appointment with no pacote: both columns null. */
const notLinked = [{ id: "appt-1", packInstanceId: null, packBaseServiceId: null }];

beforeEach(() => {
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockCtx.mockResolvedValue(actor);
  writes = [];
  withLink(notLinked);
});

describe("updateAppointment — a pacote session keeps its service", () => {
  it("REFUSES a service change on a linked appointment, and writes NOTHING", async () => {
    withLink(linkedToNesa);
    const result = await updateAppointment("appt-1", { serviceId: FISIO });

    expect(result).toEqual({ ok: false, error: "pack_service_locked" });
    // THE HALF THAT MATTERS. A refusal that still issued the UPDATE would leave
    // the row on Fisioterapia while telling reception it had been refused.
    expect(writes).toEqual([]);
  });

  it("REFUSES clearing the service on a linked appointment", async () => {
    withLink(linkedToNesa);
    const result = await updateAppointment("appt-1", { serviceId: null });

    expect(result).toEqual({ ok: false, error: "pack_service_locked" });
    expect(writes).toEqual([]);
  });

  /**
   * THE REPAIR ARM. Setting it BACK to the pacote's own service is the one edit
   * that fixes a row somebody has already broken. A blanket "no service change
   * on a linked row" would refuse exactly that, and would also refuse a no-op
   * re-save of the correct value.
   */
  it("ALLOWS setting the service back to the pacote's own base service", async () => {
    withLink(linkedToNesa);
    const result = await updateAppointment("appt-1", { serviceId: NESA });

    expect(result.ok).toBe(true);
    expect(writes).toEqual([{ serviceId: NESA }]);
  });

  /**
   * THE NEGATIVE ARM ON THE OTHER SIDE. An ordinary appointment must still be
   * editable; a guard that refuses everything is indistinguishable from a
   * broken screen.
   */
  it("ALLOWS a service change on an appointment with no pacote", async () => {
    withLink(notLinked);
    const result = await updateAppointment("appt-1", { serviceId: FISIO });

    expect(result.ok).toBe(true);
    expect(writes).toEqual([{ serviceId: FISIO }]);
  });

  /**
   * THE GUARD IS SCOPED TO THE FIELD IT GOVERNS. Marking a pacote session as
   * completed is not a service change and must go through — otherwise the fix
   * would make linked appointments uneditable, which nobody asked for, and a
   * session could never be marked done.
   */
  it("does not fire for a patch that does not touch serviceId", async () => {
    withLink(linkedToNesa);
    const result = await updateAppointment("appt-1", { status: "completed" });

    expect(result.ok).toBe(true);
    expect(writes).toEqual([{ status: "completed" }]);
  });

  /**
   * A SERIES EDIT IS REFUSED IF ANY MEMBER IS LINKED. `resolveSeries` can
   * return several rows and the write applies to all of them, so a refusal that
   * looked only at the one clicked would let the rest through.
   */
  it("REFUSES when only ONE member of the affected set is linked", async () => {
    withLink([
      { id: "appt-1", packInstanceId: null, packBaseServiceId: null },
      { id: "appt-2", packInstanceId: "inst-1", packBaseServiceId: NESA },
    ]);
    const result = await updateAppointment("appt-1", { serviceId: FISIO });

    expect(result).toEqual({ ok: false, error: "pack_service_locked" });
    expect(writes).toEqual([]);
  });
});
