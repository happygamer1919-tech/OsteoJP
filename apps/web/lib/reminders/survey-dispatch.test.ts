/**
 * survey-dispatch.test.ts - SAT-01, the automatic send (spec 9.2).
 *
 * WHAT IS REAL HERE AND WHAT IS NOT. `dispatchSurvey`, `dispatchFollowUp`, the
 * switch, the channel plan, the templates, the body builder and the Inngest
 * function that calls them are the real code. Five seams are replaced, each
 * with something that RECORDS rather than something that agrees:
 *
 *   ./data                       the appointment row the dispatch reads
 *   ./clients                    the two send functions, which capture the message
 *   ./dispatch-ledger            an in-memory ledger
 *   @/lib/surveys/survey-store   the database's issue door, with a chosen answer
 *   @/lib/surveys/survey-code    the real generator, counted
 *
 * Every seam also writes one word to `h.order`, which is how the order of work
 * is read: the code, then the issue, then the provider.
 *
 * WHAT THIS FILE DOES NOT PROVE: anything the database decides (the 60-day
 * rule, the patient's own switch, an answered visit, the second patient of a
 * shared visit) and what a stored row holds. Those are
 * ./survey-dispatch.db.test.ts, against a real database.
 *
 * No provider is reachable from here: both send functions are replaced.
 * Every name, address and phone number below is invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Sent = { templateId: string; to: string; subject?: string; body: string };
type LedgerRow = {
  channel: string;
  templateId: string;
  outcome: string;
  suppressionReason?: string | null;
  bodyLength?: number | null;
  providerMessageId?: string | null;
  providerErrorCode?: string | null;
};

const h = vi.hoisted(() => ({
  loadReminderData: vi.fn(),
  email: [] as Sent[],
  sms: [] as Sent[],
  ledger: [] as LedgerRow[],
  codes: [] as string[],
  issues: [] as { channel: string; code: string; appointmentId: string; tenantId: string }[],
  issueAnswer: "issued" as string | Error,
  providerError: null as Error | null,
  order: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("./data", () => ({
  loadReminderData: h.loadReminderData,
  isGuestLinkedAppointment: vi.fn(async () => false),
}));
vi.mock("./clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clients")>();
  return {
    ...actual,
    sendEmail: vi.fn(async (m: Parameters<typeof actual.sendEmail>[0]) => {
      h.order.push("provider");
      if (h.providerError) throw h.providerError;
      h.email.push({ templateId: m.templateId, to: m.to, subject: m.subject, body: m.body });
      return { channel: "email" as const, sandbox: false, id: `test-email-${h.email.length}` };
    }),
    sendSms: vi.fn(async (m: Parameters<typeof actual.sendSms>[0]) => {
      h.order.push("provider");
      if (h.providerError) throw h.providerError;
      h.sms.push({ templateId: m.templateId, to: m.to, body: m.body });
      return { channel: "sms" as const, sandbox: false, id: `test-sms-${h.sms.length}` };
    }),
  };
});
vi.mock("./dispatch-ledger", () => ({
  HANDED_OVER_WHILE_LIVE_SEND_OFF: "live_send_disabled",
  recordDispatch: vi.fn(async (row: LedgerRow) => {
    h.order.push("ledger");
    h.ledger.push(row);
  }),
  recordBookingApprovedHandOver: vi.fn(async () => {}),
  hasBookingApprovedHandOver: vi.fn(async () => false),
}));
vi.mock("@/lib/surveys/survey-store", () => ({
  issueSurveyAutomatic: vi.fn(
    async (args: { channel: string; code: string; appointmentId: string; tenantId: string }) => {
      h.order.push("issue");
      h.issues.push(args);
      if (h.issueAnswer instanceof Error) throw h.issueAnswer;
      return h.issueAnswer;
    },
  ),
}));
vi.mock("@/lib/surveys/survey-code", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surveys/survey-code")>();
  return {
    ...actual,
    generateSurveyCode: vi.fn(() => {
      const code = actual.generateSurveyCode();
      h.order.push("code");
      h.codes.push(code);
      return code;
    }),
  };
});

import { isWellFormedSurveyCode } from "@/lib/surveys/survey-code";
import { ProviderSendError } from "./clients";
import {
  SURVEY_RENDER_REFUSAL,
  dispatchFollowUp,
  dispatchSurvey,
  planSurveyChannel,
} from "./dispatch";
import { sendFollowUpNotification } from "./inngest/functions";
import { SURVEY_SMS } from "./templates";

const TENANT = "11111111-1111-4111-8111-111111111111";
const APPT = "22222222-2222-4222-8222-222222222222";
const PATIENT = "33333333-3333-4333-8333-333333333333";
const OTHER_PATIENT = "44444444-4444-4444-8444-444444444444";

const LOCATION_PHONE = "926 714 926";
/** A tenant-level phone that is nobody's, so a fall-back to it would show. */
const TENANT_PHONE = "210 999 999";
/** A reserved host of 14 characters, the length of the deployed one. */
const ORIGIN = "https://app.jp.invalid";

/** 14/05 at 14:30 in Lisbon: a fixed wall-clock hour, far from any DST edge. */
const STARTS_AT = new Date(Date.UTC(2031, 4, 14, 13, 30, 0));
/**
 * The run wakes the next day. 15/05/2031 plus 14 days is 29/05/2031, the day
 * the link dies on, so the email prints the day before: 28/05/2031.
 */
const NOW = new Date(Date.UTC(2031, 4, 15, 14, 15, 0));

function row(over: Record<string, unknown> = {}) {
  return {
    appointmentId: APPT,
    startsAt: STARTS_AT,
    status: "completed",
    confirmationState: "confirmed",
    origin: "staff",
    patientId: PATIENT,
    patientName: "Madalena Sousa",
    patientEmail: "madalena@example.test",
    patientPhone: "+351 912 000 001",
    patientReminderSmsEnabled: true,
    patientReminderEmailEnabled: true,
    patientDeletedAt: null,
    patientHasAcceptedTerms: false,
    practitionerName: "Dr. Teste Ficticio",
    locationName: "OsteoJP (Montemor-o-Novo)",
    locationPhone: LOCATION_PHONE,
    locationAddress: "Rua Inventada 4, 7050-000 Montemor-o-Novo",
    serviceName: "Osteopatia",
    tenantSettings: { locale: "pt", contacts: { phone: TENANT_PHONE } },
    ...over,
  };
}

const ENV_KEYS = [
  "SURVEY_SEND_MODE",
  "SURVEY_CANARY_PATIENT_IDS",
  "REMINDERS_LIVE_SEND",
  "REMINDERS_LINK_SECRET",
  "REMINDERS_RESCHEDULE_BASE_URL",
  "REMINDERS_REPLY_CAPABLE",
  "TWILIO_SMS_FROM",
  "TWILIO_MESSAGING_SERVICE_SID",
] as const;
const saved: Record<string, string | undefined> = {};
let logged: string[] = [];

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.REMINDERS_RESCHEDULE_BASE_URL = ORIGIN;
  // The one-way sender id: the 24h reminder then appends "Nao lemos respostas."
  process.env.TWILIO_SMS_FROM = "OsteoJP";
  h.loadReminderData.mockReset();
  h.email.length = 0;
  h.sms.length = 0;
  h.ledger.length = 0;
  h.codes.length = 0;
  h.issues.length = 0;
  h.order.length = 0;
  h.issueAnswer = "issued";
  h.providerError = null;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  // Every line the dispatch logs, kept whole: nothing logged may carry a code.
  logged = [];
  for (const level of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    });
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const only = <T>(list: T[]): T => {
  expect(list).toHaveLength(1);
  return list[0]!;
};

/** Nothing of the survey ran: no code, no issue, no survey message, no row. */
function expectNoSurveyWork(): void {
  expect(h.codes).toEqual([]);
  expect(h.issues).toEqual([]);
  expect([...h.email, ...h.sms].filter((m) => m.templateId.startsWith("survey."))).toEqual([]);
}

/** The code never leaves the message: not a row, not a log line, not the outcome. */
function expectCodeNowhereButTheMessage(outcome: unknown): void {
  const code = only(h.codes);
  const stored = JSON.stringify(h.ledger) + JSON.stringify(outcome) + logged.join("\n");
  expect(stored).not.toContain(code);
  // No link either: `/s/` followed by anything shaped like a code.
  expect(stored).not.toMatch(/\/s\/[A-Za-z0-9_-]{8}/);
}

/* ==================================================================== */
/* The channel plan                                                      */
/* ==================================================================== */

describe("planSurveyChannel - one channel, email first, never both (S6)", () => {
  const all = {
    hasEmail: true,
    hasPhone: true,
    tenantEmailEnabled: true,
    tenantSmsEnabled: true,
    patientEmailEnabled: true,
    patientSmsEnabled: true,
  };
  it.each([
    ["everything allowed", {}, { send: "email" }],
    ["no email on file", { hasEmail: false }, { send: "sms" }],
    ["the patient's email switch off", { patientEmailEnabled: false }, { send: "sms" }],
    ["the clinic's email reminders off", { tenantEmailEnabled: false }, { send: "sms" }],
    ["no phone on file", { hasPhone: false }, { send: "email" }],
    [
      "no contact at all",
      { hasEmail: false, hasPhone: false },
      { send: "none", reason: "no_contact", channel: "email" },
    ],
    [
      "an email that may not be used and no phone",
      { patientEmailEnabled: false, hasPhone: false },
      { send: "none", reason: "channels_off", channel: "email" },
    ],
    [
      "a phone that may not be used and no email",
      { hasEmail: false, patientSmsEnabled: false },
      { send: "none", reason: "channels_off", channel: "sms" },
    ],
    [
      "both on file and both switched off by the patient",
      { patientEmailEnabled: false, patientSmsEnabled: false },
      { send: "none", reason: "channels_off", channel: "email" },
    ],
    [
      "both on file and both switched off by the clinic",
      { tenantEmailEnabled: false, tenantSmsEnabled: false },
      { send: "none", reason: "channels_off", channel: "email" },
    ],
  ])("%s", (_label, over, want) => {
    expect(planSurveyChannel({ ...all, ...over })).toEqual(want);
  });
});

/* ==================================================================== */
/* The switch off: exactly the follow-up of today                        */
/* ==================================================================== */

/** Every state the follow-up tells apart. */
const FOLLOW_UP_FIXTURES: [string, Record<string, unknown> | null][] = [
  ["a concluded visit, email and phone", {}],
  ["no email", { patientEmail: null }],
  ["no phone", { patientPhone: null }],
  ["no contact", { patientEmail: null, patientPhone: null }],
  ["both switches off", { patientReminderEmailEnabled: false, patientReminderSmsEnabled: false }],
  ["a landline", { patientEmail: null, patientPhone: "214 000 000" }],
  ["no longer concluded", { status: "scheduled" }],
  ["a removed patient", { patientDeletedAt: new Date(Date.UTC(2031, 4, 15)) }],
  ["an appointment that is not there", null],
  ["a location with no phone", { locationPhone: null }],
];

/** The values that read as off: unset, the word, and every near miss of on and canary. */
const OFF_VALUES: (string | undefined)[] = [undefined, "", "off", "ON", "On", " on", "on ", "on\n", "true", "1", "Canary", "canary "];

type Run = { outcome: unknown; email: Sent[]; sms: Sent[]; ledger: LedgerRow[]; reads: number; logged: string[] };

async function runOnce(fixture: Record<string, unknown> | null, call: () => Promise<unknown>): Promise<Run> {
  h.loadReminderData.mockReset();
  h.loadReminderData.mockResolvedValue(fixture === null ? null : row(fixture));
  h.email.length = 0;
  h.sms.length = 0;
  h.ledger.length = 0;
  logged.length = 0;
  const outcome = await call();
  return {
    outcome,
    email: [...h.email],
    sms: [...h.sms],
    ledger: [...h.ledger],
    reads: h.loadReminderData.mock.calls.length,
    logged: [...logged],
  };
}

describe("switch off: the 24-hour message is today's follow-up and nothing else", () => {
  it.each(FOLLOW_UP_FIXTURES)("%s: the same outcome, the same messages, no row", async (_label, fixture) => {
    const before = await runOnce(fixture, () => dispatchFollowUp(TENANT, APPT));

    for (const value of OFF_VALUES) {
      if (value === undefined) delete process.env.SURVEY_SEND_MODE;
      else process.env.SURVEY_SEND_MODE = value;
      // A list is set as well: with the switch off it must not matter.
      process.env.SURVEY_CANARY_PATIENT_IDS = PATIENT;

      const after = await runOnce(fixture, () => dispatchSurvey(TENANT, APPT));

      expect(after, `SURVEY_SEND_MODE=${JSON.stringify(value)}`).toEqual(before);
      expect(after.ledger).toEqual([]);
      expectNoSurveyWork();
    }
  });

  it("CONTROL: the comparison above is not two empty runs", async () => {
    const run = await runOnce({}, () => dispatchSurvey(TENANT, APPT));
    expect(run.outcome).toMatchObject({ dispatched: true });
    expect(run.email.map((m) => m.templateId)).toEqual(["follow_up.email"]);
    expect(run.sms.map((m) => m.templateId)).toEqual(["follow_up.sms"]);
    expect(run.reads).toBe(1);
  });
});

/* ==================================================================== */
/* Runs already asleep                                                   */
/* ==================================================================== */

/** The Inngest function's own handler, driven with a step that runs at once. */
async function wake(data: Record<string, unknown>) {
  const steps: string[] = [];
  const step = {
    sleepUntil: async (id: string, at: Date) => {
      steps.push(`sleepUntil:${id}:${at.toISOString()}`);
    },
    run: async (id: string, fn: () => Promise<unknown>) => {
      steps.push(`run:${id}`);
      return fn();
    },
  };
  const handler = (sendFollowUpNotification as unknown as {
    fn: (ctx: unknown) => Promise<Record<string, unknown>>;
  }).fn;
  const result = await handler({ event: { id: "evt-old", ts: 1, data }, step });
  return { result, steps };
}

describe("a run that went to sleep in the old code wakes into this one", () => {
  // The event an appointment concluded before this change carries: three
  // fields, and nothing about a survey.
  const OLD_EVENT = { appointmentId: APPT, tenantId: TENANT, endsAt: "2031-05-14T14:15:00.000Z" };

  it.each(FOLLOW_UP_FIXTURES)("switch off, %s: it does what it would have done", async (_label, fixture) => {
    const before = await runOnce(fixture, () => dispatchFollowUp(TENANT, APPT));

    let steps: string[] = [];
    const after = await runOnce(fixture, async () => {
      const woken = await wake(OLD_EVENT);
      steps = woken.steps;
      return woken.result;
    });

    // The same two steps under the same names, the sleep to the same instant.
    expect(steps).toEqual([
      "sleepUntil:wait-24h-after-visit:2031-05-15T14:15:00.000Z",
      "run:dispatch-follow-up",
    ]);
    expect(after.outcome).toEqual({ appointmentId: APPT, ...(before.outcome as object) });
    expect({ ...after, outcome: null }).toEqual({ ...before, outcome: null });
    expect(after.ledger).toEqual([]);
    expectNoSurveyWork();
  });

  it("switch on: the same run sends the survey instead, and no follow-up", async () => {
    process.env.SURVEY_SEND_MODE = "on";
    h.loadReminderData.mockResolvedValue(row());

    const { result } = await wake(OLD_EVENT);

    expect(result).toMatchObject({ appointmentId: APPT, dispatched: true });
    expect(h.email.map((m) => m.templateId)).toEqual(["survey.email"]);
    expect(h.sms).toEqual([]);
  });
});

/* ==================================================================== */
/* The switch on: the matrix of spec 9.2                                 */
/* ==================================================================== */

describe("switch on: the survey goes instead of the follow-up", () => {
  beforeEach(() => {
    process.env.SURVEY_SEND_MODE = "on";
  });

  it("both channels allowed: the EMAIL only, with the location's phone and a 14-day date", async () => {
    h.loadReminderData.mockResolvedValue(row());

    const outcome = await dispatchSurvey(TENANT, APPT);

    expect(outcome).toEqual({
      dispatched: true,
      channels: [{ channel: "email", sandbox: false, id: "test-email-1" }],
    });
    expect(h.sms).toEqual([]);
    const mail = only(h.email);
    const code = only(h.codes);
    expect(isWellFormedSurveyCode(code)).toBe(true);
    expect(mail.templateId).toBe("survey.email");
    expect(mail.to).toBe("madalena@example.test");
    expect(mail.subject).toBe("Avaliação da sua consulta de 14 de maio de 2031");
    expect(mail.body).toBe(
      [
        "Olá Madalena,",
        "",
        "Pedimos a sua avaliação da consulta de 14 de maio de 2031. A avaliação tem três perguntas e a resposta é facultativa.",
        "",
        `Responder: ${ORIGIN}/s/${code}`,
        "",
        "A ligação é pessoal, só pode ser usada uma vez e é válida até 28 de maio de 2031.",
        "",
        `Se não pretender receber estas avaliações, indique-o na mesma ligação ou contacte a clínica: ${LOCATION_PHONE}`,
        "",
        "OsteoJP",
      ].join("\n"),
    );
    expect(mail.body).not.toContain(TENANT_PHONE);
    // The database was asked for the email channel, with the code in the body.
    expect(only(h.issues)).toEqual({ tenantId: TENANT, appointmentId: APPT, channel: "email", code });
    expect(h.ledger).toEqual([
      {
        tenantId: TENANT,
        appointmentId: APPT,
        channel: "email",
        templateId: "survey.email",
        outcome: "sent",
        suppressionReason: null,
        providerMessageId: "test-email-1",
      },
    ]);
    expectCodeNowhereButTheMessage(outcome);
  });

  it.each([
    ["no email on file", { patientEmail: null }],
    ["a blank email", { patientEmail: "   " }],
    ["the patient's email switch off", { patientReminderEmailEnabled: false }],
    ["the clinic's email reminders off", { tenantSettings: { locale: "pt", reminders: { emailEnabled: false } } }],
  ])("%s: the SMS only, the approved three lines and no fourth", async (_label, over) => {
    h.loadReminderData.mockResolvedValue(row(over));

    const outcome = await dispatchSurvey(TENANT, APPT);

    expect(outcome).toEqual({ dispatched: true, channels: [{ channel: "sms", sandbox: false, id: "test-sms-1" }] });
    expect(h.email).toEqual([]);
    const sms = only(h.sms);
    const code = only(h.codes);
    expect(sms.templateId).toBe("survey.sms");
    expect(sms.body).toBe(
      `OsteoJP: avaliacao da consulta de 14/05\nResponder: app.jp.invalid/s/${code}\nPara nao receber mais avaliacoes, use a mesma ligacao.`,
    );
    // The template with its two placeholders filled, and not one character more.
    expect(sms.body).toBe(
      SURVEY_SMS.pt.replace("{data}", "14/05").replace("{ligacao}", `app.jp.invalid/s/${code}`),
    );
    expect(sms.body.split("\n")).toHaveLength(3);
    expect(sms.body).not.toContain("Nao lemos respostas");
    expect(sms.body).not.toContain("Responda");
    // 101 fixed characters, the date (5), the host (14), "/s/" (3), the code (8).
    expect(sms.body.length).toBe(131);
    expect(only(h.issues).channel).toBe("sms");
    expect(h.ledger).toEqual([
      {
        tenantId: TENANT,
        appointmentId: APPT,
        channel: "sms",
        templateId: "survey.sms",
        outcome: "sent",
        suppressionReason: null,
        bodyLength: 131,
        segments: null,
        providerMessageId: "test-sms-1",
      },
    ]);
    expectCodeNowhereButTheMessage(outcome);
  });

  it("a sender that takes replies changes nothing: the SMS has no reply line either", async () => {
    process.env.TWILIO_SMS_FROM = "+351210000000";
    h.loadReminderData.mockResolvedValue(row({ patientEmail: null }));
    await dispatchSurvey(TENANT, APPT);
    expect(only(h.sms).body.split("\n")).toHaveLength(3);
  });

  it("the English texts go to a tenant set to English", async () => {
    h.loadReminderData.mockResolvedValue(row({ tenantSettings: { locale: "en" } }));
    await dispatchSurvey(TENANT, APPT);
    const mail = only(h.email);
    expect(mail.subject).toBe("Satisfaction survey for your appointment on 14 May 2031");
    expect(mail.body).toContain("valid until 28 May 2031.");
    expect(mail.body).toContain(`contact the clinic: ${LOCATION_PHONE}`);
  });

  it.each([
    ["no contact at all", { patientEmail: null, patientPhone: null }, "email", "no_contact"],
    [
      "both of the patient's switches off",
      { patientReminderEmailEnabled: false, patientReminderSmsEnabled: false },
      "email",
      "channels_off",
    ],
    ["a phone only, and its switch off", { patientEmail: null, patientReminderSmsEnabled: false }, "sms", "channels_off"],
    ["no longer concluded", { status: "scheduled" }, "email", "status"],
    ["cancelled since", { status: "cancelled" }, "email", "status"],
    ["a location with no phone, for the email", { locationPhone: null }, "email", "location_contact_missing"],
    ["a location with a blank phone, for the email", { locationPhone: "  " }, "email", "location_contact_missing"],
    ["a number that is not a number", { patientEmail: null, patientPhone: "12" }, "sms", "invalid_phone"],
    ["a landline", { patientEmail: null, patientPhone: "214 000 000" }, "sms", "landline"],
  ])("%s: one suppressed row with its reason, and nothing was made", async (_label, over, channel, reason) => {
    h.loadReminderData.mockResolvedValue(row(over));

    const outcome = await dispatchSurvey(TENANT, APPT);

    expect(outcome).toEqual({ dispatched: false, reason });
    expect(h.ledger).toEqual([
      {
        tenantId: TENANT,
        appointmentId: APPT,
        channel,
        templateId: `survey.${channel}`,
        outcome: "suppressed",
        suppressionReason: reason,
      },
    ]);
    // Refused before the code: nothing to issue, nothing to send, and no
    // follow-up in its place.
    expect(h.codes).toEqual([]);
    expect(h.issues).toEqual([]);
    expect(h.email).toEqual([]);
    expect(h.sms).toEqual([]);
  });

  it("a location with no phone never falls back to the tenant's number", async () => {
    h.loadReminderData.mockResolvedValue(row({ locationPhone: null }));
    await dispatchSurvey(TENANT, APPT);
    expect(h.email).toEqual([]);
    expect(logged.join("\n")).not.toContain(TENANT_PHONE);
  });

  it("the SMS does not need the location's phone: it prints none", async () => {
    h.loadReminderData.mockResolvedValue(row({ patientEmail: null, locationPhone: null }));
    expect(await dispatchSurvey(TENANT, APPT)).toMatchObject({ dispatched: true });
    expect(only(h.sms).body).not.toContain(TENANT_PHONE);
  });

  it.each([
    ["an appointment that is not there", null, "not_found"],
    ["a removed patient", { patientDeletedAt: new Date(Date.UTC(2031, 4, 15)) }, "patient_deleted"],
  ])("%s: one suppressed row under the email id", async (_label, fixture, reason) => {
    h.loadReminderData.mockResolvedValue(fixture === null ? null : row(fixture));

    expect(await dispatchSurvey(TENANT, APPT)).toEqual({ dispatched: false, reason });

    expect(h.ledger.map((r) => [r.templateId, r.outcome, r.suppressionReason])).toEqual([
      ["survey.email", "suppressed", reason],
    ]);
    expectNoSurveyWork();
    expect(h.email).toEqual([]);
    expect(h.sms).toEqual([]);
  });

  it.each([
    ["a send in the last 60 days", "cooldown", "survey_cooldown"],
    ["opted out, already answered, or changed since the read", "not_eligible", "survey_not_eligible"],
    ["a session the database does not answer", "not_allowed", "survey_not_allowed"],
  ])("the database refuses to issue (%s): a suppressed row and NO message", async (_label, answer, reason) => {
    for (const fixture of [{}, { patientEmail: null }]) {
      h.email.length = 0;
      h.sms.length = 0;
      h.ledger.length = 0;
      h.codes.length = 0;
      h.issues.length = 0;
      h.issueAnswer = answer;
      h.loadReminderData.mockResolvedValue(row(fixture));

      const outcome = await dispatchSurvey(TENANT, APPT);

      expect(outcome).toEqual({ dispatched: false, reason });
      expect(h.issues).toHaveLength(1);
      expect(h.email).toEqual([]);
      expect(h.sms).toEqual([]);
      expect(h.ledger.map((r) => [r.outcome, r.suppressionReason])).toEqual([["suppressed", reason]]);
      expectCodeNowhereButTheMessage(outcome);
    }
  });

  it("issuing throws: a row is left, the error goes on, and nothing reaches a provider", async () => {
    h.issueAnswer = new Error("the database is away");
    h.loadReminderData.mockResolvedValue(row());

    await expect(dispatchSurvey(TENANT, APPT)).rejects.toThrow("the database is away");

    expect(h.email).toEqual([]);
    expect(h.ledger.map((r) => [r.templateId, r.outcome, r.suppressionReason])).toEqual([
      ["survey.email", "suppressed", "survey_issue_error"],
    ]);
  });

  it.each([
    ["email", {}],
    ["sms", { patientEmail: null }],
  ])("the provider refuses the %s: a provider_error row, and the error goes on", async (channel, over) => {
    h.providerError = new ProviderSendError(channel as "email" | "sms", "validation_error", "refused");
    h.loadReminderData.mockResolvedValue(row(over));

    await expect(dispatchSurvey(TENANT, APPT)).rejects.toThrow("refused");

    expect(h.ledger).toEqual([
      {
        tenantId: TENANT,
        appointmentId: APPT,
        channel,
        templateId: `survey.${channel}`,
        outcome: "provider_error",
        providerErrorCode: "validation_error",
      },
    ]);
    expect(JSON.stringify(h.ledger) + logged.join("\n")).not.toContain(only(h.codes));
  });

  it("a held message (the notify gate) is a suppressed row with the gate's reason", async () => {
    const clients = await import("./clients");
    vi.mocked(clients.sendEmail).mockResolvedValueOnce({ channel: "email", sandbox: true, id: "sandbox" });
    h.loadReminderData.mockResolvedValue(row());

    expect(await dispatchSurvey(TENANT, APPT)).toMatchObject({ dispatched: true });

    expect(h.ledger.map((r) => [r.outcome, r.suppressionReason, r.providerMessageId])).toEqual([
      ["suppressed", "sandbox", null],
    ]);
  });
});

/* ==================================================================== */
/* A body that cannot be built costs no row (INC-CONFIRM-07)             */
/* ==================================================================== */

describe("a refused body is recorded, and nothing is issued", () => {
  beforeEach(() => {
    process.env.SURVEY_SEND_MODE = "on";
  });

  it.each([
    ["email", {}],
    ["sms", { patientEmail: null }],
  ])("no origin for the link, %s: body_refused, no issue, no message", async (channel, over) => {
    delete process.env.REMINDERS_RESCHEDULE_BASE_URL;
    h.loadReminderData.mockResolvedValue(row(over));

    const outcome = await dispatchSurvey(TENANT, APPT);

    expect(outcome).toMatchObject({ dispatched: false, reason: "body_refused" });
    expect((outcome as { detail?: string }).detail).toContain("REMINDERS_RESCHEDULE_BASE_URL is not set");
    expect(h.issues).toEqual([]);
    expect(h.email).toEqual([]);
    expect(h.sms).toEqual([]);
    expect(h.ledger.map((r) => [r.channel, r.outcome, r.suppressionReason])).toEqual([
      [channel, "suppressed", "body_refused"],
    ]);
    expectCodeNowhereButTheMessage(outcome);
  });

  it("an SMS one character too long: refused, not split, nothing issued", async () => {
    // 43 characters of host fit one segment in pt (spec 9.2); 44 do not.
    process.env.REMINDERS_RESCHEDULE_BASE_URL = `https://${"a".repeat(35)}.invalid`;
    h.loadReminderData.mockResolvedValue(row({ patientEmail: null }));
    expect(await dispatchSurvey(TENANT, APPT)).toMatchObject({ dispatched: true });
    expect(only(h.sms).body.length).toBe(160);

    h.sms.length = 0;
    h.ledger.length = 0;
    h.codes.length = 0;
    h.issues.length = 0;
    process.env.REMINDERS_RESCHEDULE_BASE_URL = `https://${"a".repeat(36)}.invalid`;

    const outcome = await dispatchSurvey(TENANT, APPT);

    expect(outcome).toEqual({
      dispatched: false,
      reason: "body_refused",
      detail: "reminders/sms: message is 161 chars, exceeds 160-char single segment",
    });
    expect(h.issues).toEqual([]);
    expect(h.sms).toEqual([]);
    expect(h.ledger.map((r) => [r.outcome, r.suppressionReason])).toEqual([["suppressed", "body_refused"]]);
    expectCodeNowhereButTheMessage(outcome);
  });

  it("an SMS that would leave GSM-7: refused, nothing issued", async () => {
    process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://clínica.invalid";
    h.loadReminderData.mockResolvedValue(row({ patientEmail: null }));

    expect(await dispatchSurvey(TENANT, APPT)).toMatchObject({ dispatched: false, reason: "body_refused" });

    expect(h.issues).toEqual([]);
    expect(h.sms).toEqual([]);
  });

  it("an email whose render throws: a fixed sentence, and the name it tripped on goes nowhere", async () => {
    h.loadReminderData.mockResolvedValue(row({ patientName: "{{segredo}} Sousa" }));

    const outcome = await dispatchSurvey(TENANT, APPT);

    expect(outcome).toEqual({ dispatched: false, reason: "body_refused", detail: SURVEY_RENDER_REFUSAL });
    expect(h.issues).toEqual([]);
    expect(h.email).toEqual([]);
    expect(JSON.stringify(h.ledger) + JSON.stringify(outcome) + logged.join("\n")).not.toContain("segredo");
  });
});

/* ==================================================================== */
/* The order of work                                                     */
/* ==================================================================== */

describe("the order of work: the code, the body, the issue, the provider", () => {
  it.each([
    ["email", {}],
    ["sms", { patientEmail: null }],
  ])("%s: the code is made first, the issue comes before the hand-over, the row last", async (_channel, over) => {
    process.env.SURVEY_SEND_MODE = "on";
    h.loadReminderData.mockResolvedValue(row(over));
    await dispatchSurvey(TENANT, APPT);
    expect(h.order).toEqual(["code", "issue", "provider", "ledger"]);
  });

  it("the switch is read before the appointment: off never reads it for the survey", async () => {
    // One read, the follow-up's own. A survey path that looked first and asked
    // the switch second would read twice.
    h.loadReminderData.mockResolvedValue(row());
    await dispatchSurvey(TENANT, APPT);
    expect(h.loadReminderData).toHaveBeenCalledTimes(1);
    expect(h.order).not.toContain("code");
  });
});

/* ==================================================================== */
/* Canary                                                                */
/* ==================================================================== */

describe("canary: only a listed patient, everyone else as off", () => {
  beforeEach(() => {
    process.env.SURVEY_SEND_MODE = "canary";
    process.env.SURVEY_CANARY_PATIENT_IDS = PATIENT;
  });

  it("a listed patient is sent the survey, and no follow-up", async () => {
    h.loadReminderData.mockResolvedValue(row());

    expect(await dispatchSurvey(TENANT, APPT)).toMatchObject({ dispatched: true });

    expect(h.email.map((m) => m.templateId)).toEqual(["survey.email"]);
    expect(h.sms).toEqual([]);
    expect(h.issues).toHaveLength(1);
    expect(h.ledger.map((r) => [r.templateId, r.outcome])).toEqual([["survey.email", "sent"]]);
  });

  it.each(FOLLOW_UP_FIXTURES.filter(([, f]) => f !== null))(
    "an unlisted patient, %s: no survey, the reason recorded, then exactly what off gives",
    async (_label, fixture) => {
      const unlisted = { ...fixture, patientId: OTHER_PATIENT };
      delete process.env.SURVEY_SEND_MODE;
      const off = await runOnce(unlisted, () => dispatchSurvey(TENANT, APPT));
      process.env.SURVEY_SEND_MODE = "canary";

      const canary = await runOnce(unlisted, () => dispatchSurvey(TENANT, APPT));

      expect(canary.outcome).toEqual(off.outcome);
      expect(canary.email).toEqual(off.email);
      expect(canary.sms).toEqual(off.sms);
      expectNoSurveyWork();
      expect(only(canary.ledger)).toMatchObject({
        tenantId: TENANT,
        appointmentId: APPT,
        outcome: "suppressed",
        suppressionReason: "survey_canary_not_listed",
      });
      expect(only(canary.ledger).templateId).toMatch(/^survey\.(email|sms)$/);
    },
  );

  it("the row of an unlisted patient is filed under the channel the survey would have used", async () => {
    h.loadReminderData.mockResolvedValue(row({ patientId: OTHER_PATIENT, patientEmail: null }));
    await dispatchSurvey(TENANT, APPT);
    expect(only(h.ledger)).toMatchObject({ channel: "sms", templateId: "survey.sms" });
  });

  it.each([
    ["an empty list", ""],
    ["no list", undefined],
    ["a list of something that is not an id", "madalena"],
  ])("%s lets nobody through", async (_label, list) => {
    if (list === undefined) delete process.env.SURVEY_CANARY_PATIENT_IDS;
    else process.env.SURVEY_CANARY_PATIENT_IDS = list;
    h.loadReminderData.mockResolvedValue(row());

    await dispatchSurvey(TENANT, APPT);

    expectNoSurveyWork();
    expect(only(h.ledger).suppressionReason).toBe("survey_canary_not_listed");
  });

  it("an appointment that is not there has nobody to list: a not_found row, nothing sent", async () => {
    h.loadReminderData.mockResolvedValue(null);
    expect(await dispatchSurvey(TENANT, APPT)).toEqual({ dispatched: false, reason: "not_found" });
    expect(h.ledger.map((r) => r.suppressionReason)).toEqual(["not_found"]);
    expectNoSurveyWork();
  });

  it("a listed patient who was removed gets nothing, and the row says so", async () => {
    h.loadReminderData.mockResolvedValue(row({ patientDeletedAt: new Date(Date.UTC(2031, 4, 15)) }));
    expect(await dispatchSurvey(TENANT, APPT)).toEqual({ dispatched: false, reason: "patient_deleted" });
    expect(h.ledger.map((r) => r.suppressionReason)).toEqual(["patient_deleted"]);
    expectNoSurveyWork();
  });
});

/* ==================================================================== */
/* Q-O: a correction into Concluida asks for the survey ALONE            */
/* ==================================================================== */

/**
 * Strategy's ruling of 2026-10-22: "emit on a correction into Concluida, only
 * for visits that ended in the last 7 days, same 24 h and 60-day rules." The
 * correction emits the ordinary appointment/completed event with
 * `surveyOnly: true`. These arms drive the real handler with that event: the
 * survey goes through the same sleep and the same issue door, and where the
 * ordinary run would fall back to the follow-up message, this one sends
 * nothing. Which corrections emit is lib/scheduling/estado-correction-survey.test.ts.
 */
describe("Q-O: a correction's run sends the survey or nothing, never the follow-up", () => {
  const CORRECTION_EVENT = {
    appointmentId: APPT,
    tenantId: TENANT,
    endsAt: "2031-05-14T14:15:00.000Z",
    surveyOnly: true,
  };

  it("switch off (every value that reads off): nothing is sent, nothing is read, no row", async () => {
    for (const value of OFF_VALUES) {
      if (value === undefined) delete process.env.SURVEY_SEND_MODE;
      else process.env.SURVEY_SEND_MODE = value;
      process.env.SURVEY_CANARY_PATIENT_IDS = PATIENT;

      let steps: string[] = [];
      const run = await runOnce({}, async () => {
        const woken = await wake(CORRECTION_EVENT);
        steps = woken.steps;
        return woken.result;
      });

      // The same 24 hour sleep, under the same step names.
      expect(steps).toEqual(["sleepUntil:wait-24h-after-visit:2031-05-15T14:15:00.000Z", "run:dispatch-follow-up"]);
      expect(run.outcome, `SURVEY_SEND_MODE=${JSON.stringify(value)}`).toEqual({
        appointmentId: APPT,
        dispatched: false,
        reason: "survey_only",
      });
      expect(run.email).toEqual([]);
      expect(run.sms).toEqual([]);
      expect(run.ledger).toEqual([]);
      expect(run.reads).toBe(0);
      expectNoSurveyWork();
    }
  });

  it("CONTROL: the same visit's ORDINARY event, switch off, sends the follow-up", async () => {
    const ordinary = { appointmentId: APPT, tenantId: TENANT, endsAt: CORRECTION_EVENT.endsAt };
    const run = await runOnce({}, async () => (await wake(ordinary)).result);
    expect(run.email.map((m) => m.templateId)).toEqual(["follow_up.email"]);
    expect(run.sms.map((m) => m.templateId)).toEqual(["follow_up.sms"]);
  });

  it("canary, the patient not listed: the one row that says so, and no follow-up", async () => {
    process.env.SURVEY_SEND_MODE = "canary";
    process.env.SURVEY_CANARY_PATIENT_IDS = OTHER_PATIENT;
    const run = await runOnce({}, async () => (await wake(CORRECTION_EVENT)).result);
    expect(run.outcome).toEqual({ appointmentId: APPT, dispatched: false, reason: "survey_only" });
    expect(run.email).toEqual([]);
    expect(run.sms).toEqual([]);
    expect(only(run.ledger)).toMatchObject({ outcome: "suppressed", suppressionReason: "survey_canary_not_listed" });
    expectNoSurveyWork();
  });

  it("canary, the patient listed: the survey, as an ordinary run sends it", async () => {
    process.env.SURVEY_SEND_MODE = "canary";
    process.env.SURVEY_CANARY_PATIENT_IDS = PATIENT;
    h.loadReminderData.mockResolvedValue(row());
    const { result } = await wake(CORRECTION_EVENT);
    expect(result).toMatchObject({ appointmentId: APPT, dispatched: true });
    expect(h.email.map((m) => m.templateId)).toEqual(["survey.email"]);
    expect(h.sms).toEqual([]);
  });

  it("switch on: the survey, through the issue door, and no follow-up", async () => {
    process.env.SURVEY_SEND_MODE = "on";
    h.loadReminderData.mockResolvedValue(row());
    const { result, steps } = await wake(CORRECTION_EVENT);
    expect(steps).toEqual(["sleepUntil:wait-24h-after-visit:2031-05-15T14:15:00.000Z", "run:dispatch-follow-up"]);
    expect(result).toMatchObject({ appointmentId: APPT, dispatched: true });
    expect(h.issues).toHaveLength(1);
    expect(h.email.map((m) => m.templateId)).toEqual(["survey.email"]);
    expect(h.sms).toEqual([]);
  });

  it("switch on, a send to this patient in the last 60 days: the door refuses, a row, NO message", async () => {
    process.env.SURVEY_SEND_MODE = "on";
    h.issueAnswer = "cooldown";
    h.loadReminderData.mockResolvedValue(row());
    const { result } = await wake(CORRECTION_EVENT);
    expect(result).toEqual({ appointmentId: APPT, dispatched: false, reason: "survey_cooldown" });
    expect(h.issues).toHaveLength(1);
    expect(h.email).toEqual([]);
    expect(h.sms).toEqual([]);
    expect(h.ledger.map((r) => [r.outcome, r.suppressionReason])).toEqual([["suppressed", "survey_cooldown"]]);
  });

  it("switch on, corrected away from Concluida again before the run wakes: the status gate holds", async () => {
    process.env.SURVEY_SEND_MODE = "on";
    h.loadReminderData.mockResolvedValue(row({ status: "no_show" }));
    const { result } = await wake(CORRECTION_EVENT);
    expect(result).toEqual({ appointmentId: APPT, dispatched: false, reason: "status" });
    expectNoSurveyWork();
  });
});
