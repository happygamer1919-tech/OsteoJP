import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MARC-THERAPIST-01 - THE SAVE THE FICHA'S TERAPEUTA FIELD MAKES, driven
 * through the real `rescheduleAppointment`.
 *
 * The field adds no server code: it sends `therapistChangeInput(row, newId)` to
 * the action the agenda's edit panel calls. So this suite drives the action
 * with that exact input and asserts what it WRITES and what it RETURNS:
 *
 *   - one update, of time, therapist and clinic only (nothing about a pacote);
 *   - one audit row, `appointment.reschedule`;
 *   - the care-team writer asked for this appointment, Terapeuta slot only;
 *   - one reminder target, at the unchanged start;
 *   - a therapist outside their hours, and one with a booking in the way, are
 *     refused with the agenda's codes, and then NOTHING of the above happens.
 *
 * The transaction is a fake that answers by the columns asked for (the pattern
 * of actions.availability-enforced.test.ts). The same properties are proven
 * against Postgres, with the real policies, in
 * marcacoes-therapist-change.db.test.ts.
 *
 * Ids are invented.
 */

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

const h = vi.hoisted(() => ({
  audit: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
  enqueue: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
  careTeam: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(async () => []),
  findConflictsForWindow: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(async () => []),
}));
vi.mock("./actor", () => ({ clientIp: vi.fn(async () => null) }));
vi.mock("./audit", () => ({ writeAppointmentAudit: h.audit }));
vi.mock("./reminders", () => ({
  enqueueRemindersAfterCommit: h.enqueue,
  enqueueStatusNotificationsAfterCommit: vi.fn(async () => {}),
}));
vi.mock("./conflict", () => ({
  findConflicts: vi.fn(async () => []),
  findConflictsForWindow: h.findConflictsForWindow,
  blockingConflicts: (c: unknown[]) => c,
}));
vi.mock("@/lib/admin/care-team-auto", () => ({ addBookedTherapistsToCareTeam: h.careTeam }));
vi.mock("@/lib/notifications/centre", () => ({
  emitConfirmedNotification: vi.fn(async () => {}),
  emitRescheduledNotification: vi.fn(async () => {}),
  emitCancelledNotification: vi.fn(async () => {}),
  emitCareTeamAddedNotifications: vi.fn(async () => {}),
}));

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import type { RequestContext } from "@osteojp/auth";
import { rescheduleAppointment } from "./actions";
import { therapistChangeInput } from "./therapist-change";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const actor: RequestContext = { tenantId: "tenant-A", role: "reception", userId: "user-1" };

const APPT = "appt-1";
const OLD = "therapist-old";
const NEW = "therapist-new";
/** 2031-05-12 is a MONDAY. Lisbon is UTC+1 in May, so 15:00 local is 14:00Z. */
const START = "2031-05-12T14:00:00.000Z";
const END = "2031-05-12T14:45:00.000Z";

const row = {
  id: APPT,
  startsAt: new Date(START),
  endsAt: new Date(END),
  practitionerId: OLD,
  practitionerName: "Terapeuta Antigo",
  practitionerTwoId: null as string | null,
  patientId: "patient-1",
  locationId: "loc-1",
  room: null as string | null,
  status: "confirmed",
  recurrenceParentId: null,
};
/** What the ficha's row holds: the same appointment, as the list reads it. */
const listRow = { ...row, startsAt: START, endsAt: END };

const MONDAY_09_13 = {
  weekday: 1,
  startTime: "09:00:00",
  endTime: "13:00:00",
  validFrom: null,
  validUntil: null,
  isActive: true,
  // HOR-01: the row's clinic, as every real row carries. The resolver reads a
  // therapist's rows at every clinic and narrows to the one asked about.
  locationId: "loc-1",
};

let updates: Record<string, unknown>[] = [];

function fakeTx(templates: unknown[]) {
  return {
    execute: async () => [],
    select: (cols?: Record<string, unknown>) => {
      // The clinic read resolves to no rows, which the hours checks treat as
      // "nothing to refuse" (the same stub audit-override-trace.test.ts uses).
      if (cols && "middayClosedFrom" in cols) {
        const clinic: Record<string, unknown> = {
          from: () => clinic,
          where: () => clinic,
          limit: async () => [],
        };
        return clinic;
      }
      // The working-hours read is awaited without a limit; every other read
      // that is awaited that way gets no rows.
      const awaited = cols && "weekday" in cols ? templates : [];
      const chain: Record<string, unknown> = {
        from: () => chain,
        innerJoin: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        then: (resolve: (rows: unknown[]) => unknown) => resolve(awaited),
        limit: async () => [row],
      };
      return chain;
    },
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        return { where: async () => [] };
      },
    }),
    insert: () => ({ values: async () => [] }),
  };
}

function arrange(templates: unknown[] = []) {
  updates = [];
  h.audit.mockClear();
  h.enqueue.mockClear();
  h.careTeam.mockClear();
  h.findConflictsForWindow.mockReset();
  h.findConflictsForWindow.mockResolvedValue([]);
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockCtx.mockResolvedValue(actor);
  mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(fakeTx(templates) as never)));
}

beforeEach(() => arrange());

const nothingWritten = () => {
  expect(updates).toEqual([]);
  expect(h.audit).not.toHaveBeenCalled();
  expect(h.careTeam).not.toHaveBeenCalled();
  expect(h.enqueue).not.toHaveBeenCalled();
};

describe("the Terapeuta changed from the ficha: what the save writes", () => {
  it("ONE update, of the time, the therapist and the clinic, and of nothing else", async () => {
    const r = await rescheduleAppointment(APPT, therapistChangeInput(listRow, NEW));
    expect(r).toEqual({ ok: true, data: { id: APPT } });
    expect(updates).toEqual([
      { startsAt: new Date(START), endsAt: new Date(END), practitionerId: NEW, locationId: "loc-1" },
    ]);
    // Said again as the property it protects: no key of the write names a
    // pacote, a service or a status, so the pacote link and balance cannot move.
    expect(Object.keys(updates[0]!).sort()).toEqual(["endsAt", "locationId", "practitionerId", "startsAt"]);
  });

  it("ONE audit row: appointment.reschedule, naming the new therapist and the unchanged time, no override", async () => {
    await rescheduleAppointment(APPT, therapistChangeInput(listRow, NEW));
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.audit.mock.calls[0]![1]).toMatchObject({
      tenantId: "tenant-A",
      actorUserId: "user-1",
      action: "appointment.reschedule",
      appointmentId: APPT,
      metadata: {
        practitionerId: NEW,
        locationId: "loc-1",
        startsAt: START,
        endsAt: END,
        scope: "one",
        allowConflict: false,
      },
    });
  });

  it("the care team is asked to take the new therapist: this appointment, the Terapeuta slot", async () => {
    await rescheduleAppointment(APPT, therapistChangeInput(listRow, NEW));
    expect(h.careTeam).toHaveBeenCalledTimes(1);
    expect(h.careTeam.mock.calls[0]![2]).toEqual([APPT]);
    expect(h.careTeam.mock.calls[0]![3]).toEqual({ slots: "primary" });
  });

  it("ONE reminder target, at the start the appointment already had, marked as a therapist-only change", async () => {
    await rescheduleAppointment(APPT, therapistChangeInput(listRow, NEW));
    expect(h.enqueue).toHaveBeenCalledTimes(1);
    // Q-K rule 2: the start is the one the row had and the Terapeuta is new, so
    // the confirmation goes by email alone.
    expect(h.enqueue).toHaveBeenCalledWith("tenant-A", [
      {
        appointmentId: APPT,
        startsAt: new Date(START),
        practitionerId: NEW,
        confirmation: "therapist_only",
        status: "confirmed",
      },
    ]);
  });

  it("the conflict check is asked about the NEW therapist, with this appointment left out of it", async () => {
    await rescheduleAppointment(APPT, therapistChangeInput(listRow, NEW));
    expect(h.findConflictsForWindow).toHaveBeenCalledTimes(1);
    expect(h.findConflictsForWindow.mock.calls[0]![1]).toMatchObject({
      practitionerId: NEW,
      locationId: "loc-1",
      startsAt: new Date(START),
      endsAt: new Date(END),
      excludeIds: [APPT],
    });
  });
});

describe("the Terapeuta changed from the ficha: what the save refuses", () => {
  it("a therapist who does NOT WORK that hour: outside_availability, naming their hours; nothing is written", async () => {
    arrange([MONDAY_09_13]);
    const r = await rescheduleAppointment(APPT, therapistChangeInput(listRow, NEW));
    expect(r).toEqual({
      ok: false,
      error: "outside_availability",
      availabilityWindows: [{ startTime: "09:00", endTime: "13:00" }],
    });
    nothingWritten();
  });

  it("the same therapist INSIDE their hours is accepted, so the refusal above is the hour and not the mock", async () => {
    arrange([{ ...MONDAY_09_13, endTime: "19:00:00" }]);
    const r = await rescheduleAppointment(APPT, therapistChangeInput(listRow, NEW));
    expect(r).toMatchObject({ ok: true });
    expect(updates).toHaveLength(1);
  });

  it("a therapist with a BOOKING IN THE WAY: conflict, listing it; nothing is written", async () => {
    const inTheWay = {
      kind: "therapist",
      id: "appt-other",
      patientName: null,
      startsAt: START,
      endsAt: END,
      room: null,
    };
    h.findConflictsForWindow.mockResolvedValue([inTheWay]);
    const r = await rescheduleAppointment(APPT, therapistChangeInput(listRow, NEW));
    expect(r).toEqual({ ok: false, error: "conflict", conflicts: [inTheWay] });
    nothingWritten();
  });

  it("the field sends NO override, so that conflict stays a refusal", () => {
    expect(therapistChangeInput(listRow, NEW).allowConflict).toBe(false);
  });
});
