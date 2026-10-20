/**
 * confirmation-resend-rule.test.ts - Q-K: WHAT A STAFF SAVE OF A CONFIRMED
 * PORTAL APPOINTMENT RE-SENDS TO THE PATIENT.
 *
 * THE FINDING. Changing the Terapeuta (or the hour) of a confirmed portal
 * appointment more than 24 hours after its last confirmation sent today's
 * "Marcação confirmada" again, by email AND SMS together. A row brought back
 * from Cancelada to Confirmada did the same. Only Inngest's 24 hour duplicate
 * key (appointment + start) stopped a repeat, so an identical re-save a day
 * later sent the pair again, and a change of Terapeuta inside the day was
 * dropped and never told.
 *
 * STRATEGY'S RULING, as built:
 *   (1) a change of START TIME always notifies; the duplicate key carries the
 *       start AND the therapist, so a real change is never swallowed, and an
 *       identical re-save sends nothing;
 *   (2) a THERAPIST-ONLY change sends the EMAIL only, the SMS only when the
 *       patient has no usable email (no address, or email off for the clinic
 *       or for the patient);
 *   (3) Cancelada back to Confirmada keeps today's send.
 * And, from the first review: a change of CLINIC sends the full confirmation,
 * because the message names the clinic.
 *
 * WHAT IS REAL HERE. The two server actions (`rescheduleAppointment`, through
 * the ficha's own `therapistChangeInput` where the Terapeuta changes, and
 * `updateAppointment`), the enqueue, the event payloads, the confirmation key
 * expression, the Inngest function's handler and the dispatch are the real
 * code. Modelled: the transaction (a fake that serves one row), the call that
 * leaves the process (`inngest.send`, captured), the providers (captured), and
 * Inngest's duplicate key: a key seen once inside one 24 hour window is dropped
 * the second time. A window is one call to `deliver`, so "a day later" is a
 * second call with a fresh window.
 *
 * WHAT IS NOT. The key is a SETTING: it is live only after the owner presses
 * Resync on the Inngest app. Until then Inngest still keys on appointment +
 * start, which the "with the old key" arms reproduce.
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

type Sent = { templateId: string };
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
      h.email.push({ templateId: m.templateId });
      return { channel: "email" as const, sandbox: false, id: "test-email" };
    }),
    sendSms: vi.fn(async (m: Parameters<typeof actual.sendSms>[0]) => {
      h.sms.push({ templateId: m.templateId });
      return { channel: "sms" as const, sandbox: false, id: "test-sms" };
    }),
  };
});

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import type { RequestContext } from "@osteojp/auth";
import { rescheduleAppointment, updateAppointment } from "@/lib/scheduling/actions";
import { enqueueRemindersAfterCommit } from "@/lib/scheduling/reminders";
import { therapistChangeInput } from "@/lib/scheduling/therapist-change";
import { planConfirmationChannels } from "./dispatch";
import {
  CONFIRMATION_IDEMPOTENCY_KEY,
  CONFIRMATION_TRIGGER_FILTER,
  sendAppointmentConfirmation,
} from "./inngest/functions";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);

const TENANT = "11111111-1111-4111-8111-111111111111";
const APPT = "22222222-2222-4222-8222-222222222222";
const PATIENT = "33333333-3333-4333-8333-333333333333";
const ANA = "therapist-ana";
const RUI = "therapist-rui";
const actor: RequestContext = { tenantId: TENANT, role: "reception", userId: "user-1" };

/** Far enough out that the appointment is in the future. Pinned hours. */
const ORIGINAL = new Date("2031-05-14T10:00:00.000Z");
const LATER = new Date("2031-05-14T15:00:00.000Z");
const hourAfter = (d: Date) => new Date(d.getTime() + 60 * 60_000);

/** The confirmation key exactly as it stood before Q-K, for the control arms. */
const KEY_BEFORE_QK = 'event.data.appointmentId + ":confirmation:" + event.data.startsAt';

/** The one row the fake transaction serves: a confirmed portal appointment. */
let rowState = {
  id: APPT,
  startsAt: ORIGINAL,
  endsAt: hourAfter(ORIGINAL),
  practitionerId: ANA,
  practitionerTwoId: null as string | null,
  patientId: PATIENT,
  locationId: "loc-1",
  room: null as string | null,
  status: "confirmed",
  recurrenceParentId: null,
};

function fakeTx() {
  return {
    // No row is an unaccepted pedido: the appointment is confirmed.
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

/** The booking's own confirmation event, as createAppointment emits it. */
async function booked() {
  await enqueueRemindersAfterCommit(TENANT, [{ appointmentId: APPT, startsAt: ORIGINAL, practitionerId: ANA }]);
}

/** A move through the agenda's action. The fake does not persist, so the row is moved here. */
async function move(to: { startsAt?: Date; practitionerId?: string; durationMin?: number; locationId?: string }) {
  const startsAt = to.startsAt ?? rowState.startsAt;
  const minutes = to.durationMin ?? 60;
  const result = await rescheduleAppointment(APPT, {
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + minutes * 60_000).toISOString(),
    practitionerId: to.practitionerId ?? rowState.practitionerId,
    locationId: to.locationId ?? rowState.locationId,
  });
  expect(result).toEqual({ ok: true, data: { id: APPT } });
  rowState = {
    ...rowState,
    startsAt,
    endsAt: new Date(startsAt.getTime() + minutes * 60_000),
    practitionerId: to.practitionerId ?? rowState.practitionerId,
    locationId: to.locationId ?? rowState.locationId,
  };
}

/** The ficha's Terapeuta field (MARC-THERAPIST-01), sent the way the field sends it. */
async function changeTherapistFromFicha(to: string) {
  const listed = {
    practitionerId: rowState.practitionerId,
    practitionerName: "Dra Inventada",
    practitionerTwoId: rowState.practitionerTwoId,
    locationId: rowState.locationId,
    startsAt: rowState.startsAt.toISOString(),
    endsAt: rowState.endsAt.toISOString(),
  };
  const result = await rescheduleAppointment(APPT, therapistChangeInput(listed, to));
  expect(result).toEqual({ ok: true, data: { id: APPT } });
  rowState = { ...rowState, practitionerId: to };
}

/* ------------------------- a small model of Inngest ------------------------- */

/** Evaluate a `+` chain of `event.data.<field>` reads and quoted literals; throw on anything else. */
function evaluateKey(expression: string, data: Record<string, unknown>): string {
  return expression
    .split("+")
    .map((part) => part.trim())
    .map((part) => {
      const field = /^event\.data\.([A-Za-z]+)$/.exec(part);
      if (field) {
        // A key that reads a field the event lacks is a key nobody measured.
        if (!(field[1]! in data)) throw new Error(`the key reads event.data.${field[1]}, which this event lacks`);
        return String(data[field[1]!]);
      }
      const literal = /^"([^"]*)"$/.exec(part) ?? /^'([^']*)'$/.exec(part);
      if (literal) return literal[1]!;
      throw new Error(`cannot evaluate idempotency key part ${JSON.stringify(part)}`);
    })
    .join("");
}

/**
 * Deliver events to send-appointment-confirmation inside ONE 24 hour window:
 * the trigger filter, then the duplicate key. Returns the events whose run
 * STARTED and the keys that were dropped.
 */
function deliver(events: { name: string; data: Record<string, unknown> }[], key = CONFIRMATION_IDEMPOTENCY_KEY) {
  expect(CONFIRMATION_TRIGGER_FILTER).toBe("event.data.confirmationEligible == true");
  const seen = new Set<string>();
  const runs: Record<string, unknown>[] = [];
  const dropped: string[] = [];
  for (const e of events) {
    if (e.name !== "appointment/scheduled" || e.data.confirmationEligible !== true) continue;
    const k = evaluateKey(key, e.data);
    if (seen.has(k)) dropped.push(k);
    else {
      seen.add(k);
      runs.push(e.data);
    }
  }
  return { runs, dropped };
}

/** Run the REAL handler of send-appointment-confirmation for one event. */
async function runConfirmation(data: Record<string, unknown>) {
  const handler = (
    sendAppointmentConfirmation as unknown as {
      fn: (ctx: {
        event: { data: Record<string, unknown> };
        step: { run: (name: string, f: () => unknown) => unknown };
      }) => Promise<unknown>;
    }
  ).fn;
  return handler({ event: { data }, step: { run: (_name, f) => f() } });
}

/** What the patient receives for the events of one save, in a fresh window. */
async function received(events = h.sent) {
  h.email.length = 0;
  h.sms.length = 0;
  for (const run of deliver(events).runs) await runConfirmation(run);
  return { email: h.email.map((m) => m.templateId), sms: h.sms.map((m) => m.templateId) };
}

/** The row the dispatch reads: a confirmed portal appointment. */
function dispatchRow(
  contact: { email?: boolean; patientEmailOn?: boolean; clinicEmailOn?: boolean } = {},
) {
  return {
    appointmentId: APPT,
    startsAt: rowState.startsAt,
    status: "confirmed",
    confirmationState: "pending",
    origin: "patient_portal",
    patientId: PATIENT,
    patientName: "Paciente Exemplo",
    patientEmail: contact.email === false ? null : "paciente@example.test",
    patientPhone: "+351 912 000 001",
    patientReminderSmsEnabled: true,
    patientReminderEmailEnabled: contact.patientEmailOn !== false,
    patientDeletedAt: null,
    patientHasAcceptedTerms: false,
    practitionerName: "Dra Inventada",
    locationName: "Castelo Branco",
    locationPhone: "+351 272 111 111",
    locationAddress: "Rua de Exemplo 1, 6000-000 Castelo Branco",
    serviceName: "Osteopatia",
    tenantSettings:
      contact.clinicEmailOn === false ? { locale: "pt", reminders: { emailEnabled: false } } : { locale: "pt" },
  };
}

beforeEach(() => {
  h.sent.length = 0;
  h.email.length = 0;
  h.sms.length = 0;
  h.loadReminderData.mockReset();
  h.loadReminderData.mockImplementation(async () => dispatchRow());
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockCtx.mockResolvedValue(actor);
  mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(fakeTx() as never)));
  rowState = {
    ...rowState,
    startsAt: ORIGINAL,
    endsAt: hourAfter(ORIGINAL),
    practitionerId: ANA,
    locationId: "loc-1",
    status: "confirmed",
  };
  process.env.REMINDERS_LINK_SECRET = "test-only-link-secret-not-prod";
  process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://app.example.test";
  delete process.env.REMINDERS_LIVE_SEND;
  delete process.env.BOOK_CONFIRM_MODE;
});

/* ================================================================== */

describe("the model can fail: the key in force decides what is dropped", () => {
  it("with the key as it was before Q-K, a therapist change inside the day is DROPPED", async () => {
    await booked();
    await changeTherapistFromFicha(RUI);
    const { runs, dropped } = deliver(h.sent, KEY_BEFORE_QK);
    expect(runs).toHaveLength(1);
    expect(dropped).toEqual([`${APPT}:confirmation:${ORIGINAL.toISOString()}`]);
  });

  it("an event without a therapist cannot be keyed: the model refuses rather than guesses", () => {
    expect(() =>
      deliver([
        {
          name: "appointment/scheduled",
          data: { appointmentId: APPT, startsAt: ORIGINAL.toISOString(), confirmationEligible: true },
        },
      ]),
    ).toThrow(/practitionerId/);
  });
});

describe("rule 1: a change of START TIME always notifies, email and SMS", () => {
  it("the move emits a full confirmation: no therapist-only marker, the therapist in the payload", async () => {
    await move({ startsAt: LATER });
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.data).toEqual({
      appointmentId: APPT,
      tenantId: TENANT,
      startsAt: LATER.toISOString(),
      practitionerId: ANA,
      confirmationEligible: true,
    });
  });

  it("the patient receives today's pair", async () => {
    await move({ startsAt: LATER });
    expect(await received()).toEqual({ email: ["confirmation.email"], sms: ["confirmation.sms"] });
  });

  it("inside the same day as the booking's confirmation it is NOT swallowed: the start is in the key", async () => {
    await booked();
    await move({ startsAt: LATER });
    const { runs, dropped } = deliver(h.sent);
    expect(dropped).toEqual([]);
    expect(runs.map((r) => r.startsAt)).toEqual([ORIGINAL.toISOString(), LATER.toISOString()]);
  });

  it("a new start AND a new therapist in one save is a start change: the full pair", async () => {
    await move({ startsAt: LATER, practitionerId: RUI });
    expect("therapistChangeOnly" in h.sent[0]!.data).toBe(false);
    expect(await received()).toEqual({ email: ["confirmation.email"], sms: ["confirmation.sms"] });
  });
});

describe("rule 2: a THERAPIST-ONLY change sends the EMAIL only; the SMS only without an email", () => {
  it("the ficha's Terapeuta field emits the marker and the new therapist", async () => {
    await changeTherapistFromFicha(RUI);
    expect(h.sent).toEqual([
      {
        name: "appointment/scheduled",
        data: {
          appointmentId: APPT,
          tenantId: TENANT,
          startsAt: ORIGINAL.toISOString(),
          practitionerId: RUI,
          confirmationEligible: true,
          therapistChangeOnly: true,
        },
      },
    ]);
  });

  it("the agenda's edit panel (same action, Terapeuta changed) does the same", async () => {
    await move({ practitionerId: RUI });
    expect(h.sent[0]!.data).toMatchObject({ practitionerId: RUI, therapistChangeOnly: true });
  });

  it("a patient WITH an email receives the email and NO SMS", async () => {
    await changeTherapistFromFicha(RUI);
    expect(await received()).toEqual({ email: ["confirmation.email"], sms: [] });
  });

  it("a patient with NO email receives the SMS", async () => {
    h.loadReminderData.mockImplementation(async () => dispatchRow({ email: false }));
    await changeTherapistFromFicha(RUI);
    expect(await received()).toEqual({ email: [], sms: ["confirmation.sms"] });
  });

  it("an email on file that the PATIENT switched off is no usable email: the SMS", async () => {
    h.loadReminderData.mockImplementation(async () => dispatchRow({ patientEmailOn: false }));
    await changeTherapistFromFicha(RUI);
    expect(await received()).toEqual({ email: [], sms: ["confirmation.sms"] });
  });

  it("an email on file with email reminders off for the CLINIC is no usable email: the SMS", async () => {
    h.loadReminderData.mockImplementation(async () => dispatchRow({ clinicEmailOn: false }));
    await changeTherapistFromFicha(RUI);
    expect(await received()).toEqual({ email: [], sms: ["confirmation.sms"] });
  });

  it("inside the same day as the booking's confirmation it is NOT swallowed: the therapist is in the key", async () => {
    await booked();
    await changeTherapistFromFicha(RUI);
    const { runs, dropped } = deliver(h.sent);
    expect(dropped).toEqual([]);
    expect(runs).toHaveLength(2);
    expect(runs[1]).toMatchObject({ practitionerId: RUI, therapistChangeOnly: true });
  });
});

describe("a change of CLINIC sends the full confirmation: the message names the clinic", () => {
  it("the clinic only, same start and therapist: email and SMS, no therapist-only marker", async () => {
    await move({ locationId: "loc-2" });
    expect(h.sent[0]!.data).toEqual({
      appointmentId: APPT,
      tenantId: TENANT,
      startsAt: ORIGINAL.toISOString(),
      practitionerId: ANA,
      confirmationEligible: true,
    });
    expect(await received()).toEqual({ email: ["confirmation.email"], sms: ["confirmation.sms"] });
  });

  it("the clinic AND the therapist at the same start: the full pair too, not the email alone", async () => {
    await move({ locationId: "loc-2", practitionerId: RUI });
    expect(h.sent[0]!.data).toMatchObject({ practitionerId: RUI, confirmationEligible: true });
    expect("therapistChangeOnly" in h.sent[0]!.data).toBe(false);
    expect(await received()).toEqual({ email: ["confirmation.email"], sms: ["confirmation.sms"] });
  });
});

describe("rule 3: Cancelada back to Confirmada keeps today's send", () => {
  beforeEach(() => {
    rowState = { ...rowState, status: "cancelled" };
  });

  it("emits a full confirmation, no therapist-only marker", async () => {
    expect((await updateAppointment(APPT, { status: "confirmed" })).ok).toBe(true);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.data).toEqual({
      appointmentId: APPT,
      tenantId: TENANT,
      startsAt: ORIGINAL.toISOString(),
      practitionerId: ANA,
      confirmationEligible: true,
    });
  });

  it("and the patient receives today's pair, email and SMS", async () => {
    await updateAppointment(APPT, { status: "confirmed" });
    expect(await received()).toEqual({ email: ["confirmation.email"], sms: ["confirmation.sms"] });
  });
});

describe("an IDENTICAL re-save sends nothing", () => {
  it("same start, same therapist: the event goes out for the reminders, but carries no confirmation", async () => {
    await move({});
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.data.confirmationEligible).toBe(false);
    expect(await received()).toEqual({ email: [], sms: [] });
  });

  it("a DAY LATER too, which is the finding: with the old key and no rule the pair went again", async () => {
    await booked();
    expect(await received()).toEqual({ email: ["confirmation.email"], sms: ["confirmation.sms"] });

    // More than 24 hours on: a fresh window, so no key from the booking is
    // remembered. Only the save's own decision can stop a repeat.
    h.sent.length = 0;
    await move({});
    expect(deliver(h.sent, KEY_BEFORE_QK).runs).toEqual([]);
    expect(await received()).toEqual({ email: [], sms: [] });
  });

  it("the edit panel changing only the DURATION is the same save: nothing is sent", async () => {
    await move({ durationMin: 45 });
    expect(h.sent.map((e) => e.data.confirmationEligible)).toEqual([false]);
    expect(await received()).toEqual({ email: [], sms: [] });
  });

  it("changing the therapist and then saving again unchanged: one email, then nothing", async () => {
    await changeTherapistFromFicha(RUI);
    await changeTherapistFromFicha(RUI);
    expect(h.sent.map((e) => e.data.confirmationEligible)).toEqual([true, false]);
    expect(await received()).toEqual({ email: ["confirmation.email"], sms: [] });
  });
});

describe("a START-TIME change AFTER a therapist change still notifies", () => {
  it("therapist first (email only), then the hour (the full pair), and nothing is dropped", async () => {
    await booked();
    await changeTherapistFromFicha(RUI);
    await move({ startsAt: LATER });

    expect(h.sent.map((e) => e.data)).toEqual([
      expect.objectContaining({ startsAt: ORIGINAL.toISOString(), practitionerId: ANA, confirmationEligible: true }),
      expect.objectContaining({
        startsAt: ORIGINAL.toISOString(),
        practitionerId: RUI,
        confirmationEligible: true,
        therapistChangeOnly: true,
      }),
      expect.objectContaining({ startsAt: LATER.toISOString(), practitionerId: RUI, confirmationEligible: true }),
    ]);
    expect("therapistChangeOnly" in h.sent[2]!.data).toBe(false);
    expect(deliver(h.sent).dropped).toEqual([]);

    // What the patient receives for the hour change on its own.
    expect(await received([h.sent[2]!])).toEqual({ email: ["confirmation.email"], sms: ["confirmation.sms"] });
  });
});

/**
 * KNOWN RESIDUAL OF THE RULED KEY (Q-K review, round 1; put to strategy).
 *
 * The key is appointment + start + therapist, as ruled. Inside its 24 hours it
 * drops ANY confirmation whose start and therapist were already confirmed for
 * this appointment, so a change that RETURNS to an earlier pair is swallowed
 * and the patient's last message names the pair they are no longer booked
 * for. These arms pin that as it stands: if the key's composition changes,
 * they fail and the change is visible.
 */
describe("KNOWN RESIDUAL: a change back to an earlier start and therapist within 24 hours is dropped", () => {
  it("Terapeuta A to B and back to A: the return to A is dropped", async () => {
    await booked();
    await changeTherapistFromFicha(RUI);
    await changeTherapistFromFicha(ANA);
    // The save asked for a confirmation each time...
    expect(h.sent.map((e) => e.data.confirmationEligible)).toEqual([true, true, true]);
    // ...and the key drops the third, which repeats the booking's pair.
    const { runs, dropped } = deliver(h.sent);
    expect(runs.map((r) => r.practitionerId)).toEqual([ANA, RUI]);
    expect(dropped).toEqual([`${APPT}:confirmation:${ORIGINAL.toISOString()}:${ANA}`]);
  });

  it("10:00 to 15:00 and back to 10:00: the return is dropped, although rule 1 says a start change notifies", async () => {
    await booked();
    await move({ startsAt: LATER });
    await move({ startsAt: ORIGINAL });
    const { runs, dropped } = deliver(h.sent);
    expect(runs.map((r) => r.startsAt)).toEqual([ORIGINAL.toISOString(), LATER.toISOString()]);
    expect(dropped).toEqual([`${APPT}:confirmation:${ORIGINAL.toISOString()}:${ANA}`]);
  });

  it("after 24 hours the same return is sent: the residual is the key's window, not the save's decision", async () => {
    await booked();
    await changeTherapistFromFicha(RUI);
    h.sent.length = 0;
    await changeTherapistFromFicha(ANA);
    expect(deliver(h.sent).runs).toHaveLength(1);
  });
});

/* ================================================================== */

describe("planConfirmationChannels: the legs of today's confirmation", () => {
  const all = {
    hasEmail: true,
    hasPhone: true,
    tenantEmailEnabled: true,
    tenantSmsEnabled: true,
    patientEmailEnabled: true,
    patientSmsEnabled: true,
    therapistChangeOnly: false,
  };

  it("a booking, a new start, an uncancel: both legs, as always", () => {
    expect(planConfirmationChannels(all)).toEqual({ email: true, sms: true });
  });

  it("a therapist-only change with an email on file: the email alone", () => {
    expect(planConfirmationChannels({ ...all, therapistChangeOnly: true })).toEqual({ email: true, sms: false });
  });

  it("a therapist-only change with NO email on file: the SMS", () => {
    expect(planConfirmationChannels({ ...all, therapistChangeOnly: true, hasEmail: false })).toEqual({
      email: false,
      sms: true,
    });
  });

  it("a therapist-only change with the PATIENT's email switched off: no usable email, so the SMS", () => {
    expect(planConfirmationChannels({ ...all, therapistChangeOnly: true, patientEmailEnabled: false })).toEqual({
      email: false,
      sms: true,
    });
  });

  it("a therapist-only change with the CLINIC's email reminders off: no usable email, so the SMS", () => {
    expect(planConfirmationChannels({ ...all, therapistChangeOnly: true, tenantEmailEnabled: false })).toEqual({
      email: false,
      sms: true,
    });
  });

  it("a therapist-only change with no usable email AND the SMS off: nothing (the SMS keeps its own conditions)", () => {
    expect(
      planConfirmationChannels({ ...all, therapistChangeOnly: true, patientEmailEnabled: false, tenantSmsEnabled: false }),
    ).toEqual({ email: false, sms: false });
    expect(
      planConfirmationChannels({ ...all, therapistChangeOnly: true, tenantEmailEnabled: false, hasPhone: false }),
    ).toEqual({ email: false, sms: false });
  });

  it("the switches still hold every leg", () => {
    expect(planConfirmationChannels({ ...all, tenantSmsEnabled: false })).toEqual({ email: true, sms: false });
    expect(planConfirmationChannels({ ...all, patientSmsEnabled: false })).toEqual({ email: true, sms: false });
    expect(planConfirmationChannels({ ...all, tenantEmailEnabled: false })).toEqual({ email: false, sms: true });
    expect(
      planConfirmationChannels({ ...all, therapistChangeOnly: true, hasEmail: false, patientSmsEnabled: false }),
    ).toEqual({ email: false, sms: false });
  });
});
