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

  it("REFUSES onward moves out of the terminal states", async () => {
    for (const from of ["completed", "no_show", "cancelled"] as AppointmentStatusValue[]) {
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
