import { describe, it, expect, vi } from "vitest";
import { patients } from "@osteojp/db";
import type { RequestContext } from "../auth/context";

vi.mock("server-only", () => ({}));

import { therapistPatientScope } from "./scope";

/**
 * W10-04 isolation: therapistPatientScope returns a NARROWING predicate ONLY for
 * the therapist role; owner/admin/reception are unscoped (undefined -> no extra
 * WHERE). The predicate contents (appointment-participation UNION created_by) are
 * exercised end-to-end by the negative-isolation E2E; this pins the role gate.
 */
const ctx = (role: RequestContext["role"]): RequestContext => ({
  tenantId: "00000000-0000-0000-0000-0000000000a1",
  role,
  userId: "00000000-0000-0000-0000-00000000u001",
});

describe("therapistPatientScope — role-gated patient narrowing", () => {
  it("returns a predicate for the therapist role", () => {
    expect(therapistPatientScope(ctx("therapist"), patients.id)).toBeDefined();
  });

  it("returns undefined (no narrowing) for owner, admin and reception", () => {
    expect(therapistPatientScope(ctx("owner"), patients.id)).toBeUndefined();
    expect(therapistPatientScope(ctx("admin"), patients.id)).toBeUndefined();
    expect(therapistPatientScope(ctx("reception"), patients.id)).toBeUndefined();
  });
});
