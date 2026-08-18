/**
 * W7-01 flag decoupling.
 *
 * INVITES_LIVE_SEND gates invite email. REMINDERS_LIVE_SEND gates appointment
 * reminders. They are independent: toggling one must never change the other's
 * behaviour. Before this loop, invites rode REMINDERS_LIVE_SEND, so the owner
 * could not enable invite email without also enabling live reminders
 * (QUESTIONS Q-W6-02-1).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send: (...a: unknown[]) => send(...a) }; } }));

import { invitesLiveSendEnabled, sendInviteEmail } from "./email";
import { liveSendEnabled, sendEmail } from "@/lib/reminders/clients";

const msg = { to: "novo@osteojp.pt", subject: "Convite", body: "corpo" };

/**
 * INC-12 (2026-08-18): the notification env assertion moved from module scope
 * into `dispatch`, so an ARMED stream now requires the SMS and link variables
 * at send time too. They have nothing to do with an invite email, and that is
 * deliberate: the requirement is the APP's, exactly as the boot check's was, so
 * a misconfigured deploy is fixed in one pass rather than one variable per
 * redeploy.
 *
 * These cases are about the FLAG SPLIT and the FROM-ADDRESS SPLIT, so they arm
 * a complete environment and let the split be the only variable. Placeholders;
 * no real credential appears in this repo.
 */
const ENV_KEYS = [
  "INVITES_LIVE_SEND",
  "REMINDERS_LIVE_SEND",
  "RESEND_API_KEY",
  "REMINDERS_EMAIL_FROM",
  "INVITES_EMAIL_FROM",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_SMS_FROM",
  "REMINDERS_RESCHEDULE_BASE_URL",
  "REMINDERS_LINK_SECRET",
] as const;

/** Everything an armed stream requires EXCEPT the flags and the senders. */
function armRest(): void {
  process.env.TWILIO_ACCOUNT_SID = "AC_test";
  process.env.TWILIO_AUTH_TOKEN = "tok_test";
  process.env.TWILIO_SMS_FROM = "+351900000001";
  process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://example.test";
  process.env.REMINDERS_LINK_SECRET = "test";
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe("flag independence", () => {
  it("INVITES_LIVE_SEND on does NOT turn reminders live", () => {
    process.env.INVITES_LIVE_SEND = "true";
    expect(invitesLiveSendEnabled()).toBe(true);
    expect(liveSendEnabled()).toBe(false);
  });

  it("REMINDERS_LIVE_SEND on does NOT turn invites live", () => {
    process.env.REMINDERS_LIVE_SEND = "true";
    expect(liveSendEnabled()).toBe(true);
    expect(invitesLiveSendEnabled()).toBe(false);
  });

  it("both off, both on: each flag tracks only itself", () => {
    expect(invitesLiveSendEnabled()).toBe(false);
    expect(liveSendEnabled()).toBe(false);
    process.env.INVITES_LIVE_SEND = "true";
    process.env.REMINDERS_LIVE_SEND = "true";
    expect(invitesLiveSendEnabled()).toBe(true);
    expect(liveSendEnabled()).toBe(true);
  });

  it("only the exact string \"true\" enables invite live send", () => {
    for (const v of ["false", "1", "TRUE", "yes", ""]) {
      process.env.INVITES_LIVE_SEND = v;
      expect(invitesLiveSendEnabled()).toBe(false);
    }
  });

  it("reminders stay sandbox with REMINDERS_LIVE_SEND off even when INVITES_LIVE_SEND is on", async () => {
    process.env.INVITES_LIVE_SEND = "true";
    process.env.INVITES_EMAIL_FROM = "convites@send.osteojp.pt";
    process.env.RESEND_API_KEY = "test-key";
    armRest();
    const r = await sendEmail({ ...msg, templateId: "confirmation.email" });
    expect(r.sandbox).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it("invites stay sandbox with INVITES_LIVE_SEND off even when REMINDERS_LIVE_SEND is on", async () => {
    process.env.REMINDERS_LIVE_SEND = "true";
    process.env.REMINDERS_EMAIL_FROM = "lembretes@send.osteojp.pt";
    process.env.RESEND_API_KEY = "test-key";
    armRest();
    const r = await sendInviteEmail(msg);
    expect(r.sandbox).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("sendInviteEmail", () => {
  it("gate off -> sandbox, zero network calls", async () => {
    const r = await sendInviteEmail(msg);
    expect(r).toEqual({ channel: "email", sandbox: true, id: "sandbox:invite" });
    expect(send).not.toHaveBeenCalled();
  });

  /**
   * INC-12 CHANGED THIS ONE, and the old expectation described a state no
   * deployment could be in. It read "gate on but Resend key absent -> sandbox,
   * zero network calls", which was true of the code and false of production:
   * `clients.ts` asserted the same variables at MODULE SCOPE, so an armed
   * deploy with no key never booted far enough to dispatch anything.
   *
   * The assertion is in `dispatch` now, so the state is reachable and it
   * THROWS. Zero network calls is still asserted - the throw is not a partial
   * send - and that half of the original property is unchanged.
   */
  it("gate on but Resend key absent -> THROWS, zero network calls", async () => {
    process.env.INVITES_LIVE_SEND = "true";
    await expect(sendInviteEmail(msg)).rejects.toThrow(/RESEND_API_KEY/);
    expect(send).not.toHaveBeenCalled();
  });

  it("gate on + key present -> real (mocked) send, sandbox false", async () => {
    process.env.INVITES_LIVE_SEND = "true";
    process.env.RESEND_API_KEY = "test-key";
    // LE-reminders-email-from-naming (owner ruling 2026-08-05: SPLIT, not
    // rename): the invite stream sends under its OWN from-address now.
    process.env.INVITES_EMAIL_FROM = "convites@send.osteojp.pt";
    armRest();
    send.mockResolvedValue({ data: { id: "re_live_1" }, error: null });
    const r = await sendInviteEmail(msg);
    expect(r).toEqual({ channel: "email", sandbox: false, id: "re_live_1" });
    expect(send).toHaveBeenCalledOnce();
    // THE LOAD-BEARING ASSERTION OF THE SPLIT: the invite goes out under the
    // INVITES sender. Without it the two names could diverge in the environment
    // while every invite still shipped from the reminders identity, and nothing
    // would notice until someone read a raw header.
    expect(send.mock.calls[0]![0]).toMatchObject({ from: "convites@send.osteojp.pt" });
  });

  it("uses the invites sender even when the reminders sender is also set", async () => {
    // The failure this pins: with both variables present, a from-resolver that
    // ignored the template id would silently pick the reminders identity and the
    // split would be cosmetic.
    process.env.INVITES_LIVE_SEND = "true";
    process.env.RESEND_API_KEY = "test-key";
    process.env.REMINDERS_EMAIL_FROM = "lembretes@send.osteojp.pt";
    process.env.INVITES_EMAIL_FROM = "convites@send.osteojp.pt";
    armRest();
    send.mockResolvedValue({ data: { id: "re_live_2" }, error: null });

    await sendInviteEmail(msg);

    expect(send.mock.calls[0]![0]).toMatchObject({ from: "convites@send.osteojp.pt" });
    expect(send.mock.calls[0]![0]).not.toMatchObject({ from: "lembretes@send.osteojp.pt" });
  });

  it("gate on + Resend returns an error -> throws (caller degrades to temp password)", async () => {
    process.env.INVITES_LIVE_SEND = "true";
    process.env.RESEND_API_KEY = "test-key";
    // LE-reminders-email-from-naming (owner ruling 2026-08-05: SPLIT, not
    // rename): the invite stream sends under its OWN from-address now.
    process.env.INVITES_EMAIL_FROM = "convites@send.osteojp.pt";
    armRest();
    send.mockResolvedValue({ data: null, error: { name: "validation_error" } });
    await expect(sendInviteEmail(msg)).rejects.toThrow(/Resend send failed/);
  });

  it("never logs the recipient address (rule 7)", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await sendInviteEmail(msg);
    const logged = info.mock.calls.flat().join(" ");
    expect(logged).not.toContain("novo@osteojp.pt");
    info.mockRestore();
  });
});
