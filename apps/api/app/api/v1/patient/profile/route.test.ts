import { describe, expect, it, vi, beforeEach } from "vitest";

const { getPatientPrincipal } = vi.hoisted(() => ({ getPatientPrincipal: vi.fn() }));
vi.mock("@/lib/auth/patient", () => ({ getPatientPrincipal }));
const { getOwnProfile } = vi.hoisted(() => ({ getOwnProfile: vi.fn() }));
vi.mock("@/lib/patient/profile", () => ({ getOwnProfile }));

import { GET } from "./route";

const PRINCIPAL = { tenantId: "t-1", patientId: "p-1", userId: "u-1" };
const PROFILE = { id: "p-1", fullName: "Maria Silva", email: "m@x.pt", phone: null, address: null, postalCode: null, city: "Linda-a-Velha" };

beforeEach(() => {
  getPatientPrincipal.mockReset();
  getOwnProfile.mockReset();
});

describe("GET /api/v1/patient/profile", () => {
  it("401s when there is no patient principal (fail-closed)", async () => {
    getPatientPrincipal.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
    expect(getOwnProfile).not.toHaveBeenCalled();
  });

  it("returns the caller's own profile, scoped by the VERIFIED principal", async () => {
    getPatientPrincipal.mockResolvedValue(PRINCIPAL);
    getOwnProfile.mockResolvedValue(PROFILE);
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ profile: PROFILE });
    // patient_id is taken from the principal — there is no payload path for it.
    expect(getOwnProfile).toHaveBeenCalledWith(PRINCIPAL);
  });

  it("404s when the profile cannot be resolved", async () => {
    getPatientPrincipal.mockResolvedValue(PRINCIPAL);
    getOwnProfile.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(404);
  });
});
