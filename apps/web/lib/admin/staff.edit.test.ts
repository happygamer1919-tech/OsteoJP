import { vi, describe, it, expect, beforeEach } from "vitest";

// editStaff — end-to-end email edit. An email change must update BOTH
// public.users and the Supabase auth login email, kept consistent by ordering.
// Real assertCan (users:manage gate). DB tx, auth sync, and audit are mocked.
//
// The mocked runScoped emulates Drizzle's rollback-on-throw: withTenantContext
// wraps the callback in getDb().transaction(...) (packages/db/src/client.ts),
// so a throw AFTER the public.users write rolls that write back. The fake tx
// models that by discarding the recorded update when the callback throws — which
// is what makes "auth failure leaves public.users untouched" a faithful check.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("@/lib/auth/provision", () => ({
  provisionStaffUser: vi.fn(),
  generateSetPasswordLink: vi.fn(),
  updateStaffAuthEmail: vi.fn(),
}));
vi.mock("@/lib/reminders/clients", () => ({ sendEmail: vi.fn() }));
vi.mock("./audit", () => ({ writeAudit: vi.fn() }));
vi.mock("./appointment-delete-password", () => ({ verifyDeletePassword: vi.fn() }));

import { runScoped } from "@/lib/auth/context";
import { updateStaffAuthEmail } from "@/lib/auth/provision";
import { writeAudit } from "./audit";
import { editStaff, maskEmail } from "./staff";
import type { RequestContext } from "@osteojp/auth";

const mockRunScoped = vi.mocked(runScoped);
const mockAuthEmail = vi.mocked(updateStaffAuthEmail);
const mockAudit = vi.mocked(writeAudit);

const admin: RequestContext = { tenantId: "tenant-A", role: "admin", userId: "admin-1" };
const owner: RequestContext = { tenantId: "tenant-A", role: "owner", userId: "own-1" };
const reception: RequestContext = { tenantId: "tenant-A", role: "reception", userId: "recep-1" };

type Target = { isActive: boolean; roleSlug: string | null; fullName: string; email: string };
const THERAPIST: Target = {
  isActive: true,
  roleSlug: "therapist",
  fullName: "Old Name",
  email: "old@osteojp.pt",
};

/**
 * Fake tx for editStaff. loadTarget: select().from().leftJoin().where() → rows.
 * update: update().set(vals).where() → records vals, or rejects with `updateThrows`.
 * `stats.updated` is the recorded public.users write; the rollback emulation in
 * makeRunScoped clears it when the callback throws.
 */
function makeTx(opts: { target?: Target | null; updateThrows?: unknown }) {
  const target = opts.target === undefined ? THERAPIST : opts.target;
  const stats: { updated?: Record<string, unknown> } = { updated: undefined };
  const tx = {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => Promise.resolve(target ? [target] : []),
        }),
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => {
          if (opts.updateThrows !== undefined) return Promise.reject(opts.updateThrows);
          stats.updated = vals;
          return Promise.resolve([]);
        },
      }),
    }),
  };
  return { tx, stats };
}

function wireRunScoped(tx: unknown, stats: { updated?: Record<string, unknown> }) {
  mockRunScoped.mockImplementation(async (_actor, cb) => {
    try {
      return await cb(tx as never);
    } catch (e) {
      // Emulate ROLLBACK: the uncommitted public.users write is discarded.
      stats.updated = undefined;
      throw e;
    }
  });
}

beforeEach(() => {
  mockRunScoped.mockReset();
  mockAuthEmail.mockReset();
  mockAudit.mockReset();
});

describe("editStaff — email sync (auth + public.users)", () => {
  it("syncs BOTH stores when the email changes, and audits old/new masked", async () => {
    const { tx, stats } = makeTx({});
    wireRunScoped(tx, stats);
    mockAuthEmail.mockResolvedValue(undefined);

    await editStaff(admin, "ther-1", { fullName: "Old Name", email: "New@OsteoJP.pt" });

    // public.users written with the normalized (lowercased) email.
    expect(stats.updated).toEqual({ fullName: "Old Name", email: "new@osteojp.pt" });
    // auth login email synced to the same normalized address.
    expect(mockAuthEmail).toHaveBeenCalledExactlyOnceWith("ther-1", "new@osteojp.pt");
    // audit: email field recorded, values masked (never the full address).
    expect(mockAudit).toHaveBeenCalledTimes(1);
    const meta = mockAudit.mock.calls[0][2].metadata as Record<string, unknown>;
    expect(mockAudit.mock.calls[0][2].action).toBe("staff.profile_update");
    expect(meta.fields).toContain("email");
    expect(meta.emailFrom).toBe("ol*@osteojp.pt");
    expect(meta.emailTo).toBe("ne*@osteojp.pt");
    expect(JSON.stringify(meta)).not.toContain("old@osteojp.pt");
    expect(JSON.stringify(meta)).not.toContain("new@osteojp.pt");
  });

  it("auth failure leaves public.users untouched (rolled back) and writes no audit", async () => {
    const { tx, stats } = makeTx({});
    wireRunScoped(tx, stats);
    mockAuthEmail.mockRejectedValue(new Error("auth email update failed: taken"));

    await expect(
      editStaff(admin, "ther-1", { fullName: "Old Name", email: "new@osteojp.pt" }),
    ).rejects.toThrow();

    // We got past the public.users write (auth is called after it)...
    expect(mockAuthEmail).toHaveBeenCalledOnce();
    // ...but the transaction rolled back, so no public.users change persists...
    expect(stats.updated).toBeUndefined();
    // ...and the audit row (written last) never lands.
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("surfaces a tenant unique-email collision as email_taken BEFORE touching auth", async () => {
    const { tx } = makeTx({ updateThrows: { code: "23505" } });
    wireRunScoped(tx, { updated: undefined });
    mockAuthEmail.mockResolvedValue(undefined);

    await expect(
      editStaff(admin, "ther-1", { fullName: "Old Name", email: "taken@osteojp.pt" }),
    ).rejects.toMatchObject({ code: "email_taken" });

    // Collision caught at the DB write — auth is never touched, no audit.
    expect(mockAuthEmail).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("a name-only edit updates public.users but NEVER touches the auth email", async () => {
    const { tx, stats } = makeTx({});
    wireRunScoped(tx, stats);
    mockAuthEmail.mockResolvedValue(undefined);

    await editStaff(admin, "ther-1", { fullName: "New Name", email: "old@osteojp.pt" });

    expect(stats.updated).toEqual({ fullName: "New Name", email: "old@osteojp.pt" });
    expect(mockAuthEmail).not.toHaveBeenCalled();
    // audit records only the changed field, with no email values.
    const meta = mockAudit.mock.calls[0][2].metadata as Record<string, unknown>;
    expect(meta.fields).toEqual(["full_name"]);
    expect(meta.emailFrom).toBeUndefined();
    expect(meta.emailTo).toBeUndefined();
  });

  it("is a no-op when nothing changed — no DB write, no auth, no audit", async () => {
    const { tx, stats } = makeTx({});
    wireRunScoped(tx, stats);

    await editStaff(admin, "ther-1", { fullName: "Old Name", email: "old@osteojp.pt" });

    expect(stats.updated).toBeUndefined();
    expect(mockAuthEmail).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("owner-tier: an admin cannot edit an owner — no DB write, no auth", async () => {
    const ownerTarget: Target = { ...THERAPIST, roleSlug: "owner" };
    const { tx, stats } = makeTx({ target: ownerTarget });
    wireRunScoped(tx, stats);

    await expect(
      editStaff(admin, "own-2", { fullName: "X", email: "x@osteojp.pt" }),
    ).rejects.toMatchObject({ code: "owner_tier" });
    expect(stats.updated).toBeUndefined();
    expect(mockAuthEmail).not.toHaveBeenCalled();
  });

  it("owner-tier: an owner MAY edit an owner and sync the email", async () => {
    const ownerTarget: Target = { ...THERAPIST, roleSlug: "owner" };
    const { tx, stats } = makeTx({ target: ownerTarget });
    wireRunScoped(tx, stats);
    mockAuthEmail.mockResolvedValue(undefined);

    await editStaff(owner, "own-2", { fullName: "Old Name", email: "chief@osteojp.pt" });

    expect(mockAuthEmail).toHaveBeenCalledExactlyOnceWith("own-2", "chief@osteojp.pt");
  });

  it("not_found when the target does not exist", async () => {
    const { tx, stats } = makeTx({ target: null });
    wireRunScoped(tx, stats);

    await expect(
      editStaff(admin, "ghost", { fullName: "X", email: "x@osteojp.pt" }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(mockAuthEmail).not.toHaveBeenCalled();
  });

  it("rejects a caller without users:manage before any DB work", async () => {
    await expect(
      editStaff(reception, "ther-1", { fullName: "X", email: "x@osteojp.pt" }),
    ).rejects.toThrow();
    expect(mockRunScoped).not.toHaveBeenCalled();
  });
});

describe("maskEmail", () => {
  it("keeps the first 2 local chars + domain, stars the rest", () => {
    expect(maskEmail("bernardo@osteojp.pt")).toBe("be******@osteojp.pt");
    expect(maskEmail("new@osteojp.pt")).toBe("ne*@osteojp.pt");
  });

  it("always masks at least one char, even for a 1-2 char local part", () => {
    expect(maskEmail("a@b.pt")).toBe("a*@b.pt");
    expect(maskEmail("ab@b.pt")).toBe("ab*@b.pt");
  });

  it("never echoes a non-email shape verbatim", () => {
    expect(maskEmail("not-an-email")).toBe("***");
    expect(maskEmail("@leading.pt")).toBe("***");
  });
});
