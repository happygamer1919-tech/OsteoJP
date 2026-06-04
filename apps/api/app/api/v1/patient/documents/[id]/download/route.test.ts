import { describe, expect, it, vi, beforeEach } from "vitest";

const { getPatientPrincipal } = vi.hoisted(() => ({ getPatientPrincipal: vi.fn() }));
vi.mock("@/lib/auth/patient", () => ({ getPatientPrincipal }));
const { createOwnDocumentDownloadUrl } = vi.hoisted(() => ({ createOwnDocumentDownloadUrl: vi.fn() }));
vi.mock("@/lib/patient/download", () => ({ createOwnDocumentDownloadUrl }));

import { GET } from "./route";

const PRINCIPAL = { tenantId: "t-1", patientId: "p-1", userId: "u-1" };
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  getPatientPrincipal.mockReset();
  createOwnDocumentDownloadUrl.mockReset();
});

describe("GET /api/v1/patient/documents/[id]/download", () => {
  it("401s when there is no patient principal (fail-closed)", async () => {
    getPatientPrincipal.mockResolvedValue(null);
    const res = await GET(new Request("https://api.osteojp.pt/x"), ctx("d1"));
    expect(res.status).toBe(401);
    expect(createOwnDocumentDownloadUrl).not.toHaveBeenCalled();
  });

  it("returns a signed URL for the caller's own document", async () => {
    getPatientPrincipal.mockResolvedValue(PRINCIPAL);
    createOwnDocumentDownloadUrl.mockResolvedValue({ url: "https://supabase.example/sign?token=abc" });
    const res = await GET(new Request("https://api.osteojp.pt/x"), ctx("cccccccc-cccc-cccc-cccc-cccccccccccc"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url: "https://supabase.example/sign?token=abc" });
    // The id is a DOCUMENT id; the patient is the VERIFIED principal (never payload).
    expect(createOwnDocumentDownloadUrl).toHaveBeenCalledWith(PRINCIPAL, "cccccccc-cccc-cccc-cccc-cccccccccccc");
  });

  it("ADVERSARIAL: 404s when the document is not the caller's own (cross-patient/tenant)", async () => {
    getPatientPrincipal.mockResolvedValue(PRINCIPAL);
    createOwnDocumentDownloadUrl.mockResolvedValue(null); // self-scope said no
    const res = await GET(new Request("https://api.osteojp.pt/x"), ctx("dddddddd-dddd-dddd-dddd-dddddddddddd"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "not_found" });
  });
});
