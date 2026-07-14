/**
 * W7-01 invite regression tests.
 *
 * The defect: any raw (non-AdminError) throw from the provisioning step escaped
 * inviteStaff, and inviteAction masked it as `code: "error"` -> the generic
 * "A operação falhou. Tente novamente." with NO temporary password, leaving the
 * admin no recovery path. These tests lock the three required behaviours:
 *
 *   (a) invite gate off / Resend env absent -> temp-password SUCCESS
 *   (b) gate on + a real (mocked) send      -> `email` delivery, no temp password
 *   (c) gate on + the send fails at runtime -> temp-password fallback
 *
 * plus: every provisioning failure surfaces a SPECIFIC code, never the generic
 * mask, and the temp password always rides the fallback result.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@osteojp/db", () => ({
  users: { id: "id", email: "email", fullName: "full_name" },
  roles: { id: "id", slug: "slug" },
  auditLog: {},
  appointments: {},
  appointmentNotes: {},
  analyticsEvents: {},
  availabilityTemplates: {},
  clinicalEpisodes: {},
  clinicalRecords: {},
  therapistServices: {},
  timeOff: {},
}));
vi.mock("./audit", () => ({ writeAudit: vi.fn() }));
vi.mock("./guards", () => ({ countActiveOwners: vi.fn(), wouldRemoveLastOwner: vi.fn() }));
vi.mock("./appointment-delete-password", () => ({ verifyDeletePassword: vi.fn() }));

/** No existing staff member with this email in the tenant. */
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn(async () => []) }));

const provisionStaffUser = vi.fn();
const generateSetPasswordLink = vi.fn();
vi.mock("@/lib/auth/provision", () => ({
  provisionStaffUser: (...a: unknown[]) => provisionStaffUser(...a),
  generateSetPasswordLink: (...a: unknown[]) => generateSetPasswordLink(...a),
  updateStaffAuthEmail: vi.fn(),
}));

const invitesLiveSendEnabled = vi.fn();
const sendInviteEmail = vi.fn();
vi.mock("@/lib/invites/email", () => ({
  invitesLiveSendEnabled: () => invitesLiveSendEnabled(),
  sendInviteEmail: (...a: unknown[]) => sendInviteEmail(...a),
}));

import { inviteStaff } from "./staff";
import { AdminError, isAdminError } from "./errors";

const actor = { tenantId: "t1", role: "owner" as const, userId: "u1" };
const input = { email: "novo@osteojp.pt", fullName: "Novo Membro", roleSlug: "therapist" };

/** Exactly what apps/web/app/admin/staff/actions.ts does with a thrown error. */
function inviteStateFor(e: unknown) {
  return { ok: false as const, code: isAdminError(e) ? e.code : "error" };
}

beforeEach(() => {
  vi.clearAllMocks();
  provisionStaffUser.mockResolvedValue({ userId: "new-user" });
  generateSetPasswordLink.mockResolvedValue("https://supabase/recovery-link");
});

describe("(a) invite gate off / Resend env absent -> temp-password success", () => {
  beforeEach(() => invitesLiveSendEnabled.mockReturnValue(false));

  it("succeeds via temp_password and never surfaces the generic error", async () => {
    const r = await inviteStaff(actor, input);
    expect(r.delivery).toBe("temp_password");
    expect("tempPassword" in r && r.tempPassword.length).toBeGreaterThan(0);
  });

  it("creates the auth user (provisioning still runs)", async () => {
    await inviteStaff(actor, input);
    expect(provisionStaffUser).toHaveBeenCalledOnce();
  });

  it("skips the privileged set-password link call entirely when the gate is off", async () => {
    await inviteStaff(actor, input);
    expect(generateSetPasswordLink).not.toHaveBeenCalled();
    expect(sendInviteEmail).not.toHaveBeenCalled();
  });

  it("returns a sandbox send -> temp_password (gate on, Resend key absent)", async () => {
    invitesLiveSendEnabled.mockReturnValue(true);
    sendInviteEmail.mockResolvedValue({ channel: "email", sandbox: true, id: "sandbox:invite" });
    const r = await inviteStaff(actor, input);
    expect(r.delivery).toBe("temp_password");
    expect("tempPassword" in r && r.tempPassword.length).toBeGreaterThan(0);
  });
});

describe("(b) gate on + mocked successful send -> email delivery", () => {
  beforeEach(() => invitesLiveSendEnabled.mockReturnValue(true));

  it("returns `email` delivery and NO temp password", async () => {
    sendInviteEmail.mockResolvedValue({ channel: "email", sandbox: false, id: "re_abc123" });
    const r = await inviteStaff(actor, input);
    expect(r.delivery).toBe("email");
    expect("tempPassword" in r).toBe(false);
  });

  it("sends to the invited address with the set-password link in the body", async () => {
    sendInviteEmail.mockResolvedValue({ channel: "email", sandbox: false, id: "re_abc123" });
    await inviteStaff(actor, input);
    const msg = sendInviteEmail.mock.calls[0]?.[0] as { to: string; body: string };
    expect(msg.to).toBe("novo@osteojp.pt");
    expect(msg.body).toContain("https://supabase/recovery-link");
  });
});

describe("(c) gate on + runtime send failure -> temp-password fallback", () => {
  beforeEach(() => invitesLiveSendEnabled.mockReturnValue(true));

  it("degrades to temp_password when the send throws", async () => {
    sendInviteEmail.mockRejectedValue(new Error("invites/email: Resend send failed (validation_error)"));
    const r = await inviteStaff(actor, input);
    expect(r.delivery).toBe("temp_password");
    expect("tempPassword" in r && r.tempPassword.length).toBeGreaterThan(0);
  });

  it("degrades to temp_password when link generation fails", async () => {
    generateSetPasswordLink.mockResolvedValue(null);
    const r = await inviteStaff(actor, input);
    expect(r.delivery).toBe("temp_password");
    expect(sendInviteEmail).not.toHaveBeenCalled();
  });
});

/**
 * The regression itself. Pre-fix, each of these produced `code: "error"` (the
 * generic mask) with no temporary password.
 */
describe("provisioning failures surface a SPECIFIC code, never the generic mask", () => {
  beforeEach(() => invitesLiveSendEnabled.mockReturnValue(false));

  it("orphaned Supabase auth login -> auth_email_taken", async () => {
    provisionStaffUser.mockRejectedValue(new AdminError("auth_email_taken"));
    const state = inviteStateFor(await inviteStaff(actor, input).catch((e) => e));
    expect(state.code).toBe("auth_email_taken");
    expect(state.code).not.toBe("error");
  });

  it("admin-client env absent -> provisioning_unavailable", async () => {
    provisionStaffUser.mockRejectedValue(
      new AdminError("provisioning_unavailable", "supabase admin client unavailable"),
    );
    const state = inviteStateFor(await inviteStaff(actor, input).catch((e) => e));
    expect(state.code).toBe("provisioning_unavailable");
    expect(state.code).not.toBe("error");
  });

  it("never leaks a secret or an address in the thrown message", async () => {
    provisionStaffUser.mockRejectedValue(
      new AdminError("provisioning_unavailable", "supabase admin client unavailable"),
    );
    const e = (await inviteStaff(actor, input).catch((x) => x)) as Error;
    expect(e.message).not.toContain("novo@osteojp.pt");
    expect(e.message).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY|eyJ/);
  });

  it("a genuinely unknown throw still maps to the generic code (last resort)", async () => {
    provisionStaffUser.mockRejectedValue(new Error("something nobody predicted"));
    const state = inviteStateFor(await inviteStaff(actor, input).catch((e) => e));
    expect(state.code).toBe("error");
  });
});
