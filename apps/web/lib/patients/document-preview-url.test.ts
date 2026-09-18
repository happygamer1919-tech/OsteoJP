/**
 * The preview URL helper: what it will sign, and everything it refuses.
 *
 * THE POINT OF THESE ARMS IS THAT A PREVIEW MUST NOT WIDEN ANYTHING. The
 * download helper next to it signs any client-supplied path under the tenant
 * prefix; this one accepts an ID and signs only the row the Documentos tab's own
 * predicate returned. So the interesting assertions are the refusals, and the
 * fact that the path handed to Storage comes from the ROW rather than from the
 * caller.
 *
 * The real module runs against a fake transaction and a fake Storage client, so
 * what is asserted is what the app actually hands each of them.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
// server-only modules, stubbed to their one exported constant / functions.
vi.mock("@/lib/clinical/storage", () => ({ ATTACHMENTS_BUCKET: "clinical-attachments" }));
vi.mock("@/lib/clinical/audit", () => ({
  writeClinicalAudit: vi.fn(async () => {}),
  clientIp: vi.fn(async () => null),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { runScoped } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { attachments } from "@osteojp/db";
import { createPatientDocumentPreviewUrl } from "./documents";
import type { RequestContext } from "@osteojp/auth";

const mockRunScoped = vi.mocked(runScoped);
const mockAdmin = vi.mocked(createSupabaseAdminClient);

const TENANT = "tenant-1";
const PATIENT = "patient-9";
const DOC = "doc-1";

/** A therapist: holds patients:read, which is what the Documentos tab gates on. */
const therapist: RequestContext = { tenantId: TENANT, role: "therapist", userId: "u-1" };

type Row = { fileName: string; mimeType: string | null; storagePath: string };

/** A select chain yielding `rows`, remembering which table was read. */
function fakeTx(rows: Row[]) {
  const tablesRead: unknown[] = [];
  const chain = {
    from: (t: unknown) => {
      tablesRead.push(t);
      return chain;
    },
    where: () => chain,
    limit: async () => rows,
  };
  return { tx: { select: () => chain }, tablesRead };
}

/** A Storage stub that records exactly what was asked of it. */
function fakeStorage() {
  const calls: { bucket: string; path: string; ttl: number; options: unknown }[] = [];
  const client = {
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
  };
  return { client, calls };
}

function arrange(rows: Row[]) {
  const { tx, tablesRead } = fakeTx(rows);
  mockRunScoped.mockImplementation(async (_c, fn) => fn(tx as never));
  const { client, calls } = fakeStorage();
  mockAdmin.mockReturnValue(client as never);
  return { tablesRead, calls };
}

const pdfRow: Row = {
  fileName: "consentimento.pdf",
  mimeType: "application/pdf",
  storagePath: `${TENANT}/patient-documents/${PATIENT}/abc__consentimento.pdf`,
};

beforeEach(() => {
  mockRunScoped.mockReset();
  mockAdmin.mockReset();
});

describe("a therapist inside the tab's scope gets a preview", () => {
  it("signs the row's own path, in the attachments bucket, and says how to render it", async () => {
    const { tablesRead, calls } = arrange([pdfRow]);

    const out = await createPatientDocumentPreviewUrl(therapist, PATIENT, DOC);

    expect(out.kind).toBe("pdf");
    expect(out.fileName).toBe("consentimento.pdf");
    expect(out.url).toContain("token=abc");
    expect(tablesRead).toEqual([attachments]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.bucket).toBe("clinical-attachments");
    // THE PATH CAME FROM THE ROW, not from the caller: the caller only ever
    // supplied an id.
    expect(calls[0]!.path).toBe(pdfRow.storagePath);
  });

  it("asks for SIXTY SECONDS, the same as the download it sits beside", async () => {
    const { calls } = arrange([pdfRow]);
    await createPatientDocumentPreviewUrl(therapist, PATIENT, DOC);
    // A preview is not a longer-lived handle on the bytes. If this number ever
    // grows, the token outlives the panel that needed it.
    expect(calls[0]!.ttl).toBe(60);
  });

  it("signs it INLINE - no download option - which is the whole difference", async () => {
    const { calls } = arrange([pdfRow]);
    await createPatientDocumentPreviewUrl(therapist, PATIENT, DOC);
    // With a `download` option Supabase serves Content-Disposition: attachment
    // and the panel would save the file instead of rendering it.
    expect(calls[0]!.options).toBeUndefined();
  });

  it("renders an uploaded photo of a paper form as an image", async () => {
    const { calls } = arrange([
      { ...pdfRow, fileName: "ficha.jpg", mimeType: "image/jpeg", storagePath: `${TENANT}/x/ficha.jpg` },
    ]);
    const out = await createPatientDocumentPreviewUrl(therapist, PATIENT, DOC);
    expect(out.kind).toBe("image");
    expect(calls).toHaveLength(1);
  });
});

describe("everything it refuses, and it never signs on the way out", () => {
  it("REFUSES A DOCUMENT THE TAB WOULD NOT LIST, without saying why", async () => {
    // The scoped read returns nothing: another patient's document, another
    // tenant's, one that lives on a registo rather than the tab, or simply
    // absent. All four arrive here as an empty result and leave as one refusal.
    const { calls } = arrange([]);

    await expect(createPatientDocumentPreviewUrl(therapist, PATIENT, DOC)).rejects.toThrow();
    // The refusal happened BEFORE the service-role client was ever asked for a
    // URL. That ordering is the guarantee: the admin client bypasses RLS, so
    // nothing may be signed until the scoped read has agreed.
    expect(calls).toHaveLength(0);
  });

  it("refuses a type no browser renders, rather than signing it anyway", async () => {
    const { calls } = arrange([
      {
        fileName: "relatorio.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        storagePath: `${TENANT}/patient-documents/${PATIENT}/relatorio.docx`,
      },
    ]);

    await expect(createPatientDocumentPreviewUrl(therapist, PATIENT, DOC)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("refuses an imported document with no recorded type", async () => {
    // Every Fisiozero row whose vendor export omitted tipo_mime looks like this.
    const { calls } = arrange([
      { fileName: "scan", mimeType: null, storagePath: `${TENANT}/migration/fisiozero/scan` },
    ]);
    await expect(createPatientDocumentPreviewUrl(therapist, PATIENT, DOC)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("refuses a row whose stored path escapes the tenant prefix", async () => {
    // Defense in depth: this should be impossible, and it is refused rather
    // than signed if it ever is not.
    const { calls } = arrange([{ ...pdfRow, storagePath: "other-tenant/x/leak.pdf" }]);
    await expect(createPatientDocumentPreviewUrl(therapist, PATIENT, DOC)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("reads through runScoped, so RLS is in force for the lookup", async () => {
    arrange([pdfRow]);
    await createPatientDocumentPreviewUrl(therapist, PATIENT, DOC);
    expect(mockRunScoped).toHaveBeenCalledTimes(1);
    expect(mockRunScoped.mock.calls[0]![0]).toBe(therapist);
  });
});
