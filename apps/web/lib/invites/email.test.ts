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

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.INVITES_LIVE_SEND;
  delete process.env.REMINDERS_LIVE_SEND;
  delete process.env.RESEND_API_KEY;
});
afterEach(() => {
  delete process.env.INVITES_LIVE_SEND;
  delete process.env.REMINDERS_LIVE_SEND;
  delete process.env.RESEND_API_KEY;
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
    process.env.RESEND_API_KEY = "test-key";
    const r = await sendEmail(msg);
    expect(r.sandbox).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it("invites stay sandbox with INVITES_LIVE_SEND off even when REMINDERS_LIVE_SEND is on", async () => {
    process.env.REMINDERS_LIVE_SEND = "true";
    process.env.RESEND_API_KEY = "test-key";
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

  it("gate on but Resend key absent -> sandbox, zero network calls", async () => {
    process.env.INVITES_LIVE_SEND = "true";
    const r = await sendInviteEmail(msg);
    expect(r.sandbox).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it("gate on + key present -> real (mocked) send, sandbox false", async () => {
    process.env.INVITES_LIVE_SEND = "true";
    process.env.RESEND_API_KEY = "test-key";
    send.mockResolvedValue({ data: { id: "re_live_1" }, error: null });
    const r = await sendInviteEmail(msg);
    expect(r).toEqual({ channel: "email", sandbox: false, id: "re_live_1" });
    expect(send).toHaveBeenCalledOnce();
  });

  it("gate on + Resend returns an error -> throws (caller degrades to temp password)", async () => {
    process.env.INVITES_LIVE_SEND = "true";
    process.env.RESEND_API_KEY = "test-key";
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
