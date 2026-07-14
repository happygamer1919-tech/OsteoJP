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

describe("getStatistics query-level owner gate (W6-05)", () => {
  for (const actor of [admin, therapist, reception]) {
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
});
