import { describe, expect, it, vi, beforeEach } from "vitest";

const { getPatientPrincipal } = vi.hoisted(() => ({ getPatientPrincipal: vi.fn() }));
vi.mock("@/lib/auth/patient", () => ({ getPatientPrincipal }));
const { createOwnDocumentPreviewUrl } = vi.hoisted(() => ({ createOwnDocumentPreviewUrl: vi.fn() }));
vi.mock("@/lib/patient/download", () => ({ createOwnDocumentPreviewUrl }));

import { GET } from "./route";

const PRINCIPAL = { tenantId: "t-1", patientId: "p-1", userId: "u-1" };
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  getPatientPrincipal.mockReset();
  createOwnDocumentPreviewUrl.mockReset();
});

describe("GET /api/v1/patient/documents/[id]/preview", () => {
  it("401s when there is no patient principal (fail-closed)", async () => {
    getPatientPrincipal.mockResolvedValue(null);
    const res = await GET(new Request("https://api.osteojp.pt/x"), ctx("d1"));
    expect(res.status).toBe(401);
    // Nothing is resolved or signed for a caller who is not a patient.
    expect(createOwnDocumentPreviewUrl).not.toHaveBeenCalled();
  });

  it("returns an inline URL and its kind for the caller's own document", async () => {
    getPatientPrincipal.mockResolvedValue(PRINCIPAL);
    createOwnDocumentPreviewUrl.mockResolvedValue({
      url: "https://supabase.example/sign?token=abc",
      kind: "pdf",
    });

    const res = await GET(
      new Request("https://api.osteojp.pt/x"),
      ctx("cccccccc-cccc-cccc-cccc-cccccccccccc"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      url: "https://supabase.example/sign?token=abc",
      kind: "pdf",
    });
    // The id is a DOCUMENT id; the patient is the VERIFIED principal.
    expect(createOwnDocumentPreviewUrl).toHaveBeenCalledWith(
      PRINCIPAL,
      "cccccccc-cccc-cccc-cccc-cccccccccccc",
    );
  });

  it("ADVERSARIAL: 404s for another patient's document", async () => {
    getPatientPrincipal.mockResolvedValue(PRINCIPAL);
    createOwnDocumentPreviewUrl.mockResolvedValue(null); // self-scope said no
    const res = await GET(
      new Request("https://api.osteojp.pt/x"),
      ctx("dddddddd-dddd-dddd-dddd-dddddddddddd"),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "not_found" });
  });

  it("404s for a document that cannot be previewed, in the SAME shape", async () => {
    // A Word document the patient really does own. The portal must not be able
    // to tell this apart from somebody else's file: one refusal, one shape.
    getPatientPrincipal.mockResolvedValue(PRINCIPAL);
    createOwnDocumentPreviewUrl.mockResolvedValue(null);
    const res = await GET(
      new Request("https://api.osteojp.pt/x"),
      ctx("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "not_found" });
  });
});
