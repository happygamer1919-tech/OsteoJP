import { vi, describe, it, expect, beforeEach } from "vitest";

/**
 * AGENDA-2100 — THE LATEST START, DRIVEN THROUGH A REAL ACTION.
 *
 * ==========================================================================
 * WHAT THIS ADDS TO THE SOURCE GATE NEXT DOOR
 * ==========================================================================
 * `write-paths-check-clinic-hours.test.ts` proves every door CALLS the check.
 * This proves the check's answer reaches the caller intact: the right error
 * code, the payload that names the hour to pick instead, nothing written, and
 * the override unable to reach it.
 *
 * It drives `cloneAppointment` because that path's fake transaction is already
 * the established one (actions.clone-enforcement.test.ts) and it is the path
 * where a missing clinic rule has bitten before: the clone was the ONE create
 * path 0085 forgot, and a Marcar novamente into the closed hour was simply
 * written.
 *
 * ==========================================================================
 * THE THERAPIST'S HOURS ARE DELIBERATELY WIDE
 * ==========================================================================
 * `checkAvailability` runs BEFORE this check on every path. A template that
 * stopped at 20:00 would refuse the 20:15 arm as `outside_availability` and the
 * suite would go green while proving nothing about the clinic. So the template
 * runs 07:00-23:00: the only thing that can refuse these bookings is the rule
 * under test.
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
vi.mock("./conflict", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./conflict")>()),
  findConflictsForWindow: vi.fn(async () => []),
}));

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { findConflictsForWindow } from "./conflict";
import { cloneAppointment } from "./actions";
import type { RequestContext } from "@osteojp/auth";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const mockFindConflicts = vi.mocked(findConflictsForWindow);
const actor: RequestContext = { tenantId: "tenant-A", role: "admin", userId: "user-1" };

/** 2026-09-10 is a THURSDAY (weekday 4). Lisbon is UTC+1 in September. */
const WIDE_HOURS = {
  weekday: 4,
  startTime: "07:00:00",
  endTime: "23:00:00",
  validFrom: null,
  validUntil: null,
  isActive: true,
};

const SOURCE_ROW = {
  patientId: "patient-1",
  practitionerId: "therapist-1",
  locationId: "loc-1",
  serviceId: "svc-1",
  patientTwoId: null,
  practitionerTwoId: null,
  startsAt: new Date("2026-09-03T09:00:00.000Z"),
  endsAt: new Date("2026-09-03T10:00:00.000Z"),
  packInstanceId: null,
  room: null,
  notes: null,
  status: "completed",
};

/** The clinic as `readClinic` selects it. */
const clinic = (opensAt: string, closesAt: string) => [
  {
    name: "Linda-a-Velha",
    opensAt,
    closesAt,
    middayClosedFrom: null,
    middayClosedTo: null,
  },
];

const NEW_HOURS = clinic("09:00:00", "21:00:00");
const TODAY_HOURS = clinic("08:00:00", "20:00:00");

let inserted: Record<string, unknown> | null = null;

/** Discriminates by REQUESTED COLUMNS, exactly as the clone suite next door. */
function fakeTx(clinicRows: unknown[]) {
  return {
    select: (cols?: Record<string, unknown>) => ({
      from: () => ({
        where: () => {
          const rows =
            cols && "weekday" in cols
              ? [WIDE_HOURS]
              : cols && "patientTwoId" in cols
                ? [SOURCE_ROW]
                : cols && "middayClosedFrom" in cols
                  ? clinicRows
                  : [];
          const p = Promise.resolve(rows);
          return Object.assign(p, { limit: async () => rows });
        },
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

function arrange(clinicRows: unknown[] = NEW_HOURS) {
  inserted = null;
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockFindConflicts.mockReset();
  mockFindConflicts.mockResolvedValue([]);
  mockCtx.mockResolvedValue(actor);
  mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(fakeTx(clinicRows) as never)));
}

beforeEach(() => arrange());

/** Lisbon wall-clock on Thursday 2026-09-10, as the UTC instant the action takes. */
const lisbon = (hhmm: string) => `2026-09-10T${String(Number(hhmm.slice(0, 2)) - 1).padStart(2, "0")}${hhmm.slice(2)}:00.000Z`;

describe("AGENDA-2100: a clinic that closes at 21:00", () => {
  it("ACCEPTS a 20:00 start - the last bookable hour the owner asked for", async () => {
    const r = await cloneAppointment("src-1", lisbon("20:00"));
    expect(r.ok).toBe(true);
    expect(inserted).not.toBeNull();
  });

  it("REFUSES a 20:15 start, and writes nothing", async () => {
    const r = await cloneAppointment("src-1", lisbon("20:15"));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("outside_clinic_hours");
    expect(inserted).toBeNull();
  });

  it("NAMES the clinic and the last start, so the next attempt is informed", async () => {
    const r = await cloneAppointment("src-1", lisbon("20:15"));
    expect(r.ok === false && r.clinicWindow).toEqual({
      reason: "after_latest_start",
      locationName: "Linda-a-Velha",
      opensAt: "09:00",
      closesAt: "21:00",
      latestStart: "20:00",
    });
  });

  it("REFUSES a start before opening, with the other sentence", async () => {
    const r = await cloneAppointment("src-1", lisbon("08:30"));
    expect(r.ok === false && r.error).toBe("outside_clinic_hours");
    expect(r.ok === false && r.clinicWindow?.reason).toBe("before_open");
    expect(inserted).toBeNull();
  });

  it("ACCEPTS the opening minute itself", async () => {
    const r = await cloneAppointment("src-1", lisbon("09:00"));
    expect(r.ok).toBe(true);
  });

  /**
   * THE ARM THAT MATTERS MOST. If "Marcar mesmo assim" reached this check the
   * rule would be one click from gone, and every other assertion here would
   * still pass - the same reasoning the availability suite states for its own
   * override arm.
   */
  it("stays refused with allowConflict, because the override must not reach it", async () => {
    const r = await cloneAppointment("src-1", lisbon("20:15"), true);
    expect(r.ok === false && r.error).toBe("outside_clinic_hours");
    expect(inserted).toBeNull();
  });
});

describe("AGENDA-2100: a clinic that closes at 20:00 (today's production hours)", () => {
  it("ACCEPTS 19:00", async () => {
    arrange(TODAY_HOURS);
    const r = await cloneAppointment("src-1", lisbon("19:00"));
    expect(r.ok).toBe(true);
  });

  it("REFUSES 19:15, naming 19:00 as the last start", async () => {
    arrange(TODAY_HOURS);
    const r = await cloneAppointment("src-1", lisbon("19:15"));
    expect(r.ok === false && r.error).toBe("outside_clinic_hours");
    expect(r.ok === false && r.clinicWindow?.latestStart).toBe("19:00");
  });
});

describe("AGENDA-2100: a location the tenant does not have", () => {
  it("is not this check's refusal to invent", async () => {
    // Same rule as the closure check beside it: a missing row must not become
    // "the clinic is closed". The location is validated elsewhere.
    //
    // THE HOUR IS INSIDE THE THERAPIST'S TEMPLATE ON PURPOSE. The first version
    // of this arm used 23:30, which `checkAvailability` refuses BEFORE this
    // check is reached - so it went red while proving nothing about the clinic.
    // 22:00 is inside 07:00-23:00, which leaves the missing clinic row as the
    // only thing that could refuse.
    arrange([]);
    const r = await cloneAppointment("src-1", lisbon("22:00"));
    // Named, so a future refusal from somewhere else cannot masquerade as this
    // assertion passing or failing for the reason it claims.
    expect(r.ok === false && r.error).toBeFalsy();
    expect(r.ok).toBe(true);
  });
});
