/**
 * acceptance-after-reschedule.test.ts - A REQUEST MOVED BEFORE IT IS ACCEPTED
 * STILL GETS ITS CONFIRMATION AND ITS REMINDERS.
 *
 * THE DEFECT THIS CLOSED (found while building BOOK-CONFIRM, fixed 2026-10-03).
 * Reception moved an online request to another time BEFORE accepting it, then
 * accepted it within 24 hours:
 *
 *   1. `rescheduleAppointment` emitted `appointment/scheduled` for the request
 *      at its NEW start. It emitted for every row it moved.
 *   2. send-appointment-confirmation ran, answered `unconfirmed`, sent nothing,
 *      and SPENT its idempotency key: appointmentId + ":confirmation:" + startsAt.
 *      The fan-out spent the reminder keys the same way.
 *   3. The acceptance emitted for the SAME appointment at the SAME start. Every
 *      key was a duplicate inside Inngest's 24 hour window, so the confirmation
 *      run and both reminder runs were dropped. Nothing recorded an attempt.
 *
 * THE FIX IS UPSTREAM OF THE KEYS, WHICH ARE UNTOUCHED: a move (and an
 * un-cancel) of a row that is an unaccepted request at that moment emits
 * nothing. See `unconfirmedPedidoIdsAmong` in lib/scheduling/pedido-acceptance.ts.
 *
 * WHAT IS REAL HERE. The two server actions (`rescheduleAppointment`,
 * `confirmAppointmentRequest`), the enqueue, the event payloads, the key
 * expressions and the dispatch are the real code. Three things are modelled:
 * the transaction (a fake that answers the pedido probe from a list), the one
 * call that leaves the process (`inngest.send`, captured), and Inngest's
 * idempotency itself: a key seen once is dropped the second time. The model is
 * small enough to read, and its first arm proves it WOULD drop the acceptance
 * if the move still emitted, so the passing arms are not passing by blindness.
 *
 * The real `is_unconfirmed_pedido` answer is proven against Postgres in
 * lib/scheduling/pedido-move-emits.db.test.ts.
 *
 * Ids and names are invented.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/lib/scheduling/actor", () => ({ clientIp: vi.fn(async () => null) }));
vi.mock("@/lib/scheduling/audit", () => ({ writeAppointmentAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/scheduling/conflict", () => ({
  findConflicts: vi.fn(async () => []),
  findConflictsForWindow: vi.fn(async () => []),
  blockingConflicts: (c: unknown[]) => c,
}));
vi.mock("@/lib/notifications/centre", () => ({
  emitConfirmedNotification: vi.fn(async () => {}),
  emitRescheduledNotification: vi.fn(async () => {}),
  emitCancelledNotification: vi.fn(async () => {}),
  emitCareTeamAddedNotifications: vi.fn(async () => {}),
}));

type Sent = { templateId: string; to: string; body: string };
const h = vi.hoisted(() => ({
  sent: [] as { name: string; data: Record<string, unknown> }[],
  loadReminderData: vi.fn(),
  email: [] as Sent[],
  sms: [] as Sent[],
}));

vi.mock("./inngest/client", async () => {
  const actual = await vi.importActual<typeof import("./inngest/client")>("./inngest/client");
  return {
    ...actual,
    inngest: {
      ...actual.inngest,
      send: vi.fn(async (e: { name: string; data: Record<string, unknown> }) => {
        h.sent.push(e);
      }),
      createFunction: actual.inngest.createFunction.bind(actual.inngest),
    },
  };
});
vi.mock("./data", () => ({ loadReminderData: h.loadReminderData }));
vi.mock("./dispatch-ledger", () => ({
  HANDED_OVER_WHILE_LIVE_SEND_OFF: "live_send_disabled",
  recordDispatch: vi.fn(async () => {}),
  recordBookingApprovedHandOver: vi.fn(async () => {}),
  hasBookingApprovedHandOver: vi.fn(async () => false),
}));
vi.mock("./clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clients")>();
  return {
    ...actual,
    sendEmail: vi.fn(async (m: Parameters<typeof actual.sendEmail>[0]) => {
      h.email.push({ templateId: m.templateId, to: m.to, body: m.body });
      return { channel: "email" as const, sandbox: false, id: "test-email" };
    }),
    sendSms: vi.fn(async (m: Parameters<typeof actual.sendSms>[0]) => {
      h.sms.push({ templateId: m.templateId, to: m.to, body: m.body });
      return { channel: "sms" as const, sandbox: false, id: "test-sms" };
    }),
  };
});

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import type { RequestContext } from "@osteojp/auth";
import { confirmAppointmentRequest, rescheduleAppointment } from "@/lib/scheduling/actions";
import { enqueueRemindersAfterCommit } from "@/lib/scheduling/reminders";
import { dispatchConfirmation, dispatchReminder } from "./dispatch";
import {
  CONFIRMATION_IDEMPOTENCY_KEY,
  CONFIRMATION_TRIGGER_FILTER,
  REMINDER_IDEMPOTENCY_KEY,
} from "./inngest/functions";
import { computeDueReminders } from "./offsets";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);

const TENANT = "11111111-1111-4111-8111-111111111111";
const APPT = "22222222-2222-4222-8222-222222222222";
const PATIENT = "33333333-3333-4333-8333-333333333333";
const actor: RequestContext = { tenantId: TENANT, role: "reception", userId: "user-1" };

/** Far enough out that both reminder offsets are still ahead. Pinned hours. */
const ORIGINAL = new Date("2031-05-14T10:00:00.000Z");
const MOVED_ONCE = new Date("2031-05-15T10:00:00.000Z");
const MOVED_TWICE = new Date("2031-05-16T14:00:00.000Z");
const hourAfter = (d: Date) => new Date(d.getTime() + 60 * 60_000);

/** The one row the fake transaction serves, to both actions. */
let rowState = {
  id: APPT,
  startsAt: ORIGINAL,
  endsAt: hourAfter(ORIGINAL),
  practitionerId: "therapist-1",
  practitionerTwoId: null as string | null,
  patientId: PATIENT,
  locationId: "loc-1",
  room: null as string | null,
  status: "scheduled",
  recurrenceParentId: null,
};
/** What `is_unconfirmed_pedido` answers. The row is a pedido while it is on this list. */
let pedidoIds: string[] = [];

function fakeTx() {
  return {
    execute: async (q: unknown) => {
      const text = JSON.stringify(q ?? "");
      if (text.includes("is_unconfirmed_pedido")) return pedidoIds.map((id) => ({ id }));
      return [];
    },
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
      const chain: Record<string, unknown> = {
        from: () => chain,
        innerJoin: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        then: (resolve: (rows: unknown[]) => unknown) => resolve([]),
        limit: async () => [rowState],
      };
      return chain;
    },
    update: () => ({
      set: () => ({
        where: () => {
          const done = Promise.resolve([] as unknown[]);
          return Object.assign(done, { returning: async () => [{ id: APPT }] });
        },
      }),
    }),
    insert: () => ({ values: async () => [] }),
  };
}

/** Reception moves the row, through the real action. The fake does not persist, so the row is moved here. */
async function move(to: Date) {
  const result = await rescheduleAppointment(APPT, {
    startsAt: to.toISOString(),
    endsAt: hourAfter(to).toISOString(),
    practitionerId: "therapist-1",
    locationId: "loc-1",
  });
  expect(result).toEqual({ ok: true, data: { id: APPT } });
  rowState = { ...rowState, startsAt: to, endsAt: hourAfter(to) };
}

/** Reception accepts the request from the Pedidos queue, through the real action. */
async function accept() {
  const result = await confirmAppointmentRequest(APPT);
  expect(result.ok).toBe(true);
  rowState = { ...rowState, status: "confirmed" };
  pedidoIds = [];
}

/* ------------------------- a small model of Inngest ------------------------- */

/**
 * Evaluate a key expression for one event. The expressions are `+` chains of
 * `event.data.<field>` reads and quoted literals; this reads exactly that shape
 * and throws on anything else, so an expression it cannot read fails loudly.
 */
function evaluateKey(expression: string, data: Record<string, unknown>): string {
  return expression
    .split("+")
    .map((part) => part.trim())
    .map((part) => {
      const field = /^event\.data\.([A-Za-z]+)$/.exec(part);
      if (field) return String(data[field[1]!]);
      const literal = /^"([^"]*)"$/.exec(part) ?? /^'([^']*)'$/.exec(part);
      if (literal) return literal[1]!;
      throw new Error(`cannot evaluate idempotency key part ${JSON.stringify(part)}`);
    })
    .join("");
}

/**
 * Deliver the captured events in order, the way Inngest would inside one 24h
 * window: a run whose key was already seen is dropped. Returns what RAN.
 */
function deliver(events: { name: string; data: Record<string, unknown> }[]) {
  const seen = new Set<string>();
  const confirmationRuns: Record<string, unknown>[] = [];
  const reminderRuns: { offsetId: string; channel: string; sendAt: string }[] = [];
  const dropped: string[] = [];
  expect(CONFIRMATION_TRIGGER_FILTER).toBe("event.data.confirmationEligible == true");

  for (const [index, e] of events.entries()) {
    if (e.name !== "appointment/scheduled") continue;
    // A new appointment/scheduled cancels the sleeping reminder runs (cancelOn).
    reminderRuns.length = 0;

    if (e.data.confirmationEligible === true) {
      const key = `confirmation|${evaluateKey(CONFIRMATION_IDEMPOTENCY_KEY, e.data)}`;
      if (seen.has(key)) dropped.push(key);
      else {
        seen.add(key);
        confirmationRuns.push(e.data);
      }
    }
    // schedule-appointment-reminders fans out one reminder.due per offset.
    for (const due of computeDueReminders(new Date(String(e.data.startsAt)), new Date())) {
      const dueData = {
        appointmentId: e.data.appointmentId,
        offsetId: due.offsetId,
        channel: due.channel,
        sendAt: due.sendAt.toISOString(),
        // The id Inngest gave THIS appointment/scheduled event (functions.ts,
        // reminderScheduledBy). Without it the model would evaluate the key's
        // last term to "undefined" for every event and dedupe reminders the way
        // the key did before 2026-10-07, which the real configuration no longer
        // does.
        scheduledBy: `evt-${index}`,
      };
      const key = `reminder|${evaluateKey(REMINDER_IDEMPOTENCY_KEY, dueData)}`;
      if (seen.has(key)) dropped.push(key);
      else {
        seen.add(key);
        reminderRuns.push({ offsetId: due.offsetId, channel: due.channel, sendAt: dueData.sendAt });
      }
    }
  }
  return { confirmationRuns, reminderRuns, dropped };
}

const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  h.sent.length = 0;
  h.email.length = 0;
  h.sms.length = 0;
  h.loadReminderData.mockReset();
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockCtx.mockResolvedValue(actor);
  mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(fakeTx() as never)));
  rowState = { ...rowState, startsAt: ORIGINAL, endsAt: hourAfter(ORIGINAL), status: "scheduled" };
  pedidoIds = [APPT];
  saved.BOOK_CONFIRM_MODE = process.env.BOOK_CONFIRM_MODE;
  process.env.REMINDERS_LINK_SECRET = "test-only-link-secret-not-prod";
  process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://app.example.test";
  delete process.env.REMINDERS_LIVE_SEND;
  return () => {
    if (saved.BOOK_CONFIRM_MODE === undefined) delete process.env.BOOK_CONFIRM_MODE;
    else process.env.BOOK_CONFIRM_MODE = saved.BOOK_CONFIRM_MODE;
  };
});

/** The row the dispatch reads once the request is accepted at `startsAt`. */
function acceptedRow(startsAt: Date) {
  return {
    appointmentId: APPT,
    startsAt,
    status: "confirmed",
    confirmationState: "pending",
    origin: "patient_portal",
    patientId: PATIENT,
    patientName: "Madalena Inventada",
    patientEmail: "madalena@example.test",
    patientPhone: "+351 912 000 001",
    patientReminderSmsEnabled: true,
    patientReminderEmailEnabled: true,
    patientDeletedAt: null,
    patientHasAcceptedTerms: false,
    practitionerName: "Dra Inventada",
    locationName: "Castelo Branco",
    locationPhone: "+351 272 111 111",
    locationAddress: "Rua de Exemplo 1, 6000-000 Castelo Branco",
    serviceName: "Osteopatia",
    tenantSettings: { locale: "pt" },
  };
}

describe("the model drops a duplicate key, so the arms below are not passing by blindness", () => {
  it("IF the move still emitted, the acceptance's confirmation would be dropped (its reminders no longer are)", async () => {
    // The old behaviour, reproduced by hand: an event for the unaccepted
    // request at its new start, then the acceptance at that same start.
    await enqueueRemindersAfterCommit(TENANT, [{ appointmentId: APPT, startsAt: MOVED_ONCE }]);
    rowState = { ...rowState, startsAt: MOVED_ONCE, endsAt: hourAfter(MOVED_ONCE) };
    await accept();

    const { confirmationRuns, reminderRuns, dropped } = deliver(h.sent);
    // Only the FIRST event ran a confirmation, and it is the one that sends
    // nothing; the acceptance's confirmation run is dropped. Until 2026-10-07
    // both of its reminder runs were dropped with it (three in all): the
    // reminder key now carries the save, so they run.
    expect(confirmationRuns).toHaveLength(1);
    expect(confirmationRuns[0]!.acceptedPedido).toBeUndefined();
    expect(dropped).toEqual([`confirmation|${APPT}:confirmation:${MOVED_ONCE.toISOString()}`]);
    expect(reminderRuns).toHaveLength(2);
  });
});

describe("a request MOVED and then ACCEPTED gets its message and its reminders", () => {
  it("moving an unaccepted request emits nothing at all", async () => {
    await move(MOVED_ONCE);
    expect(h.sent).toEqual([]);
  });

  it("so the acceptance's keys are their first use: the confirmation runs, with the marker, at the new start", async () => {
    await move(MOVED_ONCE);
    await accept();

    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.data).toEqual({
      appointmentId: APPT,
      tenantId: TENANT,
      startsAt: MOVED_ONCE.toISOString(),
      confirmationEligible: true,
      acceptedPedido: true,
    });
    const { confirmationRuns, reminderRuns, dropped } = deliver(h.sent);
    expect(dropped).toEqual([]);
    expect(confirmationRuns).toHaveLength(1);
    expect(confirmationRuns[0]!.acceptedPedido).toBe(true);
    // Both reminders are scheduled, at the NEW start's offsets.
    expect(reminderRuns).toEqual([
      { offsetId: "48h", channel: "email", sendAt: new Date(MOVED_ONCE.getTime() - 48 * 3600_000).toISOString() },
      { offsetId: "24h", channel: "sms", sendAt: new Date(MOVED_ONCE.getTime() - 24 * 3600_000).toISOString() },
    ]);
  });

  it("and that run SENDS: the booking-approved email under the switch, today's pair without it", async () => {
    await move(MOVED_ONCE);
    await accept();
    const [run] = deliver(h.sent).confirmationRuns;
    h.loadReminderData.mockResolvedValue(acceptedRow(MOVED_ONCE));

    process.env.BOOK_CONFIRM_MODE = "on";
    expect(
      await dispatchConfirmation(TENANT, APPT, { acceptedPedido: run!.acceptedPedido === true }),
    ).toMatchObject({ dispatched: true });
    expect(h.email.map((m) => m.templateId)).toEqual(["booking_approved.email"]);
    expect(h.sms).toEqual([]);

    h.email.length = 0;
    process.env.BOOK_CONFIRM_MODE = "off";
    expect(
      await dispatchConfirmation(TENANT, APPT, { acceptedPedido: run!.acceptedPedido === true }),
    ).toMatchObject({ dispatched: true });
    expect(h.email.map((m) => m.templateId)).toEqual(["confirmation.email"]);
    expect(h.sms.map((m) => m.templateId)).toEqual(["confirmation.sms"]);
  });

  it("and both reminder runs dispatch once the request is accepted", async () => {
    h.loadReminderData.mockResolvedValue(acceptedRow(MOVED_ONCE));
    expect(await dispatchReminder(TENANT, APPT, "48h", "email")).toMatchObject({ dispatched: true });
    expect(await dispatchReminder(TENANT, APPT, "24h", "sms")).toMatchObject({ dispatched: true });
  });

  it("moved TWICE: still nothing emitted, and the acceptance schedules everything at the FINAL start", async () => {
    await move(MOVED_ONCE);
    await move(MOVED_TWICE);
    expect(h.sent).toEqual([]);
    await accept();

    const { confirmationRuns, reminderRuns, dropped } = deliver(h.sent);
    expect(dropped).toEqual([]);
    expect(confirmationRuns.map((r) => r.startsAt)).toEqual([MOVED_TWICE.toISOString()]);
    expect(reminderRuns.map((r) => r.sendAt)).toEqual([
      new Date(MOVED_TWICE.getTime() - 48 * 3600_000).toISOString(),
      new Date(MOVED_TWICE.getTime() - 24 * 3600_000).toISOString(),
    ]);
  });
});

describe("a moved ACCEPTED appointment re-emits exactly as before", () => {
  beforeEach(() => {
    // Accepted: the status has left `scheduled`, so it is no pedido.
    rowState = { ...rowState, status: "confirmed" };
    pedidoIds = [];
  });

  it("emits one appointment/scheduled at the new start, with the payload it always had", async () => {
    await move(MOVED_ONCE);
    expect(h.sent).toEqual([
      {
        name: "appointment/scheduled",
        data: {
          appointmentId: APPT,
          tenantId: TENANT,
          startsAt: MOVED_ONCE.toISOString(),
          confirmationEligible: true,
        },
      },
    ]);
    expect("acceptedPedido" in h.sent[0]!.data).toBe(false);
  });

  it("and that event supersedes: the reminders that remain are the NEW start's", async () => {
    // The acceptance's own event first, then the move.
    await enqueueRemindersAfterCommit(TENANT, [{ appointmentId: APPT, startsAt: ORIGINAL }]);
    await move(MOVED_ONCE);
    const { reminderRuns, dropped } = deliver(h.sent);
    expect(dropped).toEqual([]);
    expect(reminderRuns.map((r) => r.sendAt)).toEqual([
      new Date(MOVED_ONCE.getTime() - 48 * 3600_000).toISOString(),
      new Date(MOVED_ONCE.getTime() - 24 * 3600_000).toISOString(),
    ]);
  });

  it("a STAFF booking that is still Agendada re-emits on a move too: it is not a pedido", async () => {
    rowState = { ...rowState, status: "scheduled" };
    pedidoIds = [];
    await move(MOVED_ONCE);
    expect(h.sent).toHaveLength(1);
  });
});
