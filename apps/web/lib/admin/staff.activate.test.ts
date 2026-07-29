/**
 * PL-07/PL-08 activateStaffLogin tests.
 *
 * activateStaffLogin attaches (or re-issues) a Supabase login on an EXISTING staff
 * row and returns READY credentials — the login email + a freshly generated
 * password — for the admin to hand over. No link, no email. A re-activation resets
 * the password. Each activation is audited.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  loadRows: [] as Array<{ email: string; isActive: boolean; roleSlug: string | null }>,
  ensureAuthUserForStaffRow: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@osteojp/db", () => ({
  users: { id: "id", email: "email", fullName: "full_name", isActive: "is_active", roleId: "role_id" },
  roles: { id: "id", slug: "slug" },
  auditLog: {}, appointments: {}, appointmentNotes: {}, analyticsEvents: {},
  availabilityTemplates: {}, clinicalEpisodes: {}, clinicalRecords: {}, therapistServices: {}, timeOff: {},
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
        from: () => ({ leftJoin: () => ({ where: () => ({ limit: async () => H.loadRows }) }) }),
      }),
    }),
  ),
}));

// staff.ts still imports these for inviteStaff; provide them, activate uses none.
vi.mock("@/lib/auth/provision", () => ({
  provisionStaffUser: vi.fn(),
  ensureAuthUserForStaffRow: (...a: unknown[]) => H.ensureAuthUserForStaffRow(...a),
  generateSetPasswordLink: vi.fn(),
  updateStaffAuthEmail: vi.fn(),
}));
vi.mock("@/lib/invites/email", () => ({ invitesLiveSendEnabled: vi.fn(), sendInviteEmail: vi.fn() }));

import { activateStaffLogin } from "./staff";
import { AdminError } from "./errors";

const admin = { tenantId: "t1", role: "admin" as const, userId: "admin-1" };
const owner = { tenantId: "t1", role: "owner" as const, userId: "owner-1" };
const THERAPIST_ROW = { email: "ther@osteojp.pt", isActive: true, roleSlug: "therapist" as string | null };

beforeEach(() => {
  vi.clearAllMocks();
  H.loadRows = [{ ...THERAPIST_ROW }];
  H.ensureAuthUserForStaffRow.mockResolvedValue({ created: true });
});

describe("activateStaffLogin — ready credentials (PL-08)", () => {
  it("creates the auth user keyed to the SAME id, with a generated password", async () => {
    await activateStaffLogin(admin, "existing-id");
    expect(H.ensureAuthUserForStaffRow).toHaveBeenCalledWith(
      "existing-id",
      "ther@osteojp.pt",
      expect.any(String),
    );
    const pw = H.ensureAuthUserForStaffRow.mock.calls[0][2] as string;
    expect(pw.length).toBeGreaterThan(6);
  });

  it("returns the login email (username) + the SAME password that was set", async () => {
    const r = await activateStaffLogin(admin, "existing-id");
    const pw = H.ensureAuthUserForStaffRow.mock.calls[0][2] as string;
    expect(r.email).toBe("ther@osteojp.pt");
    expect(r.password).toBe(pw);
    expect(r.created).toBe(true);
  });

  it("re-activation (created=false) still returns email + the reset password", async () => {
    H.ensureAuthUserForStaffRow.mockResolvedValue({ created: false });
    const r = await activateStaffLogin(admin, "existing-id");
    expect(r.email).toBe("ther@osteojp.pt");
    expect(r.password.length).toBeGreaterThan(6);
    expect(r.created).toBe(false);
  });

  it("never returns a link or anything but email/password/created", async () => {
    const r = await activateStaffLogin(admin, "existing-id");
    expect(Object.keys(r).sort()).toEqual(["created", "email", "password"]);
  });

  it("audits the activation (PII-free)", async () => {
    await activateStaffLogin(admin, "existing-id");
    const call = H.writeAudit.mock.calls[0]?.[2] as { action: string; metadata: unknown };
    expect(call.action).toBe("staff.activate_login");
    expect(call.metadata).toEqual({ created: true });
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
    expect(r.email).toBe("own@osteojp.pt");
    expect(H.ensureAuthUserForStaffRow).toHaveBeenCalledOnce();
  });

  it("refuses a deactivated staff row", async () => {
    H.loadRows = [{ email: "ex@osteojp.pt", isActive: false, roleSlug: "therapist" }];
    await expect(activateStaffLogin(admin, "inactive")).rejects.toBeInstanceOf(AdminError);
    expect(H.ensureAuthUserForStaffRow).not.toHaveBeenCalled();
  });
});
