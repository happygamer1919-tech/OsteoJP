import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getOwnDocumentLocation } = vi.hoisted(() => ({ getOwnDocumentLocation: vi.fn() }));
vi.mock("./documents", () => ({ getOwnDocumentLocation }));

const { createSignedUrl, createSupabaseAdminClient } = vi.hoisted(() => {
  const createSignedUrl = vi.fn();
  return {
    createSignedUrl,
    createSupabaseAdminClient: vi.fn(() => ({ storage: { from: () => ({ createSignedUrl }) } })),
  };
});
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));

import { createOwnDocumentDownloadUrl, isUuid } from "./download";

const PRINCIPAL = { tenantId: "11111111-1111-1111-1111-111111111111", patientId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", userId: "u-1" };
const DOC_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const OWN_PATH = `${PRINCIPAL.tenantId}/${PRINCIPAL.patientId}/x.pdf`;

beforeEach(() => {
  getOwnDocumentLocation.mockReset();
  createSignedUrl.mockReset();
  createSupabaseAdminClient.mockClear();
});

describe("isUuid", () => {
  it("accepts a uuid, rejects junk", () => {
    expect(isUuid(DOC_ID)).toBe(true);
    expect(isUuid("../../etc/passwd")).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
  });
});

describe("createOwnDocumentDownloadUrl", () => {
  it("rejects a malformed document id BEFORE any lookup or signing", async () => {
    await expect(createOwnDocumentDownloadUrl(PRINCIPAL, "../secret")).resolves.toBeNull();
    expect(getOwnDocumentLocation).not.toHaveBeenCalled();
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("ADVERSARIAL: returns null (never signs) when the doc is not the caller's own", async () => {
    getOwnDocumentLocation.mockResolvedValue(null); // not theirs / not found
    await expect(createOwnDocumentDownloadUrl(PRINCIPAL, DOC_ID)).resolves.toBeNull();
    expect(createSignedUrl).not.toHaveBeenCalled(); // service-role never reached
  });

  it("ADVERSARIAL: refuses to sign a path outside the caller's tenant prefix", async () => {
    getOwnDocumentLocation.mockResolvedValue({
      storagePath: "22222222-2222-2222-2222-222222222222/p/x.pdf", // foreign tenant prefix
      fileName: "x.pdf",
    });
    await expect(createOwnDocumentDownloadUrl(PRINCIPAL, DOC_ID)).resolves.toBeNull();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("signs an own document and returns a short-lived URL with no PII", async () => {
    getOwnDocumentLocation.mockResolvedValue({ storagePath: OWN_PATH, fileName: "declaracao.pdf" });
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://supabase.example/storage/v1/object/sign/clinical-attachments/opaque-token?token=abc&exp=123" },
      error: null,
    });

    const res = await createOwnDocumentDownloadUrl(PRINCIPAL, DOC_ID);
    expect(res).toEqual({
      url: expect.stringContaining("token="),
    });
    // 60s TTL + Content-Disposition filename, signed against the verified path.
    expect(createSignedUrl).toHaveBeenCalledWith(OWN_PATH, 60, { download: "declaracao.pdf" });
    // No patient/document identifiers leak into the URL.
    expect(res?.url).not.toContain(PRINCIPAL.patientId);
    expect(res?.url).not.toContain(PRINCIPAL.tenantId);
  });

  it("returns null when signing fails", async () => {
    getOwnDocumentLocation.mockResolvedValue({ storagePath: OWN_PATH, fileName: "x.pdf" });
    createSignedUrl.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(createOwnDocumentDownloadUrl(PRINCIPAL, DOC_ID)).resolves.toBeNull();
  });
});
