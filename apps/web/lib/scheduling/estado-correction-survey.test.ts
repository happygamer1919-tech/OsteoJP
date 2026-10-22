/**
 * estado-correction-survey.test.ts - Q-O: A "CORRIGIR ESTADO" INTO CONCLUIDA
 * ASKS FOR THE SATISFACTION SURVEY.
 *
 * Strategy's ruling of 2026-10-22, verbatim: "Q-O a: emit on a correction into
 * Concluida, only for visits that ended in the last 7 days, same 24 h and
 * 60-day rules."
 *
 * Before it, the correction door emitted nothing, so a visit moved from Falta
 * to Concluida never had its survey. This file holds WHICH corrections emit
 * (the pure rule, every legal pair, and the 7-day window at both edges) and
 * that the real action emits exactly that, after the commit. What the event
 * then does (the 24 hour sleep, the survey alone, the 60-day rule) is
 * lib/reminders/survey-dispatch.test.ts and lib/reminders/inngest/functions.test.ts.
 *
 * Real here: `correctAppointmentEstadoAction`, the bridge in ./reminders.ts and
 * the sender in lib/reminders/index.ts. Faked: the transaction (one row), the
 * auth, the audit write, the conflict read, and `inngest.send`, captured.
 * Ids are invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  sent: [] as { name: string; data: Record<string, unknown> }[],
  conflicts: [] as unknown[],
}));

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
vi.mock("./actor", () => ({ clientIp: vi.fn(async () => null) }));
vi.mock("./audit", () => ({ writeAppointmentAudit: vi.fn(async () => {}) }));
vi.mock("./analytics", () => ({ writeAppointmentStatusChangedEvent: vi.fn(async () => {}) }));
vi.mock("./conflict", () => ({
  findConflicts: vi.fn(async () => []),
  findConflictsForWindow: vi.fn(async () => h.conflicts),
  blockingConflicts: (c: unknown[]) => c,
}));
vi.mock("@/lib/notifications/centre", () => ({
  emitConfirmedNotification: vi.fn(async () => ({ delivered: true })),
}));
vi.mock("@/lib/reminders/inngest/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/reminders/inngest/client")>(
    "@/lib/reminders/inngest/client",
  );
  return {
    ...actual,
    inngest: {
      ...actual.inngest,
      send: vi.fn(async (e: { name: string; data: Record<string, unknown> }) => {
        h.sent.push(e);
      }),
    },
  };
});

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import type { RequestContext } from "@osteojp/auth";
import { correctAppointmentEstadoAction } from "./actions";
import {
  CORRECTION_SURVEY_WINDOW_MS,
  correctionAsksSurvey,
  isLegalEstadoCorrection,
} from "./estado-correction";
import type { AppointmentStatusValue } from "./types";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);

const TENANT = "11111111-1111-4111-8111-111111111111";
const APPT = "22222222-2222-4222-8222-222222222222";
const actor: RequestContext = { tenantId: TENANT, role: "reception", userId: "user-1" };

/** The moment of every correction below. */
const NOW = new Date("2031-05-20T12:00:00.000Z");
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
/** A visit of 45 minutes that ended `msAgo` before NOW. */
const endedAgo = (msAgo: number) => {
  const endsAt = new Date(NOW.getTime() - msAgo);
  return { startsAt: new Date(endsAt.getTime() - 45 * 60_000), endsAt };
};

let row = {
  id: APPT,
  status: "no_show" as AppointmentStatusValue,
  practitionerId: "therapist-1",
  practitionerTwoId: null as string | null,
  locationId: "loc-1",
  room: null as string | null,
  ...endedAgo(2 * DAY),
};

function fakeTx() {
  return {
    execute: async () => [],
    select: () => {
      const chain: Record<string, unknown> = {
        from: () => chain,
        where: () => chain,
        limit: async () => [row],
      };
      return chain;
    },
    update: () => ({ set: () => ({ where: async () => [] }) }),
    insert: () => ({ values: async () => [] }),
  };
}

beforeEach(() => {
  h.sent.length = 0;
  h.conflicts = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockCtx.mockResolvedValue(actor);
  mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(fakeTx() as never)));
});

afterEach(() => {
  vi.useRealTimers();
});

/* ------------------------------ the rule ------------------------------ */

const ALL: AppointmentStatusValue[] = ["scheduled", "confirmed", "completed", "cancelled", "no_show"];

describe("correctionAsksSurvey: into Concluida, a visit that ended in the last 7 days", () => {
  it("of the six legal corrections, only the two INTO completed ask", () => {
    const legal = ALL.flatMap((from) => ALL.map((to) => [from, to] as const)).filter(([f, t]) =>
      isLegalEstadoCorrection(f, t),
    );
    expect(legal).toHaveLength(6);
    const endsAt = new Date(NOW.getTime() - DAY);
    expect(legal.filter(([f, t]) => correctionAsksSurvey(f, t, endsAt, NOW.getTime()))).toEqual([
      ["cancelled", "completed"],
      ["no_show", "completed"],
    ]);
  });

  it("no illegal pair asks, even into completed", () => {
    const endsAt = new Date(NOW.getTime() - DAY);
    for (const from of ["scheduled", "confirmed", "completed"] as const) {
      expect(correctionAsksSurvey(from, "completed", endsAt, NOW.getTime()), from).toBe(false);
    }
  });

  it.each([
    ["ended a moment ago", 0, true],
    ["ended 6 days 23 hours ago", 6 * DAY + 23 * HOUR, true],
    ["ended exactly 7 days ago", 7 * DAY, true],
    ["ended 7 days 1 hour ago", 7 * DAY + HOUR, false],
    ["ended 30 days ago", 30 * DAY, false],
    ["has not ended yet (ends in an hour)", -HOUR, false],
  ])("a visit that %s: %s", (_label, msAgo, asks) => {
    const endsAt = new Date(NOW.getTime() - msAgo);
    expect(correctionAsksSurvey("no_show", "completed", endsAt, NOW.getTime())).toBe(asks);
  });

  it("the window is seven days", () => {
    expect(CORRECTION_SURVEY_WINDOW_MS).toBe(7 * DAY);
  });
});

/* ------------------------------ the action ------------------------------ */

const COMPLETED = "appointment/completed";

describe("correctAppointmentEstadoAction emits the survey's event exactly when the rule says", () => {
  it("Falta to Concluida, the visit ended 6 days 23 hours ago: ONE completed event, survey only", async () => {
    row = { ...row, status: "no_show", ...endedAgo(6 * DAY + 23 * HOUR) };
    expect(await correctAppointmentEstadoAction(APPT, "completed")).toEqual({ ok: true, data: { id: APPT } });
    expect(h.sent).toEqual([
      {
        name: COMPLETED,
        data: { appointmentId: APPT, tenantId: TENANT, endsAt: row.endsAt.toISOString(), surveyOnly: true },
      },
    ]);
  });

  it("Falta to Concluida, the visit ended 7 days 1 hour ago: the correction stands, nothing is emitted", async () => {
    row = { ...row, status: "no_show", ...endedAgo(7 * DAY + HOUR) };
    expect(await correctAppointmentEstadoAction(APPT, "completed")).toEqual({ ok: true, data: { id: APPT } });
    expect(h.sent).toEqual([]);
  });

  it("Cancelada to Concluida inside the window emits too: the ruling says into Concluida", async () => {
    row = { ...row, status: "cancelled", ...endedAgo(DAY) };
    await correctAppointmentEstadoAction(APPT, "completed");
    expect(h.sent.map((e) => [e.name, e.data.surveyOnly])).toEqual([[COMPLETED, true]]);
  });

  it.each([
    ["completed", "no_show"],
    ["completed", "cancelled"],
    ["no_show", "cancelled"],
    ["cancelled", "no_show"],
  ] as const)("%s to %s, the visit ended yesterday: the correction stands, nothing is emitted", async (from, to) => {
    row = { ...row, status: from, ...endedAgo(DAY) };
    expect(await correctAppointmentEstadoAction(APPT, to)).toEqual({ ok: true, data: { id: APPT } });
    expect(h.sent).toEqual([]);
  });

  it("Falta to Concluida of a visit that has not ended yet: nothing (an open question, see the rule)", async () => {
    row = { ...row, status: "no_show", ...endedAgo(-HOUR) };
    expect((await correctAppointmentEstadoAction(APPT, "completed")).ok).toBe(true);
    expect(h.sent).toEqual([]);
  });

  it("a refused correction emits nothing: an illegal pair, and a slot taken since", async () => {
    row = { ...row, status: "confirmed", ...endedAgo(DAY) };
    expect(await correctAppointmentEstadoAction(APPT, "completed")).toEqual({ ok: false, error: "illegal_transition" });

    row = { ...row, status: "no_show", ...endedAgo(DAY) };
    h.conflicts = [{ id: "other", kind: "practitioner" }];
    expect((await correctAppointmentEstadoAction(APPT, "completed")).ok).toBe(false);
    expect(h.sent).toEqual([]);
  });

  it("a transaction that fails emits nothing: the event follows the commit", async () => {
    row = { ...row, status: "no_show", ...endedAgo(DAY) };
    mockRunScoped.mockImplementation(async () => {
      throw new Error("the database is away");
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await correctAppointmentEstadoAction(APPT, "completed")).toEqual({ ok: false, error: "error" });
    expect(h.sent).toEqual([]);
    err.mockRestore();
  });

  it("a send that fails does not fail the correction: it is committed and stands", async () => {
    row = { ...row, status: "no_show", ...endedAgo(DAY) };
    const { inngest } = await import("@/lib/reminders/inngest/client");
    vi.mocked(inngest.send).mockRejectedValueOnce(new Error("inngest unreachable"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await correctAppointmentEstadoAction(APPT, "completed")).toEqual({ ok: true, data: { id: APPT } });
    // Logged without the payload: no id reaches the log.
    expect(err.mock.calls.map((c) => c.join(" ")).join("\n")).not.toContain(APPT);
    err.mockRestore();
  });
});
