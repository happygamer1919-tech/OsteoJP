import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the patient gate so the route test never touches Supabase / next/headers
// (and never loads its "server-only" import). vi.hoisted lets the hoisted
// vi.mock factory reference the spy safely.
const { getPatientPrincipal } = vi.hoisted(() => ({ getPatientPrincipal: vi.fn() }));
vi.mock("@/lib/auth/patient", () => ({ getPatientPrincipal }));

import { GET } from "./route";

beforeEach(() => getPatientPrincipal.mockReset());

describe("GET /api/v1/auth/session", () => {
  it("401s when there is no patient principal (fail-closed)", async () => {
    getPatientPrincipal.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("returns ONLY the caller's own ids when authenticated", async () => {
    getPatientPrincipal.mockResolvedValue({
      tenantId: "t-1",
      patientId: "p-1",
      userId: "u-1",
    });
    const res = await GET();
    expect(res.status).toBe(200);
    // userId (auth sub) is deliberately NOT echoed — only self identity.
    await expect(res.json()).resolves.toEqual({ patientId: "p-1", tenantId: "t-1" });
  });
});
