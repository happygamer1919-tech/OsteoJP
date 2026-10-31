import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

/**
 * APPT-EDIT-02 - A THERAPIST KEEPS THEIR OWN VISITS, driven through the real
 * `rescheduleAppointment`.
 *
 * Owner ruling 2026-10-31: "A therapist may NOT change the therapist of a
 * visit; reception does it." So a therapist's reschedule must send the
 * Terapeuta every moved row ALREADY holds (read from the row, not the request);
 * the date, the hour and the clinic may still change. Owner, admin and
 * reception keep changing the Terapeuta as before.
 *
 * Each refusal asserts the whole of "nothing happened": no UPDATE, no audit
 * row, no care-team write, no reminder enqueued, and the conflict check never
 * asked. The refusal code is `therapist_change_reception_only`, so the screen
 * says who can make the change rather than "no permission".
 *
 * THE RACE (R4): the guard reads the row without a lock, so the therapist's
 * UPDATE also matches on the Terapeuta it checked. When reception reassigned
 * the visit in between, that UPDATE returns no row, the transaction is rolled
 * back by a throw, and the answer is the same refusal. The WHERE each role
 * sends is rendered with drizzle's real Postgres dialect and pinned. Each acceptance is the control that keeps the refusals honest: the
 * same fake accepts the same move when only the Terapeuta is kept, or when the
 * actor is not a therapist.
 *
 * The transaction is a fake that answers by the columns asked for (the pattern
 * of actions.therapist-change.test.ts). Ids are invented.
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
  resources: [] as { id: string; label: string; locationIds: string[] }[],
  // The index of the first UPDATE whose row was reassigned under the save, so
  // a guarded UPDATE from it on matches nothing and its RETURNING is empty.
  // Infinity: no row is lost.
  lostFrom: Number.POSITIVE_INFINITY,
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
// The NESA machine, when a test installs one at loc-1. The therapist works at
// loc-1, so SCHED-17's location rule passes and the only rule left to refuse
// a NESA swap is APPT-EDIT-02's.
vi.mock("./shared-resources", () => ({
  listSharedResources: vi.fn(async () => h.resources),
  listSharedResourcesTx: vi.fn(async () => h.resources),
}));
vi.mock("@/lib/auth/viewer-locations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/viewer-locations")>()),
  bookingLocationScope: vi.fn(async () => ["loc-1"]),
  resolveViewerLocationIds: vi.fn(async () => ["loc-1"]),
}));

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import type { RequestContext, Role } from "@osteojp/auth";
import { rescheduleAppointment } from "./actions";
import type { RescheduleInput } from "./types";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);

const APPT = "appt-1";
const SELF = "therapist-self";
const COLLEAGUE = "therapist-colleague";
const NESA = "resource-nesa";
/** 2031-05-12 is a MONDAY. Lisbon is UTC+1 in May, so 15:00 local is 14:00Z. */
const START = "2031-05-12T14:00:00.000Z";
const END = "2031-05-12T14:45:00.000Z";
/** The new hour a therapist may still choose: same day, 16:00 local. */
const NEW_START = "2031-05-12T15:00:00.000Z";
const NEW_END = "2031-05-12T15:45:00.000Z";

type Row = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  practitionerId: string;
  practitionerTwoId: string | null;
  patientId: string;
  locationId: string;
  room: string | null;
  status: string;
  recurrenceParentId: string | null;
};

const ownRow: Row = {
  id: APPT,
  startsAt: new Date(START),
  endsAt: new Date(END),
  practitionerId: SELF,
  practitionerTwoId: null,
  patientId: "patient-1",
  locationId: "loc-1",
  room: null,
  status: "confirmed",
  recurrenceParentId: null,
};

let updates: Record<string, unknown>[] = [];
/** The WHERE of each UPDATE, and whether its caller asked for RETURNING. */
let wheres: { cond: SQL; returning: boolean }[] = [];
const dialect = new PgDialect();
const rendered = (i: number) => dialect.sqlToQuery(wheres[i]!.cond);

/**
 * `target` answers resolveSeries' first read (the one with a limit);
 * `members` answers its series read (awaited, with room and status and no
 * recurrenceParentId). Every other awaited read gets no rows.
 */
function fakeTx(target: Row, members: Row[]) {
  return {
    execute: async () => [],
    select: (cols?: Record<string, unknown>) => {
      if (cols && "middayClosedFrom" in cols) {
        const clinic: Record<string, unknown> = {
          from: () => clinic,
          where: () => clinic,
          limit: async () => [],
        };
        return clinic;
      }
      const isSeriesRead = !!cols && "room" in cols && "status" in cols && !("recurrenceParentId" in cols);
      const awaited = isSeriesRead ? members : [];
      const chain: Record<string, unknown> = {
        from: () => chain,
        innerJoin: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        then: (resolve: (rows: unknown[]) => unknown) => resolve(awaited),
        limit: async () => [target],
      };
      return chain;
    },
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (cond: SQL) => {
          updates.push(values);
          const entry = { cond, returning: false };
          const index = wheres.push(entry) - 1;
          const plain = Promise.resolve([]);
          return {
            then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => plain.then(ok, ko),
            returning: async () => {
              entry.returning = true;
              return index >= h.lostFrom ? [] : [{ id: "updated" }];
            },
          };
        },
      }),
    }),
    insert: () => ({ values: async () => [] }),
  };
}

function arrange(opts: { role?: Role; userId?: string; target?: Row; members?: Row[] } = {}) {
  const actor: RequestContext = {
    tenantId: "tenant-A",
    role: opts.role ?? "therapist",
    userId: opts.userId ?? SELF,
  };
  const target = opts.target ?? ownRow;
  updates = [];
  wheres = [];
  h.audit.mockClear();
  h.enqueue.mockClear();
  h.careTeam.mockClear();
  h.findConflictsForWindow.mockReset();
  h.findConflictsForWindow.mockResolvedValue([]);
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockCtx.mockResolvedValue(actor);
  mockRunScoped.mockImplementation((_a, cb) =>
    Promise.resolve(cb(fakeTx(target, opts.members ?? [target]) as never)),
  );
}

beforeEach(() => {
  h.resources = [];
  h.lostFrom = Number.POSITIVE_INFINITY;
  arrange();
});

const input = (practitionerId: string, over: Partial<RescheduleInput> = {}): RescheduleInput => ({
  startsAt: START,
  endsAt: END,
  practitionerId,
  locationId: "loc-1",
  scope: "one",
  allowConflict: false,
  ...over,
});

const nothingHappened = () => {
  expect(updates).toEqual([]);
  expect(h.audit).not.toHaveBeenCalled();
  expect(h.careTeam).not.toHaveBeenCalled();
  expect(h.enqueue).not.toHaveBeenCalled();
  expect(h.findConflictsForWindow).not.toHaveBeenCalled();
};

describe("APPT-EDIT-02: a therapist may not hand a visit to anyone else", () => {
  it("their own visit, sent to a colleague: refused, and nothing is written, audited or enqueued", async () => {
    const r = await rescheduleAppointment(APPT, input(COLLEAGUE));
    expect(r).toEqual({ ok: false, error: "therapist_change_reception_only" });
    nothingHappened();
  });

  it("the same refusal when the hour moves too: a new time does not buy a new Terapeuta", async () => {
    const r = await rescheduleAppointment(APPT, input(COLLEAGUE, { startsAt: NEW_START, endsAt: NEW_END }));
    expect(r).toEqual({ ok: false, error: "therapist_change_reception_only" });
    nothingHappened();
  });

  it("a colleague's visit they are Terapeuta 2 on, taken for themselves: refused (the row is read, not the request)", async () => {
    arrange({ target: { ...ownRow, practitionerId: COLLEAGUE, practitionerTwoId: SELF } });
    const r = await rescheduleAppointment(APPT, input(SELF));
    expect(r).toEqual({ ok: false, error: "therapist_change_reception_only" });
    nothingHappened();
  });

  it("a NESA visit at their clinic, taken for themselves: refused (no shared-resource exception on a move)", async () => {
    h.resources = [{ id: NESA, label: "Equipamento NESA", locationIds: ["loc-1"] }];
    arrange({ target: { ...ownRow, practitionerId: NESA } });
    const r = await rescheduleAppointment(APPT, input(SELF));
    expect(r).toEqual({ ok: false, error: "therapist_change_reception_only" });
    nothingHappened();
  });

  it("their own visit, sent to the NESA machine: refused", async () => {
    h.resources = [{ id: NESA, label: "Equipamento NESA", locationIds: ["loc-1"] }];
    const r = await rescheduleAppointment(APPT, input(NESA));
    expect(r).toEqual({ ok: false, error: "therapist_change_reception_only" });
    nothingHappened();
  });

  it("a series move where one occurrence already has a colleague: refused, so no row of it moves", async () => {
    const second: Row = {
      ...ownRow,
      id: "appt-2",
      startsAt: new Date("2031-05-19T14:00:00.000Z"),
      endsAt: new Date("2031-05-19T14:45:00.000Z"),
      practitionerId: COLLEAGUE,
      recurrenceParentId: APPT,
    };
    arrange({ members: [ownRow, second] });
    const r = await rescheduleAppointment(APPT, input(SELF, { scope: "series", startsAt: NEW_START, endsAt: NEW_END }));
    expect(r).toEqual({ ok: false, error: "therapist_change_reception_only" });
    nothingHappened();
  });
});

describe("APPT-EDIT-02: what a therapist still may do, and what everyone else still may do", () => {
  it("a therapist moves their own visit to a new hour, keeping themselves: one update, one audit, one reminder", async () => {
    const r = await rescheduleAppointment(APPT, input(SELF, { startsAt: NEW_START, endsAt: NEW_END }));
    expect(r).toEqual({ ok: true, data: { id: APPT } });
    expect(updates).toEqual([
      { startsAt: new Date(NEW_START), endsAt: new Date(NEW_END), practitionerId: SELF, locationId: "loc-1" },
    ]);
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.enqueue).toHaveBeenCalledTimes(1);
  });

  it("a therapist moves a NESA visit to a new hour, keeping NESA: accepted", async () => {
    h.resources = [{ id: NESA, label: "Equipamento NESA", locationIds: ["loc-1"] }];
    arrange({ target: { ...ownRow, practitionerId: NESA } });
    const r = await rescheduleAppointment(APPT, input(NESA, { startsAt: NEW_START, endsAt: NEW_END }));
    expect(r).toMatchObject({ ok: true });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ practitionerId: NESA });
  });

  it.each(["owner", "admin", "reception"] as const)(
    "%s hands the visit to another therapist: accepted, written, audited and enqueued",
    async (role) => {
      arrange({ role, userId: `${role}-1` });
      const r = await rescheduleAppointment(APPT, input(COLLEAGUE));
      expect(r).toEqual({ ok: true, data: { id: APPT } });
      expect(updates).toEqual([
        { startsAt: new Date(START), endsAt: new Date(END), practitionerId: COLLEAGUE, locationId: "loc-1" },
      ]);
      expect(h.audit).toHaveBeenCalledTimes(1);
      expect(h.enqueue).toHaveBeenCalledTimes(1);
    },
  );
});

describe("APPT-EDIT-02 (R4): the visit reassigned between the guard and the write", () => {
  it("a therapist's UPDATE matches on the Terapeuta the guard checked, and asks for the row back", async () => {
    const r = await rescheduleAppointment(APPT, input(SELF, { startsAt: NEW_START, endsAt: NEW_END }));
    expect(r).toMatchObject({ ok: true });
    expect(wheres).toHaveLength(1);
    expect(wheres[0]!.returning).toBe(true);
    const q = rendered(0);
    expect(q.sql).toBe('("appointments"."id" = $1 and "appointments"."practitioner_id" = $2)');
    expect(q.params).toEqual([APPT, SELF]);
  });

  it("reception changed the Terapeuta underneath: no row comes back, so refused, no audit, no reminder, no care team", async () => {
    h.lostFrom = 0;
    const r = await rescheduleAppointment(APPT, input(SELF, { startsAt: NEW_START, endsAt: NEW_END }));
    expect(r).toEqual({ ok: false, error: "therapist_change_reception_only" });
    // The UPDATE was attempted (and matched nothing); the throw rolls the
    // transaction back, so nothing after it in the save runs.
    expect(wheres).toHaveLength(1);
    expect(h.audit).not.toHaveBeenCalled();
    expect(h.careTeam).not.toHaveBeenCalled();
    expect(h.enqueue).not.toHaveBeenCalled();
  });

  it("in a series, the second row lost: refused, and the first row's audit is inside the rolled-back transaction", async () => {
    const second: Row = {
      ...ownRow,
      id: "appt-2",
      startsAt: new Date("2031-05-19T14:00:00.000Z"),
      endsAt: new Date("2031-05-19T14:45:00.000Z"),
      recurrenceParentId: APPT,
    };
    arrange({ members: [ownRow, second] });
    // The first UPDATE finds its row, the second does not.
    h.lostFrom = 1;
    const r = await rescheduleAppointment(APPT, input(SELF, { scope: "series", startsAt: NEW_START, endsAt: NEW_END }));
    expect(r).toEqual({ ok: false, error: "therapist_change_reception_only" });
    expect(wheres).toHaveLength(2);
    // The first row's audit was written with `tx`, so in Postgres the throw
    // rolls it back with the row; the fake cannot roll back, so it is counted.
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.audit.mock.calls[0]![0]).toBeTypeOf("object");
    expect(h.enqueue).not.toHaveBeenCalled();
    expect(h.careTeam).not.toHaveBeenCalled();
  });

  it.each(["owner", "admin", "reception"] as const)(
    "%s: the WHERE is the id alone, as before, with no RETURNING asked",
    async (role) => {
      arrange({ role, userId: `${role}-1` });
      h.lostFrom = 0; // would refuse a guarded write; theirs is not guarded
      const r = await rescheduleAppointment(APPT, input(COLLEAGUE));
      expect(r).toMatchObject({ ok: true });
      expect(wheres).toHaveLength(1);
      expect(wheres[0]!.returning).toBe(false);
      const q = rendered(0);
      expect(q.sql).toBe('"appointments"."id" = $1');
      expect(q.params).toEqual([APPT]);
    },
  );
});
