import { vi, describe, it, expect, beforeEach } from "vitest";

/**
 * SCHED-15 — "MARCAR NOVAMENTE" PAYS THE SAME TOLLS AS THE CREATE PATH.
 *
 * ==========================================================================
 * WHY THIS SUITE EXISTS, AND WHAT IT IS GUARDING AGAINST.
 * ==========================================================================
 * `cloneAppointment` was a create path that checked NEITHER availability NOR
 * conflicts. Its own header said so and gave a reason — the clinic may want to
 * book over a busy slot — but "may override" and "is never asked" are different
 * things, and only the second was implemented. A clone therefore landed on top
 * of another patient's visit, and outside the therapist's hours, with nothing on
 * screen either time. That second half is RB-03's defect reappearing through the
 * one write path RB-03 did not touch.
 *
 * ==========================================================================
 * THE TWO ARMS THAT CARRY THE RULES, AND THEY GO RED SEPARATELY.
 * ==========================================================================
 * RULE 1 (same tolls): the availability arm is driven with `allowConflict: true`
 * DELIBERATELY, exactly as actions.availability-enforced.test.ts drives the
 * create path — if the override reached that check, the defect would be one
 * click away rather than fixed and every other assertion here would still pass.
 *
 * RULE 2 (no pacote link): asserted on the VALUES ACTUALLY INSERTED, not on the
 * pure mapping. clone-core.test.ts proves the mapping; this proves the action
 * writes that mapping and nothing else. The DB half — that the patient's balance
 * does not move — is in packages/db/tests/appointment-clone-rls.test.ts.
 */

vi.mock("server-only", () => ({}));
// BOTH revalidators, not just `revalidatePath`. `revalidateAppointmentSurfaces`
// also calls `updateTag`, and it runs inside `afterCommit`, which SWALLOWS
// throws by design. An unmocked `updateTag` therefore does not fail loudly - it
// aborts the post-commit step before the reminder enqueue and leaves the
// reminder assertions failing for a reason that has nothing to do with reminders.
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
// The conflict READ is stubbed so this suite drives the DECISION rather than the
// query. conflict.test.ts owns the query; what is untested until here is whether
// cloneAppointment asks it at all and what it does with the answer.
vi.mock("./conflict", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./conflict")>()),
  findConflictsForWindow: vi.fn(async () => []),
}));

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { enqueueRemindersAfterCommit } from "./reminders";
import { findConflictsForWindow } from "./conflict";
import { cloneAppointment } from "./actions";
import type { RequestContext } from "@osteojp/auth";
import type { ConflictInfo } from "./types";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const mockFindConflicts = vi.mocked(findConflictsForWindow);
const mockEnqueue = vi.mocked(enqueueRemindersAfterCommit);
const actor: RequestContext = { tenantId: "tenant-A", role: "admin", userId: "user-1" };

/** 2026-08-24 is a MONDAY; the template below is weekday 1. */
const MONDAY_08_13 = {
  weekday: 1,
  startTime: "08:00:00",
  endTime: "13:00:00",
  validFrom: null,
  validUntil: null,
  isActive: true,
};

/**
 * The SOURCE appointment the clone is taken from: a 55-minute Fisioterapia visit
 * that already happened, LINKED TO A PACOTE. The link is what rule 2 is about,
 * so the source deliberately carries one even though `CloneSource` has no such
 * field — this is the row as the database holds it, not as the mapping reads it.
 */
const SOURCE_ROW = {
  patientId: "patient-1",
  practitionerId: "therapist-1",
  locationId: "loc-1",
  serviceId: "svc-fisio",
  patientTwoId: "patient-2",
  practitionerTwoId: "therapist-2",
  startsAt: new Date("2026-09-03T09:00:00.000Z"),
  endsAt: new Date("2026-09-03T09:55:00.000Z"),
  packInstanceId: "pack-instance-1",
  room: "Sala 2",
  notes: "Sessão correu bem.",
  status: "completed",
};

let inserted: Record<string, unknown> | null = null;

/**
 * Discriminates by REQUESTED COLUMNS, never by call order — the reasoning
 * actions.availability-enforced.test.ts states in full. Three readers reach this
 * stub: the viewer's staff_locations, the availability templates, and the
 * clone's own source read. `patientTwoId` is unique to the third.
 */
function fakeTx(templates: unknown[], source: unknown[] = [SOURCE_ROW]) {
  return {
    select: (cols?: Record<string, unknown>) => ({
      from: () => ({
        where: () => {
          const rows = cols && "weekday" in cols ? templates : cols && "patientTwoId" in cols ? source : [];
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

function arrange(templates: unknown[] = [MONDAY_08_13], source: unknown[] = [SOURCE_ROW]) {
  inserted = null;
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockFindConflicts.mockReset();
  mockEnqueue.mockReset();
  mockFindConflicts.mockResolvedValue([]);
  mockCtx.mockResolvedValue(actor);
  mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(fakeTx(templates, source) as never)));
}

const busy = (): ConflictInfo => ({
  kind: "therapist",
  id: "other-appt",
  patientName: "Outro Paciente",
  startsAt: "2026-09-10T09:00:00.000Z",
  endsAt: "2026-09-10T10:00:00.000Z",
  room: null,
});

/** 10:00 Lisbon on Thursday 2026-09-10 is 09:00Z — inside 08:00-13:00. */
const INSIDE = "2026-09-10T09:00:00.000Z";
/** 17:00 Lisbon is 16:00Z — outside a day that ends at 13:00. */
const OUTSIDE = "2026-09-10T16:00:00.000Z";

beforeEach(() => arrange());

describe("SCHED-15 rule 1 — the clone pays availability", () => {
  it("REFUSES a slot outside the therapist's hours, DESPITE allowConflict", async () => {
    arrange([{ ...MONDAY_08_13, weekday: 4 }]); // 2026-09-10 is a Thursday
    const r = await cloneAppointment("src-1", OUTSIDE, true);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("outside_availability");
    // A refusal that returned an error AFTER inserting would satisfy the line
    // above and still leave the appointment in the diary.
    expect(inserted).toBeNull();
  });

  it("NAMES the window that day, so the next attempt is informed", async () => {
    arrange([{ ...MONDAY_08_13, weekday: 4 }]);
    const r = await cloneAppointment("src-1", OUTSIDE, true);
    expect(r.ok === false && r.availabilityWindows).toEqual([
      { startTime: "08:00", endTime: "13:00" },
    ]);
  });

  it("ALLOWS a slot inside the hours — the negative arm", async () => {
    // Without this, an enforcement that refused everything would pass every
    // refusal assertion in this file.
    arrange([{ ...MONDAY_08_13, weekday: 4 }]);
    const r = await cloneAppointment("src-1", INSIDE);
    expect(r.ok).toBe(true);
    expect(inserted).not.toBeNull();
  });
});

describe("SCHED-15 rule 1 — the clone pays conflict checking", () => {
  it("REFUSES a double booking and hands the conflicts back", async () => {
    arrange([{ ...MONDAY_08_13, weekday: 4 }]);
    mockFindConflicts.mockResolvedValue([busy()]);
    const r = await cloneAppointment("src-1", INSIDE);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("conflict");
    expect(r.ok === false && r.conflicts).toHaveLength(1);
    expect(inserted).toBeNull();
  });

  it("BOOKS ANYWAY when the caller passes allowConflict — the override still works", async () => {
    // The loop decision this change did not reverse: the clinic may deliberately
    // book over a busy slot. What changed is that it is now a decision.
    arrange([{ ...MONDAY_08_13, weekday: 4 }]);
    mockFindConflicts.mockResolvedValue([busy()]);
    const r = await cloneAppointment("src-1", INSIDE, true);
    expect(r.ok).toBe(true);
    expect(inserted).not.toBeNull();
  });

  it("does not even ASK for conflicts when the override is set", async () => {
    arrange([{ ...MONDAY_08_13, weekday: 4 }]);
    await cloneAppointment("src-1", INSIDE, true);
    expect(mockFindConflicts).not.toHaveBeenCalled();
  });

  it("ASKS for conflicts on the CLONE's window, not the source's", async () => {
    // The source is 03/09 09:00-09:55. The clone is 10/09 at 10:00 Lisbon and
    // must be checked there — a check against the source's own past window would
    // pass every time and look identical in a green run.
    arrange([{ ...MONDAY_08_13, weekday: 4 }]);
    await cloneAppointment("src-1", INSIDE);
    expect(mockFindConflicts).toHaveBeenCalledTimes(1);
    const arg = mockFindConflicts.mock.calls[0][1] as { startsAt: Date; endsAt: Date };
    expect(arg.startsAt.toISOString()).toBe(INSIDE);
    // 55 minutes, preserved from the source.
    expect(arg.endsAt.toISOString()).toBe("2026-09-10T09:55:00.000Z");
  });
});

describe("SCHED-15 rule 1 — the clone emits reminders", () => {
  it("enqueues the reminder for the NEW appointment", async () => {
    // The failure this rule was written against: an appointment created by a
    // side door that never gets its 48h email. A clone is a real new
    // appointment and is scheduled like any other creation.
    arrange([{ ...MONDAY_08_13, weekday: 4 }]);
    const r = await cloneAppointment("src-1", INSIDE);
    expect(r.ok).toBe(true);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue.mock.calls[0][1]).toEqual([
      { appointmentId: "new-appt-1", startsAt: new Date(INSIDE) },
    ]);
  });

  it("does NOT enqueue anything when the clone was refused", async () => {
    arrange([{ ...MONDAY_08_13, weekday: 4 }]);
    mockFindConflicts.mockResolvedValue([busy()]);
    await cloneAppointment("src-1", INSIDE);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

describe("SCHED-15 rule 2 — the clone carries NO pacote link", () => {
  it("inserts pack_instance_id as NULL even though the SOURCE row is linked", async () => {
    // SOURCE_ROW.packInstanceId is set. If the clone inherited it, copying a
    // completed NESA session would spend another of the patient's ten with
    // nobody deciding — pack-balance.ts derives the balance from linked,
    // non-cancelled appointments, so the link IS the consumption.
    arrange([{ ...MONDAY_08_13, weekday: 4 }]);
    const r = await cloneAppointment("src-1", INSIDE);
    expect(r.ok).toBe(true);
    expect(inserted).not.toBeNull();
    expect(inserted!.packInstanceId).toBeNull();
  });

  it("writes the key EXPLICITLY rather than omitting it", async () => {
    // An omitted key inserts NULL today and stops doing so the day a column
    // default changes. `in` is what separates the two.
    arrange([{ ...MONDAY_08_13, weekday: 4 }]);
    await cloneAppointment("src-1", INSIDE);
    expect("packInstanceId" in inserted!).toBe(true);
  });

  it("copies the clinical shape and the secondary participants, and drops the per-visit fields", async () => {
    // The whole excluded/included partition on the row that actually reaches
    // the database, in one place: this is the shape Rodica gets.
    arrange([{ ...MONDAY_08_13, weekday: 4 }]);
    await cloneAppointment("src-1", INSIDE);
    expect(inserted).toMatchObject({
      patientId: SOURCE_ROW.patientId,
      practitionerId: SOURCE_ROW.practitionerId,
      serviceId: SOURCE_ROW.serviceId,
      locationId: SOURCE_ROW.locationId,
      patientTwoId: SOURCE_ROW.patientTwoId,
      practitionerTwoId: SOURCE_ROW.practitionerTwoId,
      status: "scheduled",
      confirmationState: "pending",
      room: null,
      notes: null,
      packInstanceId: null,
    });
    // Status is NEVER inherited: the source is `completed`.
    expect(inserted!.status).not.toBe(SOURCE_ROW.status);
  });
});
