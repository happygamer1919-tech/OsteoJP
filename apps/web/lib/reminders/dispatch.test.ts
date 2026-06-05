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
    sendEmail: vi.fn(async (m: { to: string; subject: string; body: string }) => {
      h.email.push({ to: m.to });
      return actual.sendEmail(m);
    }),
    sendSms: vi.fn(async (m: { to: string; body: string }) => {
      h.sms.push({ to: m.to });
      return actual.sendSms(m);
    }),
  };
});

import { dispatchReminder, planReminderChannels } from "./dispatch";

const TENANT_ID = "22222222-2222-2222-2222-222222222222";
const APPOINTMENT_ID = "11111111-1111-1111-1111-111111111111";
// Future-dated so the reschedule token (used in the email path) is not expired.
const STARTS_AT = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);

function cfg(overrides: Partial<ReminderConfig> = {}): ReminderConfig {
  return { emailEnabled: true, smsEnabled: true, leadTimeHours: [48, 24], ...overrides };
}

/* ------------------------------- pure plan ------------------------------- */

describe("planReminderChannels", () => {
  const both = { email: true, phone: true };

  it("sends both channels on the default config with both contacts on file", () => {
    expect(planReminderChannels(cfg(), "24h", both)).toEqual({
      send: true,
      email: true,
      sms: true,
    });
  });

  it("drops the email channel when email is disabled (SMS still sends)", () => {
    expect(planReminderChannels(cfg({ emailEnabled: false }), "24h", both)).toEqual({
      send: true,
      email: false,
      sms: true,
    });
  });

  it("drops the SMS channel when SMS is disabled (email still sends)", () => {
    expect(planReminderChannels(cfg({ smsEnabled: false }), "24h", both)).toEqual({
      send: true,
      email: true,
      sms: false,
    });
  });

  it("does not send a channel the patient lacks contact for, even when enabled", () => {
    expect(planReminderChannels(cfg(), "24h", { email: true, phone: false })).toEqual({
      send: true,
      email: true,
      sms: false,
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

  it("reports channels_off when contact exists but every reachable channel is disabled", () => {
    // Email-only patient, email disabled → nothing reachable.
    expect(
      planReminderChannels(cfg({ emailEnabled: false }), "24h", { email: true, phone: false }),
    ).toEqual({ send: false, reason: "channels_off" });
    // Both channels off, both contacts present.
    expect(
      planReminderChannels(cfg({ emailEnabled: false, smsEnabled: false }), "24h", both),
    ).toEqual({ send: false, reason: "channels_off" });
  });

  it("reports no_contact when the patient has neither email nor phone", () => {
    expect(planReminderChannels(cfg(), "24h", { email: false, phone: false })).toEqual({
      send: false,
      reason: "no_contact",
    });
  });
});

/* --------------------------- wired dispatch ------------------------------ */

describe("dispatchReminder honors tenant reminder config", () => {
  const ENV_KEYS = ["REMINDERS_LIVE_SEND", "REMINDERS_LINK_SECRET", "REMINDERS_RESCHEDULE_BASE_URL"];
  const saved: Record<string, string | undefined> = {};

  function fixture(reminders?: unknown) {
    return {
      appointmentId: APPOINTMENT_ID,
      startsAt: STARTS_AT,
      status: "confirmed",
      patientName: "Madalena Sousa",
      patientEmail: "madalena@example.pt",
      patientPhone: "+351 210 000 000",
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

    const outcome = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h");

    expect(outcome).toMatchObject({ dispatched: true });
    if (!outcome.dispatched) throw new Error("expected dispatched");
    expect(outcome.channels.map((c) => c.channel)).toEqual(["sms"]);
    expect(h.email).toHaveLength(0);
    expect(h.sms).toHaveLength(1);
  });

  it("suppresses an offset whose lead time the tenant did not select", async () => {
    h.loadReminderData.mockResolvedValue(
      fixture({ emailEnabled: true, smsEnabled: true, leadTimeHours: [24] }),
    );

    // 48h is not in the selected set → nothing sends.
    const off = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "48h");
    expect(off).toEqual({ dispatched: false, reason: "lead_time_off" });
    expect(h.email).toHaveLength(0);
    expect(h.sms).toHaveLength(0);

    // 24h is selected → both channels send.
    const on = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h");
    expect(on).toMatchObject({ dispatched: true });
    if (!on.dispatched) throw new Error("expected dispatched");
    expect(on.channels.map((c) => c.channel).sort()).toEqual(["email", "sms"]);
  });

  it("preserves prior behavior when the tenant has no reminder config saved", async () => {
    // No `reminders` key at all → tolerant parse → defaults (all channels, all
    // lead times). This is the "defaults preserve current behavior" guarantee.
    h.loadReminderData.mockResolvedValue(fixture(undefined));

    const outcome = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "48h");

    expect(outcome).toMatchObject({ dispatched: true });
    if (!outcome.dispatched) throw new Error("expected dispatched");
    expect(outcome.channels.map((c) => c.channel).sort()).toEqual(["email", "sms"]);
    expect(h.email).toHaveLength(1);
    expect(h.sms).toHaveLength(1);
  });
});
