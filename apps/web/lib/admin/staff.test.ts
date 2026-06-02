import { describe, it, expect, vi } from "vitest";

// staff.ts (and its provision/audit imports) pull in "server-only"; neutralise
// it for the node test runner. We only exercise the pure normalizer here.
vi.mock("server-only", () => ({}));

import { normalizeStaffProfile } from "./staff";
import { isAdminError } from "./errors";

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
