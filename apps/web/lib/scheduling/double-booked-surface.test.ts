import { vi, describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 0061 / INC-08 — the constraint refusal must reach the agenda as pt-PT.
 *
 * WHY THIS IS MANDATORY RATHER THAN POLISH. The owner is demonstrating this
 * build to the clinic team. `appointments_no_double_confirmed` is a REAL
 * refusal that reception can trigger by ordinary work, and without a mapping it
 * arrives as a raw Postgres error and a 500. A database error on screen during
 * that demo is worse than the bug the constraint replaced.
 *
 * The mapping is deliberately NOT `conflict`. That code carries a list of
 * conflicting appointments and the drawer answers it with "Guardar mesmo
 * assim" — an override this constraint exists to refuse, so offering it would
 * invite a retry that cannot succeed.
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
vi.mock("@/lib/notifications/centre", () => ({
  emitConfirmedNotification: vi.fn(async () => ({ delivered: true })),
}));

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { updateAppointment } from "./actions";
import type { RequestContext } from "@osteojp/auth";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const actor: RequestContext = { tenantId: "tenant-A", role: "reception", userId: "user-1" };

/** The shape postgres.js raises for an exclusion violation. */
function pgError(code: string, constraintName: string): Error {
  const e = new Error("conflicting key value violates exclusion constraint") as Error &
    Record<string, unknown>;
  e.code = code;
  e.constraint_name = constraintName;
  return e;
}

beforeEach(() => {
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockCtx.mockResolvedValue(actor);
});

describe("0061 — the exclusion violation surfaces as double_booked", () => {
  it("maps 23P01 on appointments_no_double_confirmed to `double_booked`", async () => {
    mockRunScoped.mockRejectedValue(pgError("23P01", "appointments_no_double_confirmed"));
    const r = await updateAppointment("appt-1", { status: "confirmed" });
    expect(r).toEqual({ ok: false, error: "double_booked" });
  });

  it("reads the node-postgres field name too, not only postgres.js", async () => {
    const e = new Error("boom") as Error & Record<string, unknown>;
    e.code = "23P01";
    e.constraint = "appointments_no_double_confirmed"; // node-postgres spelling
    mockRunScoped.mockRejectedValue(e);
    const r = await updateAppointment("appt-1", { status: "confirmed" });
    expect(r).toEqual({ ok: false, error: "double_booked" });
  });

  it("unwraps a driver error nested under `cause`", async () => {
    const wrapped = new Error("query failed") as Error & Record<string, unknown>;
    wrapped.cause = pgError("23P01", "appointments_no_double_confirmed");
    mockRunScoped.mockRejectedValue(wrapped);
    const r = await updateAppointment("appt-1", { status: "confirmed" });
    expect(r).toEqual({ ok: false, error: "double_booked" });
  });

  // ================================================================
  // NEGATIVE ARMS. Without these the mapper could simply return
  // `double_booked` for every failure and pass everything above.
  // ================================================================
  it("does NOT claim double-booking for a DIFFERENT exclusion constraint", async () => {
    // 23P01 belongs to any exclusion constraint. Mapping an unrelated one to
    // "this slot is taken" would be a confident lie to reception.
    mockRunScoped.mockRejectedValue(pgError("23P01", "some_other_exclude"));
    const r = await updateAppointment("appt-1", { status: "confirmed" });
    expect(r).toEqual({ ok: false, error: "error" });
  });

  it("does NOT claim double-booking for a different SQLSTATE", async () => {
    mockRunScoped.mockRejectedValue(pgError("23505", "appointments_no_double_confirmed"));
    const r = await updateAppointment("appt-1", { status: "confirmed" });
    expect(r).toEqual({ ok: false, error: "error" });
  });

  it("does NOT claim double-booking for an ordinary error", async () => {
    mockRunScoped.mockRejectedValue(new Error("network went away"));
    const r = await updateAppointment("appt-1", { status: "confirmed" });
    expect(r).toEqual({ ok: false, error: "error" });
  });

  it("terminates on a self-referential cause chain instead of hanging", async () => {
    const a = new Error("a") as Error & Record<string, unknown>;
    a.cause = a;
    mockRunScoped.mockRejectedValue(a);
    const r = await updateAppointment("appt-1", { status: "confirmed" });
    expect(r).toEqual({ ok: false, error: "error" });
  });
});

describe("0061 — the copy exists and both surfaces render it", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("pt-PT and en both carry the two new keys", () => {
    const root = join(__dirname, "..", "..", "..", "..", "packages", "i18n", "src");
    for (const f of ["strings.pt.json", "strings.en.json"]) {
      const dict = JSON.parse(readFileSync(join(root, f), "utf8")) as Record<string, string>;
      for (const key of [
        "appointment.doubleBooked",
        "appointment.illegalTransition",
        "requests.error.doubleBooked",
      ]) {
        expect(dict[key], `${f} is missing ${key}`).toBeTruthy();
      }
    }
  });

  it("the agenda drawer renders it as a MESSAGE, never through the conflict path", () => {
    const src = strip(
      readFileSync(join(__dirname, "..", "..", "app", "agenda", "appointment-drawer.tsx"), "utf8"),
    );
    expect(src).toContain('r.error === "double_booked"');
    expect(src).toContain('s["appointment.doubleBooked"]');
    // The refusal must NOT be routed into setConflicts: that surface offers
    // "Guardar mesmo assim", which cannot succeed against this constraint.
    expect(src).not.toMatch(/double_booked[\s\S]{0,120}setConflicts/);
  });

  it("the reception confirm queue maps it to its own row error, not `generic`", () => {
    const src = strip(
      readFileSync(
        join(__dirname, "..", "..", "app", "notificacoes", "pending-requests.tsx"),
        "utf8",
      ),
    );
    expect(src).toContain('result.error === "double_booked"');
    expect(src).toContain('s["requests.error.doubleBooked"]');
  });
});
