/**
 * third-location-messages.test.ts - S-1012-A1 ruling 6, gate G7.
 *
 *   "Prove by test that every automatic SMS and email for an appointment at a
 *    third location carries that location's name and phone, with no
 *    per-location Twilio or Resend setting. Report any text that still names
 *    only two clinics."
 *
 *   G7 "CHECK: reminder SMS, reminder email and booking confirmation for a
 *       third-location appointment. EXPECT: its name and phone in each, one
 *       SMS segment."
 *
 * WHAT IS REAL HERE AND WHAT IS NOT. Every dispatch function and everything it
 * decides is the real code: the routing, the context, the templates, the SMS
 * body assembly and its one-segment rule. Four seams are replaced, each with
 * something that RECORDS rather than something that agrees:
 *
 *   ./data                the appointment row the dispatch reads (one fixture)
 *   ./clients             the two send functions, which capture the whole message
 *   ./dispatch-ledger     an in-memory ledger
 *   ./confirm-code-store  the confirm code's row (a database write)
 *
 * The fixture is ONE appointment at a synthetic third location. The clinic's
 * two existing locations appear nowhere in it, and the tenant-level phone is a
 * number of its own, so a message that printed any of them would show.
 *
 * WHAT THIS FILE DOES NOT PROVE: that the row comes from the appointment's own
 * location. ./data is replaced, so a broken join could not fail here. That is
 * proved against a real database in ./third-location-data.db.test.ts.
 *
 * ONE FINDING IS PINNED BELOW AS IT IS, NOT FIXED (3). It is patient-facing
 * copy and a REMINDERS_* flag (Tier D), so this file records what is sent today
 * and a change to the copy has to change the pin with it:
 *   1. RULED AND FIXED FOR THE EMAILS (MN-03, owner, 2026-10-12: "Yes, in the
 *      two emails only."). The follow-up and the no-show messages printed the
 *      location's phone and NOT its name. The two emails now carry a "Local:"
 *      line; the two SMS still print the phone alone, pinned byte for byte;
 *   2. RULED AND FIXED (MN-02, strategy, 2026-10-12). The 24h SMS with the
 *      confirm link armed is 163 characters with this location's full name. It
 *      was refused; it now prints the place alone ("Montemor-o-Novo", 153) and
 *      goes as one segment. A body that fits keeps the full name;
 *   3. the 24h SMS with the fee line (unapproved, off today) is refused at this
 *      location, with or without the link.
 *
 * "REPORT ANY TEXT THAT STILL NAMES ONLY TWO CLINICS". None is changed here;
 * each is patient-facing copy or outside this change. Read on this branch:
 *   a patient sees
 *     apps/portal/app/global-error.tsx:75-77      two phone numbers, fatal error page
 *     apps/portal/lib/clinics.ts:91-112           published details for LV and CB only
 *                                                 (also the list shown when the API is down)
 *     packages/i18n/src/portal/strings.pt.json:250-255, strings.en.json the same keys
 *                                                 names, addresses and hours of two
 *     apps/web/lib/clinical/report/location-contacts.ts:71-89
 *                                                 the printed contact block of two (report,
 *                                                 RGPD and Declaração footers); a third
 *                                                 location's footer is its own row
 *   a patient does not see a wrong text, but the table holds two
 *     apps/portal/lib/locationLabel.ts:9-12       city names by short code, LV and CB; a name
 *                                                 shaped "OsteoJP (Place)" needs no entry (:49)
 *   staff see
 *     apps/web/lib/reminders/messaging-check-body.ts:35
 *                                                 the delivery test's sample says "Castelo Branco",
 *                                                 as "the longest real clinic name"; the third
 *                                                 location's stored name is longer
 *     apps/web/app/horarios/AlternatingWeeksPanel.tsx:88-90
 *                                                 alternating weeks assume a pair
 *   comments only
 *     apps/web/lib/clinical/report/location-contacts.ts:66-69
 *                                                 says Montemor-o-Novo was ruled "never a real
 *                                                 or planned clinic" (2026-08-06); S-1012-A1
 *                                                 makes it one
 *     apps/web/lib/reminders/fee-notice.ts:45-49  the fee line's budget is measured with
 *                                                 "Castelo Branco" as the longest name
 *
 * Every name, address and phone number of a person below is invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Sent = { templateId: string; to: string; subject?: string; body: string };

const h = vi.hoisted(() => ({
  loadReminderData: vi.fn(),
  isGuestLinked: vi.fn(async (): Promise<boolean> => false),
  email: [] as Sent[],
  sms: [] as Sent[],
  ledger: [] as { channel: string; templateId: string; outcome: string; suppressionReason?: string | null }[],
  handOvers: [] as { appointmentId: string; startsAt: string }[],
  issuedCodes: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("./data", () => ({
  loadReminderData: h.loadReminderData,
  isGuestLinkedAppointment: h.isGuestLinked,
}));
vi.mock("./clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clients")>();
  return {
    ...actual,
    sendEmail: vi.fn(async (m: Parameters<typeof actual.sendEmail>[0]) => {
      h.email.push({ templateId: m.templateId, to: m.to, subject: m.subject, body: m.body });
      return { channel: "email" as const, sandbox: false, id: `test-email-${h.email.length}` };
    }),
    sendSms: vi.fn(async (m: Parameters<typeof actual.sendSms>[0]) => {
      h.sms.push({ templateId: m.templateId, to: m.to, body: m.body });
      return { channel: "sms" as const, sandbox: false, id: `test-sms-${h.sms.length}` };
    }),
  };
});
vi.mock("./dispatch-ledger", () => ({
  HANDED_OVER_WHILE_LIVE_SEND_OFF: "live_send_disabled",
  recordDispatch: vi.fn(async (row: (typeof h.ledger)[number]) => {
    h.ledger.push(row);
  }),
  recordBookingApprovedHandOver: vi.fn(async (args: { appointmentId: string; startsAt: Date }) => {
    h.handOvers.push({ appointmentId: args.appointmentId, startsAt: args.startsAt.toISOString() });
  }),
  hasBookingApprovedHandOver: vi.fn(async (args: { appointmentId: string; startsAt: Date }) =>
    h.handOvers.some(
      (o) => o.appointmentId === args.appointmentId && o.startsAt === args.startsAt.toISOString(),
    ),
  ),
}));
vi.mock("./confirm-code-store", () => ({
  issueConfirmCode: vi.fn(async (args: { code: string }) => {
    h.issuedCodes.push(args.code);
    return { code: args.code, codeHash: "test-hash" };
  }),
  withdrawConfirmCode: vi.fn(async () => true),
}));

import { OSTEOJP_LOCATION_CONTACTS } from "../clinical/report/location-contacts";
import {
  dispatchConfirmation,
  dispatchFollowUp,
  dispatchNoShow,
  dispatchReminder,
} from "./dispatch";
import { REMINDER_TEMPLATES } from "./notification-registry";
import {
  REPLY_ACK_CANCELLED,
  REPLY_ACK_CONFIRMED,
  REPLY_ACK_REVIEW,
  REPLY_ACK_TEMPLATE_IDS,
} from "./reminder-copy";
import { FEE_NOTICE_TEMPLATE_ID } from "./fee-notice";
import { smsPlaceName } from "./sms-body";
import { FOLLOW_UP_SMS, NO_SHOW_SMS, SMS_SEGMENT_LIMIT } from "./templates";

const TENANT = "11111111-1111-4111-8111-111111111111";
const APPT = "22222222-2222-4222-8222-222222222222";
const PATIENT = "33333333-3333-4333-8333-333333333333";

/** The third location, as ruling 5 says its row is created. */
const NAME = "OsteoJP (Montemor-o-Novo)";
const PHONE = "926 714 926";
const ADDRESS = "Rua Horta das Almas 4, 7050-356 Montemor-o-Novo";

/** A tenant-level phone that is nobody's, so a fall-back to it would show. */
const TENANT_PHONE = "210 999 999";

/** 14/05 at 14:30 in Lisbon: a fixed wall-clock hour, far from any DST edge. */
const STARTS_AT = new Date(Date.UTC(2031, 4, 14, 13, 30, 0));

function row(over: Record<string, unknown> = {}) {
  return {
    appointmentId: APPT,
    startsAt: STARTS_AT,
    status: "confirmed",
    confirmationState: "pending",
    origin: "patient_portal",
    patientId: PATIENT,
    patientName: "Madalena Sousa",
    patientEmail: "madalena@example.test",
    patientPhone: "+351 912 000 001",
    patientReminderSmsEnabled: true,
    patientReminderEmailEnabled: true,
    patientDeletedAt: null,
    patientHasAcceptedTerms: false,
    practitionerName: "Dr. Teste Ficticio",
    locationName: NAME,
    locationPhone: PHONE,
    locationAddress: ADDRESS,
    serviceName: "Osteopatia",
    tenantSettings: { locale: "pt", contacts: { phone: TENANT_PHONE } },
    ...over,
  };
}

/* ------------------------------------------------------------------ */
/* What "no other clinic" means                                        */
/* ------------------------------------------------------------------ */

/**
 * Every way the two existing clinics are named or reached: their place names,
 * the short codes their rows are stored under, every phone and email of the
 * printed contact dataset, and the tenant-level phone of this fixture.
 */
const OTHER_CLINICS: readonly string[] = [
  "Linda-a-Velha",
  "Linda a Velha",
  "Castelo Branco",
  "(LV)",
  "(CB)",
  TENANT_PHONE,
  ...Object.values(OSTEOJP_LOCATION_CONTACTS).flatMap((c) => [
    ...c.phones,
    ...c.addressLines,
    ...(c.postalCode ? [c.postalCode] : []),
  ]),
];

/** Phone numbers compared digits only, so "214 191 988" and "214191988" are one. */
const squash = (s: string) => s.replace(/[\s.-]/g, "").toLowerCase();

function expectNoOtherClinic(text: string, label: string): void {
  for (const other of OTHER_CLINICS) {
    expect(squash(text), `${label} names another clinic: ${other}`).not.toContain(squash(other));
  }
}

function expectThisLocation(text: string, label: string): void {
  expect(text, `${label} does not carry the location's name`).toContain(NAME);
  expect(text, `${label} does not carry the location's phone`).toContain(PHONE);
  expectNoOtherClinic(text, label);
}

/* ------------------------------------------------------------------ */
/* The real segment rule, for the character set of the body            */
/* ------------------------------------------------------------------ */

// GSM 03.38. A body made only of these goes out in the 7-bit alphabet: 160
// septets in one segment, 153 per part beyond that. A character of the
// extension table costs TWO septets. Any other character moves the whole body
// to UCS-2: 70 UTF-16 code units in one segment, 67 per part beyond that.
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXTENSION = "\f^{}\\[~]|€";

function smsSegments(body: string): { charset: "GSM-7" | "UCS-2"; units: number; segments: number } {
  let septets = 0;
  let gsm = true;
  for (const ch of body) {
    if (GSM7_BASIC.includes(ch)) septets += 1;
    else if (GSM7_EXTENSION.includes(ch)) septets += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (gsm) {
    return { charset: "GSM-7", units: septets, segments: septets <= 160 ? 1 : Math.ceil(septets / 153) };
  }
  const units = body.length;
  return { charset: "UCS-2", units, segments: units <= 70 ? 1 : Math.ceil(units / 67) };
}

function expectOneSegment(body: string, measured: number): void {
  const verdict = smsSegments(body);
  expect(verdict.charset).toBe("GSM-7");
  expect(verdict.segments).toBe(1);
  // The measured length, pinned: the figure the report quotes.
  expect(verdict.units).toBe(measured);
  expect(body.length).toBe(measured);
}

describe("the segment rule this file measures with", () => {
  it("counts a plain body in septets, an extension character twice, and an accent as UCS-2", () => {
    expect(smsSegments("a".repeat(160))).toEqual({ charset: "GSM-7", units: 160, segments: 1 });
    expect(smsSegments("a".repeat(161))).toEqual({ charset: "GSM-7", units: 161, segments: 2 });
    expect(smsSegments(`${"a".repeat(159)}€`)).toEqual({ charset: "GSM-7", units: 161, segments: 2 });
    expect(smsSegments("ã".repeat(70))).toEqual({ charset: "UCS-2", units: 70, segments: 1 });
    expect(smsSegments("ã".repeat(71))).toEqual({ charset: "UCS-2", units: 71, segments: 2 });
  });

  it("the name and the phone of the third location are GSM-7, character for character", () => {
    expect(smsSegments(NAME)).toEqual({ charset: "GSM-7", units: 25, segments: 1 });
    expect(smsSegments(PHONE).charset).toBe("GSM-7");
  });
});

/* ------------------------------------------------------------------ */
/* Environment                                                         */
/* ------------------------------------------------------------------ */

const ENV_KEYS = [
  "BOOK_CONFIRM_MODE",
  "BOOK_CONFIRM_CANARY_PATIENT_IDS",
  "REMINDERS_LIVE_SEND",
  "REMINDERS_LINK_SECRET",
  "REMINDERS_RESCHEDULE_BASE_URL",
  "REMINDERS_CONFIRM_LINK_ENABLED",
  "REMINDERS_CONFIRM_CODE_SECRET",
  "REMINDERS_FEE_NOTICE_ENABLED",
  "REMINDERS_REPLY_CAPABLE",
  "TWILIO_SMS_FROM",
  "TWILIO_MESSAGING_SERVICE_SID",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  h.loadReminderData.mockReset();
  h.isGuestLinked.mockReset();
  h.isGuestLinked.mockResolvedValue(false);
  h.email.length = 0;
  h.sms.length = 0;
  h.ledger.length = 0;
  h.handOvers.length = 0;
  h.issuedCodes.length = 0;
  // The emails sign a reschedule link. A reserved host of 14 characters: the
  // length of the host confirm-code.ts records as serving the patient-facing
  // links, so every measured length below is the deployed one. Never the real
  // host (scripts/no-production-hosts-in-tests.test.mjs).
  process.env.REMINDERS_LINK_SECRET = "test-only-link-secret-not-prod";
  process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://app.jp.invalid";
  // The one-way alphanumeric sender id, so the 24h body carries its longest
  // unconditional form (the "Nao lemos respostas." line).
  process.env.TWILIO_SMS_FROM = "OsteoJP";
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

const only = <T>(list: T[]): T => {
  expect(list).toHaveLength(1);
  return list[0]!;
};

/* ==================================================================== */
/* G7: the reminders                                                     */
/* ==================================================================== */

describe("G7 - the reminders of a third-location appointment", () => {
  it("48h reminder EMAIL: the location's name and phone, no other clinic", async () => {
    h.loadReminderData.mockResolvedValue(row());

    expect((await dispatchReminder(TENANT, APPT, "48h", "email")).dispatched).toBe(true);

    const mail = only(h.email);
    expect(mail.templateId).toBe("reminder.48h.email");
    expect(h.sms).toEqual([]);
    expectThisLocation(mail.body, "48h email body");
    expect(mail.body).toContain(`em ${NAME}, com Dr. Teste Ficticio.`);
    expect(mail.body).toContain(`Ou contacte: ${PHONE}`);
    expectNoOtherClinic(mail.subject ?? "", "48h email subject");
  });

  it("24h reminder SMS: the location's name and phone, ONE segment, 126 characters", async () => {
    h.loadReminderData.mockResolvedValue(row());

    expect((await dispatchReminder(TENANT, APPT, "24h", "sms")).dispatched).toBe(true);

    const sms = only(h.sms);
    expect(sms.templateId).toBe("reminder.24h.sms");
    expect(h.email).toEqual([]);
    expect(sms.body).toBe(
      `OsteoJP - Lembrete\nConsulta: amanha 14/05 as 14:30\nLocal: ${NAME}\nRemarcar: ${PHONE}\nNao lemos respostas.`,
    );
    expectThisLocation(sms.body, "24h sms");
    expectOneSegment(sms.body, 126);
  });

  it("24h reminder SMS from a sender that takes replies: still ONE segment, 154 characters", async () => {
    // An E.164 sender: the body invites a reply instead of saying none is read.
    process.env.TWILIO_SMS_FROM = "+351210000000";
    h.loadReminderData.mockResolvedValue(row());

    await dispatchReminder(TENANT, APPT, "24h", "sms");

    const sms = only(h.sms);
    expectThisLocation(sms.body, "24h sms, replyable sender");
    expectOneSegment(sms.body, 154);
  });

  it("the location's phone is its OWN: with none on the row, the tenant's is printed (today's rule)", async () => {
    // The control for "no other clinic": this is the one way a tenant-level
    // number reaches a reminder, and it needs the location's own to be empty.
    h.loadReminderData.mockResolvedValue(row({ locationPhone: null }));

    await dispatchReminder(TENANT, APPT, "24h", "sms");

    expect(only(h.sms).body).toContain(`Remarcar: ${TENANT_PHONE}`);
  });
});

/* ==================================================================== */
/* FINDING 2: the 24h SMS with the confirm link                          */
/* ==================================================================== */

// MN-02 (strategy ruling, 2026-10-12). With the link armed the body with the
// full name is 163 characters. It is not refused any more: the sender id already
// says OsteoJP, so a body that is too long prints the place alone, and only
// then. The location is not renamed and nothing is split in two.
describe("G7 - the 24h SMS with the confirm link armed prints the place alone when the full name does not fit", () => {
  beforeEach(() => {
    process.env.REMINDERS_CONFIRM_LINK_ENABLED = "true";
    process.env.REMINDERS_CONFIRM_CODE_SECRET = "test-only-confirm-secret-not-prod";
  });

  it("a link host of 14 characters, the deployed length: 163 with the full name, so it goes as 153 with the place alone", async () => {
    h.loadReminderData.mockResolvedValue(row());

    expect((await dispatchReminder(TENANT, APPT, "24h", "sms")).dispatched).toBe(true);

    const sms = only(h.sms);
    expect(sms.templateId).toBe("reminder.24h.sms");
    expect(sms.body).toMatch(
      new RegExp(
        "^OsteoJP - Lembrete\\nConsulta: amanha 14/05 as 14:30\\nLocal: Montemor-o-Novo\\nRemarcar: 926 714 926" +
          "\\nConfirmar: app\\.jp\\.invalid/c/[A-Za-z0-9_-]{8}\\nNao lemos respostas\\.$",
      ),
    );
    expect(sms.body).not.toContain(NAME);
    expect(sms.body).toContain(PHONE);
    expectNoOtherClinic(sms.body, "24h sms with the link");
    expect(smsSegments(sms.body)).toEqual({ charset: "GSM-7", units: 153, segments: 1 });
    expect(h.issuedCodes).toHaveLength(1);
  });

  it("the same appointment at a 12-character name goes with its FULL name: 150 characters, the control", async () => {
    h.loadReminderData.mockResolvedValue(row({ locationName: "OsteoJP (XX)" }));

    expect((await dispatchReminder(TENANT, APPT, "24h", "sms")).dispatched).toBe(true);

    const sms = only(h.sms);
    expect(sms.body).toContain("\nLocal: OsteoJP (XX)\n");
    expect(sms.body).toMatch(/\nConfirmar: app\.jp\.invalid\/c\/[A-Za-z0-9_-]{8}\nNao lemos respostas\.$/);
    expect(smsSegments(sms.body)).toEqual({ charset: "GSM-7", units: 150, segments: 1 });
  });

  it("the edge: at exactly 160 the full name stays, at 161 the place alone goes (151)", async () => {
    h.loadReminderData.mockResolvedValue(row());

    process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://abcdefgh.pt"; // 11
    expect((await dispatchReminder(TENANT, APPT, "24h", "sms")).dispatched).toBe(true);
    const fits = only(h.sms);
    expectThisLocation(fits.body, "24h sms with the link");
    expect(smsSegments(fits.body)).toEqual({ charset: "GSM-7", units: 160, segments: 1 });

    process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://abcdefghi.pt"; // 12
    expect((await dispatchReminder(TENANT, APPT, "24h", "sms")).dispatched).toBe(true);
    expect(h.sms).toHaveLength(2);
    const short = h.sms[1]!;
    expect(short.body).toContain("\nLocal: Montemor-o-Novo\n");
    expect(short.body).not.toContain(NAME);
    expect(smsSegments(short.body)).toEqual({ charset: "GSM-7", units: 151, segments: 1 });
  });

  it("still too long with the place alone: REFUSED with the full body's length, nothing sent and no code minted", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    h.loadReminderData.mockResolvedValue(row());
    process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://a-long-host-name.invalid"; // 24

    expect(await dispatchReminder(TENANT, APPT, "24h", "sms")).toEqual({
      dispatched: false,
      reason: "body_refused",
      detail: `reminders/sms: message is 173 chars, exceeds ${SMS_SEGMENT_LIMIT}-char single segment`,
    });
    expect(h.sms).toEqual([]);
    expect(h.issuedCodes).toEqual([]);
    expect(h.ledger).toEqual([
      expect.objectContaining({
        channel: "sms",
        templateId: "reminder.24h.sms",
        outcome: "suppressed",
        suppressionReason: "body_refused",
      }),
    ]);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("a name of another brand is never shortened, brackets or not: 163 characters at a 25-character name, REFUSED", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.loadReminderData.mockResolvedValue(row({ locationName: "Clinica (Montemor-o-Novo)" }));

    expect(await dispatchReminder(TENANT, APPT, "24h", "sms")).toMatchObject({
      dispatched: false,
      reason: "body_refused",
      detail: `reminders/sms: message is 163 chars, exceeds ${SMS_SEGMENT_LIMIT}-char single segment`,
    });
    expect(h.sms).toEqual([]);
  });

  it("a body refused for a character outside GSM-7 stays refused: only a too long body is shortened", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // The tab is not GSM-7. Trimmed, this name would shorten and fit.
    h.loadReminderData.mockResolvedValue(row({ locationName: `${NAME}\t` }));

    expect(await dispatchReminder(TENANT, APPT, "24h", "sms")).toMatchObject({
      dispatched: false,
      reason: "body_refused",
    });
    expect(h.sms).toEqual([]);
    expect(h.issuedCodes).toEqual([]);
  });

  it("smsPlaceName reads only the form OsteoJP (<place>)", () => {
    expect(smsPlaceName("OsteoJP (Montemor-o-Novo)")).toBe("Montemor-o-Novo");
    expect(smsPlaceName("  OsteoJP ( Castelo Branco ) ")).toBe("Castelo Branco");
    for (const same of [
      "OsteoJP Montemor",
      "Montemor-o-Novo",
      "OsteoJP ()",
      "OsteoJP ( )",
      // A short code is not a place: the two older clinics are stored this way.
      "OsteoJP (LV)",
      "OsteoJP (CB)",
      "OsteoJP (X)",
      // No space before the bracket.
      "OsteoJP(Montemor-o-Novo)",
      "OsteoJP (Novo)",
      // Text before the brand, after the bracket, another brand, another case.
      "Clinica OsteoJP (Montemor-o-Novo)",
      "OsteoJP (Montemor-o-Novo) sala 2",
      "Clinica (Montemor-o-Novo)",
      "osteojp (Montemor-o-Novo)",
      // A bracket inside the bracket.
      "OsteoJP (A) (Bairro)",
      "OsteoJP ((Montemor))",
    ]) {
      expect(smsPlaceName(same), same).toBe(same);
    }
    expect(smsPlaceName("OsteoJP (Evora)")).toBe("Evora");
  });
});

/* ==================================================================== */
/* FINDING 3: the 24h SMS with the fee line                              */
/* ==================================================================== */

// Unapproved copy behind a flag that is off (fee-notice.ts), so no patient is
// affected today. Rendered here all the same: it is a 24h SMS of its own id,
// and at this location it does not fit.
describe("FINDING - the 24h SMS with the fee line (unapproved, off today) does not fit at this location", () => {
  beforeEach(() => {
    process.env.REMINDERS_FEE_NOTICE_ENABLED = "true";
  });

  const refused = (chars: number) => ({
    dispatched: false,
    reason: "body_refused",
    detail: `reminders/sms: message is ${chars} chars, exceeds ${SMS_SEGMENT_LIMIT}-char single segment`,
  });

  it("the flag alone changes nothing: a patient who has not accepted gets the plain 126 characters", async () => {
    h.loadReminderData.mockResolvedValue(row());

    expect((await dispatchReminder(TENANT, APPT, "24h", "sms")).dispatched).toBe(true);

    const sms = only(h.sms);
    expect(sms.templateId).toBe("reminder.24h.sms");
    expectOneSegment(sms.body, 126);
  });

  it("flag on and terms accepted: 180 characters, REFUSED, nothing sent under either id", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.loadReminderData.mockResolvedValue(row({ patientHasAcceptedTerms: true }));

    expect(await dispatchReminder(TENANT, APPT, "24h", "sms")).toEqual(refused(180));
    expect(h.sms).toEqual([]);
  });

  it("with the confirm link as well: 217 characters, REFUSED", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.REMINDERS_CONFIRM_LINK_ENABLED = "true";
    process.env.REMINDERS_CONFIRM_CODE_SECRET = "test-only-confirm-secret-not-prod";
    h.loadReminderData.mockResolvedValue(row({ patientHasAcceptedTerms: true }));

    expect(await dispatchReminder(TENANT, APPT, "24h", "sms")).toEqual(refused(217));
    expect(h.sms).toEqual([]);
    expect(h.issuedCodes).toEqual([]);
  });

  it("the control: at a 12-character name the same fee-bearing SMS is 167 characters and refused too", async () => {
    // So the fee line's overflow is not this location's alone: with the one-way
    // sender's "Nao lemos respostas." line it fits at no location. MN-02 does
    // not rescue it: "XX" is a short code, not a place, so nothing is shortened.
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.loadReminderData.mockResolvedValue(row({ locationName: "OsteoJP (XX)", patientHasAcceptedTerms: true }));

    expect(await dispatchReminder(TENANT, APPT, "24h", "sms")).toEqual(refused(167));
    expect(h.sms).toEqual([]);
  });
});

/* ==================================================================== */
/* G7: the booking confirmation, both of its messages                    */
/* ==================================================================== */

describe("G7 - the booking confirmation of a third-location appointment", () => {
  it("confirmation EMAIL and SMS (a booking, a reschedule): name and phone in each, SMS 109 characters", async () => {
    h.loadReminderData.mockResolvedValue(row());

    expect((await dispatchConfirmation(TENANT, APPT)).dispatched).toBe(true);

    const mail = only(h.email);
    expect(mail.templateId).toBe("confirmation.email");
    expectThisLocation(mail.body, "confirmation email body");
    expect(mail.body).toContain(`  Local:     ${NAME}\n`);
    expect(mail.body).toContain(`Ou contacte: ${PHONE}`);
    expectNoOtherClinic(mail.subject ?? "", "confirmation email subject");

    const sms = only(h.sms);
    expect(sms.templateId).toBe("confirmation.sms");
    expect(sms.body).toBe(
      `OsteoJP - Marcacao confirmada\nConsulta: 14/05 as 14:30\nLocal: ${NAME}\nRemarcar: ${PHONE}`,
    );
    expectThisLocation(sms.body, "confirmation sms");
    expectOneSegment(sms.body, 109);
  });

  describe("booking approved (reception accepts an online request)", () => {
    beforeEach(() => {
      process.env.BOOK_CONFIRM_MODE = "on";
    });

    it("the EMAIL: the location's name, its address and its phone, no other clinic", async () => {
      h.loadReminderData.mockResolvedValue(row());

      expect((await dispatchConfirmation(TENANT, APPT, { acceptedPedido: true })).dispatched).toBe(true);

      const mail = only(h.email);
      expect(mail.templateId).toBe("booking_approved.email");
      expect(h.sms).toEqual([]);
      expectThisLocation(mail.body, "booking approved email body");
      expect(mail.body).toContain(`Local: ${NAME}, ${ADDRESS}\n`);
      expect(mail.body).toContain(`Para alterar ou cancelar, contacte a clínica: ${PHONE}\n`);
      expectNoOtherClinic(mail.subject ?? "", "booking approved email subject");
    });

    it("the SMS (no email on file): name and phone, ONE segment, 100 characters", async () => {
      h.loadReminderData.mockResolvedValue(row({ patientEmail: null }));

      expect((await dispatchConfirmation(TENANT, APPT, { acceptedPedido: true })).dispatched).toBe(true);

      const sms = only(h.sms);
      expect(sms.templateId).toBe("booking_approved.sms");
      expect(h.email).toEqual([]);
      expect(sms.body).toBe(
        `OsteoJP: marcacao confirmada para 14/05 as 14:30 em ${NAME}. Duvidas: ${PHONE}.`,
      );
      expectThisLocation(sms.body, "booking approved sms");
      expectOneSegment(sms.body, 100);
    });

    it("the public form's request, linked to this appointment: the same email, the same location", async () => {
      h.isGuestLinked.mockResolvedValue(true);
      h.loadReminderData.mockResolvedValue(row({ origin: "staff" }));

      expect(
        (await dispatchConfirmation(TENANT, APPT, { acceptedGuestRequest: true })).dispatched,
      ).toBe(true);

      const mail = only(h.email);
      expect(mail.templateId).toBe("booking_approved.email");
      expectThisLocation(mail.body, "booking approved email, public form");
    });

    it("never the tenant's phone: a location with no phone sends NOTHING", async () => {
      h.loadReminderData.mockResolvedValue(row({ locationPhone: null }));

      expect((await dispatchConfirmation(TENANT, APPT, { acceptedPedido: true })).dispatched).toBe(false);

      expect(h.email).toEqual([]);
      expect(h.sms).toEqual([]);
    });
  });
});

/* ==================================================================== */
/* MN-03: the follow-up and the no-show                                  */
/* ==================================================================== */

// MN-03 (owner, 2026-10-12: "Yes, in the two emails only."). Until then both
// messages printed the location's phone and NOT its name, so with a third
// location live a patient could not tell which clinic wrote. The two EMAILS now
// carry a "Local:" line, the label the confirmation email already uses, filled
// from the appointment's own location row. The two SMS are not changed by one
// byte: their templates and their rendered bodies are pinned below.

/** Three locations: the third as ruling 5 names it, and two invented ones. */
const THREE = [
  { name: NAME, phone: PHONE },
  { name: "Clinica Norte", phone: "210 222 222" },
  { name: "Clinica Sul", phone: "272 111 111" },
] as const;

/** The dash of the approved signature and subjects, by its code point. */
const DASH = String.fromCharCode(0x2014);

/** The whole follow-up email body. A blank name is the body as it was before MN-03. */
const followUpEmailBody = (name: string, phone: string) =>
  [
    "Olá Madalena,",
    "",
    "Obrigado pela visita de 14 de maio de 2031. Ficamos ao dispor para qualquer questão.",
    "",
    ...(name ? [`Local: ${name}`] : []),
    `Para marcar a próxima consulta contacte: ${phone}`,
    "",
    `${DASH} OsteoJP`,
  ].join("\n");

/** The whole no-show email body. A blank name is the body as it was before MN-03. */
const noShowEmailBody = (name: string, phone: string, link: string) =>
  [
    "Olá Madalena,",
    "",
    "A sua consulta de 14 de maio de 2031 às 14:30 ficou por realizar.",
    "",
    ...(name ? [`Local: ${name}`] : []),
    `Para remarcar: ${link}`,
    `Ou contacte: ${phone}`,
    "",
    `${DASH} OsteoJP`,
  ].join("\n");

/** The signed link is different on every run: read it, then compare the rest exactly. */
function rescheduleLinkOf(body: string): string {
  const found = body.match(/^Para remarcar: (https:\/\/app\.jp\.invalid\/r\/\S+)$/m);
  expect(found, "the no-show email carries no reschedule link").not.toBeNull();
  return found![1]!;
}

function expectNoOtherOfTheThree(text: string, own: (typeof THREE)[number]): void {
  for (const other of THREE) {
    if (other === own) continue;
    expect(text, `names ${other.name}`).not.toContain(other.name);
    expect(squash(text), `prints the phone of ${other.name}`).not.toContain(squash(other.phone));
  }
}

describe("MN-03 - the follow-up and the no-show EMAIL carry the location's name", () => {
  it.each(THREE)("follow-up EMAIL at $name: its OWN name and phone, no other location's", async (place) => {
    h.loadReminderData.mockResolvedValue(
      row({ status: "completed", locationName: place.name, locationPhone: place.phone }),
    );

    expect((await dispatchFollowUp(TENANT, APPT)).dispatched).toBe(true);

    const mail = only(h.email);
    expect(mail.templateId).toBe("follow_up.email");
    expect(mail.subject).toBe(`Obrigado pela sua visita ${DASH} 14 de maio de 2031`);
    expect(mail.body).toBe(followUpEmailBody(place.name, place.phone));
    expect(mail.body).toContain(`\nLocal: ${place.name}\n`);
    expectNoOtherOfTheThree(mail.body, place);
    expectNoOtherClinic(`${mail.subject}\n${mail.body}`, "follow-up email");
  });

  it.each(THREE)("no-show EMAIL at $name: its OWN name and phone, no other location's", async (place) => {
    h.loadReminderData.mockResolvedValue(
      row({ status: "no_show", locationName: place.name, locationPhone: place.phone }),
    );

    expect((await dispatchNoShow(TENANT, APPT)).dispatched).toBe(true);

    const mail = only(h.email);
    expect(mail.templateId).toBe("no_show.email");
    expect(mail.subject).toBe(`Sentimos a sua falta ${DASH} consulta de 14 de maio de 2031`);
    expect(mail.body).toBe(noShowEmailBody(place.name, place.phone, rescheduleLinkOf(mail.body)));
    expect(mail.body).toContain(`\nLocal: ${place.name}\n`);
    expectNoOtherOfTheThree(mail.body, place);
    expectNoOtherClinic(`${mail.subject}\n${mail.body}`, "no-show email");
  });

  it("the third location's emails carry its name and its phone", async () => {
    h.loadReminderData.mockResolvedValue(row({ status: "completed" }));
    await dispatchFollowUp(TENANT, APPT);
    expectThisLocation(only(h.email).body, "follow-up email body");
    h.email.length = 0;

    h.loadReminderData.mockResolvedValue(row({ status: "no_show" }));
    await dispatchNoShow(TENANT, APPT);
    expectThisLocation(only(h.email).body, "no-show email body");
  });

  it("the English emails carry the same name, on a Location line", async () => {
    const en = { locale: "en", contacts: { phone: TENANT_PHONE } };
    h.loadReminderData.mockResolvedValue(row({ status: "completed", tenantSettings: en }));
    await dispatchFollowUp(TENANT, APPT);
    expect(only(h.email).body).toContain(
      `\n\nLocation: ${NAME}\nTo book your next appointment contact us: ${PHONE}\n`,
    );
    h.email.length = 0;

    h.loadReminderData.mockResolvedValue(row({ status: "no_show", tenantSettings: en }));
    await dispatchNoShow(TENANT, APPT);
    expect(only(h.email).body).toContain(`\n\nLocation: ${NAME}\nTo rebook: https://app.jp.invalid/r/`);
    expect(only(h.email).body).toContain(`\nOr contact us: ${PHONE}\n`);
  });

  // The column is required, so this cannot happen from the database. If a name
  // ever arrives blank the email is still sent, without the line: exactly the
  // body that was sent before MN-03. The same for a name carrying a word in
  // braces, which the template fill would substitute or refuse.
  it.each([[""], ["   "], ["Clinica {norte}"], ["Clinica {{clinic_phone}}"]])(
    "a blank or braced name (%j) never stops the send: the line is left out",
    async (blank) => {
      h.loadReminderData.mockResolvedValue(row({ status: "completed", locationName: blank }));
      expect((await dispatchFollowUp(TENANT, APPT)).dispatched).toBe(true);
      const followUp = only(h.email);
      expect(followUp.body).toBe(followUpEmailBody("", PHONE));
      expect(followUp.body).not.toContain("Local:");
      h.email.length = 0;

      h.loadReminderData.mockResolvedValue(row({ status: "no_show", locationName: blank }));
      expect((await dispatchNoShow(TENANT, APPT)).dispatched).toBe(true);
      const noShow = only(h.email);
      expect(noShow.body).toBe(noShowEmailBody("", PHONE, rescheduleLinkOf(noShow.body)));
      expect(noShow.body).not.toContain("Local:");
    },
  );
});

// These pass on the commit before MN-03 and on this one, with no edit between.
describe("MN-03 SMS pin - the follow-up and the no-show SMS are what they were, byte for byte", () => {
  it("the two SMS templates, pt and en", () => {
    expect(FOLLOW_UP_SMS).toEqual({
      pt: "OsteoJP - Obrigado pela sua visita\nVisita: {date}\nMarcar proxima consulta: {phone}",
      en: "OsteoJP - Thank you for your visit\nVisit: {date}\nBook next appointment: {phone}",
    });
    expect(NO_SHOW_SMS).toEqual({
      pt: "OsteoJP - Consulta nao realizada\nConsulta: {date} as {time}\nRemarcar: {phone}",
      en: "OsteoJP - Missed appointment\nAppointment: {date} at {time}\nRebook: {phone}",
    });
  });

  it.each(THREE)("follow-up SMS at $name: the phone and no name", async (place) => {
    h.loadReminderData.mockResolvedValue(
      row({ status: "completed", locationName: place.name, locationPhone: place.phone }),
    );

    await dispatchFollowUp(TENANT, APPT);

    const sms = only(h.sms);
    expect(sms.templateId).toBe("follow_up.sms");
    expect(sms.body).toBe(
      `OsteoJP - Obrigado pela sua visita\nVisita: 14/05\nMarcar proxima consulta: ${place.phone}`,
    );
    expect(sms.body).not.toContain(place.name);
    expectNoOtherClinic(sms.body, "follow-up sms");
    expectOneSegment(sms.body, 85);
  });

  it.each(THREE)("no-show SMS at $name: the phone and no name", async (place) => {
    h.loadReminderData.mockResolvedValue(
      row({ status: "no_show", locationName: place.name, locationPhone: place.phone }),
    );

    await dispatchNoShow(TENANT, APPT);

    const sms = only(h.sms);
    expect(sms.templateId).toBe("no_show.sms");
    expect(sms.body).toBe(
      `OsteoJP - Consulta nao realizada\nConsulta: 14/05 as 14:30\nRemarcar: ${place.phone}`,
    );
    expect(sms.body).not.toContain(place.name);
    expectNoOtherClinic(sms.body, "no-show sms");
    expectOneSegment(sms.body, 79);
  });

  it("the SMS does not read the name: three names and one phone give one body", async () => {
    const bodies = { followUp: new Set<string>(), noShow: new Set<string>() };
    for (const place of THREE) {
      h.loadReminderData.mockResolvedValue(row({ status: "completed", locationName: place.name }));
      await dispatchFollowUp(TENANT, APPT);
      bodies.followUp.add(only(h.sms).body);
      h.sms.length = 0;
      h.email.length = 0;

      h.loadReminderData.mockResolvedValue(row({ status: "no_show", locationName: place.name }));
      await dispatchNoShow(TENANT, APPT);
      bodies.noShow.add(only(h.sms).body);
      h.sms.length = 0;
      h.email.length = 0;
    }

    expect([...bodies.followUp]).toEqual([
      `OsteoJP - Obrigado pela sua visita\nVisita: 14/05\nMarcar proxima consulta: ${PHONE}`,
    ]);
    expect([...bodies.noShow]).toEqual([
      `OsteoJP - Consulta nao realizada\nConsulta: 14/05 as 14:30\nRemarcar: ${PHONE}`,
    ]);
  });
});

/* ==================================================================== */
/* The reply acknowledgements, and the list this file answers for        */
/* ==================================================================== */

describe("the reply acknowledgements name no clinic at all", () => {
  it.each([
    [REPLY_ACK_TEMPLATE_IDS.confirmed, REPLY_ACK_CONFIRMED.pt, 40],
    [REPLY_ACK_TEMPLATE_IDS.cancelled, REPLY_ACK_CANCELLED.pt, 63],
    [REPLY_ACK_TEMPLATE_IDS.review, REPLY_ACK_REVIEW.pt, 69],
  ])("%s: a fixed sentence, one segment", (_id, body, measured) => {
    expectNoOtherClinic(body, "reply acknowledgement");
    expect(body).not.toContain("Montemor");
    expectOneSegment(body, measured);
  });
});

describe("every registered appointment message is one this file sent", () => {
  it("the registry holds no patient message this proof did not look at", async () => {
    // Send them all, once, and compare with the registry: a template added
    // later fails here until somebody proves it for a third location too.
    const seen = new Set<string>();
    const collect = () => {
      for (const m of [...h.email, ...h.sms]) seen.add(m.templateId);
      h.email.length = 0;
      h.sms.length = 0;
      h.handOvers.length = 0;
    };

    h.loadReminderData.mockResolvedValue(row());
    await dispatchReminder(TENANT, APPT, "48h", "email");
    await dispatchReminder(TENANT, APPT, "24h", "sms");
    await dispatchConfirmation(TENANT, APPT);
    collect();
    process.env.BOOK_CONFIRM_MODE = "on";
    await dispatchConfirmation(TENANT, APPT, { acceptedPedido: true });
    collect();
    h.loadReminderData.mockResolvedValue(row({ patientEmail: null }));
    await dispatchConfirmation(TENANT, APPT, { acceptedPedido: true });
    collect();
    h.loadReminderData.mockResolvedValue(row({ status: "completed" }));
    await dispatchFollowUp(TENANT, APPT);
    collect();
    h.loadReminderData.mockResolvedValue(row({ status: "no_show" }));
    await dispatchNoShow(TENANT, APPT);
    collect();

    // Not sendable from a dispatch of this file, each for a stated reason:
    const notSentHere = new Set<string>([
      // routed away: 48h goes by email only and 24h by SMS only (offsets.ts).
      "reminder.48h.sms",
      "reminder.24h.email",
      // the 24h SMS under another id, when the fee line is switched on.
      // Rendered above (FINDING 3): at this location it is refused, so no
      // message goes out under this id to be collected here.
      FEE_NOTICE_TEMPLATE_ID,
      // fixed sentences, asserted above.
      ...Object.values(REPLY_ACK_TEMPLATE_IDS),
    ]);

    const registered = REMINDER_TEMPLATES.map((t) => t.id);
    expect(registered.length).toBeGreaterThan(0);
    for (const id of registered) {
      expect(seen.has(id) || notSentHere.has(id), `no proof for template ${id}`).toBe(true);
    }
    for (const id of seen) expect(registered, `sent under an unregistered id: ${id}`).toContain(id);
  });
});
