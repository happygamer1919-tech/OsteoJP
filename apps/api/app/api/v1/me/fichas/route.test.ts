import { describe, expect, it, vi, beforeEach } from "vitest";

const { getPatientPrincipal } = vi.hoisted(() => ({ getPatientPrincipal: vi.fn() }));
const { listOwnFichas } = vi.hoisted(() => ({ listOwnFichas: vi.fn() }));
vi.mock("@/lib/auth/patient", () => ({ getPatientPrincipal }));
vi.mock("@/lib/fichas/read", () => ({ listOwnFichas }));

import { GET } from "./route";

beforeEach(() => {
  getPatientPrincipal.mockReset();
  listOwnFichas.mockReset();
});

describe("GET /api/v1/me/fichas", () => {
  it("401s fail-closed when there is no patient principal", async () => {
    getPatientPrincipal.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listOwnFichas).not.toHaveBeenCalled();
  });

  it("returns the patient's own redacted fichas", async () => {
    getPatientPrincipal.mockResolvedValue({ tenantId: "t", patientId: "p", userId: "s" });
    listOwnFichas.mockResolvedValue([{ id: "r1", status: "signed", version: 1, episodeId: null, createdAt: null, signedAt: null, data: {} }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fichas).toHaveLength(1);
    expect(body.fichas[0]).not.toHaveProperty("private_notes");
  });
});
