import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * APPT-BULK-01 - `bulkRescheduleAppointments`, driven through the real action
 * with a fake transaction (the pattern of actions.therapist-change.test.ts).
 *
 * What it pins, each against the single drawer move as the yardstick:
 *   - preview writes NOTHING: no update, no audit row, no care-team join, no
 *     reminder call, and no slot lock;
 *   - apply writes, per changed row, exactly one update and one
 *     `appointment.reschedule` audit row whose metadata EQUALS what
 *     `rescheduleAppointment` writes for the same move;
 *   - apply makes ONE reminder call for the whole action, holding every saved
 *     row, with the same target a drawer move builds;
 *   - a row that is refused (a conflict, the therapist's hours) is skipped and
 *     writes nothing, and the others still save;
 *   - the per-row tick passes an overridable conflict and is recorded, and it
 *     never passes the therapist's hours;
 *   - only owner, admin and reception get through; a therapist is refused
 *     before any read;
 *   - rows that are not this patient's, not ahead, or not Agendada/Confirmada
 *     are not eligible and write nothing.
 *
 * The same, against Postgres with the real policies: bulk-reschedule.db.test.ts.
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
  rescheduled: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
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
  emitRescheduledNotification: h.rescheduled,
  emitCancelledNotification: vi.fn(async () => {}),
  emitCareTeamAddedNotifications: vi.fn(async () => {}),
}));

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import type { RequestContext } from "@osteojp/auth";
import { bulkRescheduleAppointments, rescheduleAppointment } from "./actions";
import type { BulkRequest } from "./bulk-reschedule-core";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const reception: RequestContext = { tenantId: "tenant-A", role: "reception", userId: "user-1" };

const PATIENT = "patient-1";
const OLD = "therapist-old";
const NEW = "therapist-new";
const LOC = "loc-1";

type Row = {
  id: string;
  patientId: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  practitionerId: string;
  practitionerTwoId: string | null;
  locationId: string;
  room: string | null;
  recurrenceParentId: null;
};

/** Mondays in May 2031, 15:00 Lisbon (14:00Z), 45 minutes. Pinned, never `now`. */
const monday = (day: number): Row => ({
  id: `appt-${day}`,
  patientId: PATIENT,
  status: "confirmed",
  startsAt: new Date(`2031-05-${String(day).padStart(2, "0")}T14:00:00.000Z`),
  endsAt: new Date(`2031-05-${String(day).padStart(2, "0")}T14:45:00.000Z`),
  practitionerId: OLD,
  practitionerTwoId: null,
  locationId: LOC,
  room: null,
  recurrenceParentId: null,
});

let rows: Row[] = [];
let updates: { id: string | null; values: Record<string, unknown> }[] = [];
/** How many slot locks (pg_advisory_xact_lock) the transactions asked for. */
let slotLocks = 0;
let templates: unknown[] = [];

/** The id a drizzle condition names, found by walking it. */
function idIn(cond: unknown): string | null {
  const known = new Set(rows.map((r) => r.id));
  const seen = new WeakSet<object>();
  const walk = (v: unknown, depth: number): string | null => {
    if (typeof v === "string") return known.has(v) ? v : null;
    if (!v || typeof v !== "object" || depth > 8 || seen.has(v)) return null;
    seen.add(v);
    for (const x of Array.isArray(v) ? v : Object.values(v)) {
      const hit = walk(x, depth + 1);
      if (hit) return hit;
    }
    return null;
  };
  return walk(cond, 0);
}

/** Does a drizzle SQL object carry this text anywhere in its chunks? */
function mentions(q: unknown, text: string): boolean {
  const seen = new WeakSet<object>();
  const walk = (v: unknown, depth: number): boolean => {
    if (typeof v === "string") return v.includes(text);
    if (!v || typeof v !== "object" || depth > 10 || seen.has(v)) return false;
    seen.add(v);
    return (Array.isArray(v) ? v : Object.values(v)).some((x) => walk(x, depth + 1));
  };
  return walk(q, 0);
}

function fakeTx() {
  return {
    execute: async (q: unknown) => {
      if (mentions(q, "pg_advisory_xact_lock")) slotLocks += 1;
      return [];
    },
    select: (cols?: Record<string, unknown>) => {
      if (cols && "middayClosedFrom" in cols) {
        const clinic: Record<string, unknown> = { from: () => clinic, where: () => clinic, limit: async () => [] };
        return clinic;
      }
      let named: string | null = null;
      const isSourceRead = !!cols && "patientId" in cols && "status" in cols && "locationId" in cols;
      const awaited = () => {
        if (cols && "weekday" in cols) return templates;
        if (isSourceRead) return rows;
        return [];
      };
      const chain: Record<string, unknown> = {
        from: () => chain,
        innerJoin: () => chain,
        leftJoin: () => chain,
        where: (cond: unknown) => {
          named = idIn(cond);
          return chain;
        },
        then: (resolve: (r: unknown[]) => unknown) => resolve(awaited()),
        limit: async () => {
          const r = rows.find((x) => x.id === named);
          return r ? [r] : [];
        },
      };
      return chain;
    },
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async (cond: unknown) => {
          const id = idIn(cond);
          updates.push({ id, values });
          // The fake database moves too, so a later row of the same action
          // meets this one where it now is.
          const r = rows.find((x) => x.id === id);
          if (r) Object.assign(r, values);
          return [];
        },
      }),
    }),
    insert: () => ({ values: async () => [] }),
  };
}

function arrange(actor: RequestContext = reception) {
  rows = [monday(12), monday(19), monday(26)];
  updates = [];
  slotLocks = 0;
  templates = [];
  for (const f of [h.audit, h.enqueue, h.careTeam, h.rescheduled]) f.mockClear();
  h.findConflictsForWindow.mockReset();
  h.findConflictsForWindow.mockResolvedValue([]);
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockCtx.mockResolvedValue(actor);
  mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(fakeTx() as never)));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2031-05-01T09:00:00.000Z"));
  arrange();
});

const req = (over: Partial<BulkRequest> = {}): BulkRequest => ({
  patientId: PATIENT,
  rows: rows.map((r) => ({ id: r.id })),
  change: { practitionerId: NEW, time: "10:00" },
  mode: "preview",
  ...over,
});

const nothingWritten = () => {
  expect(updates).toEqual([]);
  expect(h.audit).not.toHaveBeenCalled();
  expect(h.careTeam).not.toHaveBeenCalled();
  expect(h.enqueue).not.toHaveBeenCalled();
  expect(h.rescheduled).not.toHaveBeenCalled();
};

/** 10:00 Lisbon in May is 09:00Z. */
const tenOn = (day: number) => new Date(`2031-05-${String(day).padStart(2, "0")}T09:00:00.000Z`);
const endOn = (day: number) => new Date(`2031-05-${String(day).padStart(2, "0")}T09:45:00.000Z`);

describe("bulkRescheduleAppointments: preview writes nothing", () => {
  it("returns each row's old and new values with verdict ok, and writes nothing at all", async () => {
    const r = await bulkRescheduleAppointments(req());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.mode).toBe("preview");
    expect(r.data.okCount).toBe(3);
    expect(r.data.rows.map((x) => x.verdict.kind)).toEqual(["ok", "ok", "ok"]);
    expect(r.data.rows.every((x) => x.applied === false)).toBe(true);
    expect(r.data.rows[0]).toEqual({
      id: "appt-12",
      before: {
        startsAt: "2031-05-12T14:00:00.000Z",
        endsAt: "2031-05-12T14:45:00.000Z",
        practitionerId: OLD,
        locationId: LOC,
      },
      after: { startsAt: tenOn(12).toISOString(), endsAt: endOn(12).toISOString(), practitionerId: NEW, locationId: LOC },
      verdict: { kind: "ok" },
      applied: false,
    });
    expect(updates).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
    expect(h.careTeam).not.toHaveBeenCalled();
    expect(h.enqueue).not.toHaveBeenCalled();
    expect(h.rescheduled).not.toHaveBeenCalled();
    // No slot lock was taken: the preview stopped before the write side.
    expect(slotLocks).toBe(0);
  });

  it("runs the conflict check for every row against the NEW therapist", async () => {
    await bulkRescheduleAppointments(req());
    expect(h.findConflictsForWindow).toHaveBeenCalledTimes(3);
    for (const [i, day] of [12, 19, 26].entries()) {
      expect(h.findConflictsForWindow.mock.calls[i]![1]).toMatchObject({
        practitionerId: NEW,
        locationId: LOC,
        startsAt: tenOn(day),
        endsAt: endOn(day),
        // PREVIEW: the row itself, and the rows this preview already passed,
        // which the apply will have moved before this one.
        excludeIds: [`appt-${day}`, ...[12, 19, 26].slice(0, i).map((d) => `appt-${d}`)],
      });
    }
  });

  it("an APPLY excludes only the row itself: it meets the database as it stands", async () => {
    await bulkRescheduleAppointments(req({ mode: "apply" }));
    for (const [i, day] of [12, 19, 26].entries()) {
      expect((h.findConflictsForWindow.mock.calls[i]![1] as { excludeIds: string[] }).excludeIds).toEqual([`appt-${day}`]);
    }
  });

  it("shows a conflict even on a row ticked to override it", async () => {
    const inTheWay = { kind: "therapist", id: "x", patientName: null, startsAt: "s", endsAt: "e", room: null };
    h.findConflictsForWindow.mockResolvedValue([inTheWay]);
    const r = await bulkRescheduleAppointments(req({ rows: [{ id: "appt-12", allowConflict: true }] }));
    expect(r.ok && r.data.rows[0]!.verdict).toEqual({ kind: "conflict", conflicts: [inTheWay] });
    nothingWritten();
  });
});

describe("bulkRescheduleAppointments: apply writes what a drawer move writes, per row", () => {
  it("one update and one appointment.reschedule audit row per changed row", async () => {
    const r = await bulkRescheduleAppointments(req({ mode: "apply" }));
    expect(r.ok && r.data.rows.map((x) => [x.verdict.kind, x.applied])).toEqual([
      ["ok", true],
      ["ok", true],
      ["ok", true],
    ]);
    expect(updates).toEqual(
      [12, 19, 26].map((day) => ({
        id: `appt-${day}`,
        values: { startsAt: tenOn(day), endsAt: endOn(day), practitionerId: NEW, locationId: LOC },
      })),
    );
    expect(h.audit).toHaveBeenCalledTimes(3);
    // One slot lock per row, as a drawer move takes (the yardstick that the
    // preview's zero above is not a fake that never sees a lock).
    expect(slotLocks).toBe(3);
    expect(h.audit.mock.calls.map((c) => (c[1] as { action: string }).action)).toEqual([
      "appointment.reschedule",
      "appointment.reschedule",
      "appointment.reschedule",
    ]);
  });

  it("the audit row EQUALS the one rescheduleAppointment writes for the same move", async () => {
    await bulkRescheduleAppointments(req({ mode: "apply", rows: [{ id: "appt-19" }] }));
    const bulkCall = h.audit.mock.calls[0]![1];
    arrange();
    await rescheduleAppointment("appt-19", {
      startsAt: tenOn(19).toISOString(),
      endsAt: endOn(19).toISOString(),
      practitionerId: NEW,
      locationId: LOC,
      scope: "one",
      allowConflict: false,
    });
    const drawerCall = h.audit.mock.calls[0]![1];
    expect(bulkCall).toEqual(drawerCall);
    expect(bulkCall).toEqual({
      tenantId: "tenant-A",
      actorUserId: "user-1",
      action: "appointment.reschedule",
      appointmentId: "appt-19",
      metadata: {
        practitionerId: NEW,
        locationId: LOC,
        startsAt: tenOn(19).toISOString(),
        endsAt: endOn(19).toISOString(),
        scope: "one",
        allowConflict: false,
      },
      ip: null,
    });
  });

  it("ONE reminder call for the whole action, one target per saved row, built as a drawer move builds it", async () => {
    await bulkRescheduleAppointments(req({ mode: "apply" }));
    expect(h.enqueue).toHaveBeenCalledTimes(1);
    expect(h.enqueue).toHaveBeenCalledWith(
      "tenant-A",
      [12, 19, 26].map((day) => ({
        appointmentId: `appt-${day}`,
        startsAt: tenOn(day),
        practitionerId: NEW,
        status: "confirmed",
      })),
    );
    // The single move's own target for the same row, for comparison.
    const bulkTarget = (h.enqueue.mock.calls[0]![1] as unknown[])[1];
    arrange();
    await rescheduleAppointment("appt-19", {
      startsAt: tenOn(19).toISOString(),
      endsAt: endOn(19).toISOString(),
      practitionerId: NEW,
      locationId: LOC,
      scope: "one",
    });
    expect((h.enqueue.mock.calls[0]![1] as unknown[])[0]).toEqual(bulkTarget);
  });

  it("a therapist-only change carries the therapist-only marker, as a drawer move does (Q-K)", async () => {
    await bulkRescheduleAppointments(req({ mode: "apply", change: { practitionerId: NEW } }));
    const targets = h.enqueue.mock.calls[0]![1] as { confirmation?: string }[];
    expect(targets.map((t) => t.confirmation)).toEqual(["therapist_only", "therapist_only", "therapist_only"]);
  });

  it("the care team is asked for each moved row, Terapeuta slot only", async () => {
    await bulkRescheduleAppointments(req({ mode: "apply" }));
    expect(h.careTeam).toHaveBeenCalledTimes(3);
    expect(h.careTeam.mock.calls.map((c) => [c[2], c[3]])).toEqual([
      [["appt-12"], { slots: "primary" }],
      [["appt-19"], { slots: "primary" }],
      [["appt-26"], { slots: "primary" }],
    ]);
  });
});

describe("bulkRescheduleAppointments: a refused row is skipped and writes nothing", () => {
  it("a conflict on the middle row skips it; the other two save and share one reminder call", async () => {
    const inTheWay = { kind: "therapist", id: "x", patientName: null, startsAt: "s", endsAt: "e", room: null };
    h.findConflictsForWindow.mockImplementation(async (...args: unknown[]) =>
      (args[1] as { startsAt: Date }).startsAt.getTime() === tenOn(19).getTime() ? [inTheWay] : [],
    );
    const r = await bulkRescheduleAppointments(req({ mode: "apply" }));
    expect(r.ok && r.data.rows.map((x) => [x.id, x.verdict.kind, x.applied])).toEqual([
      ["appt-12", "ok", true],
      ["appt-19", "conflict", false],
      ["appt-26", "ok", true],
    ]);
    expect(r.ok && [r.data.okCount, r.data.skippedCount]).toEqual([2, 1]);
    expect(updates.map((u) => u.id)).toEqual(["appt-12", "appt-26"]);
    expect(h.audit.mock.calls.map((c) => (c[1] as { appointmentId: string }).appointmentId)).toEqual([
      "appt-12",
      "appt-26",
    ]);
    expect(h.enqueue).toHaveBeenCalledTimes(1);
    expect((h.enqueue.mock.calls[0]![1] as { appointmentId: string }[]).map((t) => t.appointmentId)).toEqual([
      "appt-12",
      "appt-26",
    ]);
  });

  it("the row's tick passes that conflict, and the audit row records the override", async () => {
    const inTheWay = { kind: "therapist", id: "x", patientName: null, startsAt: "s", endsAt: "e", room: null };
    h.findConflictsForWindow.mockResolvedValue([inTheWay]);
    const r = await bulkRescheduleAppointments(
      req({ mode: "apply", rows: [{ id: "appt-12", allowConflict: true }, { id: "appt-19" }] }),
    );
    expect(r.ok && r.data.rows.map((x) => [x.id, x.verdict.kind])).toEqual([
      ["appt-12", "ok"],
      ["appt-19", "conflict"],
    ]);
    expect(updates.map((u) => u.id)).toEqual(["appt-12"]);
    expect((h.audit.mock.calls[0]![1] as { metadata: { allowConflict: boolean } }).metadata.allowConflict).toBe(true);
  });

  it("the tick never passes the therapist's working hours", async () => {
    // Monday 09:00-09:30 only: 10:00 is outside.
    templates = [{ weekday: 1, startTime: "09:00:00", endTime: "09:30:00", validFrom: null, validUntil: null, isActive: true }];
    const r = await bulkRescheduleAppointments(
      req({ mode: "apply", rows: rows.map((x) => ({ id: x.id, allowConflict: true })) }),
    );
    expect(r.ok && r.data.rows.map((x) => x.verdict)).toEqual(
      [0, 1, 2].map(() => ({
        kind: "refused",
        error: "outside_availability",
        availabilityWindows: [{ startTime: "09:00", endTime: "09:30" }],
      })),
    );
    expect(updates).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
    expect(h.enqueue).not.toHaveBeenCalled();
  });

  it("a row's own picked hour is the one checked and saved", async () => {
    await bulkRescheduleAppointments(req({ mode: "apply", rows: [{ id: "appt-12", time: "11:30" }] }));
    expect(updates[0]!.values.startsAt).toEqual(new Date("2031-05-12T10:30:00.000Z"));
  });
});

describe("bulkRescheduleAppointments: which rows and who", () => {
  it("another patient's row, a past row and a cancelled row are not eligible and write nothing", async () => {
    rows[0] = { ...rows[0]!, patientId: "someone-else" };
    rows[1] = { ...rows[1]!, startsAt: new Date("2031-04-28T14:00:00.000Z"), endsAt: new Date("2031-04-28T14:45:00.000Z") };
    rows[2] = { ...rows[2]!, status: "cancelled" };
    const r = await bulkRescheduleAppointments(req({ mode: "apply" }));
    expect(r.ok && r.data.rows.map((x) => x.verdict.kind)).toEqual(["not_eligible", "not_eligible", "not_eligible"]);
    expect(updates).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
    expect(h.enqueue).not.toHaveBeenCalled();
  });

  it("a row the viewer cannot read (RLS) is not found, so not eligible", async () => {
    const r = await bulkRescheduleAppointments(req({ mode: "apply", rows: [{ id: "appt-unknown" }] }));
    expect(r.ok && r.data.rows[0]).toEqual({
      id: "appt-unknown",
      before: null,
      after: null,
      verdict: { kind: "not_eligible" },
      applied: false,
    });
    expect(updates).toEqual([]);
  });

  it("a change that leaves a row as it is writes nothing for it", async () => {
    const r = await bulkRescheduleAppointments(req({ mode: "apply", change: { practitionerId: OLD, time: "15:00" } }));
    expect(r.ok && r.data.rows.map((x) => x.verdict.kind)).toEqual(["unchanged", "unchanged", "unchanged"]);
    expect(updates).toEqual([]);
    expect(h.enqueue).not.toHaveBeenCalled();
  });

  it.each(["owner", "admin", "reception"] as const)("%s gets through", async (role) => {
    arrange({ ...reception, role });
    const r = await bulkRescheduleAppointments(req());
    expect(r.ok).toBe(true);
  });

  it("a therapist is refused before any read, and nothing is written", async () => {
    arrange({ ...reception, role: "therapist" });
    const r = await bulkRescheduleAppointments(req({ mode: "apply" }));
    expect(r).toEqual({ ok: false, error: "forbidden" });
    expect(mockRunScoped).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("a malformed request is refused before any read", async () => {
    for (const bad of [req({ rows: [] }), req({ change: {} }), req({ mode: "write" as never })]) {
      expect(await bulkRescheduleAppointments(bad)).toEqual({ ok: false, error: "validation" });
    }
    expect(mockRunScoped).not.toHaveBeenCalled();
  });
});

/**
 * The conflict check as the database would answer it: every stored row (and
 * any `others`) with the same therapist overlapping the window, minus the ids
 * the move excludes. Reads `rows` live, so it sees what earlier rows of the
 * same action have already written.
 */
function databaseConflicts(others: Row[] = []) {
  h.findConflictsForWindow.mockImplementation(async (...args: unknown[]) => {
    const w = args[1] as { practitionerId: string; startsAt: Date; endsAt: Date; excludeIds?: string[] };
    return [...rows, ...others]
      .filter((r) => !(w.excludeIds ?? []).includes(r.id))
      .filter((r) => r.practitionerId === w.practitionerId)
      .filter((r) => r.startsAt.getTime() < w.endsAt.getTime() && w.startsAt.getTime() < r.endsAt.getTime())
      .map((r) => ({
        kind: "therapist",
        id: r.id,
        patientName: null,
        startsAt: r.startsAt.toISOString(),
        endsAt: r.endsAt.toISOString(),
        room: null,
      }));
  });
}

describe("bulkRescheduleAppointments: a shift moves a series onto its own old slots", () => {
  it("+7 days on a weekly series: the preview passes every row, the apply saves every row, latest first", async () => {
    databaseConflicts();
    const change = { shiftDays: 7 };
    const preview = await bulkRescheduleAppointments(req({ change }));
    expect(preview.ok && preview.data.rows.map((x) => [x.id, x.verdict.kind])).toEqual([
      ["appt-12", "ok"],
      ["appt-19", "ok"],
      ["appt-26", "ok"],
    ]);
    expect(updates).toEqual([]);

    const apply = await bulkRescheduleAppointments(req({ change, mode: "apply" }));
    expect(apply.ok && apply.data.okCount).toBe(3);
    // Latest first: each visit's new slot was free when it arrived.
    expect(updates.map((u) => u.id)).toEqual(["appt-26", "appt-19", "appt-12"]);
    expect(rows.map((r) => r.startsAt.toISOString())).toEqual([
      "2031-05-19T14:00:00.000Z",
      "2031-05-26T14:00:00.000Z",
      "2031-06-02T14:00:00.000Z",
    ]);
  });

  it("-7 days: earliest first, and the preview says what the apply then does", async () => {
    databaseConflicts();
    const change = { shiftDays: -7 };
    const preview = await bulkRescheduleAppointments(req({ change }));
    expect(preview.ok && preview.data.rows.map((x) => x.verdict.kind)).toEqual(["ok", "ok", "ok"]);
    const apply = await bulkRescheduleAppointments(req({ change, mode: "apply" }));
    expect(apply.ok && apply.data.okCount).toBe(3);
    expect(updates.map((u) => u.id)).toEqual(["appt-12", "appt-19", "appt-26"]);
  });

  it("+7 when the LAST visit's new slot is taken: it is refused, and so is each visit that would land on one left in place; no overlap is written", async () => {
    const foreign: Row = { ...monday(26), id: "foreign", patientId: "someone-else", startsAt: new Date("2031-06-02T14:00:00.000Z"), endsAt: new Date("2031-06-02T14:45:00.000Z") };
    databaseConflicts([foreign]);
    const change = { shiftDays: 7 };
    const preview = await bulkRescheduleAppointments(req({ change }));
    expect(preview.ok && preview.data.rows.map((x) => x.verdict.kind)).toEqual(["conflict", "conflict", "conflict"]);
    const apply = await bulkRescheduleAppointments(req({ change, mode: "apply" }));
    expect(apply.ok && apply.data.rows.map((x) => x.verdict.kind)).toEqual(["conflict", "conflict", "conflict"]);
    expect(updates).toEqual([]);
    expect(h.enqueue).not.toHaveBeenCalled();
  });

  it("two rows landing on each other in the preview are flagged, and the apply refuses the second", async () => {
    databaseConflicts();
    // A second visit the same Monday at 18:00, so "new hour 10:00" puts two
    // visits of this selection at 10:00 on the 12th with one therapist.
    rows.push({ ...monday(12), id: "appt-12b", startsAt: new Date("2031-05-12T17:00:00.000Z"), endsAt: new Date("2031-05-12T17:45:00.000Z") });
    const ids = [{ id: "appt-12" }, { id: "appt-12b" }];
    const preview = await bulkRescheduleAppointments(req({ rows: ids, change: { time: "10:00" } }));
    expect(preview.ok && preview.data.rows.map((x) => [x.id, x.verdict.kind])).toEqual([
      ["appt-12", "ok"],
      ["appt-12b", "overlap"],
    ]);
    const apply = await bulkRescheduleAppointments(req({ rows: ids, change: { time: "10:00" }, mode: "apply" }));
    expect(apply.ok && apply.data.rows.map((x) => [x.id, x.verdict.kind])).toEqual([
      ["appt-12", "ok"],
      ["appt-12b", "conflict"],
    ]);
    expect(updates.map((u) => u.id)).toEqual(["appt-12"]);
  });
});

describe("bulkRescheduleAppointments: stale rows, the past, and a row that throws", () => {
  it("a row whose start is not the one the client saw is left alone (a retried save cannot shift twice)", async () => {
    const r = await bulkRescheduleAppointments(
      req({ mode: "apply", change: { shiftDays: 7 }, rows: [{ id: "appt-12", expectedStartsAt: "2031-05-05T14:00:00.000Z" }] }),
    );
    expect(r.ok && r.data.rows[0]!.verdict).toEqual({ kind: "changed" });
    expect(updates).toEqual([]);
    expect(h.enqueue).not.toHaveBeenCalled();
  });

  it("the start she saw passes", async () => {
    const r = await bulkRescheduleAppointments(
      req({ mode: "apply", change: { shiftDays: 7 }, rows: [{ id: "appt-12", expectedStartsAt: "2031-05-12T14:00:00.000Z" }] }),
    );
    expect(r.ok && r.data.rows[0]!.verdict).toEqual({ kind: "ok" });
  });

  it("a row cancelled between the read and its own transaction is not moved", async () => {
    // The action's first read sees Confirmada; the row's transaction sees
    // Cancelada (another desk cancelled it in between).
    let reads = 0;
    mockRunScoped.mockImplementation((_a, cb) => {
      reads += 1;
      if (reads === 2) rows[0] = { ...rows[0]!, status: "cancelled" };
      return Promise.resolve(cb(fakeTx() as never));
    });
    const r = await bulkRescheduleAppointments(req({ mode: "apply", rows: [{ id: "appt-12" }] }));
    expect(r.ok && r.data.rows[0]!.verdict).toEqual({ kind: "changed" });
    expect(updates).toEqual([]);
  });

  it("a row MOVED between the read and its own transaction is not moved again", async () => {
    let reads = 0;
    mockRunScoped.mockImplementation((_a, cb) => {
      reads += 1;
      if (reads === 2) {
        rows[0] = { ...rows[0]!, startsAt: new Date("2031-05-13T14:00:00.000Z"), endsAt: new Date("2031-05-13T14:45:00.000Z") };
      }
      return Promise.resolve(cb(fakeTx() as never));
    });
    const r = await bulkRescheduleAppointments(req({ mode: "apply", rows: [{ id: "appt-12" }] }));
    expect(r.ok && r.data.rows[0]!.verdict).toEqual({ kind: "changed" });
    expect(updates).toEqual([]);
  });

  it("a change that would put a visit in the past is refused for that row", async () => {
    const r = await bulkRescheduleAppointments(req({ mode: "apply", change: { shiftDays: -30 } }));
    expect(r.ok && r.data.rows.map((x) => x.verdict.kind)).toEqual(["past", "past", "past"]);
    expect(updates).toEqual([]);
  });

  it("a row that THROWS is refused, and the rows already saved still get their one reminder call", async () => {
    let call = 0;
    h.findConflictsForWindow.mockImplementation(async () => {
      call += 1;
      if (call === 2) throw new Error("boom");
      return [];
    });
    const r = await bulkRescheduleAppointments(req({ mode: "apply" }));
    expect(r.ok && r.data.rows.map((x) => [x.id, x.verdict.kind])).toEqual([
      ["appt-12", "ok"],
      ["appt-19", "refused"],
      ["appt-26", "ok"],
    ]);
    expect(h.enqueue).toHaveBeenCalledTimes(1);
    expect((h.enqueue.mock.calls[0]![1] as { appointmentId: string }[]).map((t) => t.appointmentId)).toEqual([
      "appt-12",
      "appt-26",
    ]);
  });
});
