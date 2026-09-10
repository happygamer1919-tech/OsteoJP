/**
 * email-leg-live.test.ts — THE 48h EMAIL LEG, ARMED.
 *
 * ===========================================================================
 * WHY THIS FILE EXISTS WHEN reminders-e2e.smoke.test.ts ALREADY COVERS 48h.
 * ===========================================================================
 * That suite runs the whole pipeline in DRY RUN, on purpose, and says so in its
 * header: "REMINDERS_LIVE_SEND off, no real credentials, zero network". It
 * proves the 48h email RENDERS and reaches the `sendEmail` wrapper. It cannot
 * prove the wrapper then reaches Resend, because with the flag off the gate
 * suppresses every send before the transport - which is exactly the half that
 * production runs and no test did.
 *
 * clients.test.ts covers the other half, live-armed, but through an INJECTED
 * fixture registry and the id `confirmation.email`. The production registry and
 * the id `reminder.48h.email` were never carried through an armed dispatch.
 *
 * So the two suites met at a seam, and the seam is where production lives:
 *
 *     smoke:        dispatchReminder -> sendEmail            (flag OFF)
 *     clients:                          sendEmail -> Resend  (fixture registry)
 *     PRODUCTION:   dispatchReminder -> sendEmail -> Resend  (real registry, armed)
 *                                                ^^^^^^^^^^
 *                                                never exercised
 *
 * This file runs that whole line with the flag ON, the real registry, and the
 * Resend SDK mocked at the module boundary - so the question "does a 48h email
 * dispatch ever reach a Resend call" is answered by observation rather than by
 * reading the code.
 *
 * IT ALSO PINS WHERE A FAILURE GOES, which was the second half of the question.
 * A Resend rejection THROWS out of dispatchReminder. It used to throw between
 * the send and the ledger write, so the row that would have recorded the attempt
 * was never written and a refused email left NOTHING anywhere queryable - only a
 * failed Inngest run, which expires. `provider_error` had been in 0075's CHECK
 * since the table was created and no code had ever written it.
 *
 * That is fixed in this batch and asserted below: the rejection writes its row
 * FIRST and then rethrows, so the run still fails and still retries. The tests
 * hold both halves - the row exists, and the throw survives - because either one
 * alone would be the wrong fix.
 *
 * NO NETWORK. The `resend` and `twilio` modules are replaced before import; the
 * credentials below are placeholders and no real value appears in this repo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  loadReminderData: vi.fn(),
  resendSend: vi.fn(),
  ResendCtor: vi.fn(),
  twilioCreate: vi.fn(),
  // TYPED WITH ITS ARGUMENT. A bare `vi.fn(async () => {})` has an EMPTY tuple
  // parameter list, so `mock.calls[0]![0]` is a compile error - and the shape
  // the assertions below read is exactly that argument.
  recordDispatch: vi.fn(async (_row: Record<string, unknown>) => {}),
}));

vi.mock("server-only", () => ({}));
vi.mock("./data", () => ({ loadReminderData: h.loadReminderData }));
// The ledger is the OBSERVATION under test in the rejection case, so it is
// captured rather than left to no-op against an absent database.
vi.mock("./dispatch-ledger", () => ({
  recordDispatch: h.recordDispatch,
  recordProviderStatus: vi.fn(async () => {}),
}));

// The SDKs, replaced at the module boundary. dispatch.ts -> clients.ts imports
// these LAZILY inside the live path, so a suppressed send never loads them and
// a call here is itself evidence the live path was taken.
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: h.resendSend };
    constructor(key: string) {
      h.ResendCtor(key);
    }
  },
}));
vi.mock("twilio", () => ({
  default: () => ({ messages: { create: h.twilioCreate } }),
}));

import { dispatchReminder } from "./dispatch";

const TENANT_ID = "22222222-2222-2222-2222-222222222222";
const APPOINTMENT_ID = "11111111-1111-1111-1111-111111111111";
const PATIENT_ID = "33333333-3333-3333-3333-333333333333";

/**
 * EIGHT DAYS OUT, which is the lead time of the appointment the clinic reported.
 * Both offsets are schedulable at that distance, so nothing here is excluded by
 * the scheduling arithmetic - the run reaches dispatch with both windows open.
 */
const STARTS_AT = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);

/** Every gate this appointment must pass, all passing. */
function eligible() {
  return {
    appointmentId: APPOINTMENT_ID,
    startsAt: STARTS_AT,
    status: "confirmed",
    patientId: PATIENT_ID,
    patientName: "Madalena Sousa",
    patientEmail: "madalena@example.pt",
    patientPhone: "+351 912 345 678",
    patientReminderSmsEnabled: true,
    patientReminderEmailEnabled: true,
    patientDeletedAt: null,
    practitionerName: "Dr. João Pereira",
    locationName: "Linda-a-Velha",
    locationPhone: "+351 210 000 000",
    tenantSettings: {
      locale: "pt",
      contacts: { phone: "+351 210 000 000" },
      // Both channels on, both lead times selected - the effective production
      // config read on 2026-09-10.
      reminders: { emailEnabled: true, smsEnabled: true, leadTimeHours: [48, 24] },
    },
  };
}

const ENV_KEYS = [
  "REMINDERS_LIVE_SEND",
  "INVITES_LIVE_SEND",
  "RESEND_API_KEY",
  "REMINDERS_EMAIL_FROM",
  "INVITES_EMAIL_FROM",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_SMS_FROM",
  "TWILIO_MESSAGING_SERVICE_SID",
  "REMINDERS_RESCHEDULE_BASE_URL",
  "REMINDERS_LINK_SECRET",
] as const;

const saved: Record<string, string | undefined> = {};

/**
 * PRODUCTION'S SHAPE, DERIVED RATHER THAN GUESSED. `assertNotificationEnv` runs
 * on EVERY dispatch, both channels, and throws naming every missing var at once
 * - so an armed stream missing RESEND_API_KEY or REMINDERS_EMAIL_FROM could not
 * deliver an SMS either. The 24h SMS leg mints confirm codes daily in
 * production, which means that assertion is passing there, which means both
 * email variables are set. That is why this arms them: it is what production
 * must look like for the observed SMS behaviour to be possible.
 */
function armLikeProduction(): void {
  process.env.REMINDERS_LIVE_SEND = "true";
  process.env.RESEND_API_KEY = "re_placeholder";
  process.env.REMINDERS_EMAIL_FROM = "lembretes@send.osteojp.pt";
  process.env.TWILIO_ACCOUNT_SID = "AC_placeholder";
  process.env.TWILIO_AUTH_TOKEN = "tok_placeholder";
  process.env.TWILIO_SMS_FROM = "OsteoJP";
  process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://portal.example.test";
  process.env.REMINDERS_LINK_SECRET = "placeholder-secret";
}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  h.loadReminderData.mockReset();
  h.resendSend.mockReset();
  h.ResendCtor.mockReset();
  h.twilioCreate.mockReset();
  h.recordDispatch.mockReset();
  h.recordDispatch.mockImplementation(async () => {});
  h.loadReminderData.mockResolvedValue(eligible());
  armLikeProduction();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("the 48h email leg, armed and through the real registry", () => {
  it("REACHES RESEND: an eligible 48h run calls emails.send under reminder.48h.email", async () => {
    h.resendSend.mockResolvedValue({ data: { id: "email_live_1" }, error: null });

    const outcome = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "48h", "email");

    // The SDK was constructed, which only happens on the live path.
    expect(h.ResendCtor).toHaveBeenCalledWith("re_placeholder");
    expect(h.resendSend).toHaveBeenCalledTimes(1);

    const sent = h.resendSend.mock.calls[0]![0] as {
      from: string;
      to: string;
      subject: string;
      text: string;
    };
    expect(sent.from).toBe("lembretes@send.osteojp.pt");
    expect(sent.to).toBe("madalena@example.pt");
    // The 48h body, not some other template that happened to be approved.
    expect(sent.subject).toContain("48");
    expect(sent.text).toContain("/r/");

    expect(outcome).toMatchObject({ dispatched: true });
    if (!outcome.dispatched) throw new Error("expected dispatched");
    // sandbox:false is the single field that separates a live send from a
    // suppressed one, and it is the one the ledger reads to decide `sent`.
    expect(outcome.channels).toEqual([
      { channel: "email", sandbox: false, id: "email_live_1" },
    ]);
  });

  it("SENDS NO SMS on the email run - one run, one channel", async () => {
    h.resendSend.mockResolvedValue({ data: { id: "email_live_2" }, error: null });
    await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "48h", "email");
    expect(h.twilioCreate).not.toHaveBeenCalled();
  });

  it("A RESEND REJECTION THROWS OUT OF dispatchReminder, and that is where the record is lost", async () => {
    h.resendSend.mockResolvedValue({ data: null, error: { name: "validation_error" } });

    // The throw is the whole finding. `dispatchReminder`'s ledger wrapper records
    // only NOT-dispatched OUTCOMES; a throw is not an outcome, so it passes the
    // wrapper without writing anything, and the `sent` row inside the inner
    // function is never reached either - it sits after this await. The attempt
    // therefore exists only as a failed Inngest run, which expires.
    await expect(
      dispatchReminder(TENANT_ID, APPOINTMENT_ID, "48h", "email"),
    ).rejects.toThrow(/Resend send failed/);

    // And the error names the provider's reason class, never the recipient.
    await expect(
      dispatchReminder(TENANT_ID, APPOINTMENT_ID, "48h", "email"),
    ).rejects.not.toThrow(/madalena/);
  });

  it("A REJECTION NOW LEAVES A provider_error ROW, which is what nothing did before", async () => {
    h.resendSend.mockResolvedValue({ data: null, error: { name: "validation_error" } });

    await expect(
      dispatchReminder(TENANT_ID, APPOINTMENT_ID, "48h", "email"),
    ).rejects.toThrow(/Resend send failed/);

    // Exactly one row, and it is the third outcome 0075 defined and nothing
    // had ever written.
    expect(h.recordDispatch).toHaveBeenCalledTimes(1);
    expect(h.recordDispatch.mock.calls[0]![0]).toMatchObject({
      tenantId: TENANT_ID,
      appointmentId: APPOINTMENT_ID,
      channel: "email",
      templateId: "reminder.48h.email",
      outcome: "provider_error",
      // Resend's reason class, carried on the typed error rather than parsed
      // back out of the sentence.
      providerErrorCode: "validation_error",
    });
  });

  it("a SENT email still records exactly one `sent` row and no error row", async () => {
    h.resendSend.mockResolvedValue({ data: { id: "email_live_3" }, error: null });
    await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "48h", "email");
    expect(h.recordDispatch).toHaveBeenCalledTimes(1);
    expect(h.recordDispatch.mock.calls[0]![0]).toMatchObject({
      outcome: "sent",
      providerMessageId: "email_live_3",
    });
  });

  it("the ROUTING GUARD refuses a 48h SMS even fully armed", async () => {
    const outcome = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "48h", "sms");
    expect(outcome).toEqual({ dispatched: false, reason: "channel_not_for_offset" });
    expect(h.twilioCreate).not.toHaveBeenCalled();
    expect(h.resendSend).not.toHaveBeenCalled();
  });

  it("the patient email opt-out is the one stored flag that silences this leg", async () => {
    h.loadReminderData.mockResolvedValue({
      ...eligible(),
      patientReminderEmailEnabled: false,
    });
    const outcome = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "48h", "email");
    expect(outcome).toEqual({ dispatched: false, reason: "channels_off" });
    expect(h.resendSend).not.toHaveBeenCalled();
  });
});
