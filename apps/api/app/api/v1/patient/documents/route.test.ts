import { describe, expect, it, vi, beforeEach } from "vitest";

const { getPatientPrincipal } = vi.hoisted(() => ({ getPatientPrincipal: vi.fn() }));
vi.mock("@/lib/auth/patient", () => ({ getPatientPrincipal }));
const { listOwnDocuments } = vi.hoisted(() => ({ listOwnDocuments: vi.fn() }));
vi.mock("@/lib/patient/documents", () => ({ listOwnDocuments }));

import { GET } from "./route";

const PRINCIPAL = { tenantId: "t-1", patientId: "p-1", userId: "u-1" };
const DOCS = [{ id: "d1", fileName: "declaracao.pdf", mimeType: "application/pdf", sizeBytes: 1024, createdAt: "2026-04-06T09:00:00.000Z" }];

beforeEach(() => {
  getPatientPrincipal.mockReset();
  listOwnDocuments.mockReset();
});

describe("GET /api/v1/patient/documents", () => {
  it("401s when there is no patient principal (fail-closed)", async () => {
    getPatientPrincipal.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
    expect(listOwnDocuments).not.toHaveBeenCalled();
  });

  it("returns the caller's own documents, scoped by the VERIFIED principal", async () => {
    getPatientPrincipal.mockResolvedValue(PRINCIPAL);
    listOwnDocuments.mockResolvedValue(DOCS);
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ documents: DOCS });
    expect(listOwnDocuments).toHaveBeenCalledWith(PRINCIPAL);
  });
});
