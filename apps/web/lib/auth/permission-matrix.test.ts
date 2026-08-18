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
    // PL-09 Phase 3: admin NOW has statistics:read (location-scoped in-query),
    // so it is no longer a denied capability for admin.
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

  it("SEC-01: the guest queue is owner, admin and reception - NEVER the therapist", () => {
    // Owner ruling 2026-08-18, after a therapist was observed reading the whole
    // tenant's guest queue - names and phone numbers - on deployed production.
    //
    // THE LINE THAT MATTERS IS THE THERAPIST ONE, and it is asserted against the
    // capability the defect actually rode. `appointments:read` gated this queue
    // and EVERY role holds it, so the check passed for a therapist while gating
    // nothing. The pair below is the whole point: the therapist keeps working
    // the calendar and is refused the queue.
    expect(can("therapist", "appointments:read")).toBe(true);
    expect(can("therapist", "guest_requests:read")).toBe(false);

    for (const role of ["owner", "admin", "reception"] as const) {
      expect(can(role, "guest_requests:read")).toBe(true);
    }

    // The grant carried nothing else with it: reception still holds no settings.
    expect(can("reception", "settings:read")).toBe(false);
  });

  it("PL-09 Phase 5: reception manages schedules but holds NO tenant settings", () => {
    // Reception OWNS scheduling for their location (schedule:*), decoupled from
    // settings:* — it must never gain tenant settings by that grant.
    expect(can("reception", "schedule:read")).toBe(true);
    expect(can("reception", "schedule:manage")).toBe(true);
    expect(can("reception", "settings:read")).toBe(false);
    expect(can("reception", "settings:manage")).toBe(false);
    // owner + admin also manage schedules.
    expect(can("owner", "schedule:manage")).toBe(true);
    expect(can("admin", "schedule:manage")).toBe(true);
    // ITEM 3 (2026-08-14): the therapist role now manages schedules too, but
    // ONLY its own - the restriction is a SCOPE, not a capability, and lives in
    // lib/admin/schedule-scope.ts (`{kind:"self"}`) with its own suite in
    // lib/admin/therapist-self-schedule.test.ts. This line used to read
    // `toBe(false)`; it is changed on the owner's ruling, not to make a test
    // pass. What matters HERE is that the grant carried nothing else with it:
    expect(can("therapist", "schedule:manage")).toBe(true);
    expect(can("therapist", "settings:read")).toBe(false);
    expect(can("therapist", "settings:manage")).toBe(false);
    expect(can("therapist", "users:manage")).toBe(false);
  });
});
