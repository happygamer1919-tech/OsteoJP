import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * downloadReportUrlAction: "Transferir PDF" ON A REGISTO (EXPORT-01).
 *
 *   - the record is read by the engine that reads it as the registo page does
 *     (`generateRegistoReportPdf`, with the caller's own context): the action
 *     hands it the caller, the id and the app's locale, and nothing else;
 *   - G2: RECEPTION is refused before the engine or the ceiling is asked; a
 *     registo outside the caller's reach (`not_found`) and a DRAFT
 *     (`not_printable`, G3) answer `{ url: null }` with nothing stored;
 *   - a registo the engine prints (an imported one and an annulled one among
 *     them: the engine never refuses those) is stored under the caller's tenant
 *     and handed back as a 60 second signed URL.
 * Which registos the engine finds for which role is the database's answer
 * (lib/clinical/report/registo-export.db.test.ts).
 */

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  ctx: { tenantId: "11111111-1111-4111-8111-111111111111", role: "owner", userId: "user-1" },
  generate: vi.fn(),
  allowed: vi.fn(),
  upload: vi.fn(),
  createSignedUrl: vi.fn(),
  admin: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requireRequestContext: async () => h.ctx }));
vi.mock("@/lib/clinical/records", () => ({
  createAddendum: vi.fn(),
  getRecordDetail: vi.fn(),
  signAndLockRecord: vi.fn(),
  updateRecordData: vi.fn(),
}));
vi.mock("@/lib/clinical/document-rate-limit", () => ({ documentGenerationAllowed: h.allowed }));
vi.mock("@/lib/clinical/terms-acceptance", () => ({ recordTermsAcceptance: vi.fn() }));
vi.mock("@/lib/clinical/storage", () => ({
  confirmAttachment: vi.fn(),
  createAttachmentDownloadUrl: vi.fn(),
  createAttachmentUploadUrl: vi.fn(),
  ATTACHMENTS_BUCKET: "clinical-attachments",
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: h.admin }));
vi.mock("@/lib/clinical/report", () => ({ generateRegistoReportPdf: h.generate }));
vi.mock("@/lib/clinical/rgpd/generate", () => ({ generateRgpdFormPdf: vi.fn() }));
vi.mock("@/lib/patients/documents", () => ({
  confirmPatientDocument: vi.fn(),
  createPatientDocumentUploadUrl: vi.fn(),
}));

import { ClinicalError } from "@/lib/clinical/errors";
import { downloadReportUrlAction } from "./actions";

const REC = "22222222-2222-4222-8222-222222222222";
const SIGNED = "https://storage.example/signed?token=opaque";
const BYTES = new Uint8Array([37, 80, 68, 70]);

beforeEach(() => {
  h.ctx = { ...h.ctx, role: "owner" };
  h.generate.mockReset();
  h.generate.mockResolvedValue({ bytes: BYTES, filename: "relatorio-clinico-22222222.pdf" });
  h.allowed.mockReset();
  h.allowed.mockResolvedValue(true);
  h.upload.mockReset();
  h.upload.mockResolvedValue({ data: { path: "x" }, error: null });
  h.createSignedUrl.mockReset();
  h.createSignedUrl.mockResolvedValue({ data: { signedUrl: SIGNED }, error: null });
  h.admin.mockReset();
  h.admin.mockReturnValue({ storage: { from: () => ({ upload: h.upload, createSignedUrl: h.createSignedUrl }) } });
});

describe("downloadReportUrlAction: a registo the caller may open", () => {
  it.each(["owner", "admin", "therapist"])("%s: the engine is asked as that caller, for this registo, in the app's locale", async (role) => {
    h.ctx = { ...h.ctx, role };
    expect(await downloadReportUrlAction(REC)).toEqual({ url: SIGNED });
    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(h.generate).toHaveBeenCalledWith(h.ctx, REC, "pt");
  });

  it("the file is stored under the caller's tenant by the record's id, and handed back as a 60 second signed URL", async () => {
    await downloadReportUrlAction(REC);
    const [path, bytes, options] = h.upload.mock.calls[0]!;
    expect(path).toMatch(new RegExp(`^${h.ctx.tenantId}/reports/${REC}/[0-9a-f-]{36}\\.pdf$`));
    expect(bytes).toBe(BYTES);
    expect(options).toEqual({ contentType: "application/pdf", upsert: true });
    expect(h.createSignedUrl).toHaveBeenCalledWith(path, 60, { download: "relatorio-clinico-22222222.pdf" });
  });
});

describe("downloadReportUrlAction: every refusal is the same answer, with nothing stored", () => {
  const nothingStored = () => {
    expect(h.admin).not.toHaveBeenCalled();
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.createSignedUrl).not.toHaveBeenCalled();
  };

  it("G2, RECEPTION (no clinical_records:read): refused before the ceiling and the engine", async () => {
    h.ctx = { ...h.ctx, role: "reception" };
    expect(await downloadReportUrlAction(REC)).toEqual({ url: null });
    expect(h.allowed).not.toHaveBeenCalled();
    expect(h.generate).not.toHaveBeenCalled();
    nothingStored();
  });

  it.each(["owner", "admin", "therapist"])("G2, %s against a registo outside their reach (the engine finds nothing): no URL", async (role) => {
    h.ctx = { ...h.ctx, role };
    h.generate.mockRejectedValue(new ClinicalError("not_found"));
    expect(await downloadReportUrlAction(REC)).toEqual({ url: null });
    nothingStored();
  });

  it("G3, a DRAFT (the engine refuses to print it): no URL", async () => {
    h.generate.mockRejectedValue(new ClinicalError("not_printable"));
    expect(await downloadReportUrlAction(REC)).toEqual({ url: null });
    nothingStored();
  });

  it("the document ceiling refuses: the engine is not asked", async () => {
    h.allowed.mockResolvedValue(false);
    expect(await downloadReportUrlAction(REC)).toEqual({ url: null });
    expect(h.generate).not.toHaveBeenCalled();
    nothingStored();
  });

  it("no id: refused before the ceiling", async () => {
    expect(await downloadReportUrlAction("")).toEqual({ url: null });
    expect(h.allowed).not.toHaveBeenCalled();
    expect(h.generate).not.toHaveBeenCalled();
  });
});
