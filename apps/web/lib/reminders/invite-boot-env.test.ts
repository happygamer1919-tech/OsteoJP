/**
 * ===========================================================================
 * INC-12, 2026-08-18. THIS FILE USED TO ASSERT THE OPPOSITE, AND THAT IS THE
 * POINT OF READING IT.
 * ===========================================================================
 *
 * WHAT IT ASSERTED BEFORE. `assertNotificationEnv` ran at MODULE SCOPE in
 * `clients.ts`, and the cases here were `await expect(import("./clients"))
 * .rejects.toThrow(...)`: arming a stream with a required var missing had to
 * fail AT BOOT. That property came from #763 and #778, and the reasoning behind
 * it was sound - a misconfiguration that surfaces at the user instead of at
 * boot is the worst of both, because it looks healthy until somebody is
 * waiting on a message that never arrives.
 *
 * WHAT WENT WRONG WITH IT. On 2026-08-18 `REMINDERS_LIVE_SEND=true` reached
 * production with `REMINDERS_LINK_SECRET` absent. The throw happened while the
 * module graph was still being built, so it did not fail "the notification
 * path" - it failed EVERY IMPORTER. `/admin/staff` returned an error page
 * (it imports the invite chain, which imports this file) and the ENTIRE
 * `/api/inngest` route stopped answering, including the GET Inngest uses for
 * introspection and the PUT it uses to register functions. Two surfaces that
 * send nothing, down, from one missing variable.
 *
 * THE DIAGNOSIS IS ABOUT PROPORTION, NOT ABOUT THE CHECK. The property being
 * checked is "this stream cannot send". The blast radius was "anything that
 * transitively imports the adapters". Those two sets have no relationship to
 * each other, and the second is very much larger.
 *
 * WHAT IS ASSERTED NOW, and it is a PAIR:
 *   1. Importing the module does NOT throw, however incomplete the env.
 *   2. SENDING throws NotificationEnvError, with the same full list of names.
 *
 * EITHER HALF ALONE IS A BUG. Half 1 without half 2 is a guard that was
 * deleted. Half 2 without half 1 is the outage. They are in the same file, next
 * to each other, so an edit that satisfies one by breaking the other fails
 * here rather than in production.
 *
 * THESE TESTS FAIL WITHOUT THE FIX. Put `assertNotificationEnv([...])` back at
 * the top of `clients.ts` and every "does not throw on import" case starts
 * throwing - that is the negative arm, and it is why the import cases are
 * written as `resolves` rather than merely omitted.
 *
 * WHAT WAS NOT WEAKENED. The env requirement itself is unchanged: same flags,
 * same variable list, same `NotificationEnvError`, same "name every missing var
 * at once" message. Only the moment moved. And it did not become a suppression:
 * an armed-but-incomplete send THROWS rather than returning
 * `missing_provider_config`, because that reason is also what a healthy sandbox
 * deploy logs and a broken deploy must not be indistinguishable from a safe one.
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
  // LE-reminders-email-from-naming (2026-08-05): each armed stream carries its
  // OWN sender, so "every required name" includes the invites one.
  process.env.INVITES_EMAIL_FROM = "test";
  process.env.TWILIO_ACCOUNT_SID = "test";
  process.env.TWILIO_AUTH_TOKEN = "test";
  process.env.TWILIO_SMS_FROM = "test";
  process.env.REMINDERS_RESCHEDULE_BASE_URL = "test";
  process.env.REMINDERS_LINK_SECRET = "test";
}

/**
 * The invite body is registered `approved: true` in this app, so a dispatch
 * reaches the env assertion. An UNAPPROVED template would be refused one step
 * earlier and would prove nothing about the environment.
 */
async function sendAnInvite() {
  const { sendEmail } = await import("./clients");
  const { INVITE_TEMPLATE } = await import("./notification-registry");
  return sendEmail({
    templateId: INVITE_TEMPLATE.id,
    to: "staff@example.test",
    subject: "assunto de teste",
    body: "corpo de teste",
  });
}

beforeEach(() => {
  for (const k of [...FLAGS, ...VARS]) saved[k] = process.env[k];
  for (const k of [...FLAGS, ...VARS]) delete process.env[k];
  vi.resetModules();
});

afterEach(() => {
  for (const k of [...FLAGS, ...VARS]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
});

describe("INC-12 - importing the send adapters never throws", () => {
  it("loads with INVITES_LIVE_SEND armed and INVITES_EMAIL_FROM missing", async () => {
    setAllRequired();
    delete process.env.INVITES_EMAIL_FROM;
    process.env.INVITES_LIVE_SEND = "true";

    // NEGATIVE ARM. Restore the module-scope assertNotificationEnv in
    // clients.ts and this line starts rejecting.
    await expect(import("./clients")).resolves.toBeDefined();
  });

  it("loads in the exact production state of 2026-08-18", async () => {
    // REMINDERS_LIVE_SEND armed, REMINDERS_LINK_SECRET absent. This is the
    // configuration that took down /admin/staff and /api/inngest.
    setAllRequired();
    delete process.env.REMINDERS_LINK_SECRET;
    process.env.REMINDERS_LIVE_SEND = "true";

    await expect(import("./clients")).resolves.toBeDefined();
  });

  it("loads with several required vars missing at once", async () => {
    setAllRequired();
    delete process.env.INVITES_EMAIL_FROM;
    delete process.env.RESEND_API_KEY;
    process.env.INVITES_LIVE_SEND = "true";

    await expect(import("./clients")).resolves.toBeDefined();
  });

  it("loads when every live-send flag is off, so dev, CI and preview boot", async () => {
    // Nothing set at all. Unchanged from before the fix, and it must stay so.
    await expect(import("./clients")).resolves.toBeDefined();
  });

  it("loads when armed and every required var is present", async () => {
    setAllRequired();
    process.env.INVITES_LIVE_SEND = "true";

    await expect(import("./clients")).resolves.toBeDefined();
  });
});

describe("INC-12 - the SEND is what refuses an armed, incomplete environment", () => {
  it("throws NotificationEnvError naming INVITES_EMAIL_FROM", async () => {
    setAllRequired();
    delete process.env.INVITES_EMAIL_FROM;
    process.env.INVITES_LIVE_SEND = "true";

    await expect(sendAnInvite()).rejects.toThrow(/INVITES_EMAIL_FROM/);
  });

  it("throws in the exact production state of 2026-08-18", async () => {
    setAllRequired();
    delete process.env.REMINDERS_LINK_SECRET;
    // BOTH flags, because the invite send is what this module exposes and the
    // env requirement is the app's flag SET rather than the template's own.
    // Arming reminders alone would suppress the invite at the flag check and
    // never reach the assertion - a real behaviour, and not this property.
    process.env.REMINDERS_LIVE_SEND = "true";
    process.env.INVITES_LIVE_SEND = "true";

    await expect(sendAnInvite()).rejects.toThrow(/REMINDERS_LINK_SECRET/);
  });

  it("names every missing var at once, not just the first", async () => {
    // One pass to fix a misconfigured deploy, not one redeploy per variable.
    // The old boot check's whole value was this message; it is unchanged.
    setAllRequired();
    delete process.env.INVITES_EMAIL_FROM;
    delete process.env.RESEND_API_KEY;
    process.env.INVITES_LIVE_SEND = "true";

    await expect(sendAnInvite()).rejects.toThrow(/RESEND_API_KEY/);
    await expect(sendAnInvite()).rejects.toThrow(/INVITES_EMAIL_FROM/);
  });

  it("does NOT demand the invites sender when only reminders are armed", async () => {
    // apps/api arms REMINDERS_LIVE_SEND alone and has no invite path at all, so
    // a global INVITES_EMAIL_FROM requirement would fail on a variable it can
    // never use. The per-flag rule that makes that work is unchanged.
    setAllRequired();
    delete process.env.INVITES_EMAIL_FROM;
    process.env.REMINDERS_LIVE_SEND = "true";

    // The invite stream is OFF here, so this suppresses rather than throwing.
    await expect(sendAnInvite()).resolves.toMatchObject({ sandbox: true });
  });

  it("suppresses rather than throwing when every flag is off", async () => {
    // The state dev, CI and every preview deploy are in. Nothing required,
    // nothing thrown, and the send is a sandbox no-op.
    await expect(sendAnInvite()).resolves.toMatchObject({ sandbox: true });
  });
});
