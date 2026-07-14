/**
 * W7-01: classify a Supabase auth error as "login email already registered"
 * WITHOUT matching provider message text (which is not a stable contract).
 * Auth emails are unique platform-wide, so a staff member deleted from a tenant
 * leaves an orphaned auth login that the tenant-scoped invite pre-check cannot
 * see; re-inviting that address must say so, not fail generically.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@osteojp/db", () => ({
  getDbAdmin: vi.fn(),
  withTenantContext: vi.fn(),
  roles: {},
  users: {},
  tenants: {},
  provisionTenant: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/admin/audit", () => ({ writeAudit: vi.fn() }));

import { isAuthEmailTaken } from "./provision";

describe("isAuthEmailTaken", () => {
  it("matches the structured duplicate-email codes", () => {
    expect(isAuthEmailTaken({ code: "email_exists" })).toBe(true);
    expect(isAuthEmailTaken({ code: "user_already_exists" })).toBe(true);
  });

  it("does not match unrelated auth codes", () => {
    expect(isAuthEmailTaken({ code: "weak_password", status: 422 })).toBe(false);
    expect(isAuthEmailTaken({ code: "over_request_rate_limit", status: 429 })).toBe(false);
    expect(isAuthEmailTaken({ code: "unexpected_failure", status: 500 })).toBe(false);
  });

  it("falls back to status 422 only when no code is present", () => {
    expect(isAuthEmailTaken({ status: 422 })).toBe(true);
    expect(isAuthEmailTaken({ status: 500 })).toBe(false);
  });

  it("treats a missing error as not-taken", () => {
    expect(isAuthEmailTaken(null)).toBe(false);
    expect(isAuthEmailTaken(undefined)).toBe(false);
  });

  it("ignores provider message text entirely", () => {
    // A message that *says* already registered but carries a non-duplicate code
    // must NOT be classified as a duplicate: the code is the contract.
    expect(
      isAuthEmailTaken({ code: "unexpected_failure", status: 500 }),
    ).toBe(false);
  });
});
