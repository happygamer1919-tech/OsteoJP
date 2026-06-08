import { describe, expect, it, vi, beforeEach } from "vitest";

const { getPatientPrincipal } = vi.hoisted(() => ({ getPatientPrincipal: vi.fn() }));
vi.mock("@/lib/auth/patient", () => ({ getPatientPrincipal }));
const { getOwnProfile, updateOwnProfile } = vi.hoisted(() => ({
  getOwnProfile: vi.fn(),
  updateOwnProfile: vi.fn(),
}));
vi.mock("@/lib/patient/profile", () => ({ getOwnProfile, updateOwnProfile }));

import { GET, PATCH } from "./route";

const PRINCIPAL = { tenantId: "t-1", patientId: "p-1", userId: "u-1" };
const PROFILE = {
  id: "p-1",
  fullName: "Maria Silva",
  email: "m@x.pt",
  phone: null,
  address: null,
  postalCode: null,
  city: "Linda-a-Velha",
};

beforeEach(() => {
  getPatientPrincipal.mockReset();
  getOwnProfile.mockReset();
  updateOwnProfile.mockReset();
});

describe("GET /api/v1/patient/profile", () => {
  it("401s when there is no patient principal (fail-closed)", async () => {
    getPatientPrincipal.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    // unauthorized() helper always includes a message (i18n)
    const body = await res.json() as { error: string };
    expect(body.error).toBe("unauthorized");
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

describe("PATCH /api/v1/patient/profile", () => {
  it("401s when there is no patient principal (fail-closed)", async () => {
    getPatientPrincipal.mockResolvedValue(null);
    const req = new Request("http://localhost/api/v1/patient/profile", {
      method: "PATCH",
      body: JSON.stringify({ phone: "+351912345678" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("unauthorized");
    expect(updateOwnProfile).not.toHaveBeenCalled();
  });

  it("updates the profile and returns the updated row", async () => {
    getPatientPrincipal.mockResolvedValue(PRINCIPAL);
    const updated = { ...PROFILE, phone: "+351912345678" };
    updateOwnProfile.mockResolvedValue(updated);
    const req = new Request("http://localhost/api/v1/patient/profile", {
      method: "PATCH",
      body: JSON.stringify({ phone: "+351912345678" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ profile: updated });
    expect(updateOwnProfile).toHaveBeenCalledWith(PRINCIPAL, { phone: "+351912345678" });
  });

  it("400s when no editable fields are provided", async () => {
    getPatientPrincipal.mockResolvedValue(PRINCIPAL);
    const req = new Request("http://localhost/api/v1/patient/profile", {
      method: "PATCH",
      body: JSON.stringify({ fullName: "Hacker" }), // not editable
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("no_editable_fields");
  });

  it("422s on invalid phone", async () => {
    getPatientPrincipal.mockResolvedValue(PRINCIPAL);
    updateOwnProfile.mockRejectedValue(new Error("INVALID_PHONE"));
    const req = new Request("http://localhost/api/v1/patient/profile", {
      method: "PATCH",
      body: JSON.stringify({ phone: "not-a-phone" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(422);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("invalid_phone");
  });
});
