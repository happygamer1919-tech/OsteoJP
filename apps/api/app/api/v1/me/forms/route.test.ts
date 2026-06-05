import { describe, expect, it, vi, beforeEach } from "vitest";

const { getPatientPrincipal } = vi.hoisted(() => ({ getPatientPrincipal: vi.fn() }));
const { createPatientFormSubmission, listOwnSubmissions } = vi.hoisted(() => ({
  createPatientFormSubmission: vi.fn(),
  listOwnSubmissions: vi.fn(),
}));
vi.mock("@/lib/auth/patient", () => ({ getPatientPrincipal }));
vi.mock("@/lib/intake/submit", () => ({ createPatientFormSubmission, listOwnSubmissions }));

import { POST, GET } from "./route";

function req(body: unknown): Request {
  return new Request("http://localhost/api/v1/me/forms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getPatientPrincipal.mockReset();
  createPatientFormSubmission.mockReset();
  listOwnSubmissions.mockReset();
});

describe("POST /api/v1/me/forms", () => {
  it("401s fail-closed without a patient principal", async () => {
    getPatientPrincipal.mockResolvedValue(null);
    const res = await POST(req({ formKey: "ficha_geral" }));
    expect(res.status).toBe(401);
    expect(createPatientFormSubmission).not.toHaveBeenCalled();
  });

  it("creates a submission (201) and never forwards a body patient_id", async () => {
    getPatientPrincipal.mockResolvedValue({ tenantId: "t", patientId: "p-1", userId: "s" });
    createPatientFormSubmission.mockResolvedValue({
      ok: true,
      submission: { id: "sub-1", formKey: "ficha_geral", therapy: null, source: "patient", reviewState: "pending_review", submittedAt: "2026-06-04T10:00:00.000Z" },
    });

    // Adversarial body carries a foreign patient_id — it must be ignored.
    const res = await POST(req({ formKey: "ficha_geral", payload: {}, patientId: "p-VICTIM" }));
    expect(res.status).toBe(201);

    const [principalArg, inputArg] = createPatientFormSubmission.mock.calls[0];
    expect(principalArg.patientId).toBe("p-1");
    // The route builds input from formKey/therapy/payload ONLY — no patientId key.
    expect(inputArg).not.toHaveProperty("patientId");
    expect(Object.keys(inputArg).sort()).toEqual(["formKey", "payload", "therapy"]);

    const body = await res.json();
    expect(body.submission.source).toBe("patient");
    expect(body.submission.reviewState).toBe("pending_review");
  });

  it("400s on a validation error from the writer", async () => {
    getPatientPrincipal.mockResolvedValue({ tenantId: "t", patientId: "p-1", userId: "s" });
    createPatientFormSubmission.mockResolvedValue({ ok: false, error: "unknown_form" });
    const res = await POST(req({ formKey: "bogus" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "unknown_form" });
  });

  it("400s on invalid JSON", async () => {
    getPatientPrincipal.mockResolvedValue({ tenantId: "t", patientId: "p-1", userId: "s" });
    const bad = new Request("http://localhost/api/v1/me/forms", { method: "POST", body: "{not json" });
    const res = await POST(bad);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/me/forms", () => {
  it("401s fail-closed without a principal", async () => {
    getPatientPrincipal.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("lists the patient's own submissions", async () => {
    getPatientPrincipal.mockResolvedValue({ tenantId: "t", patientId: "p-1", userId: "s" });
    listOwnSubmissions.mockResolvedValue([{ id: "sub-1", formKey: "ficha_geral", therapy: null, source: "patient", reviewState: "pending_review", submittedAt: "x" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      submissions: [{ id: "sub-1", formKey: "ficha_geral", therapy: null, source: "patient", reviewState: "pending_review", submittedAt: "x" }],
    });
  });
});
