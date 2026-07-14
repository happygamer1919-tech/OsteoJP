import { describe, expect, it } from "vitest";
import {
  assertCan,
  can,
  ForbiddenError,
  PERMISSIONS,
  ROLES,
  type Capability,
  type Role,
} from "@osteojp/auth";

/**
 * Adversarial audit — role boundaries per the permission matrix.
 *
 * The intra-tenant role wall is enforced app-layer by assertCan() before any
 * DB call (the tenant wall + clinical_records role gate are ALSO enforced by
 * RLS; see the packages/db suites). Here we attempt every "lower role does a
 * higher-role-only action" and assert denial, and lock the full matrix so a
 * future grant can't silently widen a role.
 *
 * Source of truth: packages/auth/permissions.ts (PERMISSIONS).
 */

// The capability matrix from CLAUDE.md, expressed as the actions each role must
// be DENIED. Derived independently of PERMISSIONS so a drift in either fails.
const DENIED: Record<Role, Capability[]> = {
  owner: [], // owner is unrestricted within the tenant
  admin: [
    // oversight role, not a clinician — cannot author/review/sign clinical records
    "clinical_records:author",
    "clinical_records:review",
    "clinical_records:sign",
    // only the owner manages roles (no privilege escalation by an admin)
    "roles:manage",
    // the Pacientes eliminados recovery view is owner-only (W6-04)
    "patients:recover",
    "statistics:read",
  ],
  therapist: [
    "patients:delete",
    "patients:recover",
    "statistics:read",
    "appointments:delete",
    "invoices:issue",
    "invoices:void",
    "services:write",
    "locations:write",
    "users:read",
    "users:manage",
    "roles:read",
    "roles:manage",
    "settings:read",
    "settings:manage",
    "audit_log:read",
  ],
  reception: [
    // NO clinical access at all
    "clinical_records:read",
    "clinical_records:author",
    "clinical_records:review",
    "clinical_records:sign",
    "patients:delete",
    "patients:recover",
    "statistics:read",
    "invoices:void",
    "services:write",
    "locations:write",
    "users:read",
    "users:manage",
    "roles:read",
    "roles:manage",
    "settings:read",
    "settings:manage",
    "audit_log:read",
  ],
};

describe("role-boundary denials (lower role attempting higher-role-only actions)", () => {
  for (const role of ROLES) {
    for (const capability of DENIED[role]) {
      it(`${role} is DENIED ${capability}`, () => {
        expect(can(role, capability)).toBe(false);
        expect(() => assertCan(role, capability)).toThrow(ForbiddenError);
      });
    }
  }

  it("ForbiddenError carries the offending role + capability", () => {
    try {
      assertCan("reception", "clinical_records:read");
      throw new Error("expected assertCan to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
      expect((err as ForbiddenError).role).toBe("reception");
      expect((err as ForbiddenError).capability).toBe("clinical_records:read");
    }
  });
});

describe("matrix lock — granted capabilities (escalation guard)", () => {
  // Every action a role IS allowed must pass assertCan, so the DENIED lists
  // above can't pass vacuously by also denying a granted capability.
  for (const role of ROLES) {
    it(`${role} is allowed exactly its granted capabilities`, () => {
      for (const capability of PERMISSIONS[role]) {
        expect(can(role, capability)).toBe(true);
        expect(() => assertCan(role, capability)).not.toThrow();
      }
    });
  }

  it("owner holds every capability; no other role is a superset of owner", () => {
    const ownerCaps = PERMISSIONS.owner;
    for (const role of ROLES) {
      if (role === "owner") continue;
      // Every non-owner capability is also an owner capability (no escalation).
      for (const cap of PERMISSIONS[role]) {
        expect(ownerCaps.has(cap)).toBe(true);
      }
      // And a non-owner is strictly smaller than owner.
      expect(PERMISSIONS[role].size).toBeLessThan(ownerCaps.size);
    }
  });

  it("only the owner can manage roles (privilege-escalation wall)", () => {
    expect(can("owner", "roles:manage")).toBe(true);
    for (const role of ["admin", "therapist", "reception"] as const) {
      expect(can(role, "roles:manage")).toBe(false);
    }
  });
});
