import { vi, describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * SEC-allowconflict-not-audited — the override and the transition are now in
 * the trail.
 *
 * WHY THIS EXISTS, and it is not hypothetical. INC-08 was a confirmed
 * production double booking produced by three code paths in ninety seconds, and
 * TWO OF THEM LEFT NO EVIDENCE OF HOW:
 *
 *   - `allowConflict` was never written to audit metadata by ANY path, so
 *     "Guardar mesmo assim" — the single most consequential discretionary act
 *     the scheduling UI offers — was indistinguishable in the record from a save
 *     that had no conflict to override. During the investigation its ABSENCE
 *     from a reschedule row was read as evidence the override had not been used.
 *     It was evidence of nothing: the field could not have been there.
 *
 *   - `updateAppointment` recorded `{changed, scope}` with no from/to status, so
 *     every status change in the log read "the status changed" and nothing more.
 *     The end states in the INC-08 timeline are INFERENCES from the surviving
 *     row.
 *
 * THE RULE THIS FILE ENFORCES: a path that READS `allowConflict` must RECORD it,
 * and a path that patches status must record both ends. The source arm at the
 * bottom is the half that survives a new path being written next month.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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
vi.mock("@/lib/notifications/centre", () => ({
  emitConfirmedNotification: vi.fn(async () => ({ delivered: true })),
}));

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { writeAppointmentAudit } from "./audit";
import { updateAppointment, cancelAppointment, rescheduleAppointment } from "./actions";
import type { RequestContext } from "@osteojp/auth";
import type { AppointmentStatusValue } from "./types";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const mockAudit = vi.mocked(writeAppointmentAudit);

const actor: RequestContext = { tenantId: "tenant-A", role: "reception", userId: "user-1" };

let seriesRow = {
  id: "appt-1",
  startsAt: new Date("2026-09-01T09:00:00.000Z"),
  endsAt: new Date("2026-09-01T10:00:00.000Z"),
  practitionerId: "therapist-1",
  locationId: "loc-1",
  room: null as string | null,
  status: "scheduled" as AppointmentStatusValue,
  recurrenceParentId: null,
};

function fakeTx() {
  return {
    execute: async () => [],
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

/** The metadata of the first audit row written. */
const meta = () => mockAudit.mock.calls[0]?.[1]?.metadata as Record<string, unknown> | undefined;

beforeEach(() => {
  seriesRow = { ...seriesRow, status: "scheduled" };
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockAudit.mockClear();
  mockCtx.mockResolvedValue(actor);
  mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(fakeTx() as never)));
});

describe("the override is recorded, on every path that reads it", () => {
  it("updateAppointment records allowConflict = true when it was used", async () => {
    await updateAppointment("appt-1", { status: "confirmed" }, { allowConflict: true });
    expect(meta()).toMatchObject({ allowConflict: true });
  });

  // THE ARM THAT MATTERS MOST. A field written only when true is exactly as
  // unreadable as one never written: absence would again be ambiguous between
  // "not overridden" and "this path does not record it".
  it("records allowConflict = FALSE explicitly, rather than omitting it", async () => {
    await updateAppointment("appt-1", { status: "confirmed" });
    expect(meta()).toHaveProperty("allowConflict", false);
    expect(Object.keys(meta()!)).toContain("allowConflict");
  });

  it("rescheduleAppointment records it too", async () => {
    await rescheduleAppointment("appt-1", {
      startsAt: "2026-09-02T09:00:00.000Z",
      endsAt: "2026-09-02T10:00:00.000Z",
      practitionerId: "therapist-1",
      locationId: "loc-1",
      allowConflict: true,
    });
    expect(meta()).toMatchObject({ allowConflict: true });
  });
});

describe("a status patch records BOTH ends of the transition", () => {
  it("updateAppointment writes fromStatus and toStatus", async () => {
    seriesRow = { ...seriesRow, status: "scheduled" };
    await updateAppointment("appt-1", { status: "confirmed" });
    expect(meta()).toMatchObject({ fromStatus: "scheduled", toStatus: "confirmed" });
  });

  it("cancelAppointment writes them as well — a cancel IS a status patch", async () => {
    seriesRow = { ...seriesRow, status: "confirmed" };
    await cancelAppointment("appt-1", "paciente pediu");
    expect(meta()).toMatchObject({ fromStatus: "confirmed", toStatus: "cancelled" });
  });

  // NEGATIVE ARM: a non-status edit must NOT invent a transition. Writing
  // `toStatus: undefined` on a room change would put a meaningless key in every
  // audit row and make the field useless for filtering.
  it("does NOT write a transition for an edit that changes no status", async () => {
    await updateAppointment("appt-1", { room: "Sala 2" });
    expect(meta()).not.toHaveProperty("fromStatus");
    expect(meta()).not.toHaveProperty("toStatus");
    // …but the override is still recorded, because that path reads it.
    expect(meta()).toHaveProperty("allowConflict", false);
  });

  it("cancel does NOT claim an override it never read", async () => {
    // Vacating a slot cannot create a conflict, so cancelAppointment takes no
    // allowConflict. Writing `false` there would imply a decision nobody made.
    await cancelAppointment("appt-1");
    expect(meta()).not.toHaveProperty("allowConflict");
  });
});

// ====================================================================
// THE SOURCE ARM. The behavioural tests above cover the paths that exist
// TODAY. This one covers the path somebody writes next month: if a new action
// reads allowConflict and forgets to record it, this goes red without anyone
// having to remember why.
// ====================================================================
describe("every path that reads allowConflict also records it", () => {
  const SRC = readFileSync(join(__dirname, "actions.ts"), "utf8");
  const body = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  /** actions.ts split into one chunk per exported action. */
  const chunks = body
    .split(/\nexport async function /)
    .slice(1)
    .map((c) => ({ name: c.slice(0, c.indexOf("(")), src: c }));

  it("found the exported actions to scan", () => {
    // Vacuous-pass guard: an empty or tiny split would make every assertion
    // below pass over nothing.
    expect(chunks.length).toBeGreaterThan(6);
    const names = chunks.map((c) => c.name);
    expect(names).toContain("updateAppointment");
    expect(names).toContain("rescheduleAppointment");
    expect(names).toContain("createAppointment");
  });

  it("no action reads the override without writing it to the trail", () => {
    const READS = /\b(?:input|opts\?\.|opts\.)\s*\.?allowConflict\b|\ballowConflict\b\s*&&/;
    const RECORDS = /allowConflict:\s*!!/;
    const offenders = chunks
      .filter((c) => READS.test(c.src) && !RECORDS.test(c.src))
      .map((c) => c.name);
    expect(offenders).toEqual([]);
  });

  it("the readers it found are the three expected ones, so the scan is real", () => {
    // If the READS pattern silently stopped matching, the assertion above would
    // pass over an empty set. Pin the population it is actually checking.
    const READS = /\b(?:input|opts\?\.|opts\.)\s*\.?allowConflict\b/;
    const readers = chunks.filter((c) => READS.test(c.src)).map((c) => c.name).sort();
    expect(readers).toEqual([
      "createAppointment",
      "rescheduleAppointment",
      "updateAppointment",
    ]);
  });
});
