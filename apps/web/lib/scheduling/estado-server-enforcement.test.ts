import { vi, describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * INC-08 — the two server-side guards on `updateAppointment`, each with an arm
 * that FAILS if the guard is deleted.
 *
 * THE INCIDENT THESE COME FROM, so the tests are readable as evidence. A
 * confirmed production double booking, same practitioner (8ac3b349), same
 * window. The audit log, UTC:
 *
 *   16:58:37  pedido confirmed via portal_request_confirm — now blocks
 *   16:59:18  pedido flipped BACK to `scheduled` from the agenda drawer.
 *             `scheduled` + an appointment_request row is what
 *             is_unconfirmed_pedido calls non-blocking, so the row became
 *             invisible to every conflict check. ILLEGAL under the Estado map,
 *             and nothing on the server was enforcing it.
 *   16:59:55  a staff appointment was rescheduled onto that window. The check
 *             ran and correctly saw nothing.
 *   17:00:01  and 17:00:14 — both rows patched to `confirmed`. That path ran NO
 *             conflict check at all.
 *
 * Two holes, two guards, two negative arms.
 */

vi.mock("server-only", () => ({}));
// updateTag joined with SCHED-27: updateAppointment's post-commit block calls
// revalidateAppointmentSurfaces() before it enqueues reminders, and that helper
// drops the stat-strip tag. Without it the helper threw inside afterCommit, the
// failure was swallowed as best-effort, and the reminder enqueue after it never
// ran - which is how the first run of the reminders arm below read 0 calls.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));

vi.mock("@/lib/auth/context", () => ({
  requireRequestContext: vi.fn(),
  runScoped: vi.fn(),
}));
vi.mock("@osteojp/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@osteojp/auth")>();
  return {
    assertCan: vi.fn(),
    ForbiddenError: class ForbiddenError extends Error {},
    // SCHED-30: who may bring a Cancelada back is read from the REAL matrix.
    can: actual.can,
  };
});
// SCHED-30: a therapist's clinics. Unassigned here (null, STAFF-02's fallback);
// the clinic arm runs against a real database in therapist-cancel.db.test.ts.
vi.mock("@/lib/auth/viewer-locations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/viewer-locations")>();
  return { ...actual, bookingLocationScope: vi.fn(async () => null) };
});
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
// SCHED-27: the un-cancel checks. Mocked to PASS here so this file keeps testing
// the map, the role gate and the conflict gate; the closure, NESA and pacote
// refusals themselves are asserted against a real database in
// estado-uncancel.db.test.ts.
vi.mock("./clinic-closure-enforcement", () => ({
  checkClinicClosure: vi.fn(async () => ({ ok: true })),
  // AGENDA-2100: the un-cancel path now also asks whether the clinic is OPEN at
  // that hour. Mocked to PASS for exactly the reason the closure above it is:
  // this file tests the estado map, the role gate and the conflict gate, and the
  // clinic-hours rule has its own suites (clinic-hours-window.test.ts,
  // actions.clinic-hours-enforced.test.ts, write-paths-check-clinic-hours.test.ts).
  //
  // A FACTORY REPLACES THE WHOLE MODULE, so an export it omits is `undefined`
  // rather than the real function - and calling it throws an error the action
  // catches and reports as the generic `error`. That is what six arms here did
  // the moment the new check landed.
  checkClinicWindow: vi.fn(async () => ({ ok: true })),
}));
vi.mock("./uncancel-db", () => ({ uncancelOverdrawsPack: vi.fn(async () => false) }));
vi.mock("./shared-resources", () => ({
  listSharedResources: vi.fn(async () => []),
  listSharedResourcesTx: vi.fn(async () => []),
}));

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { findConflictsForWindow } from "./conflict";
import { updateAppointment } from "./actions";
import type { RequestContext } from "@osteojp/auth";
import type { AppointmentStatusValue, ConflictInfo } from "./types";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const mockConflicts = vi.mocked(findConflictsForWindow);

const actor: RequestContext = { tenantId: "tenant-A", role: "reception", userId: "user-1" };

function row(status: AppointmentStatusValue) {
  return {
    id: "appt-1",
    startsAt: new Date("2026-09-01T09:00:00.000Z"),
    endsAt: new Date("2026-09-01T10:00:00.000Z"),
    practitionerId: "therapist-1",
    locationId: "loc-1",
    room: null,
    status,
    recurrenceParentId: null,
  };
}

let trace: string[] = [];
let seriesRow = row("scheduled");
/** Ids `is_unconfirmed_pedido` reports as unconfirmed pedidos (non-blocking). */
let pedidoIds: string[] = [];
let updated = false;

function fakeTx() {
  return {
    // Serves BOTH the advisory-lock call and the is_unconfirmed_pedido probe.
    // The probe is the only one whose result is read, so it is distinguished by
    // the SQL text rather than by call order.
    execute: async (q: unknown) => {
      const text = JSON.stringify(q ?? "");
      if (text.includes("is_unconfirmed_pedido")) {
        trace.push("pedido-probe");
        return pedidoIds.map((id) => ({ id }));
      }
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
          return [seriesRow];
        },
      };
      return chain;
    },
    update: () => ({
      set: () => ({
        where: async () => {
          trace.push("update");
          updated = true;
          return [];
        },
      }),
    }),
    insert: () => ({ values: async () => [] }),
  };
}

beforeEach(() => {
  trace = [];
  seriesRow = row("scheduled");
  pedidoIds = [];
  updated = false;
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockConflicts.mockReset();
  mockCtx.mockResolvedValue(actor);
  mockConflicts.mockResolvedValue([]);
  mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(fakeTx() as never)));
});

const CONFLICT: ConflictInfo = {
  kind: "therapist",
  id: "other-1",
  patientName: "Outro Paciente",
  startsAt: "2026-09-01T09:00:00.000Z",
  endsAt: "2026-09-01T10:00:00.000Z",
  room: null,
};

// ====================================================================
// (a) THE ESTADO MAP, ENFORCED SERVER-SIDE
// ====================================================================
describe("INC-08 (a) — the server refuses an illegal Estado transition", () => {
  it("REFUSES confirmed -> scheduled, the exact 16:59:18 move, and writes nothing", async () => {
    seriesRow = row("confirmed");
    const r = await updateAppointment("appt-1", { status: "scheduled" });
    expect(r).toEqual({ ok: false, error: "illegal_transition" });
    // NOT a partial state: the refusal happens before any UPDATE.
    expect(updated).toBe(false);
    expect(trace).not.toContain("update");
  });

  // SCHED-27 (owner, 2026-09-13) opened cancelled -> scheduled|confirmed, so
  // cancelled left this arm; its own arms are in the SCHED-27 block below.
  it("REFUSES onward moves out of the terminal states", async () => {
    for (const from of ["completed", "no_show"] as AppointmentStatusValue[]) {
      seriesRow = row(from);
      updated = false;
      const r = await updateAppointment("appt-1", { status: "confirmed" });
      expect(r).toEqual({ ok: false, error: "illegal_transition" });
      expect(updated).toBe(false);
    }
  });

  // THE ARM THAT STOPS THIS BEING A REFUSE-EVERYTHING TEST. A guard that
  // rejected every transition would pass all of the above and be useless.
  it("ALLOWS the legal moves, so the guard is a map and not a wall", async () => {
    for (const [from, to] of [
      ["scheduled", "confirmed"],
      ["scheduled", "completed"],
      ["scheduled", "no_show"],
      ["confirmed", "completed"],
      ["confirmed", "no_show"],
    ] as [AppointmentStatusValue, AppointmentStatusValue][]) {
      seriesRow = row(from);
      updated = false;
      const r = await updateAppointment("appt-1", { status: to });
      expect(r.ok).toBe(true);
      expect(updated).toBe(true);
    }
  });

  it("does not fire on a patch that carries no status at all", async () => {
    seriesRow = row("confirmed");
    const r = await updateAppointment("appt-1", { room: "Sala 2" });
    expect(r.ok).toBe(true);
  });
});

// ====================================================================
// (b) THE CONFLICT CHECK ON ENTERING THE BLOCKING SET
// ====================================================================
describe("INC-08 (b) — a status patch that starts blocking is conflict-checked", () => {
  it("REFUSES to confirm an unconfirmed pedido whose window is taken", async () => {
    pedidoIds = ["appt-1"]; // scheduled + an appointment_request row = non-blocking
    mockConflicts.mockResolvedValue([CONFLICT]);
    const r = await updateAppointment("appt-1", { status: "confirmed" });
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ error: "conflict" });
    expect(updated).toBe(false);
  });

  it("names the conflict, so reception can tell the patient what happened", async () => {
    pedidoIds = ["appt-1"];
    mockConflicts.mockResolvedValue([CONFLICT]);
    const r = await updateAppointment("appt-1", { status: "confirmed" });
    if (r.ok) throw new Error("expected a refusal");
    expect(r.conflicts?.[0]).toMatchObject({ kind: "therapist", patientName: "Outro Paciente" });
  });

  it("LOCKS THE SLOT BEFORE IT READS — check-then-write without a lock is the race", async () => {
    pedidoIds = ["appt-1"];
    await updateAppointment("appt-1", { status: "confirmed" });
    expect(trace).toContain("lock");
    expect(trace.indexOf("lock")).toBeLessThan(trace.indexOf("update"));
  });

  // THE ARM THAT STOPS THIS BEING A REFUSE-EVERYTHING TEST, twice over.
  it("CONFIRMS a pedido on a genuinely free window", async () => {
    pedidoIds = ["appt-1"];
    mockConflicts.mockResolvedValue([]);
    const r = await updateAppointment("appt-1", { status: "confirmed" });
    expect(r.ok).toBe(true);
    expect(updated).toBe(true);
  });

  it("does NOT re-check a row that was ALREADY blocking", async () => {
    // An ordinary staff row at `scheduled` with no request row already occupies
    // its slot. Re-checking it against itself proves nothing, and would refuse
    // every completion in a busy clinic.
    pedidoIds = [];
    mockConflicts.mockResolvedValue([CONFLICT]);
    const r = await updateAppointment("appt-1", { status: "completed" });
    expect(r.ok).toBe(true);
    expect(mockConflicts).not.toHaveBeenCalled();
  });

  it("does NOT check a transition that LEAVES the blocking set", async () => {
    pedidoIds = ["appt-1"];
    mockConflicts.mockResolvedValue([CONFLICT]);
    const r = await updateAppointment("appt-1", { status: "no_show" });
    expect(r.ok).toBe(true);
    expect(mockConflicts).not.toHaveBeenCalled();
  });

  it("honours allowConflict, which is the existing Guardar-mesmo-assim contract", async () => {
    pedidoIds = ["appt-1"];
    mockConflicts.mockResolvedValue([CONFLICT]);
    const r = await updateAppointment("appt-1", { status: "confirmed" }, { allowConflict: true });
    expect(r.ok).toBe(true);
  });
});

// ====================================================================
// SCHED-27 — BRINGING A CANCELADA BACK (owner, 2026-09-13)
// ====================================================================
describe("SCHED-27 — Cancelada back to Agendada or Confirmada", () => {
  beforeEach(async () => {
    const auth = await import("@osteojp/auth");
    vi.mocked(auth.assertCan).mockReset();
    const reminders = await import("./reminders");
    vi.mocked(reminders.enqueueRemindersAfterCommit).mockClear();
  });

  it("reception brings a Cancelada back to scheduled, and to confirmed", async () => {
    for (const to of ["scheduled", "confirmed"] as AppointmentStatusValue[]) {
      seriesRow = row("cancelled");
      updated = false;
      const r = await updateAppointment("appt-1", { status: to });
      expect(r.ok).toBe(true);
      expect(updated).toBe(true);
    }
  });

  // SCHED-30 (owner dispatch 2026-09-14) REPLACED the arm that stood here, "a
  // THERAPIST cannot: bringing one back is the inverse of cancelling
  // (appointments:delete)". The owner now lets a therapist bring back a row they
  // are on; what stays refused is a row they are not on, and any override.
  it("SCHED-30: a THERAPIST on the row brings it back", async () => {
    mockCtx.mockResolvedValue({ ...actor, role: "therapist", userId: "therapist-1" });
    seriesRow = row("cancelled");
    const r = await updateAppointment("appt-1", { status: "scheduled" });
    expect(r.ok).toBe(true);
    expect(updated).toBe(true);
  });

  it("SCHED-30: a therapist NOT on the row cannot bring it back", async () => {
    mockCtx.mockResolvedValue({ ...actor, role: "therapist", userId: "therapist-2" });
    seriesRow = row("cancelled");
    const r = await updateAppointment("appt-1", { status: "scheduled" });
    expect(r).toEqual({ ok: false, error: "forbidden" });
    expect(updated).toBe(false);
  });

  it("SCHED-30: a therapist's un-cancel into a slot taken since is refused EVEN with Guardar mesmo assim", async () => {
    mockCtx.mockResolvedValue({ ...actor, role: "therapist", userId: "therapist-1" });
    seriesRow = row("cancelled");
    mockConflicts.mockResolvedValue([CONFLICT]);
    const r = await updateAppointment("appt-1", { status: "scheduled" }, { allowConflict: true });
    expect(r).toMatchObject({ ok: false, error: "conflict", conflictOverridable: false });
    expect(updated).toBe(false);
    expect(trace).toContain("lock");
  });

  // THE MEASURED DEFECT. Before SCHED-27 the conflict gate ran only when a row
  // was `scheduled`, so a Cancelada row would have skipped it.
  it("RUNS the conflict check for a row leaving Cancelada, and refuses a slot booked since", async () => {
    seriesRow = row("cancelled");
    mockConflicts.mockResolvedValue([CONFLICT]);
    const r = await updateAppointment("appt-1", { status: "scheduled" });
    expect(r).toMatchObject({ ok: false, error: "conflict" });
    expect(updated).toBe(false);
    expect(trace).toContain("lock");
  });

  it("honours Guardar mesmo assim on it, as on any booking", async () => {
    seriesRow = row("cancelled");
    mockConflicts.mockResolvedValue([CONFLICT]);
    const r = await updateAppointment("appt-1", { status: "confirmed" }, { allowConflict: true });
    expect(r.ok).toBe(true);
  });

  it("re-emits reminders for a FUTURE appointment brought back, and not for a past one", async () => {
    const reminders = await import("./reminders");
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    seriesRow = { ...row("cancelled"), startsAt: future, endsAt: new Date(future.getTime() + 60 * 60 * 1000) };
    await updateAppointment("appt-1", { status: "scheduled" });
    expect(vi.mocked(reminders.enqueueRemindersAfterCommit)).toHaveBeenCalledTimes(1);

    vi.mocked(reminders.enqueueRemindersAfterCommit).mockClear();
    seriesRow = row("cancelled"); // 2026-09-01: its reminder offsets have passed
    await updateAppointment("appt-1", { status: "scheduled" });
    expect(vi.mocked(reminders.enqueueRemindersAfterCommit)).not.toHaveBeenCalled();
  });
});

// ====================================================================
// SOURCE ARMS. The two above run against mocks, so they prove the LOGIC. These
// prove the WIRING — that the real module still imports the real map and still
// probes the real SECURITY DEFINER function. A mocked test cannot see an import
// being deleted.
// ====================================================================
describe("INC-08 — the wiring, asserted on the source", () => {
  const SRC = readFileSync(join(__dirname, "actions.ts"), "utf8");
  const body = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("actions.ts imports the Estado map rather than restating the rule", () => {
    expect(body).toMatch(/import\s*\{\s*isLegalEstadoTransition\s*\}\s*from\s*"\.\/estado-transitions"/);
    expect(body).toContain("isLegalEstadoTransition(");
  });

  it("the pedido probe goes through is_unconfirmed_pedido, not a staff_notifications join", () => {
    // 0059:26-40: staff_notifications SELECT is pinned by 0055 to
    // recipient_user_id = auth.uid(), so a caller who is not the recipient
    // would see no row, conclude "not a pedido", and skip the check. The
    // SECURITY DEFINER function is the only read that answers the same for
    // every caller.
    expect(body).toContain("public.is_unconfirmed_pedido(");
  });

  it("the stripper used above does not silently empty the file", () => {
    // Vacuous-pass guard: if `body` were "", every assertion above that uses
    // toContain would fail loudly, but a regex-based one could still pass. Pin
    // the size so a broken stripper is a red test and not a green one.
    expect(body.length).toBeGreaterThan(5000);
  });
});
