/**
 * PL-07 activateStaffLogin tests.
 *
 * activateStaffLogin attaches a Supabase login to an EXISTING staff row (same id,
 * history preserved) — the onboarding path for pre-existing staff whose rows
 * cannot be deleted. Delivery mirrors inviteStaff: email when the gate is on,
 * otherwise an out-of-band hand-off (the recovery link, or a temp password only
 * for a freshly created auth user). Each activation is audited.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  loadRows: [] as Array<{ email: string; isActive: boolean; roleSlug: string | null }>,
  ensureAuthUserForStaffRow: vi.fn(),
  generateSetPasswordLink: vi.fn(),
  invitesLiveSendEnabled: vi.fn(),
  sendInviteEmail: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@osteojp/db", () => ({
  users: { id: "id", email: "email", fullName: "full_name", isActive: "is_active", roleId: "role_id" },
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
vi.mock("./audit", () => ({ writeAudit: (...a: unknown[]) => H.writeAudit(...a) }));
vi.mock("./guards", () => ({ countActiveOwners: vi.fn(), wouldRemoveLastOwner: vi.fn() }));
vi.mock("./appointment-delete-password", () => ({ verifyDeletePassword: vi.fn() }));

// runScoped executes its callback with a fake tx: the load query resolves to
// H.loadRows; the audit callback just invokes the mocked writeAudit.
vi.mock("@/lib/auth/context", () => ({
  runScoped: vi.fn(async (_actor: unknown, cb: (tx: unknown) => unknown) =>
    cb({
      select: () => ({
        from: () => ({
          leftJoin: () => ({ where: () => ({ limit: async () => H.loadRows }) }),
        }),
      }),
    }),
  ),
}));

vi.mock("@/lib/auth/provision", () => ({
  provisionStaffUser: vi.fn(),
  ensureAuthUserForStaffRow: (...a: unknown[]) => H.ensureAuthUserForStaffRow(...a),
  generateSetPasswordLink: (...a: unknown[]) => H.generateSetPasswordLink(...a),
  updateStaffAuthEmail: vi.fn(),
}));
vi.mock("@/lib/invites/email", () => ({
  invitesLiveSendEnabled: () => H.invitesLiveSendEnabled(),
  sendInviteEmail: (...a: unknown[]) => H.sendInviteEmail(...a),
}));

import { activateStaffLogin } from "./staff";
import { AdminError } from "./errors";

const admin = { tenantId: "t1", role: "admin" as const, userId: "admin-1" };
const owner = { tenantId: "t1", role: "owner" as const, userId: "owner-1" };
const THERAPIST_ROW = { email: "ther@osteojp.pt", isActive: true, roleSlug: "therapist" as string | null };

beforeEach(() => {
  vi.clearAllMocks();
  H.loadRows = [{ ...THERAPIST_ROW }];
  H.ensureAuthUserForStaffRow.mockResolvedValue({ created: true });
  H.generateSetPasswordLink.mockResolvedValue("https://supabase/recovery-link");
  H.invitesLiveSendEnabled.mockReturnValue(false);
});

describe("activateStaffLogin — attach a login to an existing row", () => {
  it("creates the auth user keyed to the SAME row id", async () => {
    await activateStaffLogin(admin, "existing-id");
    expect(H.ensureAuthUserForStaffRow).toHaveBeenCalledWith(
      "existing-id",
      "ther@osteojp.pt",
      expect.any(String),
    );
  });

  it("audits the activation (PII-free)", async () => {
    await activateStaffLogin(admin, "existing-id");
    const call = H.writeAudit.mock.calls[0]?.[2] as { action: string; metadata: unknown };
    expect(call.action).toBe("staff.activate_login");
    expect(call.metadata).toEqual({ created: true });
  });

  it("gate off + new auth user -> hands over the set-password link", async () => {
    const r = await activateStaffLogin(admin, "existing-id");
    expect(r.delivery).toBe("link");
    expect("setPasswordLink" in r && r.setPasswordLink).toBe("https://supabase/recovery-link");
    expect(H.sendInviteEmail).not.toHaveBeenCalled();
  });

  it("gate off + new auth user + link generation fails -> temp password fallback", async () => {
    H.generateSetPasswordLink.mockResolvedValue(null);
    const r = await activateStaffLogin(admin, "existing-id");
    expect(r.delivery).toBe("temp_password");
    expect("tempPassword" in r && r.tempPassword.length).toBeGreaterThan(0);
  });

  it("gate on + successful send -> email delivery, link in the body", async () => {
    H.invitesLiveSendEnabled.mockReturnValue(true);
    H.sendInviteEmail.mockResolvedValue({ channel: "email", sandbox: false, id: "re_1" });
    const r = await activateStaffLogin(admin, "existing-id");
    expect(r.delivery).toBe("email");
    const msg = H.sendInviteEmail.mock.calls[0]?.[0] as { to: string; body: string };
    expect(msg.to).toBe("ther@osteojp.pt");
    expect(msg.body).toContain("https://supabase/recovery-link");
  });

  it("re-activation (auth already existed) -> link, never a temp password", async () => {
    H.ensureAuthUserForStaffRow.mockResolvedValue({ created: false });
    const r = await activateStaffLogin(admin, "existing-id");
    expect(r.delivery).toBe("link");
    expect("tempPassword" in r).toBe(false);
  });

  it("not_found when the row is missing", async () => {
    H.loadRows = [];
    await expect(activateStaffLogin(admin, "missing")).rejects.toMatchObject({ code: "not_found" });
    expect(H.ensureAuthUserForStaffRow).not.toHaveBeenCalled();
  });

  it("owner-tier: an admin cannot activate an owner's login", async () => {
    H.loadRows = [{ email: "own@osteojp.pt", isActive: true, roleSlug: "owner" }];
    await expect(activateStaffLogin(admin, "owner-row")).rejects.toMatchObject({ code: "owner_tier" });
    expect(H.ensureAuthUserForStaffRow).not.toHaveBeenCalled();
  });

  it("an owner CAN activate another owner's login", async () => {
    H.loadRows = [{ email: "own@osteojp.pt", isActive: true, roleSlug: "owner" }];
    const r = await activateStaffLogin(owner, "owner-row");
    expect(r.delivery).toBeDefined();
    expect(H.ensureAuthUserForStaffRow).toHaveBeenCalledOnce();
  });

  it("refuses a deactivated staff row", async () => {
    H.loadRows = [{ email: "ex@osteojp.pt", isActive: false, roleSlug: "therapist" }];
    await expect(activateStaffLogin(admin, "inactive")).rejects.toBeInstanceOf(AdminError);
    expect(H.ensureAuthUserForStaffRow).not.toHaveBeenCalled();
  });
});
