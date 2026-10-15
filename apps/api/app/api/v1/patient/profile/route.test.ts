import { describe, expect, it, vi, beforeEach } from "vitest";

const { getPatientPrincipal } = vi.hoisted(() => ({ getPatientPrincipal: vi.fn() }));
vi.mock("@/lib/auth/patient", () => ({ getPatientPrincipal }));
const { getOwnProfile, updateOwnProfile, ownSurveySwitchOffered } = vi.hoisted(() => ({
  getOwnProfile: vi.fn(),
  updateOwnProfile: vi.fn(),
  ownSurveySwitchOffered: vi.fn(),
}));
vi.mock("@/lib/patient/profile", () => ({ getOwnProfile, updateOwnProfile, ownSurveySwitchOffered }));

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
  ownSurveySwitchOffered.mockReset();
  // The survey switch is not offered unless a test says so: the shipped state.
  ownSurveySwitchOffered.mockReturnValue(false);
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

// SAT-01 (S8): the patient's own survey switch. Whether it is offered is the
// library's answer (lib/patient/profile.ts, proven against the variable in
// profile.test.ts and against a database in profile-survey.db.test.ts); these
// tests are the route's half: what it lets through, and what it does not.
describe("PATCH /api/v1/patient/profile, the survey switch", () => {
  const patch = (body: unknown) =>
    PATCH(
      new Request("http://localhost/api/v1/patient/profile", {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      }),
    );

  it("NOT OFFERED: surveyEnabled alone is a body with nothing editable, and nothing is written", async () => {
    getPatientPrincipal.mockResolvedValue(PRINCIPAL);
    for (const value of [false, true]) {
      const res = await patch({ surveyEnabled: value });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: "no_editable_fields" });
    }
    expect(ownSurveySwitchOffered).toHaveBeenCalledWith(PRINCIPAL);
    expect(updateOwnProfile).not.toHaveBeenCalled();
  });

  it("NOT OFFERED: beside an editable field it is dropped, and the other field still saves", async () => {
    getPatientPrincipal.mockResolvedValue(PRINCIPAL);
    updateOwnProfile.mockResolvedValue(PROFILE);
    const res = await patch({ city: "Oeiras", surveyEnabled: false });
    expect(res.status).toBe(200);
    expect(updateOwnProfile).toHaveBeenCalledWith(PRINCIPAL, { city: "Oeiras" });
  });

  it("NOT OFFERED: a value that is not a boolean is not even judged (the key is unknown here)", async () => {
    getPatientPrincipal.mockResolvedValue(PRINCIPAL);
    const res = await patch({ surveyEnabled: "false" });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "no_editable_fields" });
    expect(updateOwnProfile).not.toHaveBeenCalled();
  });

  it("OFFERED: the switch alone is passed through, and the reminder switches are not named", async () => {
    getPatientPrincipal.mockResolvedValue(PRINCIPAL);
    ownSurveySwitchOffered.mockReturnValue(true);
    for (const value of [false, true]) {
      updateOwnProfile.mockReset();
      updateOwnProfile.mockResolvedValue({ ...PROFILE, surveyEnabled: value });
      const res = await patch({ surveyEnabled: value });
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ profile: { ...PROFILE, surveyEnabled: value } });
      // Exactly this one key: no reminder switch travels with it.
      expect(updateOwnProfile).toHaveBeenCalledTimes(1);
      expect(updateOwnProfile).toHaveBeenCalledWith(PRINCIPAL, { surveyEnabled: value });
    }
  });

  it("OFFERED: a value that is not a boolean is refused, never coerced", async () => {
    getPatientPrincipal.mockResolvedValue(PRINCIPAL);
    ownSurveySwitchOffered.mockReturnValue(true);
    for (const value of ["false", "true", 0, 1, null, "", [], {}]) {
      const res = await patch({ surveyEnabled: value });
      expect(res.status, JSON.stringify(value)).toBe(422);
      await expect(res.json()).resolves.toEqual({ error: "invalid_survey_enabled" });
    }
    expect(updateOwnProfile).not.toHaveBeenCalled();
  });

  it("the patient is the session's, never the body's: an id in the body goes nowhere", async () => {
    getPatientPrincipal.mockResolvedValue(PRINCIPAL);
    ownSurveySwitchOffered.mockReturnValue(true);
    updateOwnProfile.mockResolvedValue({ ...PROFILE, surveyEnabled: false });
    await patch({ surveyEnabled: false, id: "p-2", patientId: "p-2", tenantId: "t-2" });
    expect(ownSurveySwitchOffered).toHaveBeenCalledWith(PRINCIPAL);
    expect(updateOwnProfile).toHaveBeenCalledWith(PRINCIPAL, { surveyEnabled: false });
  });

  it("no session: 401 before the switch is asked about", async () => {
    getPatientPrincipal.mockResolvedValue(null);
    const res = await patch({ surveyEnabled: false });
    expect(res.status).toBe(401);
    expect(ownSurveySwitchOffered).not.toHaveBeenCalled();
    expect(updateOwnProfile).not.toHaveBeenCalled();
  });
});
