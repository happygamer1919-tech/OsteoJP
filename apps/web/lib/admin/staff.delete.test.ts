import { vi, describe, it, expect, beforeEach } from "vitest";

// W4-01 — deleteStaffMember: password-gated, linked-records-guarded hard delete.
// Real assertCan (admin gate). Password + DB are mocked. Proves: wrong password
// refused, activity refused, activity-free deletes config child-first then the
// user (no clinical/audit touch), owner/self protected.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("@/lib/auth/provision", () => ({
  provisionStaffUser: vi.fn(),
  generateSetPasswordLink: vi.fn(),
}));
vi.mock("@/lib/reminders/clients", () => ({ sendEmail: vi.fn() }));
vi.mock("./audit", () => ({ writeAudit: vi.fn() }));
vi.mock("./appointment-delete-password", () => ({ verifyDeletePassword: vi.fn() }));

import {
  availabilityTemplates,
  therapistServices,
  timeOff,
  users,
} from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import { writeAudit } from "./audit";
import { verifyDeletePassword } from "./appointment-delete-password";
import { deleteStaffMember } from "./staff";
import type { RequestContext } from "@osteojp/auth";

const mockRunScoped = vi.mocked(runScoped);
const mockVerify = vi.mocked(verifyDeletePassword);
const admin: RequestContext = { tenantId: "tenant-A", role: "admin", userId: "admin-1" };
const reception: RequestContext = { tenantId: "tenant-A", role: "reception", userId: "recep-1" };

function tag(table: unknown): string {
  if (table === therapistServices) return "therapist_services";
  if (table === availabilityTemplates) return "availability_templates";
  if (table === timeOff) return "time_off";
  if (table === users) return "users";
  return "other";
}
function q(rows: unknown[]) {
  return {
    limit: async () => rows,
    then: (res: (v: unknown[]) => void, rej: (e: unknown) => void) =>
      Promise.resolve(rows).then(res, rej),
  };
}

/**
 * Fake tx. Select order: [target user, owner role, then 6 activity counts].
 * `activity` sets each count row. Records the delete order by table.
 */
function makeTx(opts: { target?: { id: string; roleId: string } | null; roleId?: string; activity?: number }) {
  const { target = { id: "ther-1", roleId: "role-therapist" }, activity = 0 } = opts;
  const selectQueue: unknown[][] = [
    target ? [target] : [], // target user
    [{ id: "role-owner" }], // owner role
    ...Array.from({ length: 6 }, () => [{ n: activity }]), // 6 activity counts
  ];
  let si = 0;
  const stats = { deleteOrder: [] as string[] };
  const tx = {
    select: () => ({ from: () => ({ where: () => q(selectQueue[si++] ?? []) }) }),
    delete: (table: unknown) => {
      stats.deleteOrder.push(tag(table));
      const rows = tag(table) === "users" ? [{ id: "ther-1" }] : [];
      return { where: () => ({ returning: async () => rows }) };
    },
  };
  return { tx, stats };
}

beforeEach(() => {
  mockRunScoped.mockReset();
  mockVerify.mockReset();
  vi.mocked(writeAudit).mockReset();
});

describe("deleteStaffMember (W4-01)", () => {
  it("refuses a wrong password before any DB work", async () => {
    mockVerify.mockResolvedValue(false);
    await expect(deleteStaffMember(admin, "ther-1", "wrong")).rejects.toMatchObject({ code: "password" });
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("refuses when the therapist has activity (appointments/records/audit) — nothing deleted", async () => {
    mockVerify.mockResolvedValue(true);
    const { tx, stats } = makeTx({ activity: 2 });
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await expect(deleteStaffMember(admin, "ther-1", "1234")).rejects.toMatchObject({ code: "has_activity" });
    expect(stats.deleteOrder).toEqual([]);
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("deletes an activity-free therapist: config rows first, then the user (no clinical touch)", async () => {
    mockVerify.mockResolvedValue(true);
    const { tx, stats } = makeTx({ activity: 0 });
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await deleteStaffMember(admin, "ther-1", "1234");

    // Config child rows deleted BEFORE the user; only config + users, nothing else.
    expect(stats.deleteOrder).toEqual([
      "therapist_services",
      "availability_templates",
      "time_off",
      "users",
    ]);
    expect(writeAudit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(writeAudit).mock.calls[0][2].action).toBe("staff.delete");
  });

  it("refuses to delete an owner (owner-tier protected)", async () => {
    mockVerify.mockResolvedValue(true);
    const { tx } = makeTx({ target: { id: "own-1", roleId: "role-owner" } });
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await expect(deleteStaffMember(admin, "own-1", "1234")).rejects.toMatchObject({ code: "owner_tier" });
  });

  it("refuses to delete yourself", async () => {
    await expect(deleteStaffMember(admin, "admin-1", "1234")).rejects.toMatchObject({ code: "invalid" });
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("refuses a non-admin (users:manage gate)", async () => {
    await expect(deleteStaffMember(reception, "ther-1", "1234")).rejects.toThrow();
    expect(mockVerify).not.toHaveBeenCalled();
  });
});
