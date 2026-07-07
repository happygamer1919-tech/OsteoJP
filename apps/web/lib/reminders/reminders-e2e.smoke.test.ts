/**
 * reminders-e2e.smoke.test.ts
 *
 * End-to-end SMOKE test for the appointment-reminder pipeline, driven entirely
 * in DRY-RUN (REMINDERS_LIVE_SEND off, no real credentials, zero network).
 *
 * It exercises the full path a real reminder takes once the Inngest step fires:
 *
 *     dispatchReminder(tenant, appointment, offset)
 *        → loadReminderData (mocked: realistic PT / EN fixtures)
 *        → resolveLocale → render PT/EN email + SMS (real templates)
 *        → sendEmail / sendSms (real sandbox wrappers; intent captured)
 *
 * and asserts, per channel, the exact INTENT that the live path would hand to
 * Resend / Twilio: recipient, channel, rendered body, and — for email — a
 * reschedule link that VERIFIES via the same token logic the public /r/[token]
 * route uses. For SMS: no link, the call-the-clinic wording, single GSM-7 segment.
 *
 * WHY ASSERT AT THE SEND-WRAPPER BOUNDARY, NOT THE LOG: the dry-run console line
 * is deliberately PII-free (channel + reason only, hard rule #7), so it cannot
 * carry the recipient/body. The "send intent" is the argument the wrapper
 * receives — the exact payload the live call would send — so we capture and
 * assert that. This is also what makes the test live-ready: the rendered intent
 * is IDENTICAL in sandbox and live; flipping REMINDERS_LIVE_SEND to "true" (with
 * provider keys) is the ONLY change — every intent assertion below holds verbatim,
 * and only SendResult.sandbox flips true → false (asserted explicitly so that one
 * field is the single delta). The mocked-SDK live wiring itself is covered by
 * clients.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Locale } from "@osteojp/i18n";

// --- hoisted capture + mocks ------------------------------------------------
// dispatch.ts imports "server-only" (node test env can't load it) and "./data"
// (the DB seam). Neutralise the first; replace the second with fixtures. The
// "./clients" mock WRAPS the real sandbox senders so dry-run logging + sandbox
// SendResults stay real, while we record the intent (to/subject/body).
const h = vi.hoisted(() => ({
  loadReminderData: vi.fn(),
  email: [] as { to: string; subject: string; body: string }[],
  sms: [] as { to: string; body: string }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("./data", () => ({ loadReminderData: h.loadReminderData }));
vi.mock("./clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clients")>();
  return {
    ...actual,
    sendEmail: vi.fn(async (m: { to: string; subject: string; body: string }) => {
      h.email.push(m);
      return actual.sendEmail(m);
    }),
    sendSms: vi.fn(async (m: { to: string; body: string }) => {
      h.sms.push(m);
      return actual.sendSms(m);
    }),
  };
});

import { dispatchReminder } from "./dispatch";
import { verifyRescheduleToken } from "./link-token";
import { formatDateShort, formatTime } from "./locale";
import { isGsm7, SMS_SEGMENT_LIMIT, type ReminderOffsetId } from "./templates";

// --- fixtures ---------------------------------------------------------------

const TENANT_ID = "22222222-2222-2222-2222-222222222222";
const APPOINTMENT_ID = "11111111-1111-1111-1111-111111111111";
const SECRET = "test-only-link-secret-not-prod";
const BASE_URL = "https://osteojp.pt";

// FUTURE-dated relative to real "now": the reschedule token expires at
// startsAt + 24h grace, so a past appointment would make verifyRescheduleToken
// (correctly) reject as expired. 45 days out keeps the token valid whenever the
// suite runs. Time/date assertions use the real formatters, not literals.
const STARTS_AT = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
// Worst-case SMS fill (longest location + longest phone), as #84 validated.
const LONGEST_LOCATION = "Montemor-o-Novo";
const LONGEST_PHONE = "+351 210 000 000";

type Fixture = ReturnType<typeof makeData>;

function makeData(locale: Locale) {
  const pt = locale === "pt";
  return {
    appointmentId: APPOINTMENT_ID,
    startsAt: STARTS_AT,
    status: "confirmed",
    patientId: "33333333-3333-3333-3333-333333333333",
    patientName: pt ? "Madalena Sousa" : "Mary Roberts",
    patientEmail: pt ? "madalena@example.pt" : "mary@example.com",
    patientPhone: LONGEST_PHONE,
    patientReminderSmsEnabled: true,
    patientReminderEmailEnabled: true,
    practitionerName: "Dr. João Pereira",
    locationName: LONGEST_LOCATION,
    locationPhone: LONGEST_PHONE,
    tenantSettings: { locale, contacts: { phone: LONGEST_PHONE } },
  };
}

// Per-locale/offset expectations for the rendered copy.
const EXPECT: Record<
  Locale,
  { greeting: string; smsVerb: string; subject: Record<ReminderOffsetId, string> }
> = {
  pt: {
    greeting: "Olá Madalena,",
    smsVerb: "ligue", // "Para remarcar ligue {phone}"
    subject: {
      "48h": "Lembrete: consulta em 48 horas",
      "24h": "Lembrete: consulta amanhã",
    },
  },
  en: {
    greeting: "Dear Mary,",
    smsVerb: "call", // "To reschedule call {phone}"
    subject: {
      "48h": "Reminder: appointment in 48 hours",
      "24h": "Reminder: appointment tomorrow",
    },
  },
};

const ENV_KEYS = [
  "REMINDERS_LIVE_SEND",
  "REMINDERS_LINK_SECRET",
  "REMINDERS_RESCHEDULE_BASE_URL",
  "RESEND_API_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_SMS_FROM",
  "TWILIO_MESSAGING_SERVICE_SID",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  // Dry-run default: live flag off, link secret + base configured.
  process.env.REMINDERS_LINK_SECRET = SECRET;
  process.env.REMINDERS_RESCHEDULE_BASE_URL = BASE_URL;
  h.email.length = 0;
  h.sms.length = 0;
  h.loadReminderData.mockReset();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

const RESCHEDULE_LINK_RE = /https:\/\/osteojp\.pt\/r\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/;

// ---------------------------------------------------------------------------
// 1. Full dry-run path: trigger → template selection → render → send intent.
// ---------------------------------------------------------------------------
describe("reminder dry-run E2E — render + send intent (PT & EN, 48h & 24h)", () => {
  const matrix: { locale: Locale; offset: ReminderOffsetId }[] = [
    { locale: "pt", offset: "48h" },
    { locale: "pt", offset: "24h" },
    { locale: "en", offset: "48h" },
    { locale: "en", offset: "24h" },
  ];

  for (const { locale, offset } of matrix) {
    it(`${locale.toUpperCase()} ${offset}: emails a verifiable reschedule link and SMSes a link-free clinic CTA`, async () => {
      const data: Fixture = makeData(locale);
      h.loadReminderData.mockResolvedValue(data);
      const info = vi.spyOn(console, "info").mockImplementation(() => {});

      const outcome = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, offset);

      // --- both channels dispatched, both sandbox (the ONE field that flips live) ---
      expect(outcome.dispatched).toBe(true);
      if (!outcome.dispatched) return; // type-narrow
      expect(outcome.channels.map((c) => c.channel).sort()).toEqual(["email", "sms"]);
      expect(outcome.channels.every((c) => c.sandbox === true)).toBe(true);

      // --- EMAIL intent: recipient, channel, rendered body, reschedule link ---
      expect(h.email).toHaveLength(1);
      const email = h.email[0]!;
      expect(email.to).toBe(data.patientEmail); // correct recipient
      expect(email.subject).toContain(EXPECT[locale].subject[offset]);
      expect(email.body).toContain(EXPECT[locale].greeting); // rendered body
      expect(email.body).toContain(data.locationName);
      expect(email.body).toContain(formatTime(STARTS_AT, locale)); // Lisbon wall-clock
      expect(email.body).not.toMatch(/\{\{?[a-z_]+\}?\}/i); // no unfilled placeholders

      // reschedule link present and RESOLVES via the same token logic /r/[token] uses
      const match = email.body.match(RESCHEDULE_LINK_RE);
      expect(match, "email body must contain an /r/<token> reschedule link").not.toBeNull();
      const token = match![1]!;
      const claims = verifyRescheduleToken(token);
      expect(claims).not.toBeNull();
      expect(claims!.tenantId).toBe(TENANT_ID);
      expect(claims!.appointmentId).toBe(APPOINTMENT_ID);

      // --- SMS intent: recipient, no link, clinic CTA, single GSM-7 segment ---
      expect(h.sms).toHaveLength(1);
      const sms = h.sms[0]!;
      // Correct recipient, normalized to E.164 (phone.ts strips the display
      // spacing of the stored "+351 210 000 000" before the send wrapper).
      expect(sms.to).toBe("+351210000000");
      expect(sms.body).not.toMatch(/https?:\/\//); // NO link
      expect(sms.body).not.toContain("/r/");
      expect(sms.body).toContain(EXPECT[locale].smsVerb); // call-the-clinic wording
      expect(sms.body).toContain(LONGEST_PHONE);
      expect(sms.body).toContain(formatDateShort(STARTS_AT)); // dd/mm date filled
      expect(sms.body).toContain(formatTime(STARTS_AT, locale)); // time filled
      expect(isGsm7(sms.body)).toBe(true); // single-byte GSM-7 family
      expect(sms.body.length).toBeLessThanOrEqual(SMS_SEGMENT_LIMIT); // ≤ 160, worst-case fill

      // --- dry-run intent log is PII-SAFE: channel + reason only, never content ---
      const logged = info.mock.calls.map((c) => String(c[0])).join("\n");
      expect(logged).toContain("[reminders] dry-run: email not sent (live_send_disabled)");
      expect(logged).toContain("[reminders] dry-run: sms not sent (live_send_disabled)");
      expect(logged).not.toContain(data.patientEmail);
      expect(logged).not.toContain(data.patientPhone);
      expect(logged).not.toContain(EXPECT[locale].greeting);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Reschedule-link secret: fails loud when unset; verifies when set.
// ---------------------------------------------------------------------------
describe("reschedule link secret (REMINDERS_LINK_SECRET)", () => {
  it("FAILS LOUD: dispatch throws when the link secret is unset (no silent unsigned link)", async () => {
    delete process.env.REMINDERS_LINK_SECRET;
    h.loadReminderData.mockResolvedValue(makeData("pt"));
    vi.spyOn(console, "info").mockImplementation(() => {});

    await expect(dispatchReminder(TENANT_ID, APPOINTMENT_ID, "48h")).rejects.toThrow(
      /REMINDERS_LINK_SECRET/,
    );
    // Nothing was handed to the senders — it failed before send intent.
    expect(h.email).toHaveLength(0);
    expect(h.sms).toHaveLength(0);
  });

  it("VERIFIES: with the secret set, the email link round-trips to its claims", async () => {
    h.loadReminderData.mockResolvedValue(makeData("pt"));
    vi.spyOn(console, "info").mockImplementation(() => {});

    await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h");

    const token = h.email[0]!.body.match(RESCHEDULE_LINK_RE)![1]!;
    // Same secret → verifies. A token verified under a DIFFERENT secret must fail.
    expect(verifyRescheduleToken(token)).not.toBeNull();
    process.env.REMINDERS_LINK_SECRET = "a-different-secret";
    expect(verifyRescheduleToken(token)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Inngest scheduler wiring — registered & deployable? (reported in PR)
// ---------------------------------------------------------------------------
describe("Inngest scheduler wiring", () => {
  it("registers all notification functions and serves them at /api/inngest", async () => {
    const { functions } = await import("./inngest/functions");
    expect(functions).toHaveLength(5);

    const route = await import("@/app/api/inngest/route");
    // serve() must expose the three verbs Inngest calls (GET/POST/PUT).
    expect(typeof route.GET).toBe("function");
    expect(typeof route.POST).toBe("function");
    expect(typeof route.PUT).toBe("function");
  });

  it("enqueue entrypoint emits the appointment/scheduled trigger event (the caller is the missing wiring)", async () => {
    const { inngest, EVENT_APPOINTMENT_SCHEDULED } = await import("./inngest/client");
    const { enqueueAppointmentReminders } = await import("./index");

    const send = vi.spyOn(inngest, "send").mockResolvedValue(undefined as never);
    await enqueueAppointmentReminders({
      appointmentId: APPOINTMENT_ID,
      tenantId: TENANT_ID,
      startsAt: STARTS_AT,
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      name: EVENT_APPOINTMENT_SCHEDULED,
      data: {
        appointmentId: APPOINTMENT_ID,
        tenantId: TENANT_ID,
        startsAt: STARTS_AT.toISOString(),
      },
    });
    // NOTE: enqueueAppointmentReminders is correct and ready, but nothing in the
    // scheduling layer CALLS it yet — that caller is the one missing wire before
    // go-live. See the PR description.
  });
});
