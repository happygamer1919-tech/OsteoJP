import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * R52 - "MARCAR NOVAMENTE" FOLLOWS THE THERAPIST CREATE RULE (PL-10).
 *
 * `createAppointment` refuses a therapist who books a practitioner other than
 * themselves (`forbidden`), with one exception: a shared resource (NESA) the
 * therapist may book at that clinic (SCHED-17). Owner, admin and reception
 * book for anyone. `cloneAppointment` creates an appointment on the SOURCE's
 * practitioner, so before R52 a therapist could copy a colleague's visit and
 * write a new row in the colleague's name. The clone now asks the create rule,
 * on the source's practitioner.
 *
 * The sources here carry NO Terapeuta 2, deliberately: SCHED-29 already
 * refuses a therapist's clone that copies a PERSON as Terapeuta 2, and a
 * source with one would be refused without R52 and prove nothing about it.
 *
 * Each refusal asserts the whole of "nothing happened": no INSERT, no audit
 * row, no reminder enqueued, no care-team write, and the conflict check never
 * asked. Each acceptance is the control that keeps the refusals honest.
 *
 * The transaction is a fake that answers by the columns asked for (the pattern
 * of actions.clone-enforcement.test.ts). Ids are invented.
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
}));
vi.mock("./actor", () => ({ clientIp: vi.fn(async () => null) }));
vi.mock("./audit", () => ({ writeAppointmentAudit: h.audit }));
vi.mock("./reminders", () => ({
  enqueueRemindersAfterCommit: h.enqueue,
  enqueueStatusNotificationsAfterCommit: vi.fn(async () => {}),
}));
vi.mock("./conflict", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./conflict")>()),
  findConflictsForWindow: h.findConflictsForWindow,
}));
vi.mock("@/lib/admin/care-team-auto", () => ({ addBookedTherapistsToCareTeam: h.careTeam }));
vi.mock("@/lib/notifications/centre", () => ({
  emitConfirmedNotification: vi.fn(async () => {}),
  emitRescheduledNotification: vi.fn(async () => {}),
  emitCancelledNotification: vi.fn(async () => {}),
  emitCareTeamAddedNotifications: vi.fn(async () => {}),
}));
// The NESA machine, when a test installs one at loc-1. Every actor here works
// at loc-1, so STAFF-02 and SCHED-17's location rule pass and the only rule
// left to refuse a clone is the one under test.
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
import { cloneAppointment } from "./actions";
import { scheduleAgainForbidden } from "./schedule-again-core";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);

const SELF = "therapist-self";
const COLLEAGUE = "therapist-colleague";
const NESA = "resource-nesa";

/** A Thursday template covering the whole day, so availability never refuses. */
const THURSDAY_ALL_DAY = {
  weekday: 4,
  startTime: "08:00:00",
  endTime: "20:00:00",
  validFrom: null,
  validUntil: null,
  isActive: true,
  locationId: "loc-1",
};

/** 10:00 Lisbon on Thursday 2026-09-10 is 09:00Z. */
const INSIDE = "2026-09-10T09:00:00.000Z";
/** 10:00 Lisbon on Sunday 2026-09-13: no template covers a Sunday. */
const OUTSIDE_SUNDAY = "2026-09-13T09:00:00.000Z";

function sourceOf(practitionerId: string) {
  return {
    patientId: "patient-1",
    practitionerId,
    locationId: "loc-1",
    serviceId: "svc-fisio",
    patientTwoId: null,
    practitionerTwoId: null,
    startsAt: new Date("2026-09-03T09:00:00.000Z"),
    endsAt: new Date("2026-09-03T09:55:00.000Z"),
  };
}

let inserted: Record<string, unknown> | null = null;

/**
 * Answers by REQUESTED COLUMNS, never by call order: `weekday` is the
 * availability read, `patientTwoId` the clone's source read, `middayClosedFrom`
 * the clinic's hours (none here). Everything else gets no rows.
 */
function fakeTx(source: unknown) {
  return {
    select: (cols?: Record<string, unknown>) => ({
      from: () => ({
        where: () => {
          const rows =
            cols && "weekday" in cols
              ? [THURSDAY_ALL_DAY]
              : cols && "patientTwoId" in cols
                ? [source]
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

function arrange(role: Role, sourcePractitionerId: string) {
  inserted = null;
  h.resources = [];
  h.audit.mockClear();
  h.enqueue.mockClear();
  h.careTeam.mockClear();
  h.findConflictsForWindow.mockClear();
  const actor: RequestContext = { tenantId: "tenant-A", role, userId: SELF };
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockCtx.mockResolvedValue(actor);
  mockRunScoped.mockImplementation((_a, cb) =>
    Promise.resolve(cb(fakeTx(sourceOf(sourcePractitionerId)) as never)),
  );
}

function expectNothingWritten() {
  expect(inserted).toBeNull();
  expect(h.audit).not.toHaveBeenCalled();
  expect(h.enqueue).not.toHaveBeenCalled();
  expect(h.careTeam).not.toHaveBeenCalled();
  expect(h.findConflictsForWindow).not.toHaveBeenCalled();
}

beforeEach(() => arrange("therapist", SELF));

describe("R52 - a therapist's Marcar novamente follows the create rule", () => {
  it("REFUSES a therapist cloning a colleague's visit, with the create path's error, and writes nothing", async () => {
    arrange("therapist", COLLEAGUE);
    const r = await cloneAppointment("src-1", INSIDE);
    expect(r).toEqual({ ok: false, error: "forbidden" });
    expectNothingWritten();
  });

  it("REFUSES it even with allowConflict: the override is for a busy slot, not for another therapist", async () => {
    arrange("therapist", COLLEAGUE);
    const r = await cloneAppointment("src-1", INSIDE, true);
    expect(r).toEqual({ ok: false, error: "forbidden" });
    expectNothingWritten();
  });

  it("REFUSES it BEFORE availability: a slot outside the colleague's hours still reads forbidden, with no windows", async () => {
    // The guard's place in the order. Were it below the availability check, a
    // therapist would get `outside_availability` and the colleague's working
    // windows for that day, which is the colleague's schedule. Sunday is
    // outside THURSDAY_ALL_DAY, so availability would refuse here if it ran.
    arrange("therapist", COLLEAGUE);
    const r = await cloneAppointment("src-1", OUTSIDE_SUNDAY);
    expect(r).toEqual({ ok: false, error: "forbidden" });
    expectNothingWritten();
  });

  it("the same Sunday slot IS refused by availability for reception, so the arm above is not vacuous", async () => {
    arrange("reception", COLLEAGUE);
    const r = await cloneAppointment("src-1", OUTSIDE_SUNDAY);
    expect(r.ok === false && r.error).toBe("outside_availability");
    expect(inserted).toBeNull();
  });

  it("ALLOWS a therapist cloning their own visit, in their own name", async () => {
    arrange("therapist", SELF);
    const r = await cloneAppointment("src-1", INSIDE);
    expect(r).toEqual({ ok: true, data: { id: "new-appt-1" } });
    expect(inserted).toMatchObject({ practitionerId: SELF, createdBy: SELF });
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.enqueue).toHaveBeenCalledTimes(1);
  });

  it("ALLOWS a therapist cloning a NESA visit at their own clinic, the create rule's one exception", async () => {
    arrange("therapist", NESA);
    h.resources = [{ id: NESA, label: "NESA", locationIds: ["loc-1"] }];
    const r = await cloneAppointment("src-1", INSIDE);
    expect(r).toEqual({ ok: true, data: { id: "new-appt-1" } });
    expect(inserted).toMatchObject({ practitionerId: NESA });
  });
});

describe("R52 - owner, admin and reception are unchanged", () => {
  it.each(["reception", "admin", "owner"] as const)(
    "%s clones a therapist's visit as before",
    async (role) => {
      arrange(role, COLLEAGUE);
      const r = await cloneAppointment("src-1", INSIDE);
      expect(r).toEqual({ ok: true, data: { id: "new-appt-1" } });
      expect(inserted).toMatchObject({ practitionerId: COLLEAGUE, createdBy: SELF });
      expect(h.audit).toHaveBeenCalledTimes(1);
    },
  );
});

// U6: the screen hides "Marcar novamente" with scheduleAgainForbidden, which
// calls the same rule this action refuses with. Here the two are run side by
// side over every role and every kind of visit: the button is hidden exactly
// when the server answers `forbidden`, and each case also proves which way it
// went, so the table cannot pass with every row agreeing on "allowed".
describe("U6 - the button's answer is the server's answer", () => {
  const cases = (["therapist", "reception", "admin", "owner"] as const).flatMap((role) =>
    [SELF, COLLEAGUE, NESA].map((practitioner) => [role, practitioner] as const),
  );
  it.each(cases)("%s on a visit of %s", async (role, practitioner) => {
    arrange(role, practitioner);
    h.resources = [{ id: NESA, label: "NESA", locationIds: ["loc-1"] }];
    const r = await cloneAppointment("src-1", INSIDE);
    const serverRefused = r.ok === false && r.error === "forbidden";
    const hidden = scheduleAgainForbidden({ role, userId: SELF }, practitioner, [NESA]);
    expect(hidden).toBe(serverRefused);
    expect(serverRefused).toBe(role === "therapist" && practitioner === COLLEAGUE);
    if (!serverRefused) expect(r).toEqual({ ok: true, data: { id: "new-appt-1" } });
  });
});
