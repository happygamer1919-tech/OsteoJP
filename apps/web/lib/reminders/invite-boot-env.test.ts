/**
 * LE-env-sweep-scope residual: the STAFF-INVITE path had no boot validation.
 *
 * #763 made the reminder path fail at boot rather than at the patient, and
 * apps/web/app/api/inngest/route.ts asserts both live-send flags. But that route
 * is only loaded for Inngest-driven work, and staff invites are not Inngest
 * driven: lib/admin/staff.ts -> lib/invites/email.ts -> sendEmail in
 * lib/reminders/clients.ts, a chain that never touches the route.
 *
 * So arming INVITES_LIVE_SEND with REMINDERS_EMAIL_FROM absent booted clean,
 * providerConfigured() then returned false, and the caller degraded every invite
 * to the temporary-password hand-off: no email, no error, no boot signal. The
 * owner would have seen invites "working" while nothing was ever sent.
 *
 * THESE TESTS FAIL WITHOUT THE FIX. Remove the assertNotificationEnv call at the
 * top of clients.ts and the first two cases stop throwing — that is the point of
 * them. The third and fourth prove the guard did not overreach into dev, CI and
 * preview, where every flag is off and boot must stay clean.
 *
 * Env var NAMES only. No value is asserted, logged or written here.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

const FLAGS = ["REMINDERS_LIVE_SEND", "INVITES_LIVE_SEND"] as const;
const VARS = [
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

/** Every name the notification path requires once a stream is armed. */
function setAllRequired(): void {
  process.env.RESEND_API_KEY = "test";
  process.env.REMINDERS_EMAIL_FROM = "test";
  // LE-reminders-email-from-naming (2026-08-05): each armed stream now carries
  // its OWN sender, so "every required name" includes the invites one.
  process.env.INVITES_EMAIL_FROM = "test";
  process.env.TWILIO_ACCOUNT_SID = "test";
  process.env.TWILIO_AUTH_TOKEN = "test";
  process.env.TWILIO_SMS_FROM = "test";
  process.env.REMINDERS_RESCHEDULE_BASE_URL = "test";
  process.env.REMINDERS_LINK_SECRET = "test";
}

beforeEach(() => {
  for (const k of [...FLAGS, ...VARS]) saved[k] = process.env[k];
  for (const k of [...FLAGS, ...VARS]) delete process.env[k];
  // The assertion runs at MODULE SCOPE, so every case needs a fresh evaluation
  // of clients.ts rather than a cached one.
  vi.resetModules();
});

afterEach(() => {
  for (const k of [...FLAGS, ...VARS]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
});

describe("the staff-invite send path is boot-validated", () => {
  it("refuses to load with INVITES_LIVE_SEND armed and INVITES_EMAIL_FROM missing", async () => {
    setAllRequired();
    delete process.env.INVITES_EMAIL_FROM;
    process.env.INVITES_LIVE_SEND = "true";

    // This is the defect, stated as a test: before #778 this import RESOLVED,
    // and the missing sender surfaced later as a silent temp-password fallback.
    // The split (2026-08-05) moved WHICH variable the invite stream needs; the
    // property that arming it without a sender fails at BOOT is unchanged.
    await expect(import("./clients")).rejects.toThrow(/INVITES_EMAIL_FROM/);
  });

  it("does NOT demand the invites sender when only reminders are armed", async () => {
    // The reason the requirement is per-flag rather than global: apps/api arms
    // REMINDERS_LIVE_SEND alone and has no invite path at all, so a global
    // INVITES_EMAIL_FROM would fail its boot over a variable it can never use.
    setAllRequired();
    delete process.env.INVITES_EMAIL_FROM;
    process.env.REMINDERS_LIVE_SEND = "true";

    await expect(import("./clients")).resolves.toBeDefined();
  });

  it("names every missing var at once, not just the first", async () => {
    setAllRequired();
    delete process.env.INVITES_EMAIL_FROM;
    delete process.env.RESEND_API_KEY;
    process.env.INVITES_LIVE_SEND = "true";

    // One pass to fix a misconfigured deploy, not one redeploy per variable.
    await expect(import("./clients")).rejects.toThrow(/RESEND_API_KEY/);
    vi.resetModules();
    await expect(import("./clients")).rejects.toThrow(/INVITES_EMAIL_FROM/);
  });

  it("stays silent when every live-send flag is off, so dev, CI and preview boot", async () => {
    // Nothing set at all: the state dev, CI and every preview deploy are in.
    await expect(import("./clients")).resolves.toBeDefined();
  });

  it("stays silent when invites are armed and every required var is present", async () => {
    setAllRequired();
    process.env.INVITES_LIVE_SEND = "true";

    await expect(import("./clients")).resolves.toBeDefined();
  });

  it("still refuses on the reminder flag alone, which was already covered", async () => {
    setAllRequired();
    delete process.env.REMINDERS_EMAIL_FROM;
    process.env.REMINDERS_LIVE_SEND = "true";

    await expect(import("./clients")).rejects.toThrow(/REMINDERS_EMAIL_FROM/);
  });
});
