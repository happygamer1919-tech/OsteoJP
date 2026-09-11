import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getPatientPrincipal } = vi.hoisted(() => ({ getPatientPrincipal: vi.fn() }));
vi.mock("@/lib/auth/patient", () => ({ getPatientPrincipal }));
const { readOwnGuestIntakes } = vi.hoisted(() => ({ readOwnGuestIntakes: vi.fn() }));
vi.mock("@/lib/guest-intake/patient-read", () => ({ readOwnGuestIntakes }));

import * as route from "./route";
import { GET } from "./route";

const PRINCIPAL = { tenantId: "t-1", patientId: "p-1", userId: "u-1" };
const INTAKE = {
  id: "i-1",
  submittedAt: "2026-09-11T09:00:00.000Z",
  dateOfBirth: "1985-03-02",
  reason: "Dor lombar",
  healthConditions: null,
  medication: null,
  fallsAccidents: null,
  surgeries: null,
  pacemaker: "nao_perguntado",
  pregnancy: "nao",
  consentAt: "2026-09-11T09:00:00.000Z",
};

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  getPatientPrincipal.mockReset();
  readOwnGuestIntakes.mockReset();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("GET /api/v1/patient/intake (INTAKE-01)", () => {
  it("401s when there is no patient principal, and reads nothing (fail-closed)", async () => {
    getPatientPrincipal.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
    expect(readOwnGuestIntakes).not.toHaveBeenCalled();
  });

  it("returns the caller's own intakes, read with the VERIFIED principal, never cached", async () => {
    getPatientPrincipal.mockResolvedValue(PRINCIPAL);
    readOwnGuestIntakes.mockResolvedValue({ enabled: true, intakes: [INTAKE] });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({ enabled: true, intakes: [INTAKE] });
    expect(readOwnGuestIntakes).toHaveBeenCalledWith(PRINCIPAL);
  });

  it("0087 not applied: 200 with enabled false, so the portal shows nothing", async () => {
    getPatientPrincipal.mockResolvedValue(PRINCIPAL);
    readOwnGuestIntakes.mockResolvedValue({ enabled: false, intakes: [] });
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ enabled: false, intakes: [] });
  });

  it("a failed read is a fixed 503, and neither the response nor the log carries the error's text", async () => {
    getPatientPrincipal.mockResolvedValue(PRINCIPAL);
    // A query error's message can carry parameters; this one carries an answer.
    readOwnGuestIntakes.mockRejectedValue(new Error('select ... params: ["Dor lombar"]'));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: "service_unavailable" });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("Dor lombar");
  });

  it("is READ ONLY: GET is the only method the route exports", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(route).not.toHaveProperty(m);
    }
  });
});
