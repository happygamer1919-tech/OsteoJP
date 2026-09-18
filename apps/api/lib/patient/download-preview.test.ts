/**
 * A PATIENT PREVIEWS THEIR OWN DOCUMENTS AND NOBODY ELSE'S.
 *
 * The preview reuses the download's self-scoped resolution, so these arms are
 * about ORDER and about what is handed to Storage: the service-role client
 * bypasses RLS, so nothing may be signed until the self-scoped read has agreed
 * the document is the caller's.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getOwnDocumentLocation } = vi.hoisted(() => ({ getOwnDocumentLocation: vi.fn() }));
vi.mock("./documents", () => ({ getOwnDocumentLocation }));

const { createSupabaseAdminClient } = vi.hoisted(() => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));

import { createOwnDocumentPreviewUrl, SIGNED_URL_TTL_SECONDS } from "./download";

const PRINCIPAL = { tenantId: "t-1", patientId: "p-1", userId: "u-1" } as never;
const DOC = "cccccccc-cccc-cccc-cccc-cccccccccccc";

/** Records exactly what Storage was asked for. */
function fakeStorage() {
  const calls: { bucket: string; path: string; ttl: number; options: unknown }[] = [];
  createSupabaseAdminClient.mockReturnValue({
    storage: {
      from(bucket: string) {
        return {
          createSignedUrl: async (path: string, ttl: number, options?: unknown) => {
            calls.push({ bucket, path, ttl, options });
            return { data: { signedUrl: `https://storage.example/${path}?token=abc` }, error: null };
          },
        };
      },
    },
  } as never);
  return calls;
}

const ownPdf = {
  storagePath: "t-1/patient-documents/p-1/consentimento.pdf",
  fileName: "consentimento.pdf",
  mimeType: "application/pdf",
};

beforeEach(() => {
  getOwnDocumentLocation.mockReset();
  createSupabaseAdminClient.mockReset();
});

describe("their own document", () => {
  it("is signed INLINE, with no download option, and says how to render it", async () => {
    const calls = fakeStorage();
    getOwnDocumentLocation.mockResolvedValue(ownPdf);

    const out = await createOwnDocumentPreviewUrl(PRINCIPAL, DOC);

    expect(out).toEqual({ url: expect.stringContaining("token=abc"), kind: "pdf" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.bucket).toBe("clinical-attachments");
    expect(calls[0]!.path).toBe(ownPdf.storagePath);
    // The absent third argument IS the feature: with `{ download }` Supabase
    // serves Content-Disposition: attachment and nothing renders in place.
    expect(calls[0]!.options).toBeUndefined();
  });

  it("gets the same 60 seconds the download gets, and not a second more", async () => {
    const calls = fakeStorage();
    getOwnDocumentLocation.mockResolvedValue(ownPdf);
    await createOwnDocumentPreviewUrl(PRINCIPAL, DOC);
    expect(calls[0]!.ttl).toBe(SIGNED_URL_TTL_SECONDS);
    expect(SIGNED_URL_TTL_SECONDS).toBe(60);
  });

  it("resolves ownership with the VERIFIED principal and the id, never a path", async () => {
    fakeStorage();
    getOwnDocumentLocation.mockResolvedValue(ownPdf);
    await createOwnDocumentPreviewUrl(PRINCIPAL, DOC);
    expect(getOwnDocumentLocation).toHaveBeenCalledWith(PRINCIPAL, DOC);
  });
});

describe("everything else, and Storage is never reached", () => {
  it("REFUSES A DOCUMENT THAT IS NOT THEIRS, before signing anything", async () => {
    const calls = fakeStorage();
    // Another patient's, another tenant's, or absent: self-scope returns null
    // for all three and they are indistinguishable from here.
    getOwnDocumentLocation.mockResolvedValue(null);

    await expect(createOwnDocumentPreviewUrl(PRINCIPAL, DOC)).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("refuses a malformed id without touching the database at all", async () => {
    const calls = fakeStorage();
    await expect(createOwnDocumentPreviewUrl(PRINCIPAL, "not-a-uuid")).resolves.toBeNull();
    expect(getOwnDocumentLocation).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("refuses a type no browser renders, even though the document IS theirs", async () => {
    const calls = fakeStorage();
    getOwnDocumentLocation.mockResolvedValue({
      storagePath: "t-1/patient-documents/p-1/relatorio.docx",
      fileName: "relatorio.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    await expect(createOwnDocumentPreviewUrl(PRINCIPAL, DOC)).resolves.toBeNull();
    // The download button beside it still works; this is a refusal, not a fault.
    expect(calls).toHaveLength(0);
  });

  it("refuses an imported document with no stored type", async () => {
    const calls = fakeStorage();
    getOwnDocumentLocation.mockResolvedValue({
      storagePath: "t-1/migration/fisiozero/scan",
      fileName: "scan",
      mimeType: null,
    });
    await expect(createOwnDocumentPreviewUrl(PRINCIPAL, DOC)).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("refuses a row whose path escapes the caller's tenant prefix", async () => {
    const calls = fakeStorage();
    getOwnDocumentLocation.mockResolvedValue({ ...ownPdf, storagePath: "t-2/leak.pdf" });
    await expect(createOwnDocumentPreviewUrl(PRINCIPAL, DOC)).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });
});
