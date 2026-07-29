import { vi, describe, it, expect, beforeEach } from "vitest";

// W6-05 - the Estatisticas KPI function is OWNER-ONLY, enforced at the query
// layer (getStatistics asserts statistics:read) in addition to the route
// redirect. A non-owner gets a hard refusal, never data.

vi.mock("server-only", () => ({}));
vi.mock("../auth/context", () => ({
  requireRequestContext: vi.fn(),
  runScoped: vi.fn(),
}));

import { ForbiddenError } from "@osteojp/auth";
import { runScoped } from "../auth/context";
import { getStatistics } from "./queries";
import type { RequestContext } from "@osteojp/auth";

const mockRunScoped = vi.mocked(runScoped);

const owner: RequestContext = { tenantId: "t-A", role: "owner", userId: "u-owner" };
const admin: RequestContext = { tenantId: "t-A", role: "admin", userId: "u-admin" };
const therapist: RequestContext = { tenantId: "t-A", role: "therapist", userId: "u-th" };
const reception: RequestContext = { tenantId: "t-A", role: "reception", userId: "u-rc" };

beforeEach(() => {
  mockRunScoped.mockReset();
});

describe("getStatistics query-level gate (PL-09 Phase 3: owner + admin)", () => {
  // therapist + reception still have no statistics:read -> refused before any query.
  for (const actor of [therapist, reception]) {
    it(`refuses a ${actor.role} with ForbiddenError (no data, no query)`, async () => {
      await expect(getStatistics(actor)).rejects.toBeInstanceOf(ForbiddenError);
      expect(mockRunScoped).not.toHaveBeenCalled();
    });
  }

  it("proceeds for the owner", async () => {
    const canned = { revenueTotalCents: 0 };
    mockRunScoped.mockResolvedValue(canned as never);
    await expect(getStatistics(owner)).resolves.toBe(canned);
    expect(mockRunScoped).toHaveBeenCalledTimes(1);
  });

  it("proceeds for an admin (statistics now allowed; scoped to their location in-query)", async () => {
    const canned = { revenueTotalCents: 0 };
    mockRunScoped.mockResolvedValue(canned as never);
    // Admin is NOT refused. It first resolves its location scope (one runScoped)
    // then runs the aggregate query (another) - both mocked here; the point is
    // the capability gate lets admin through.
    await expect(getStatistics(admin)).resolves.toBe(canned);
  });
});
