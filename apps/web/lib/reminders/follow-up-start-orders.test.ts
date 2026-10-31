/**
 * follow-up-start-orders.test.ts - R37 and the SAT-01 canary, in BOTH ORDERS.
 *
 * Strategy's gate, verbatim: "The SAT-01 canary (owner, Mon or Tue) must work
 * whether it runs before or after this merges; show both orders."
 *
 * The owner switches SURVEY_SEND_MODE to `canary` with one patient on the list.
 * That can land before this cut is deployed or after it, and the canary must
 * reach the listed patient and nobody else either way:
 *
 *   ORDER 1, canary set BEFORE this merges. Under the old code every concluded
 *            visit started a run. Those runs are asleep when this code is
 *            deployed, and wake into it. The start was not cut for them, so
 *            the dispatch-time check (dispatch.ts, untouched) decides: the
 *            listed patient gets the survey, an unlisted one gets nothing.
 *   ORDER 2, canary set AFTER this merges. The cut decides at completion: the
 *            listed patient's visit starts a run, which wakes and sends the
 *            survey; an unlisted patient's visit starts nothing.
 *
 * And the consequence of "the mode is read when the visit is completed": a
 * visit concluded while the switch was off starts no run, and flipping to
 * canary afterwards does not give it one. That visit gets NO survey, so the
 * owner flips canary BEFORE the canary patient's visit is marked Concluida.
 *
 * WHAT "REACHES THE PATIENT" MEANS HERE. The two send functions are replaced
 * by recorders that apply the registry's approval, the one gate that holds
 * the follow-up back today: an approved body is DELIVERED, an unapproved one
 * is REFUSED. The live-send flag and the providers are not modelled; nothing
 * leaves this process. The run itself is the real Inngest handler, driven
 * with a step that runs at once, as ./survey-dispatch.test.ts drives it.
 *
 * Every name, address, id and phone number below is invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveApproved } from "@osteojp/notify";

const h = vi.hoisted(() => ({
  loadReminderData: vi.fn(),
  delivered: [] as string[],
  refused: [] as string[],
  ledger: [] as { templateId: string; suppressionReason?: string | null }[],
  events: [] as { name: string; data: Record<string, unknown> }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("./data", () => ({
  loadReminderData: h.loadReminderData,
  isGuestLinkedAppointment: vi.fn(async () => false),
}));
vi.mock("./clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clients")>();
  const { webRegistry } = await import("./notification-registry");
  const record = (channel: "email" | "sms", templateId: string) => {
    const approved = resolveApproved(webRegistry, templateId, channel) !== null;
    (approved ? h.delivered : h.refused).push(templateId);
    return { channel, sandbox: !approved, id: `test-${channel}-${h.delivered.length + h.refused.length}` };
  };
  return {
    ...actual,
    sendEmail: vi.fn(async (m: { templateId: string }) => record("email", m.templateId)),
    sendSms: vi.fn(async (m: { templateId: string }) => record("sms", m.templateId)),
  };
});
vi.mock("./dispatch-ledger", () => ({
  HANDED_OVER_WHILE_LIVE_SEND_OFF: "live_send_disabled",
  recordDispatch: vi.fn(async (r: { templateId: string; suppressionReason?: string | null }) => {
    h.ledger.push(r);
  }),
  recordBookingApprovedHandOver: vi.fn(async () => {}),
  hasBookingApprovedHandOver: vi.fn(async () => false),
}));
vi.mock("@/lib/surveys/survey-store", () => ({
  issueSurveyAutomatic: vi.fn(async () => "issued"),
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
        h.events.push(e);
      }),
    },
  };
});

import { enqueueFollowUp } from "./index";
import { sendFollowUpNotification } from "./inngest/functions";

const TENANT = "11111111-1111-4111-8111-111111111111";
const APPT = "22222222-2222-4222-8222-222222222222";
const LISTED = "33333333-3333-4333-8333-333333333333";
const UNLISTED = "44444444-4444-4444-8444-444444444444";

const STARTS_AT = new Date(Date.UTC(2031, 4, 14, 13, 30, 0));
const ENDS_AT = new Date(Date.UTC(2031, 4, 14, 14, 15, 0));
/** The moment the run wakes: the visit's end plus 24 hours, and a little. */
const WAKE = new Date(Date.UTC(2031, 4, 15, 14, 15, 0));

function row(patientId: string) {
  return {
    appointmentId: APPT,
    startsAt: STARTS_AT,
    status: "completed",
    confirmationState: "confirmed",
    origin: "staff",
    patientId,
    patientName: "Madalena Sousa",
    patientEmail: "madalena@example.test",
    patientPhone: "+351 912 000 001",
    patientReminderSmsEnabled: true,
    patientReminderEmailEnabled: true,
    patientDeletedAt: null,
    patientHasAcceptedTerms: false,
    practitionerName: "Dr. Teste Ficticio",
    locationName: "OsteoJP (Montemor-o-Novo)",
    locationPhone: "926 714 926",
    locationAddress: "Rua Inventada 4, 7050-000 Montemor-o-Novo",
    serviceName: "Osteopatia",
    tenantSettings: { locale: "pt", contacts: { phone: "210 999 999" } },
  };
}

/** The event the OLD code sent for every concluded visit, whatever the switch said. */
const OLD_CODE_EVENT = { appointmentId: APPT, tenantId: TENANT, endsAt: ENDS_AT.toISOString() };

/** Wake a sleeping run: the real handler, its sleep and its step run at once. */
async function wake(data: Record<string, unknown>, patientId: string) {
  h.loadReminderData.mockResolvedValue(row(patientId));
  const step = {
    sleepUntil: async () => {},
    run: async (_id: string, fn: () => Promise<unknown>) => fn(),
  };
  const handler = (sendFollowUpNotification as unknown as {
    fn: (ctx: unknown) => Promise<Record<string, unknown>>;
  }).fn;
  return handler({ event: { id: "evt", ts: 1, data }, step });
}

/** Conclude a visit under the NEW code: the one sender, as both doors call it. */
const concludeNow = (patientId: string) =>
  enqueueFollowUp({ appointmentId: APPT, tenantId: TENANT, endsAt: ENDS_AT, patientId });

const setMode = (mode: "off" | "canary") => {
  vi.stubEnv("SURVEY_SEND_MODE", mode);
  vi.stubEnv("SURVEY_CANARY_PATIENT_IDS", LISTED);
};

beforeEach(() => {
  h.loadReminderData.mockReset();
  h.delivered.length = 0;
  h.refused.length = 0;
  h.ledger.length = 0;
  h.events.length = 0;
  vi.stubEnv("SURVEY_SEND_MODE", undefined);
  vi.stubEnv("SURVEY_CANARY_PATIENT_IDS", undefined);
  vi.stubEnv("REMINDERS_RESCHEDULE_BASE_URL", "https://app.jp.invalid");
  vi.stubEnv("TWILIO_SMS_FROM", "OsteoJP");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(WAKE);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("ORDER 1: canary set BEFORE this merges; runs the old code started wake into the new code", () => {
  it("the LISTED patient's old run delivers the survey, and nothing else", async () => {
    setMode("canary");
    const outcome = await wake(OLD_CODE_EVENT, LISTED);
    expect(outcome).toMatchObject({ appointmentId: APPT, dispatched: true });
    expect(h.delivered).toEqual(["survey.email"]);
    expect(h.refused).toEqual([]);
  });

  it("an UNLISTED patient's old run delivers nothing: no survey, and the follow-up is refused by its approval", async () => {
    setMode("canary");
    await wake(OLD_CODE_EVENT, UNLISTED);
    expect(h.delivered).toEqual([]);
    expect(h.refused).toEqual(["follow_up.email", "follow_up.sms"]);
    expect(h.ledger.map((r) => r.suppressionReason)).toEqual(["survey_canary_not_listed"]);
  });

  it("and a visit concluded AFTER the merge, with canary already set, follows ORDER 2's start rule", async () => {
    setMode("canary");
    expect(await concludeNow(UNLISTED)).toBe(false);
    expect(await concludeNow(LISTED)).toBe(true);
    expect(h.events).toHaveLength(1);
  });
});

describe("ORDER 2: canary set AFTER this merges; the cut decides at completion", () => {
  it("the LISTED patient's completion starts the run, and the run delivers the survey", async () => {
    setMode("canary");
    expect(await concludeNow(LISTED)).toBe(true);
    const event = h.events[0]!;
    expect(event.name).toBe("appointment/completed");
    const outcome = await wake(event.data, LISTED);
    expect(outcome).toMatchObject({ appointmentId: APPT, dispatched: true });
    expect(h.delivered).toEqual(["survey.email"]);
  });

  it("an UNLISTED patient's completion starts nothing: no event, so no run and no row", async () => {
    setMode("canary");
    expect(await concludeNow(UNLISTED)).toBe(false);
    expect(h.events).toEqual([]);
    expect(h.delivered).toEqual([]);
    expect(h.ledger).toEqual([]);
  });

  it("before the flip, with the switch off, no completion starts a run at all", async () => {
    setMode("off");
    expect(await concludeNow(LISTED)).toBe(false);
    expect(await concludeNow(UNLISTED)).toBe(false);
    expect(h.events).toEqual([]);
  });
});

describe("the mode is read at completion: concluded while off, flipped to canary later, NO survey", () => {
  it("the listed patient's visit concluded under off has no run to wake, whatever the switch says later", async () => {
    setMode("off");
    expect(await concludeNow(LISTED)).toBe(false);
    setMode("canary");
    // Nothing to wake: the event was never sent. This visit gets no survey.
    expect(h.events).toEqual([]);
    expect(h.delivered).toEqual([]);
  });
});

describe("defence in depth: the dispatch still reads the mode when the run wakes", () => {
  it("started under canary for the listed patient, switched off before it wakes: nothing is delivered", async () => {
    setMode("canary");
    expect(await concludeNow(LISTED)).toBe(true);
    setMode("off");
    await wake(h.events[0]!.data, LISTED);
    expect(h.delivered).toEqual([]);
    expect(h.refused).toEqual(["follow_up.email", "follow_up.sms"]);
  });

  it("an old run woken with the switch off delivers nothing either", async () => {
    setMode("off");
    await wake(OLD_CODE_EVENT, LISTED);
    expect(h.delivered).toEqual([]);
  });
});
