/**
 * dispatch.test.ts — Stream E: dispatch honors the tenant reminder config
 * (channel toggles + selected lead times) read from tenants.settings.
 *
 * Two layers:
 *   1. planReminderChannels — the pure decision: given a ReminderConfig, an
 *      offset, and which contacts the patient has, which channels send (if any).
 *      Every branch is locked here, deterministically, with no DB.
 *   2. dispatchReminder — the wired path with loadReminderData mocked and the
 *      send wrappers captured, proving the plan actually gates real sends and
 *      that an unset config preserves the prior all-channels behavior.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReminderConfig } from "@/lib/admin/settings-config";

// dispatch.ts imports "server-only" (no node build) and "./data" (the DB seam).
// Neutralise the first; replace the second with a fixture fn. "./clients" is
// wrapped so the real sandbox SendResults stay real while we record intent.
const h = vi.hoisted(() => ({
  loadReminderData: vi.fn(),
  email: [] as { to: string }[],
  sms: [] as { to: string }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("./data", () => ({ loadReminderData: h.loadReminderData }));
vi.mock("./clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clients")>();
  return {
    ...actual,
    sendEmail: vi.fn(async (m: Parameters<typeof actual.sendEmail>[0]) => {
      h.email.push({ to: m.to });
      return actual.sendEmail(m);
    }),
    sendSms: vi.fn(async (m: Parameters<typeof actual.sendSms>[0]) => {
      h.sms.push({ to: m.to });
      return actual.sendSms(m);
    }),
  };
});

import { dispatchReminder, planReminderChannels } from "./dispatch";

const TENANT_ID = "22222222-2222-2222-2222-222222222222";
const APPOINTMENT_ID = "11111111-1111-1111-1111-111111111111";
const PATIENT_ID = "33333333-3333-3333-3333-333333333333";
// Future-dated so the reschedule token (used in the email path) is not expired.
const STARTS_AT = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);

function cfg(overrides: Partial<ReminderConfig> = {}): ReminderConfig {
  return { emailEnabled: true, smsEnabled: true, leadTimeHours: [48, 24], ...overrides };
}

/* ------------------------------- pure plan ------------------------------- */

/**
 * OWNER ROUTING RULE, 2026-08-31 — ONE CHANNEL PER OFFSET, AND THE PLAN IS
 * WHERE IT IS DECIDED.
 *
 * WHAT THESE ASSERTIONS USED TO SAY. Every case below was written against
 * "24h" and expected `email: true, sms: true` — the plan happily produced BOTH
 * channels for one offset, and the reason the patient never got two messages
 * was that the SCHEDULER only ever fanned out one of them. The rule lived in a
 * fan-out detail, not in a rule, so a caller passing a different pair, or a
 * second call site, would have sent the twin with nothing refusing it.
 *
 * WHAT THEY SAY NOW. The plan itself routes: 48h can only ever produce email,
 * 24h can only ever produce SMS, whatever the tenant config and the patient
 * preferences say. Everything else about the plan is UNCHANGED and is
 * re-asserted here rather than deleted — lead_time_off still wins over
 * everything, no_contact still precedes channels_off, and a patient opt-out
 * still suppresses its own channel.
 */
describe("planReminderChannels", () => {
  const both = { email: true, phone: true };

  it("48h routes to EMAIL ONLY — there is no SMS twin, even with both on", () => {
    expect(planReminderChannels(cfg(), "48h", both)).toEqual({
      send: true,
      email: true,
      sms: false,
    });
  });

  it("24h routes to SMS ONLY — there is no email twin, even with both on", () => {
    expect(planReminderChannels(cfg(), "24h", both)).toEqual({
      send: true,
      email: false,
      sms: true,
    });
  });

  it("the routing does NOT depend on the patient having toggled preferences", () => {
    // The production default for a patient row: SMS on, email OFF (0019).
    const prodDefaults = { smsEnabled: true, emailEnabled: false };
    // 24h still routes to SMS...
    expect(planReminderChannels(cfg(), "24h", both, prodDefaults)).toEqual({
      send: true,
      email: false,
      sms: true,
    });
    // ...and 48h still routes to email and nowhere else. It does not fall back
    // to SMS because the patient never switched email on: a suppressed channel
    // is a suppressed message, never a message on the other channel.
    expect(planReminderChannels(cfg(), "48h", both, prodDefaults)).toEqual({
      send: false,
      reason: "channels_off",
    });
  });

  it("drops the email channel when the tenant disabled email (48h then sends nothing)", () => {
    expect(planReminderChannels(cfg({ emailEnabled: false }), "48h", both)).toEqual({
      send: false,
      reason: "channels_off",
    });
  });

  it("drops the SMS channel when the tenant disabled SMS (24h then sends nothing)", () => {
    expect(planReminderChannels(cfg({ smsEnabled: false }), "24h", both)).toEqual({
      send: false,
      reason: "channels_off",
    });
  });

  it("does not send a channel the patient lacks contact for", () => {
    // 48h with no email on file: skipped, and NOT re-routed to the phone.
    expect(planReminderChannels(cfg(), "48h", { email: false, phone: true })).toEqual({
      send: false,
      reason: "channels_off",
    });
    // 24h with no phone on file: same shape on the other axis.
    expect(planReminderChannels(cfg(), "24h", { email: true, phone: false })).toEqual({
      send: false,
      reason: "channels_off",
    });
  });

  it("suppresses the offset entirely when its lead time is not selected", () => {
    const subset = cfg({ leadTimeHours: [24] });
    expect(planReminderChannels(subset, "48h", both)).toEqual({
      send: false,
      reason: "lead_time_off",
    });
    // The selected lead time still goes through.
    expect(planReminderChannels(subset, "24h", both)).toMatchObject({ send: true });
  });

  it("reports no_contact when the patient has neither email nor phone", () => {
    // Precedence: no_contact beats channels_off and beats the routing rule.
    expect(planReminderChannels(cfg(), "24h", { email: false, phone: false })).toEqual({
      send: false,
      reason: "no_contact",
    });
  });

  it("A PATIENT WHO DISABLED SMS GETS NO SMS AT 24h — and no email instead", () => {
    const prefs = { smsEnabled: false, emailEnabled: true };
    // The opt-out survives the routing rule: routing chooses WHICH channel the
    // offset may use, the preference decides whether it may be used at all.
    expect(planReminderChannels(cfg(), "24h", both, prefs)).toEqual({
      send: false,
      reason: "channels_off",
    });
    // Their 48h email is untouched — the opt-out was about SMS.
    expect(planReminderChannels(cfg(), "48h", both, prefs)).toEqual({
      send: true,
      email: true,
      sms: false,
    });
  });

  it("patient opt-out of SMS takes precedence over tenant SMS being enabled", () => {
    const prefs = { smsEnabled: false, emailEnabled: true };
    expect(planReminderChannels(cfg({ smsEnabled: true }), "24h", both, prefs)).toEqual({
      send: false,
      reason: "channels_off",
    });
  });

  it("returns channels_off when the patient has opted out of every channel", () => {
    const prefs = { smsEnabled: false, emailEnabled: false };
    expect(planReminderChannels(cfg(), "24h", both, prefs)).toEqual({
      send: false,
      reason: "channels_off",
    });
    expect(planReminderChannels(cfg(), "48h", both, prefs)).toEqual({
      send: false,
      reason: "channels_off",
    });
  });

  it("omitting patientPrefs defaults to both-enabled, and routing still holds", () => {
    expect(planReminderChannels(cfg(), "24h", both)).toEqual({
      send: true,
      email: false,
      sms: true,
    });
  });
});

/* --------------------------- wired dispatch ------------------------------ */

describe("dispatchReminder honors tenant reminder config", () => {
  const ENV_KEYS = ["REMINDERS_LIVE_SEND", "REMINDERS_LINK_SECRET", "REMINDERS_RESCHEDULE_BASE_URL"];
  const saved: Record<string, string | undefined> = {};

  function fixture(reminders?: unknown, patientPrefs?: { smsEnabled?: boolean; emailEnabled?: boolean }) {
    return {
      appointmentId: APPOINTMENT_ID,
      startsAt: STARTS_AT,
      status: "confirmed",
      patientId: PATIENT_ID,
      patientName: "Madalena Sousa",
      patientEmail: "madalena@example.pt",
      // A MOBILE, changed from "+351 210 000 000" on 2026-08-20
      // (Q-LE-REMINDERS-LANDLINE-1). The old value was a 21x GEOGRAPHIC line and
      // this test asserts an SMS is dispatched to it — which the ruling now
      // refuses, correctly: a landline cannot receive one. The fixture was
      // modelling the defect and asserting it was fine. This suite is about
      // CHANNEL SELECTION, not about landlines.
      patientPhone: "+351 912 345 678",
      // Default patient prefs: SMS on, email on (same as "both enabled" default).
      patientReminderSmsEnabled: patientPrefs?.smsEnabled ?? true,
      patientReminderEmailEnabled: patientPrefs?.emailEnabled ?? true,
      practitionerName: "Dr. João Pereira",
      locationName: "Linda-a-Velha",
      locationPhone: "+351 210 000 000",
      // reminders left undefined → parseTenantConfig fills defaults (all on).
      tenantSettings: { locale: "pt", contacts: { phone: "+351 210 000 000" }, reminders },
    };
  }

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    // Dry-run: live send off; link secret + base set so the email path can sign.
    process.env.REMINDERS_LINK_SECRET = "test-only-link-secret-not-prod";
    process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://osteojp.pt";
    h.loadReminderData.mockReset();
    h.email.length = 0;
    h.sms.length = 0;
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("sends only the enabled channel (email off → SMS only) even with both contacts", async () => {
    h.loadReminderData.mockResolvedValue(
      fixture({ emailEnabled: false, smsEnabled: true, leadTimeHours: [48, 24] }),
    );

    const outcome = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms");

    expect(outcome).toMatchObject({ dispatched: true });
    if (!outcome.dispatched) throw new Error("expected dispatched");
    expect(outcome.channels.map((c) => c.channel)).toEqual(["sms"]);
    expect(h.email).toHaveLength(0);
    expect(h.sms).toHaveLength(1);
  });

  it("skips SMS (email still sends) when the stored phone cannot normalize to E.164 PT, logging ids only", async () => {
    h.loadReminderData.mockResolvedValue({
      ...fixture(undefined),
      patientPhone: "not a real number",
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const outcome = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms");

      // One run, one channel: an unusable phone means this SMS run sends nothing.
      // It is still `dispatched` (not an error) and the 48h EMAIL run is a
      // separate run, entirely unaffected — which is the point of the split.
      expect(outcome).toMatchObject({ dispatched: true });
      if (!outcome.dispatched) throw new Error("expected dispatched");
      expect(outcome.channels).toHaveLength(0);
      expect(h.sms).toHaveLength(0);
      expect(h.email).toHaveLength(0);

      // Structured skip log: ids only — NEVER the raw number (PII rule #7).
      const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
      expect(logged).toContain("invalid_phone");
      expect(logged).toContain(`tenantId=${TENANT_ID}`);
      expect(logged).toContain(`appointmentId=${APPOINTMENT_ID}`);
      expect(logged).toContain(`patientId=${PATIENT_ID}`);
      expect(logged).not.toContain("not a real number");
    } finally {
      warn.mockRestore();
    }
  });

  it("suppresses an offset whose lead time the tenant did not select", async () => {
    h.loadReminderData.mockResolvedValue(
      fixture({ emailEnabled: true, smsEnabled: true, leadTimeHours: [24] }),
    );

    // 48h is not in the selected set → nothing sends.
    const off = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "48h", "email");
    expect(off).toEqual({ dispatched: false, reason: "lead_time_off" });
    expect(h.email).toHaveLength(0);
    expect(h.sms).toHaveLength(0);

    // 24h is selected → its one channel (SMS) sends.
    const on = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms");
    expect(on).toMatchObject({ dispatched: true });
    if (!on.dispatched) throw new Error("expected dispatched");
    expect(on.channels.map((c) => c.channel)).toEqual(["sms"]);
  });

  it("preserves prior behavior when the tenant has no reminder config saved", async () => {
    // No `reminders` key at all → tolerant parse → defaults (all channels, all
    // lead times). This is the "defaults preserve current behavior" guarantee.
    h.loadReminderData.mockResolvedValue(fixture(undefined));

    const outcome = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "48h", "email");

    expect(outcome).toMatchObject({ dispatched: true });
    if (!outcome.dispatched) throw new Error("expected dispatched");
    // 48h is the EMAIL offset: one run, one channel.
    expect(outcome.channels.map((c) => c.channel)).toEqual(["email"]);
    expect(h.email).toHaveLength(1);
    expect(h.sms).toHaveLength(0);
  });

  it("suppresses SMS when patient has opted out of SMS, even if tenant SMS is on", async () => {
    h.loadReminderData.mockResolvedValue(
      fixture({ emailEnabled: true, smsEnabled: true, leadTimeHours: [48, 24] }, { smsEnabled: false, emailEnabled: true }),
    );

    // The 24h run is the SMS run. The patient opted out of SMS, so it sends
    // nothing — it does NOT fall back to email, which would deliver a channel the
    // patient did not consent to on this offset.
    const outcome = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms");

    expect(outcome).toEqual({ dispatched: false, reason: "channels_off" });
    expect(h.email).toHaveLength(0);
    expect(h.sms).toHaveLength(0);
  });

  it("returns channels_off when patient has opted out of all channels", async () => {
    h.loadReminderData.mockResolvedValue(
      fixture({ emailEnabled: true, smsEnabled: true, leadTimeHours: [48, 24] }, { smsEnabled: false, emailEnabled: false }),
    );

    const outcome = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms");

    expect(outcome).toEqual({ dispatched: false, reason: "channels_off" });
    expect(h.email).toHaveLength(0);
    expect(h.sms).toHaveLength(0);
  });
});
