/**
 * follow-up-start.test.ts - R37 (R26 CUT) at the two doors that conclude a
 * visit: the Estado save (`updateAppointment`, status Concluida) and "Corrigir
 * estado" into Concluida (`correctAppointmentEstadoAction`).
 *
 * Strategy's gate, verbatim: "CHECK all three modes. EXPECT a start only where
 * a survey could be sent." So each door is driven under off, canary (a listed
 * and an unlisted patient) and on, and `appointment/completed` must be sent
 * exactly where the survey could go. While both follow-up bodies are
 * unapproved that is the whole rule; the arm at the end approves one and shows
 * the ordinary completion starts again under off, and the correction does not.
 *
 * Real here: both actions, the bridge in ./reminders.ts, the sender and the
 * decision in lib/reminders. Faked: the transaction (one row, which carries
 * the patient), the auth, the audit and analytics writes, the conflict read,
 * and `inngest.send`, captured. The registry is the real one, behind a switch
 * that can approve the follow-up for the last arm. Ids are invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  sent: [] as { name: string; data: Record<string, unknown> }[],
  followUpApproved: false,
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
  findConflictsForWindow: vi.fn(async () => []),
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
// The real registry, with the follow-up's approval switchable for one arm.
vi.mock("@/lib/reminders/notification-registry", async () => {
  const actual = await vi.importActual<typeof import("@/lib/reminders/notification-registry")>(
    "@/lib/reminders/notification-registry",
  );
  type Entry = (typeof actual.WEB_TEMPLATES)[number];
  const approved = new Map<string, Entry>(
    actual.WEB_TEMPLATES.map((e) => [
      e.id,
      e.id.startsWith("follow_up.") ? { ...e, approved: true, approvedBy: "TEST", approvedAt: "2031-01-01" } : e,
    ]),
  );
  class Switched extends Map<string, Entry> {
    override get(id: string) {
      return (h.followUpApproved ? approved : actual.webRegistry).get(id);
    }
  }
  return { ...actual, webRegistry: new Switched(actual.webRegistry) };
});

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import type { RequestContext } from "@osteojp/auth";
import { correctAppointmentEstadoAction, updateAppointment } from "./actions";
import type { AppointmentStatusValue } from "./types";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);

const TENANT = "11111111-1111-4111-8111-111111111111";
const APPT = "22222222-2222-4222-8222-222222222222";
const LISTED = "33333333-3333-4333-8333-333333333333";
const UNLISTED = "44444444-4444-4444-8444-444444444444";
const actor: RequestContext = { tenantId: TENANT, role: "admin", userId: "user-1" };

const NOW = new Date("2031-05-20T12:00:00.000Z");
const ENDS_AT = new Date(NOW.getTime() - 24 * 60 * 60_000);

let row: Record<string, unknown> = {};
function setRow(status: AppointmentStatusValue, patientId: string) {
  row = {
    id: APPT,
    patientId,
    status,
    startsAt: new Date(ENDS_AT.getTime() - 45 * 60_000),
    endsAt: ENDS_AT,
    practitionerId: "therapist-1",
    practitionerTwoId: null,
    locationId: "loc-1",
    room: null,
    recurrenceParentId: null,
  };
}

/** One row answers every select: resolveSeries, the patient read, the correction's read. */
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
  h.followUpApproved = false;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockCtx.mockResolvedValue(actor);
  mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(fakeTx() as never)));
  vi.stubEnv("SURVEY_CANARY_PATIENT_IDS", LISTED);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/** Conclude the visit through the Estado save. */
async function concludeByEstado(patientId: string): Promise<void> {
  setRow("confirmed", patientId);
  expect((await updateAppointment(APPT, { status: "completed" })).ok).toBe(true);
}

/** Conclude the visit through "Corrigir estado", from Falta. */
async function concludeByCorrection(patientId: string): Promise<void> {
  setRow("no_show", patientId);
  expect(await correctAppointmentEstadoAction(APPT, "completed")).toEqual({ ok: true, data: { id: APPT } });
}

const DOORS = [
  ["the Estado save", concludeByEstado, undefined],
  ["Corrigir estado", concludeByCorrection, true],
] as const;

describe.each(DOORS)("R37 at %s: appointment/completed is sent only where a survey could be sent", (_door, conclude, surveyOnly) => {
  it.each([[undefined], ["off"], ["ON"], ["canary "]])("SURVEY_SEND_MODE=%j (reads off): no event, listed or not", async (mode) => {
    vi.stubEnv("SURVEY_SEND_MODE", mode);
    await conclude(LISTED);
    await conclude(UNLISTED);
    expect(h.sent).toEqual([]);
  });

  it("canary, a patient NOT on the list: no event", async () => {
    vi.stubEnv("SURVEY_SEND_MODE", "canary");
    await conclude(UNLISTED);
    expect(h.sent).toEqual([]);
  });

  it("canary, the patient on the list: ONE event, carrying what it always carried", async () => {
    vi.stubEnv("SURVEY_SEND_MODE", "canary");
    await conclude(LISTED);
    expect(h.sent).toEqual([
      {
        name: "appointment/completed",
        data: {
          appointmentId: APPT,
          tenantId: TENANT,
          endsAt: ENDS_AT.toISOString(),
          ...(surveyOnly ? { surveyOnly: true } : {}),
        },
      },
    ]);
  });

  it("on: ONE event for every patient, listed or not", async () => {
    vi.stubEnv("SURVEY_SEND_MODE", "on");
    await conclude(UNLISTED);
    await conclude(LISTED);
    expect(h.sent.map((e) => [e.name, e.data.surveyOnly])).toEqual([
      ["appointment/completed", surveyOnly],
      ["appointment/completed", surveyOnly],
    ]);
  });
});

describe("R37: the follow-up approved one day, off starts the ordinary run again and never a correction's", () => {
  it("off, a follow-up body approved: the Estado save sends the event, Corrigir estado does not", async () => {
    vi.stubEnv("SURVEY_SEND_MODE", "off");
    h.followUpApproved = true;
    await concludeByEstado(LISTED);
    await concludeByCorrection(LISTED);
    expect(h.sent.map((e) => [e.name, e.data.surveyOnly])).toEqual([["appointment/completed", undefined]]);
  });

  it("CONTROL: the same two, unapproved: nothing", async () => {
    vi.stubEnv("SURVEY_SEND_MODE", "off");
    await concludeByEstado(LISTED);
    await concludeByCorrection(LISTED);
    expect(h.sent).toEqual([]);
  });
});

describe("R37 leaves the no-show event alone", () => {
  it("Falta through the Estado save still sends appointment/noshow, under every mode", async () => {
    for (const mode of ["off", "canary", "on"]) {
      vi.stubEnv("SURVEY_SEND_MODE", mode);
      setRow("confirmed", UNLISTED);
      expect((await updateAppointment(APPT, { status: "no_show" })).ok).toBe(true);
    }
    expect(h.sent.map((e) => e.name)).toEqual(["appointment/noshow", "appointment/noshow", "appointment/noshow"]);
  });
});
