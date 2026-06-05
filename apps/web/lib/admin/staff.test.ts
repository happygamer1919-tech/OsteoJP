import { describe, it, expect, vi } from "vitest";

// staff.ts (and its provision/audit imports) pull in "server-only"; neutralise
// it for the node test runner. We only exercise the pure functions here.
vi.mock("server-only", () => ({}));

import { assignableRoles, canReassignRole, ROLES } from "@osteojp/auth";
import { inviteDeliveryFromSend, normalizeStaffProfile } from "./staff";
import { isAdminError } from "./errors";
import type { SendResult } from "@/lib/reminders/clients";

/**
 * Pure validation for the staff name/email edit (ticket #5). Locks the
 * normalization rules used by editStaff before it touches the DB: trim both
 * fields, lowercase the email (parity with the invite path + the
 * users_tenant_email_uq uniqueness intent), and reject empty/malformed input.
 */
describe("normalizeStaffProfile", () => {
  it("trims the name and lowercases + trims the email", () => {
    expect(
      normalizeStaffProfile({ fullName: "  Ana Silva  ", email: "  Ana.Silva@OsteoJP.PT " }),
    ).toEqual({ fullName: "Ana Silva", email: "ana.silva@osteojp.pt" });
  });

  it("rejects an empty full name", () => {
    expect(() => normalizeStaffProfile({ fullName: "   ", email: "a@b.pt" })).toThrow();
    try {
      normalizeStaffProfile({ fullName: "", email: "a@b.pt" });
    } catch (e) {
      expect(isAdminError(e) && e.code).toBe("invalid");
    }
  });

  it("rejects an email with no @", () => {
    try {
      normalizeStaffProfile({ fullName: "Ana", email: "not-an-email" });
      throw new Error("expected throw");
    } catch (e) {
      expect(isAdminError(e) && e.code).toBe("invalid");
    }
  });
});

/**
 * #2 — role-reassignment authority. The owner-tier rule lives in the permission
 * matrix (packages/auth) and is shared by the staff UI (assignableRoles) and the
 * server gate (canReassignRole). Lock both: admins may reassign any NON-owner
 * role; only an owner may grant owner or change a user who currently holds it.
 */
describe("assignableRoles", () => {
  it("offers an owner every role", () => {
    expect(assignableRoles("owner").sort()).toEqual([...ROLES].sort());
  });

  it("hides owner from an admin (all non-owner roles offered)", () => {
    const a = assignableRoles("admin");
    expect(a).not.toContain("owner");
    expect(a.sort()).toEqual([...ROLES].filter((r) => r !== "owner").sort());
  });

  it("offers nothing to roles without users:manage", () => {
    expect(assignableRoles("therapist")).toEqual([]);
    expect(assignableRoles("reception")).toEqual([]);
  });
});

describe("canReassignRole", () => {
  it("lets an admin move a staff member among non-owner roles", () => {
    expect(canReassignRole("admin", "reception", "therapist")).toBe(true);
    expect(canReassignRole("admin", "therapist", "admin")).toBe(true);
    expect(canReassignRole("admin", null, "reception")).toBe(true);
  });

  it("blocks an admin from granting owner or changing an owner", () => {
    expect(canReassignRole("admin", "admin", "owner")).toBe(false);
    expect(canReassignRole("admin", "owner", "admin")).toBe(false);
  });

  it("lets an owner do both sides of the owner tier", () => {
    expect(canReassignRole("owner", "admin", "owner")).toBe(true);
    expect(canReassignRole("owner", "owner", "admin")).toBe(true);
  });

  it("denies roles without users:manage outright", () => {
    expect(canReassignRole("therapist", "reception", "admin")).toBe(false);
    expect(canReassignRole("reception", "reception", "therapist")).toBe(false);
  });
});

/**
 * #3 — invite delivery decision. Temp-password is the fallback whenever the
 * invite mail did not actually leave the system: a failed send (null) OR a
 * sandbox/suppressed send. Only a real live delivery counts as "email".
 */
describe("inviteDeliveryFromSend", () => {
  const live: SendResult = { channel: "email", sandbox: false, id: "re_123" };
  const sandbox: SendResult = { channel: "email", sandbox: true, id: "sandbox:email" };

  it("counts a live delivery as email", () => {
    expect(inviteDeliveryFromSend(live)).toBe("email");
  });

  it("falls back to temp password on a sandbox/suppressed send", () => {
    expect(inviteDeliveryFromSend(sandbox)).toBe("temp_password");
  });

  it("falls back to temp password when the send failed (null)", () => {
    expect(inviteDeliveryFromSend(null)).toBe("temp_password");
  });
});
